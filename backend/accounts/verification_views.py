import logging
import os

from PIL import Image, UnidentifiedImageError
from django.http import FileResponse

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification

from communities.models import DonorCommunityApplication

from .firebase_authentication import FirebaseTokenAuthentication
from .models import (
    User,
    VerificationApplication,
    VerificationDocument,
)
from .views import (
    VERIFICATION_REQUIREMENTS,
    verification_data,
)


logger = logging.getLogger(__name__)


MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

ALLOWED_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}

ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
}


def get_authenticated_user(request):
    uid = request.auth.get("uid")

    if not uid:
        return None

    return User.objects.filter(
        firebase_uid=uid
    ).first()


def get_application_for_user(user):
    application, _ = VerificationApplication.objects.get_or_create(
        user=user,
        defaults={
            "status": VerificationApplication.Status.DRAFT,
        },
    )

    return application


def get_allowed_document_types(user):
    return {
        requirement["type"]
        for requirement in VERIFICATION_REQUIREMENTS.get(
            user.role,
            [],
        )
    }


def get_required_document_types(user):
    return {
        requirement["type"]
        for requirement in VERIFICATION_REQUIREMENTS.get(
            user.role,
            [],
        )
        if requirement["required"]
    }


def validate_pdf(file):
    try:
        file.seek(0)

        header = file.read(5)

        file.seek(0)

        return header == b"%PDF-"

    except (OSError, ValueError):
        return False


def validate_image(file):
    try:
        file.seek(0)

        with Image.open(file) as image:
            image_format = image.format
            image.verify()

        file.seek(0)

        return image_format in {"JPEG", "PNG"}

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
    ):
        return False


def validate_uploaded_document(file):
    if not isinstance(file, UploadedFile):
        return "Invalid uploaded file."

    if file.size <= 0:
        return "The uploaded file is empty."

    if file.size > MAX_DOCUMENT_SIZE:
        return "Documents must be 10 MB or smaller."

    content_type = (
        file.content_type or ""
    ).lower().strip()

    filename = (
        file.name or ""
    ).lower().strip()

    extension = ""

    if "." in filename:
        extension = filename[
            filename.rfind("."):
        ]

    if content_type not in ALLOWED_DOCUMENT_CONTENT_TYPES:
        return (
            "Only PDF, JPG, JPEG, and PNG documents are allowed."
        )

    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        return (
            "Only PDF, JPG, JPEG, and PNG documents are allowed."
        )

    if content_type == "application/pdf":
        if not validate_pdf(file):
            return "The uploaded PDF file is invalid."

    elif content_type in {
        "image/jpeg",
        "image/png",
    }:
        if not validate_image(file):
            return "The uploaded image file is invalid."

    else:
        return "Unsupported document type."

    return None


class VerificationDocumentUploadView(APIView):
    """
    Upload or replace one verification document belonging to
    the authenticated user's verification application.
    """

    authentication_classes = [
        FirebaseTokenAuthentication
    ]
    permission_classes = [IsAuthenticated]
    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    def post(self, request):
        user = get_authenticated_user(request)

        if not user:
            return Response(
                {
                    "detail": (
                        "BloodBridge profile not found. "
                        "Please register first."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.role == User.Role.SUPER_ADMIN:
            return Response(
                {
                    "detail": (
                        "Super Admin accounts do not require "
                        "document verification."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application = get_application_for_user(user)

        community_application = None

        if user.role == User.Role.DONOR:
            community_application = (
                DonorCommunityApplication.objects
                .filter(
                    donor=user,
                    status=DonorCommunityApplication.Status.PENDING,
                )
                .select_related(
                    "community",
                    "community__admin",
                )
                .first()
            )

            if community_application is None:
                return Response(
                    {
                        "detail": (
                            "Please select a community before "
                            "uploading donor verification documents."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        document_type = request.data.get(
            "document_type"
        )
        document = request.FILES.get("file")

        if not document_type:
            return Response(
                {
                    "detail": (
                        "document_type is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_types = get_allowed_document_types(
            user
        )

        if document_type not in allowed_types:
            return Response(
                {
                    "detail": (
                        "This document type is not valid for "
                        "your account role."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not document:
            return Response(
                {
                    "detail": (
                        "Please select a document to upload."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_document = (
            VerificationDocument.objects
            .filter(
                application=application,
                document_type=document_type,
            )
            .first()
        )

        is_rejected_document_replacement = (
            existing_document is not None
            and existing_document.status
            == VerificationDocument.Status.REJECTED
            and application.status
            in {
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
            }
        )

        if (
            application.status
            in {
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
                VerificationApplication.Status.APPROVED,
            }
            and not is_rejected_document_replacement
        ):
            return Response(
                {
                    "detail": (
                        "Documents cannot be changed while the "
                        "application is under review or approved."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_error = validate_uploaded_document(
            document
        )

        if validation_error:
            return Response(
                {"detail": validation_error},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():

                if existing_document:
                    old_file = (
                        existing_document.file.name
                    )

                    existing_document.file = document
                    existing_document.status = (
                        VerificationDocument.Status.PENDING
                    )
                    existing_document.rejection_reason = ""
                    existing_document.reviewed_at = None
                    existing_document.reviewed_by = None

                    existing_document.save(
                        update_fields=[
                            "file",
                            "status",
                            "rejection_reason",
                            "reviewed_at",
                            "reviewed_by",
                        ]
                    )

                    if (
                        old_file
                        and old_file
                        != existing_document.file.name
                    ):
                        try:
                            existing_document.file.storage.delete(
                                old_file
                            )
                        except Exception:
                            logger.exception(
                                "Failed to delete replaced "
                                "verification file."
                            )

                    saved_document = existing_document

                else:
                    saved_document = (
                        VerificationDocument.objects.create(
                            application=application,
                            document_type=document_type,
                            file=document,
                            status=VerificationDocument.Status.PENDING,
                        )
                    )

                if (
                    application.status
                    == VerificationApplication.Status.REJECTED
                ):
                    application.status = (
                        VerificationApplication.Status.DRAFT
                    )
                    application.rejection_reason = ""
                    application.reviewed_at = None
                    application.reviewed_by = None

                    application.save(
                        update_fields=[
                            "status",
                            "rejection_reason",
                            "reviewed_at",
                            "reviewed_by",
                            "updated_at",
                        ]
                    )

            

        except Exception:
            logger.exception(
                "Failed to save verification document."
            )

            return Response(
                {
                    "detail": (
                        "Unable to save the document. "
                        "Please try again."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "message": (
                    "Document uploaded successfully."
                ),
                "document": {
                    "id": str(saved_document.id),
                    "document_type":
                        saved_document.document_type,
                    "status": saved_document.status,
                    "uploaded_at":
                        saved_document.uploaded_at,
                },
                "verification": verification_data(
                    application
                ),
            },
            status=status.HTTP_201_CREATED,
        )

class VerificationDocumentViewView(APIView):
    """
    Securely display a verification document to its owner.

    The document is never exposed through a public media URL.
    """

    authentication_classes = [
        FirebaseTokenAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        user = get_authenticated_user(request)

        if not user:
            return Response(
                {
                    "detail": "BloodBridge profile not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            document = (
                VerificationDocument.objects
                .select_related(
                    "application",
                    "application__user",
                )
                .get(
                    id=document_id,
                    application__user=user,
                )
            )
        except VerificationDocument.DoesNotExist:
            return Response(
                {
                    "detail": "Verification document not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not document.file:
            return Response(
                {
                    "detail": "Document file is unavailable."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            document.file.open("rb")
        except (FileNotFoundError, OSError):
            return Response(
                {
                    "detail": "Document file could not be opened."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        filename = os.path.basename(
            document.file.name
        )

        response = FileResponse(
            document.file,
            as_attachment=False,
            filename=filename,
        )

        response["Content-Disposition"] = (
            f'inline; filename="{filename}"'
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"

        return response


class VerificationDocumentDeleteView(APIView):
    """
    Delete one applicant-owned verification document while the
    application is still editable.
    """

    authentication_classes = [
        FirebaseTokenAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def delete(self, request, document_id):
        user = get_authenticated_user(request)

        if not user:
            return Response(
                {
                    "detail":
                        "BloodBridge profile not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            document = (
                VerificationDocument.objects
                .select_related(
                    "application",
                    "application__user",
                )
                .get(
                    id=document_id,
                    application__user=user,
                )
            )
        except VerificationDocument.DoesNotExist:
            return Response(
                {
                    "detail":
                        "Verification document not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application = document.application

        if application.status not in {
            VerificationApplication.Status.DRAFT,
            VerificationApplication.Status.REJECTED,
        }:
            return Response(
                {
                    "detail": (
                        "Documents cannot be deleted after "
                        "the application has been submitted."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            file_name = document.file.name

            with transaction.atomic():
                document.delete()

            if file_name:
                try:
                    document.file.storage.delete(
                        file_name
                    )
                except Exception:
                    logger.exception(
                        "Failed to delete verification file."
                    )

        except Exception:
            logger.exception(
                "Failed to delete verification document."
            )

            return Response(
                {
                    "detail": (
                        "Unable to delete the document. "
                        "Please try again."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "message":
                    "Document removed successfully.",
                "verification": verification_data(
                    application
                ),
            }
        )


class VerificationSubmitView(APIView):
    """
    Submit the applicant's verification application.

    Submission is only allowed when every mandatory document
    has been uploaded.
    """

    authentication_classes = [
        FirebaseTokenAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = get_authenticated_user(request)

        if not user:
            return Response(
                {
                    "detail":
                        "BloodBridge profile not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.role == User.Role.SUPER_ADMIN:
            return Response(
                {
                    "detail": (
                        "Super Admin accounts do not require "
                        "verification."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application = get_application_for_user(user)

        if (
            application.status
            == VerificationApplication.Status.APPROVED
        ):
            return Response(
                {
                    "detail": (
                        "This verification application "
                        "has already been approved."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if application.status in {
            VerificationApplication.Status.SUBMITTED,
            VerificationApplication.Status.UNDER_REVIEW,
        }:
            return Response(
                {
                    "detail": (
                        "This verification application "
                        "has already been submitted."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        community_application = None

        if user.role == User.Role.DONOR:
            community_application = (
                DonorCommunityApplication.objects
                .filter(
                    donor=user,
                    status=DonorCommunityApplication.Status.PENDING,
                )
                .select_related(
                    "community",
                    "community__admin",
                )
                .first()
            )

            if community_application is None:
                return Response(
                    {
                        "detail": (
                            "Please select a community before "
                            "submitting donor verification documents."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        required_types = get_required_document_types(
            user
        )

        uploaded_types = set(
            VerificationDocument.objects.filter(
                application=application,
                document_type__in=required_types,
            ).values_list(
                "document_type",
                flat=True,
            )
        )

        missing_types = (
            required_types - uploaded_types
        )

        if missing_types:
            missing_requirements = [
                requirement
                for requirement in
                VERIFICATION_REQUIREMENTS.get(
                    user.role,
                    [],
                )
                if requirement["type"]
                in missing_types
            ]

            return Response(
                {
                    "detail": (
                        "All required verification documents "
                        "must be uploaded before submission."
                    ),
                    "missing_documents": [
                        {
                            "document_type":
                                item["type"],
                            "label":
                                VerificationDocument(
                                    document_type=
                                        item["type"]
                                ).get_document_type_display(),
                        }
                        for item in
                        missing_requirements
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rejected_required = list(
            VerificationDocument.objects.filter(
                application=application,
                document_type__in=required_types,
                status=
                    VerificationDocument.Status.REJECTED,
            ).values_list(
                "document_type",
                flat=True,
            )
        )

        if rejected_required:
            return Response(
                {
                    "detail": (
                        "Rejected required documents must be "
                        "replaced before submission."
                    ),
                    "rejected_documents":
                        rejected_required,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                application.status = (
                    VerificationApplication.Status.SUBMITTED
                )
                application.submitted_at = timezone.now()
                application.reviewed_at = None
                application.reviewed_by = None
                application.rejection_reason = ""

                application.save(
                    update_fields=[
                        "status",
                        "submitted_at",
                        "reviewed_at",
                        "reviewed_by",
                        "rejection_reason",
                        "updated_at",
                    ]
                )

                if user.role == User.Role.DONOR:
                    Notification.objects.create(
                        recipient=
                            community_application.community.admin,
                        title=
                            "New Donor Verification Submitted",
                        message=(
                            f"{user.full_name} has submitted the "
                            "required verification documents for "
                            "membership in "
                            f"{community_application.community.name}."
                        ),
                        category=
                            Notification.Category.VERIFICATION,
                        link=
                            "/community/applications",
                    )

                else:
                    super_admins = User.objects.filter(
                        role=User.Role.SUPER_ADMIN,
                        account_status=
                            User.AccountStatus.ACTIVE,
                        is_active=True,
                        is_superuser=True,
                    )

                    Notification.objects.bulk_create(
                        [
                            Notification(
                                recipient=admin,
                                title=
                                    "Verification Application Submitted",
                                message=(
                                    f"{user.full_name} has submitted a "
                                    f"{user.get_role_display()} "
                                    "verification application. "
                                    "Required documents are ready "
                                    "for review."
                                ),
                                category=
                                    Notification.Category.VERIFICATION,
                                link="/admin/users",
                            )
                            for admin in super_admins
                        ]
                    )

        except Exception:
            logger.exception(
                "Failed to submit verification application."
            )

            return Response(
                {
                    "detail": (
                        "Unable to submit the application. "
                        "Please try again."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if user.role == User.Role.DONOR:
            message = (
                "Your donor verification documents were submitted "
                "to the selected community for review."
            )
        else:
            message = (
                "Verification application submitted successfully. "
                "Please wait for Super Admin review."
            )

        return Response(
            {
                "message": message,
                "verification": verification_data(
                    application
                ),
            },
            status=status.HTTP_200_OK,
        )
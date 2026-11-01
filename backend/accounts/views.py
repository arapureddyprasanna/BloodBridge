import logging
import re

import dns.exception
import dns.resolver
from PIL import Image, UnidentifiedImageError

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from donors.models import DonorProfile
from communities.models import Community
from hospitals.models import HospitalProfile

from .firebase_authentication import FirebaseTokenAuthentication
from .models import (
    User,
    VerificationApplication,
    VerificationDocument,
)

logger = logging.getLogger(__name__)


ALLOWED_ROLES = {
    "donor": User.Role.DONOR,
    "hospital_admin": User.Role.HOSPITAL_ADMIN,
    "community_admin": User.Role.COMMUNITY_ADMIN,
}


# ---------------------------------------------------------------------------
# Verification document requirements
# ---------------------------------------------------------------------------

VERIFICATION_REQUIREMENTS = {
    User.Role.HOSPITAL_ADMIN: [
        {
            "type": VerificationDocument.DocumentType.HOSPITAL_REGISTRATION,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.HOSPITAL_OPERATING_LICENSE,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.REPRESENTATIVE_IDENTITY,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.AUTHORIZATION_LETTER,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.ADDRESS_PROOF,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.BLOOD_CENTRE_LICENSE,
            "required": False,
        },
    ],
    User.Role.COMMUNITY_ADMIN: [
        {
            "type": VerificationDocument.DocumentType.ORGANIZATION_REGISTRATION,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.REPRESENTATIVE_IDENTITY,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.AUTHORIZATION_LETTER,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.ADDRESS_PROOF,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.TAX_REGISTRATION,
            "required": False,
        },
    ],
    User.Role.DONOR: [
        {
            "type": VerificationDocument.DocumentType.DONOR_IDENTITY,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.AGE_VERIFICATION,
            "required": True,
        },
        {
            "type": VerificationDocument.DocumentType.DONOR_DECLARATION,
            "required": True,
        },
    ],
}


def profile_data(user, uid=None, request=None):
    photo_url = None

    if user.profile_picture:
        photo_url = user.profile_picture.url

        if request:
            photo_url = request.build_absolute_uri(photo_url)

    donor_profile_data = None
    hospital_profile_data = None
    blood_group = None

    if user.role == User.Role.DONOR:
        try:
            donor_profile = user.donor_profile
        except DonorProfile.DoesNotExist:
            donor_profile = None

        if donor_profile:
            blood_group = donor_profile.blood_group

            donor_profile_data = {
                "blood_group": donor_profile.blood_group,
                "is_available": donor_profile.is_available,
                "availability_start": (
                    donor_profile.availability_start.isoformat()
                    if donor_profile.availability_start
                    else None
                ),
                "availability_end": (
                    donor_profile.availability_end.isoformat()
                    if donor_profile.availability_end
                    else None
                ),
                "preferred_start_time": (
                    donor_profile.preferred_start_time.isoformat()
                    if donor_profile.preferred_start_time
                    else None
                ),
                "preferred_end_time": (
                    donor_profile.preferred_end_time.isoformat()
                    if donor_profile.preferred_end_time
                    else None
                ),
                "preferred_days": donor_profile.preferred_days,
                "timezone": donor_profile.timezone,
                "latitude": (
                    float(donor_profile.latitude)
                    if donor_profile.latitude is not None
                    else None
                ),
                "longitude": (
                    float(donor_profile.longitude)
                    if donor_profile.longitude is not None
                    else None
                ),
                "max_travel_distance_km": (
                    donor_profile.max_travel_distance_km
                ),
                "location_updated_at": (
                    donor_profile.location_updated_at.isoformat()
                    if donor_profile.location_updated_at
                    else None
                ),
                "allow_verified_hospital_matching": (
                    donor_profile.allow_verified_hospital_matching
                ),
                "invitation_notifications": (
                    donor_profile.invitation_notifications
                ),
                "share_phone_after_acceptance": (
                    donor_profile.share_phone_after_acceptance
                ),
                "community_visibility": (
                    donor_profile.community_visibility
                ),
            }

    if user.role == User.Role.HOSPITAL_ADMIN:
        try:
            hospital_profile = user.hospital_profile
        except HospitalProfile.DoesNotExist:
            hospital_profile = None
        if hospital_profile:
            hospital_profile_data = {
                "latitude": float(hospital_profile.latitude) if hospital_profile.latitude is not None else None,
                "longitude": float(hospital_profile.longitude) if hospital_profile.longitude is not None else None,
            }

    return {
        "uid": uid or user.firebase_uid,
        "email": user.email,
        "email_verified": user.email_verified,
        "full_name": user.full_name,
        "phone": user.mobile_number,
        "role": user.role,
        "status": user.account_status,
        "profile_picture": photo_url,
        "blood_group": blood_group,
        "donor_profile": donor_profile_data,
        "hospital_profile": hospital_profile_data,
    }


def get_verification_requirements(role):
    """
    Return the verification requirements configured for a BloodBridge role.
    """

    requirements = VERIFICATION_REQUIREMENTS.get(role, [])

    return [
        {
            "type": str(item["type"]),
            "document_type": str(item["type"]),
            "label": VerificationDocument(
                document_type=item["type"]
            ).get_document_type_display(),
            "required": item["required"],
        }
        for item in requirements
    ]


def get_required_document_types(role):
    """
    Return only mandatory document types for a role.
    """

    return {
        item["type"]
        for item in VERIFICATION_REQUIREMENTS.get(role, [])
        if item["required"]
    }


def verification_data(application):
    """
    Build a safe verification response for the authenticated user.
    """

    role = application.user.role
    requirements = get_verification_requirements(role)

    uploaded_documents = {
        document.document_type: document
        for document in application.documents.all()
    }

    documents = []

    for requirement in requirements:
        document_type = requirement["document_type"]
        document = uploaded_documents.get(document_type)

        document_data = {
            "type": str(document_type),
            "document_type": str(document_type),
            "label": requirement["label"],
            "required": requirement["required"],
            "uploaded": document is not None,
            "status": (
                document.status
                if document
                else VerificationDocument.Status.PENDING
            ),
            "rejection_reason": (
                document.rejection_reason
                if document
                else ""
            ),
        }

        if document:
            document_data["id"] = str(document.id)
            document_data["uploaded_at"] = document.uploaded_at

        documents.append(document_data)

    required_types = get_required_document_types(role)

    submitted_required_documents = sum(
        1
        for document_type in required_types
        if document_type in uploaded_documents
    )

    required_document_count = len(required_types)

    all_required_documents_uploaded = (
        submitted_required_documents == required_document_count
    )

    return {
        "id": str(application.id),
        "role": role,
        "status": application.status,
        "submitted_at": application.submitted_at,
        "reviewed_at": application.reviewed_at,
        "rejection_reason": application.rejection_reason,
        "documents_submitted": (
            application.status
            in (
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
                VerificationApplication.Status.APPROVED,
                VerificationApplication.Status.REJECTED,
            )
        ),
        "required_documents_complete": all_required_documents_uploaded,
        "required_document_count": required_document_count,
        "submitted_required_document_count": submitted_required_documents,
        "requirements": documents,
    }


class EmailDomainCheckView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        email = request.data.get("email", "")

        if not isinstance(email, str):
            return Response(
                {"detail": "Please enter a valid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = email.strip().lower()
        pattern = r"^[^@\s]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$"

        if not re.fullmatch(pattern, email):
            return Response(
                {"detail": "Please enter a valid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        domain = email.rsplit("@", 1)[1]

        try:
            answers = dns.resolver.resolve(domain, "MX", lifetime=5)

            if not list(answers):
                return Response(
                    {"detail": "This domain has no mail servers configured."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except dns.resolver.NXDOMAIN:
            return Response(
                {
                    "detail": (
                        "This email domain does not exist. Check your address."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except dns.resolver.NoAnswer:
            # Allow domains that accept email through implicit MX.
            try:
                dns.resolver.resolve(domain, "A", lifetime=5)

            except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
                return Response(
                    {
                        "detail": (
                            "This domain does not appear able to receive email."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            except (
                dns.exception.DNSException,
                UnicodeError,
                ValueError,
            ):
                logger.exception("Email domain validation failed.")
                return Response(
                    {
                        "detail": (
                            "Unable to check this domain right now. "
                            "Please try again."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        except (
            dns.exception.DNSException,
            UnicodeError,
            ValueError,
        ):
            logger.exception("Email domain validation failed.")
            return Response(
                {
                    "detail": (
                        "Please enter a valid email address with a valid domain."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"valid": True})


class RegisterView(APIView):
    authentication_classes = [FirebaseTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        claims = request.auth

        uid = claims.get("uid")
        email = (claims.get("email") or "").strip().lower()

        full_name = request.data.get("full_name", "")
        phone = request.data.get("phone", "")
        role_value = request.data.get("role", "")
        blood_group = request.data.get("blood_group", "")

        if not isinstance(full_name, str) or not isinstance(phone, str):
            return Response(
                {"detail": "Please provide a valid name and phone number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        full_name = full_name.strip()
        phone = phone.strip()

        if isinstance(blood_group, str):
            blood_group = blood_group.strip().upper()
        else:
            blood_group = ""

        if not uid or not email:
            return Response(
                {
                    "detail": (
                        "Your Firebase account must have an email address."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not full_name or not phone or role_value not in ALLOWED_ROLES:
            return Response(
                {
                    "detail": (
                        "Provide full_name, phone, and a valid role: "
                        "donor, hospital_admin, or community_admin."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Donor blood group is mandatory because it is required
        # for compatibility matching.
        if role_value == "donor":
            valid_blood_groups = {
                choice[0]
                for choice in DonorProfile.BloodGroup.choices
            }

            if blood_group not in valid_blood_groups:
                return Response(
                    {
                        "detail": (
                            "Donor blood group is required and must be one of: "
                            "A+, A-, B+, B-, AB+, AB-, O+, O-."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if User.objects.filter(firebase_uid=uid).exists():
            return Response(
                {
                    "detail": (
                        "A BloodBridge profile already exists for this account."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"detail": "A profile already exists for this email address."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=uid,
                    email=email,
                    password=None,
                    firebase_uid=uid,
                    full_name=full_name,
                    mobile_number=phone,
                    role=ALLOWED_ROLES[role_value],
                    email_verified=bool(
                        claims.get("email_verified", False)
                    ),
                    account_status=User.AccountStatus.PENDING,
                )

                # DonorProfile is created immediately because the donor's
                # blood group is foundational matching data.
                if role_value == "donor":
                    DonorProfile.objects.create(
                        user=user,
                        blood_group=blood_group,
                    )

                # Registration creates the verification application,
                # but it remains DRAFT until the applicant uploads
                # the required documents and explicitly submits it.
                VerificationApplication.objects.create(
                    user=user,
                    status=VerificationApplication.Status.DRAFT,
                )
                if role_value == "community_admin":
                    Community.objects.create(
                       admin=user,
                       name=full_name,
                       email=email,
                       mobile_number=phone,
                    )

        except IntegrityError:
            return Response(
                {
                    "detail": (
                        "A profile already exists for this account."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            super_admins = User.objects.filter(
                role=User.Role.SUPER_ADMIN,
                account_status=User.AccountStatus.ACTIVE,
                is_active=True,
                is_superuser=True,
            )

            Notification.objects.bulk_create(
                [
                    Notification(
                        recipient=admin,
                        title="New Registration Pending",
                        message=(
                            f"{user.full_name} has registered as a "
                            f"{user.get_role_display()}. Review the account "
                            "and approve or reject the registration."
                        ),
                        category=Notification.Category.VERIFICATION,
                        link="/admin/users",
                    )
                    for admin in super_admins
                ]
            )

        except Exception:
            logger.exception(
                "Failed to create registration notification."
            )

        return Response(
            {
                "message": "BloodBridge profile created successfully.",
                "profile": profile_data(user, uid, request),
            },
            status=status.HTTP_201_CREATED,
        )


class VerificationStatusView(APIView):
    """
    Return the authenticated user's complete verification state.

    This endpoint is intentionally read-only. Approval and rejection are
    controlled by Super Admin verification APIs.
    """

    authentication_classes = [FirebaseTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        uid = request.auth.get("uid")

        try:
            user = User.objects.get(firebase_uid=uid)
        except User.DoesNotExist:
            return Response(
                {"detail": "BloodBridge profile not found. Please register."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Super Admins are pre-authorized and do not participate in the
        # document verification workflow.
        if user.role == User.Role.SUPER_ADMIN:
            return Response(
                {
                    "verification_required": False,
                    "status": "approved",
                    "account_status": user.account_status,
                    "role": user.role,
                }
            )

        application, _ = VerificationApplication.objects.get_or_create(
            user=user,
            defaults={
                "status": VerificationApplication.Status.DRAFT,
            },
        )

        return Response({
            "verification_required": True,
            "account_status": user.account_status,
            "role": user.role,
            "verification": verification_data(application),
        })

class MeView(APIView):
    authentication_classes = [FirebaseTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        uid = request.auth.get("uid")
        email = (
            request.auth.get("email") or ""
        ).strip().lower()

        email_verified = bool(
            request.auth.get(
                "email_verified",
                False,
            )
        )

        try:
            user = User.objects.get(
                firebase_uid=uid
            )

        except User.DoesNotExist:

            user = None

            # Keep read-only profile recovery compatible for
            # verified Firebase identities without changing the
            # account's Firebase UID implicitly.
            if email:
                try:
                    user = User.objects.get(
                        email__iexact=email
                    )
                except User.DoesNotExist:
                    user = None

            if user is None:
                return Response(
                    {
                        "detail": (
                            "BloodBridge profile not found. "
                            "Please register."
                        )
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        firebase_verified = email_verified

        if (
            user.email_verified
            != firebase_verified
        ):
            user.email_verified = firebase_verified
            user.save(
                update_fields=[
                    "email_verified",
                    "updated_at",
                ]
            )

        return Response(
            profile_data(
                user,
                uid,
                request,
            )
        )

    def patch(self, request):
        uid = request.auth.get("uid")
        email = (
            request.auth.get("email") or ""
        ).strip().lower()
        email_verified = bool(
            request.auth.get("email_verified", False)
        )

        try:
            user = User.objects.get(
                firebase_uid=uid
            )
        except User.DoesNotExist:
            user = None
            if email and email_verified:
                user = User.objects.filter(
                    email__iexact=email
                ).first()

            if user is None:
                return Response(
                    {
                        "detail": (
                            "BloodBridge profile not found. "
                            "Please register."
                        )
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        full_name = request.data.get(
            "full_name"
        )
        phone = request.data.get("phone")
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")

        if full_name is not None:
            if (
                not isinstance(
                    full_name,
                    str,
                )
                or not full_name.strip()
            ):
                return Response(
                    {
                        "detail": (
                            "full_name cannot be empty."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.full_name = full_name.strip()

        if phone is not None:
            if (
                not isinstance(
                    phone,
                    str,
                )
                or not phone.strip()
            ):
                return Response(
                    {
                        "detail": (
                            "phone cannot be empty."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.mobile_number = phone.strip()

        if latitude is not None or longitude is not None:
            if user.role != User.Role.HOSPITAL_ADMIN:
                return Response({"detail": "Only hospital administrators can update hospital coordinates."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                hospital_profile = user.hospital_profile
            except HospitalProfile.DoesNotExist:
                return Response({"detail": "Hospital profile not found."}, status=status.HTTP_404_NOT_FOUND)
            values = {}
            for field, value, minimum, maximum in (
                ("latitude", latitude, -90, 90),
                ("longitude", longitude, -180, 180),
            ):
                if value is None:
                    continue
                try:
                    number = float(value)
                except (TypeError, ValueError):
                    return Response({"detail": f"{field} must be a valid number."}, status=status.HTTP_400_BAD_REQUEST)
                if not minimum <= number <= maximum:
                    return Response({"detail": f"{field} is outside the valid range."}, status=status.HTTP_400_BAD_REQUEST)
                values[field] = number
            for field, value in values.items():
                setattr(hospital_profile, field, value)
            hospital_profile.location_updated_at = timezone.now()
            hospital_profile.save(update_fields=[*values, "location_updated_at", "updated_at"])

        user.save()

        return Response(
            profile_data(
                user,
                uid,
                request,
            )
        )

class ProfilePictureView(APIView):
    authentication_classes = [FirebaseTokenAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    MAX_SIZE = 5 * 1024 * 1024
    ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
    ALLOWED_CONTENT_TYPES = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    def get_user(self, request):
        uid = request.auth.get("uid")
        return User.objects.filter(firebase_uid=uid).first()

    def post(self, request):
        user = self.get_user(request)

        if not user:
            return Response(
                {"detail": "BloodBridge profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        photo = request.FILES.get("photo")

        if not photo:
            return Response(
                {"detail": "Please select a profile picture."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if photo.size > self.MAX_SIZE:
            return Response(
                {"detail": "Image must be 5 MB or smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if photo.content_type not in self.ALLOWED_CONTENT_TYPES:
            return Response(
                {"detail": "Only JPG, PNG, and WebP images are allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(photo) as image:
                image_format = image.format
                image.verify()

            if image_format not in self.ALLOWED_FORMATS:
                return Response(
                    {"detail": "Only JPG, PNG, and WebP images are allowed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            photo.seek(0)

        except (UnidentifiedImageError, OSError, ValueError):
            return Response(
                {"detail": "The selected file is not a valid image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_picture = (
            user.profile_picture.name
            if user.profile_picture
            else None
        )

        try:
            user.profile_picture.save(
                photo.name,
                photo,
                save=False,
            )
            user.save(
                update_fields=[
                    "profile_picture",
                    "updated_at",
                ]
            )
        except Exception:
            logger.exception("Failed to save profile picture.")
            return Response(
                {
                    "detail": (
                        "Unable to save the profile picture. "
                        "Please try again."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if old_picture and old_picture != user.profile_picture.name:
            try:
                user.profile_picture.storage.delete(old_picture)
            except Exception:
                logger.exception(
                    "Failed to delete the previous profile picture."
                )

        return Response(
            profile_data(user, request=request)
        )

    def delete(self, request):
        user = self.get_user(request)

        if not user:
            return Response(
                {"detail": "BloodBridge profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.profile_picture:
            user.profile_picture.delete(save=False)
            user.profile_picture = None
            user.save(
                update_fields=[
                    "profile_picture",
                    "updated_at",
                ]
            )

        return Response(
            profile_data(user, request=request)
        )

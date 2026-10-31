import csv
import os

from audit_logs.models import AuditLog
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponse
from django.utils import timezone

from notifications.models import Notification

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from blood_requests.models import BloodRequest

from .firebase_authentication import FirebaseUserAuthentication
from .models import (
    User,
    VerificationApplication,
    VerificationDocument,
)
from .permission import IsSuperAdmin
from .views import VERIFICATION_REQUIREMENTS


class SuperAdminDashboardView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        users = User.objects.all()

        verified_hospitals = VerificationApplication.objects.filter(
            user__role=User.Role.HOSPITAL_ADMIN,
            status=VerificationApplication.Status.APPROVED,
        ).count()

        verified_communities = VerificationApplication.objects.filter(
            user__role=User.Role.COMMUNITY_ADMIN,
            status=VerificationApplication.Status.APPROVED,
        ).count()

        recent_registrations = [
            {
                "id": str(user.id),
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "account_status": user.account_status,
                "created_at": user.created_at,
            }
            for user in User.objects.order_by("-created_at")[:5]
        ]

        active_request_statuses = [
            BloodRequest.Status.OPEN,
            BloodRequest.Status.MATCHING,
            BloodRequest.Status.PARTIALLY_FULFILLED,
        ]

        active_blood_requests = BloodRequest.objects.filter(
            status__in=active_request_statuses
        ).count()

        urgent_requests = (
            BloodRequest.objects
            .select_related("hospital")
            .filter(
                status__in=active_request_statuses,
                urgency__in=[
                    BloodRequest.Urgency.URGENT,
                    BloodRequest.Urgency.CRITICAL,
                ],
            )
            .order_by("-created_at")
        )

        urgent_request_results = [
            {
                "id": str(blood_request.id),
                "hospital_name": blood_request.hospital.full_name,
                "blood_group": blood_request.blood_group,
                "units_required": blood_request.units_required,
                "urgency": blood_request.urgency,
                "status": blood_request.status,
                "required_by": blood_request.required_by,
                "created_at": blood_request.created_at,
            }
            for blood_request in urgent_requests[:5]
        ]

        return Response({
            "statistics": {
                "total_users": users.count(),

                "active_users": users.filter(
                    account_status=User.AccountStatus.ACTIVE
                ).count(),

                "pending_users": users.filter(
                    account_status=User.AccountStatus.PENDING
                ).count(),

                "suspended_users": users.filter(
                    account_status=User.AccountStatus.SUSPENDED
                ).count(),

                "pending_hospitals": users.filter(
                    role=User.Role.HOSPITAL_ADMIN,
                    account_status=User.AccountStatus.PENDING,
                ).count(),

                "pending_communities": users.filter(
                    role=User.Role.COMMUNITY_ADMIN,
                    account_status=User.AccountStatus.PENDING,
                ).count(),

                "verified_hospitals": verified_hospitals,

                "registered_communities": verified_communities,

                "pending_verifications": (
                    VerificationApplication.objects.filter(
                        user__role__in=[
                            User.Role.HOSPITAL_ADMIN,
                            User.Role.COMMUNITY_ADMIN,
                        ],
                        status__in=[
                            VerificationApplication.Status.SUBMITTED,
                            VerificationApplication.Status.UNDER_REVIEW,
                        ],
                    ).count()
                ),

                "blood_requests": active_blood_requests,

                "active_blood_requests": active_blood_requests,

                "urgent_requests": len(urgent_request_results),
            },

            "recent_registrations": recent_registrations,

            "urgent_requests": urgent_request_results,

            "users_by_role": list(
                User.objects.values("role")
                .annotate(
                    total=Count(
                        "id",
                        filter=Q(
                            account_status=User.AccountStatus.ACTIVE,
                            is_active=True,
                        ),
                    )
                )
                .filter(total__gt=0)
                .order_by("role")
            ),
        })

class PendingApplicationsView(APIView):
    """
    Return verification applications for a requested role/status.

    Supported statuses:
        pending   -> submitted + under_review
        verified  -> approved
        rejected  -> rejected
        all       -> all submitted applications

    Draft applications are always excluded.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        role = request.query_params.get("role")
        requested_status = (
            request.query_params.get("status", "pending")
            .strip()
            .lower()
        )

        allowed_roles = {
            "hospital": User.Role.HOSPITAL_ADMIN,
            "community": User.Role.COMMUNITY_ADMIN,
            "donor": User.Role.DONOR,
        }

        if role not in allowed_roles:
            return Response(
                {
                    "detail": (
                        "Role must be hospital, community, or donor."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        status_map = {
            "pending": {
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
            },
            "verified": {
                VerificationApplication.Status.APPROVED,
            },
            "rejected": {
                VerificationApplication.Status.REJECTED,
            },
            "all": {
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
                VerificationApplication.Status.APPROVED,
                VerificationApplication.Status.REJECTED,
            },
        }

        if requested_status not in status_map:
            return Response(
                {
                    "detail": (
                        "Status must be pending, verified, "
                        "rejected, or all."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        applications = (
            VerificationApplication.objects
            .select_related("user")
            .filter(
                user__role=allowed_roles[role],
                status__in=status_map[requested_status],
            )
            .exclude(
                status=VerificationApplication.Status.DRAFT
            )
            .order_by("-submitted_at", "-created_at")
        )

        results = []

        for application in applications:
            required_types = {
                requirement["type"]
                for requirement in VERIFICATION_REQUIREMENTS.get(
                    application.user.role,
                    [],
                )
                if requirement["required"]
            }

            uploaded_types = set(
                application.documents.filter(
                    document_type__in=required_types,
                ).values_list(
                    "document_type",
                    flat=True,
                )
            )

            missing_types = (
                required_types - uploaded_types
            )

            results.append({
                "id": str(application.user.id),
                "application_id": str(application.id),
                "full_name": application.user.full_name,
                "email": application.user.email,
                "phone": application.user.mobile_number,
                "role": application.user.role,

                # Keep both values so the frontend can
                # distinguish account status from application status.
                "status": application.user.account_status,
                "account_status": application.user.account_status,
                "verification_status": application.status,
                "application_status": application.status,

                "email_verified": (
                    application.user.email_verified
                ),

                "created_at": (
                    application.user.created_at
                ),

                "submitted_at": (
                    application.submitted_at
                ),

                "reviewed_at": (
                    application.reviewed_at
                ),

                "required_documents_count": (
                    len(required_types)
                ),

                "uploaded_required_documents_count": (
                    len(uploaded_types)
                ),

                "missing_required_documents": (
                    list(missing_types)
                ),

                "all_required_documents_uploaded": (
                    not bool(missing_types)
                ),
            })

        return Response({
            "results": results,
            "count": len(results),
            "status": requested_status,
            "role": role,
        })

class VerificationApplicationDetailView(APIView):
    """
    Return complete verification information for one applicant.

    File URLs are deliberately not exposed. Documents are accessed
    through the authenticated document-download endpoint.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request, user_id):
        try:
            application = (
                VerificationApplication.objects
                .select_related("user")
                .prefetch_related("documents")
                .get(
                    user_id=user_id,
                    user__role__in=[
                        User.Role.HOSPITAL_ADMIN,
                        User.Role.COMMUNITY_ADMIN,
                        User.Role.DONOR,
                    ],
                )
            )
        except VerificationApplication.DoesNotExist:
            return Response(
                {
                    "detail": "Verification application not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        requirements = VERIFICATION_REQUIREMENTS.get(
            application.user.role,
            [],
        )

        documents_by_type = {
            document.document_type: document
            for document in application.documents.all()
        }

        documents = []

        for requirement in requirements:
            document_type = requirement["type"]
            document = documents_by_type.get(document_type)

            label = VerificationDocument(
                document_type=document_type
            ).get_document_type_display()

            documents.append({
                "document_type": document_type,
                "label": label,
                "required": requirement["required"],
                "id": (
                    str(document.id)
                    if document
                    else None
                ),
                "status": (
                    document.status
                    if document
                    else None
                ),
                "rejection_reason": (
                    document.rejection_reason
                    if document
                    else ""
                ),
                "uploaded_at": (
                    document.uploaded_at
                    if document
                    else None
                ),
            })

        return Response({
            "application": {
                "id": str(application.id),
                "status": application.status,
                "submitted_at": application.submitted_at,
                "reviewed_at": application.reviewed_at,
                "rejection_reason": application.rejection_reason,
            },
            "applicant": {
                "id": str(application.user.id),
                "full_name": application.user.full_name,
                "email": application.user.email,
                "phone": application.user.mobile_number,
                "role": application.user.role,
                "account_status": application.user.account_status,
                "email_verified": application.user.email_verified,
                "created_at": application.user.created_at,
            },
            "documents": documents,
        })


class VerificationDocumentDownloadView(APIView):
    """
    Securely stream a verification document to a Super Admin.

    Documents are never exposed through a public media URL.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request, document_id):
        try:
            document = (
                VerificationDocument.objects
                .select_related(
                    "application",
                    "application__user",
                )
                .get(id=document_id)
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
            as_attachment=True,
            filename=filename,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"

        return response


class VerificationDocumentDecisionView(APIView):
    """
    Verify or reject an uploaded verification document.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def patch(self, request, document_id):
        try:
            document = (
                VerificationDocument.objects
                .select_related(
                    "application",
                    "application__user",
                )
                .get(id=document_id)
            )
        except VerificationDocument.DoesNotExist:
            return Response(
                {
                    "detail": "Verification document not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        decision = str(
            request.data.get("decision", "")
        ).strip().lower()

        decision_aliases = {
            "verify": VerificationDocument.Status.VERIFIED,
            "verified": VerificationDocument.Status.VERIFIED,
            "reject": VerificationDocument.Status.REJECTED,
            "rejected": VerificationDocument.Status.REJECTED,
        }

        decision = decision_aliases.get(decision)

        if decision not in {
            VerificationDocument.Status.VERIFIED,
            VerificationDocument.Status.REJECTED,
        }:
            return Response(
                {
                    "detail": (
                        "Decision must be either "
                        "'verify' or 'reject'."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rejection_reason = str(
            request.data.get("rejection_reason", "")
        ).strip()

        if (
            decision == VerificationDocument.Status.REJECTED
            and not rejection_reason
        ):
            return Response(
                {
                    "detail": (
                        "A rejection reason is required "
                        "when rejecting a document."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        firebase_uid = getattr(
            request.user,
            "firebase_uid",
            None,
        )

        if not firebase_uid:
            firebase_uid = getattr(
                request.user,
                "uid",
                None,
            )

        if not firebase_uid:
            return Response(
                {
                    "detail": (
                        "Unable to identify the authenticated "
                        "Super Admin."
                    )
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            reviewer = User.objects.get(
                firebase_uid=firebase_uid,
                role=User.Role.SUPER_ADMIN,
                account_status=User.AccountStatus.ACTIVE,
                is_active=True,
                is_superuser=True,
            )
        except User.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Authenticated Super Admin account "
                        "was not found."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            document.status = decision
            document.reviewed_by = reviewer
            document.reviewed_at = timezone.now()

            if decision == VerificationDocument.Status.REJECTED:
                document.rejection_reason = rejection_reason
            else:
                document.rejection_reason = ""

            document.save(
                update_fields=[
                    "status",
                    "reviewed_by",
                    "reviewed_at",
                    "rejection_reason",
                ]
            )

            application = document.application

            if (
                application.status
                == VerificationApplication.Status.SUBMITTED
            ):
                application.status = (
                    VerificationApplication.Status.UNDER_REVIEW
                )

                application.save(
                    update_fields=[
                        "status",
                        "updated_at",
                    ]
                )

            Notification.objects.create(
    recipient=application.user,
    title=(
        "Verification document verified"
        if decision == VerificationDocument.Status.VERIFIED
        else "Verification document rejected"
    ),
    message=(
        (
            f"Your "
            f"{document.get_document_type_display()} "
            "has been verified."
        )
        if decision == VerificationDocument.Status.VERIFIED
        else (
            f"Your "
            f"{document.get_document_type_display()} "
            f"was rejected. Reason: "
            f"{rejection_reason}"
        )
    ),
    category=Notification.Category.VERIFICATION,
    link="/login",
)

        return Response(
            {
                "detail": (
                    "Document verified successfully."
                    if decision
                    == VerificationDocument.Status.VERIFIED
                    else "Document rejected successfully."
                ),
                "document": {
                    "id": str(document.id),
                    "document_type": document.document_type,
                    "status": document.status,
                    "rejection_reason": document.rejection_reason,
                    "reviewed_at": document.reviewed_at,
                },
                "application_status": application.status,
            },
            status=status.HTTP_200_OK,
        )
class ApplicationDecisionView(APIView):
    """
    Final Super Admin decision for a verification application.

    Approval is only possible after every mandatory document
    has been individually verified.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, user_id):
        decision = request.data.get("decision")

        rejection_reason = (
            request.data.get("rejection_reason", "")
            .strip()
        )

        if decision not in ("approve", "reject"):
            return Response(
                {
                    "detail": (
                        "Decision must be approve or reject."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if decision == "reject" and not rejection_reason:
            return Response(
                {
                    "detail": (
                        "A rejection reason is required "
                        "when rejecting an application."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        reviewer = request.user

        if not reviewer:
            return Response(
                {
                    "detail": (
                        "Authenticated super admin account "
                        "was not found."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            try:
                application = (
                    VerificationApplication.objects
                    .select_for_update()
                    .select_related("user")
                    .get(
                        user_id=user_id,
                        user__role__in=[
                            User.Role.HOSPITAL_ADMIN,
                            User.Role.COMMUNITY_ADMIN,
                        ],
                    )
                )
            except VerificationApplication.DoesNotExist:
                return Response(
                    {
                        "detail": (
                            "Verification application not found."
                        )
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            if application.status not in {
                VerificationApplication.Status.SUBMITTED,
                VerificationApplication.Status.UNDER_REVIEW,
            }:
                return Response(
                    {
                        "detail": (
                            "This application is not ready "
                            "for a final decision."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if decision == "approve":
                required_types = {
                    requirement["type"]
                    for requirement in VERIFICATION_REQUIREMENTS.get(
                        application.user.role,
                        [],
                    )
                    if requirement["required"]
                }

                documents = {
                    document.document_type: document
                    for document in application.documents.filter(
                        document_type__in=required_types,
                    )
                }

                missing_documents = (
                    required_types - set(documents.keys())
                )

                if missing_documents:
                    return Response(
                        {
                            "detail": (
                                "Approval is blocked because "
                                "required documents are missing."
                            ),
                            "missing_documents": list(
                                missing_documents
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                unverified_documents = [
                    document.document_type
                    for document in documents.values()
                    if document.status
                    != VerificationDocument.Status.VERIFIED
                ]

                if unverified_documents:
                    return Response(
                        {
                            "detail": (
                                "Approval is blocked because "
                                "all required documents must "
                                "be individually verified."
                            ),
                            "unverified_documents": (
                                unverified_documents
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                application.status = (
                    VerificationApplication.Status.APPROVED
                )
                application.reviewed_at = timezone.now()
                application.reviewed_by = reviewer
                application.rejection_reason = ""

                application.user.account_status = (
                    User.AccountStatus.ACTIVE
                )
                application.user.is_active = True

                application.user.save(
                    update_fields=[
                        "account_status",
                        "is_active",
                        "updated_at",
                    ]
                )

                title = "Application Approved"

                message = (
                    "Your BloodBridge verification application "
                    "has been approved. You can now access "
                    "your account."
                )

                audit_action = AuditLog.ActionType.APPROVE

                audit_description = (
                    f"Verification application approved for "
                    f"{application.user.full_name}."
                )

                audit_reason = (
                    "All mandatory verification documents "
                    "were individually verified."
                )

            else:
                application.status = (
                    VerificationApplication.Status.REJECTED
                )
                application.reviewed_at = timezone.now()
                application.reviewed_by = reviewer
                application.rejection_reason = rejection_reason

                application.user.account_status = (
                    User.AccountStatus.REJECTED
                )
                application.user.is_active = False

                application.user.save(
                    update_fields=[
                        "account_status",
                        "is_active",
                        "updated_at",
                    ]
                )

                title = "Application Rejected"

                message = (
                    "Your BloodBridge verification application "
                    "was rejected. Please review the reason and "
                    "contact the administration if you need "
                    "further assistance."
                )

                audit_action = AuditLog.ActionType.REJECT

                audit_description = (
                    f"Verification application rejected for "
                    f"{application.user.full_name}."
                )

                audit_reason = rejection_reason

            application.save(
                update_fields=[
                    "status",
                    "reviewed_at",
                    "reviewed_by",
                    "rejection_reason",
                    "updated_at",
                ]
            )

            Notification.objects.create(
                recipient=application.user,
                title=title,
                message=message,
                category=Notification.Category.VERIFICATION,
                link="/login",
            )

            AuditLog.objects.create(
                actor=reviewer,
                action=audit_action,
                description=audit_description,
                target_type="verification_application",
                target_id=str(application.id),
                outcome=AuditLog.Outcome.SUCCESS,
                reason=audit_reason,
                ip_address=request.META.get("REMOTE_ADDR"),
                metadata={
                    "user_id": str(application.user.id),
                    "user_email": application.user.email,
                    "user_role": application.user.role,
                    "application_status": application.status,
                },
            )

        return Response(
            {
                "message": (
                    "Application approved."
                    if decision == "approve"
                    else "Application rejected."
                ),
                "id": str(application.user.id),
                "application_id": str(application.id),
                "status": application.status,
                "account_status": (
                    application.user.account_status
                ),
            },
            status=status.HTTP_200_OK,
        )
    
class UserManagementView(APIView):
    """
    List real users, return live account statistics,
    filter/search accounts, and export filtered users.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        users = User.objects.all().order_by("-created_at")

        search = request.query_params.get("search", "").strip()

        if search:
            users = users.filter(
                Q(full_name__icontains=search)
                | Q(email__icontains=search)
                | Q(mobile_number__icontains=search)
            )

        role = request.query_params.get("role", "").strip()
        account_status = request.query_params.get(
            "status",
            "",
        ).strip()

        valid_roles = {
            value
            for value, _ in User.Role.choices
        }

        valid_statuses = {
            value
            for value, _ in User.AccountStatus.choices
        }

        if role and role not in valid_roles:
            raise ValidationError({
                "role": "Invalid role filter."
            })

        if account_status and account_status not in valid_statuses:
            raise ValidationError({
                "status": "Invalid status filter."
            })

        if role:
            users = users.filter(role=role)

        if account_status:
            users = users.filter(
                account_status=account_status
            )

        if request.query_params.get(
            "export",
            "",
        ).lower() == "csv":

            response = HttpResponse(
                content_type="text/csv; charset=utf-8"
            )

            response["Content-Disposition"] = (
                'attachment; filename="bloodbridge-users.csv"'
            )

            writer = csv.writer(response)

            writer.writerow([
                "ID",
                "Full Name",
                "Email",
                "Phone",
                "Role",
                "Status",
                "Email Verified",
                "Joined",
            ])

            for user in users.iterator():
                writer.writerow([
                    str(user.id),
                    user.full_name,
                    user.email,
                    user.mobile_number,
                    user.role,
                    user.account_status,
                    user.email_verified,
                    user.created_at.isoformat(),
                ])

            return response

        all_users = User.objects.all()

        statistics = {
            "total_users": all_users.count(),
            "active_users": all_users.filter(
                account_status=User.AccountStatus.ACTIVE
            ).count(),
            "pending_users": all_users.filter(
                account_status=User.AccountStatus.PENDING
            ).count(),
            "suspended_users": all_users.filter(
                account_status=User.AccountStatus.SUSPENDED
            ).count(),
        }

        try:
            page = max(
                1,
                int(
                    request.query_params.get(
                        "page",
                        1,
                    )
                ),
            )

            page_size = int(
                request.query_params.get(
                    "page_size",
                    10,
                )
            )

        except (TypeError, ValueError):
            raise ValidationError({
                "page": (
                    "Page and page_size must be integers."
                )
            })

        page_size = min(
            max(page_size, 1),
            100,
        )

        total = users.count()

        start = (
            page - 1
        ) * page_size

        page_users = users[
            start:start + page_size
        ]

        results = [
            {
                "id": str(user.id),
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.mobile_number,
                "role": user.role,
                "status": user.account_status,
                "email_verified": user.email_verified,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat(),
            }
            for user in page_users
        ]

        return Response({
            "statistics": statistics,
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (
                (total + page_size - 1)
                // page_size
            ),
            "results": results,
        })


class UserAccountStatusView(APIView):
    """
    Allow Super Admins to suspend or reactivate eligible accounts.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def patch(self, request, user_id):
        new_status = request.data.get("status")

        if new_status not in (
            User.AccountStatus.ACTIVE,
            User.AccountStatus.SUSPENDED,
        ):
            return Response(
                {
                    "detail": (
                        "Status must be active or suspended."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                user = (
                    User.objects
                    .select_for_update()
                    .get(id=user_id)
                )
            except User.DoesNotExist:
                return Response(
                    {
                        "detail": "User not found."
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            if user.role == User.Role.SUPER_ADMIN:
                return Response(
                    {
                        "detail": (
                            "Super Admin accounts cannot be "
                            "changed here."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if user.account_status == (
                User.AccountStatus.REJECTED
            ):
                return Response(
                    {
                        "detail": (
                            "Rejected accounts cannot be "
                            "reactivated through this action."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.account_status = new_status

            user.is_active = (
                new_status
                == User.AccountStatus.ACTIVE
            )

            user.save(
                update_fields=[
                    "account_status",
                    "is_active",
                    "updated_at",
                ]
            )

        return Response({
            "message": (
                "Account suspended."
                if new_status
                == User.AccountStatus.SUSPENDED
                else "Account reactivated."
            ),
            "id": str(user.id),
            "status": user.account_status,
            "is_active": user.is_active,
        })

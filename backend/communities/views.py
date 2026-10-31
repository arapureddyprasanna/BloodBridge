import logging
import os
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q
from django.http import FileResponse
from django.utils import timezone

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.models import (
    User,
    VerificationApplication,
    VerificationDocument,
)
from accounts.permission import IsHospitalAdmin
from blood_requests.models import BloodRequest
from blood_requests.views import get_hospital_from_request
from donors.models import DonorInvitation, DonorProfile
from matching.services import find_matching_donors
from notifications.models import Notification

from .models import (
    Community,
    CommunityAnnouncement,
    CommunityBloodRequestShare,
    CommunityReview,
    DonationCamp,
    DonationCampRegistration,
    DonorCommunityApplication,
)
from .permissions import (
    IsCommunityAdmin,
    IsDonor,
    IsDonorOnboarding,
)
from .serializers import (
    CommunityApplicationSerializer,
    CommunityAnnouncementSerializer,
    CommunityBloodRequestShareSerializer,
    CommunityDetailSerializer,
    CommunityListSerializer,
    CommunityMemberDirectorySerializer,
    CommunityProfileSerializer,
    CommunityReviewCreateSerializer,
    CommunityReviewSerializer,
    DonationCampRegistrationSerializer,
    DonationCampSerializer,
)


logger = logging.getLogger(__name__)


DONOR_REQUIRED_DOCUMENT_TYPES = {
    VerificationDocument.DocumentType.DONOR_IDENTITY,
    VerificationDocument.DocumentType.AGE_VERIFICATION,
    VerificationDocument.DocumentType.DONOR_DECLARATION,
}


def get_active_donor(request):
    user = request.user

    if (
        not user.is_authenticated
        or user.role != User.Role.DONOR
        or user.account_status != User.AccountStatus.ACTIVE
        or not user.is_active
    ):
        return None

    return user


def get_onboarding_donor(request):
    user = request.user

    if (
        not user.is_authenticated
        or user.role != User.Role.DONOR
        or user.account_status
        not in {
            User.AccountStatus.PENDING,
            User.AccountStatus.ACTIVE,
        }
        or not user.is_active
    ):
        return None

    return user


def get_active_community_admin(request):
    user = request.user

    if (
        not user.is_authenticated
        or user.role != User.Role.COMMUNITY_ADMIN
        or user.account_status != User.AccountStatus.ACTIVE
        or not user.is_active
    ):
        return None

    return user


def get_eligible_communities():
    return (
        Community.objects
        .filter(
            is_active=True,
            admin__role=User.Role.COMMUNITY_ADMIN,
            admin__account_status=User.AccountStatus.ACTIVE,
            admin__is_active=True,
            admin__verification_application__status=(
                VerificationApplication.Status.APPROVED
            ),
        )
        .select_related(
            "admin",
            "admin__verification_application",
        )
    )


class CommunityListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    def get(self, request):
        communities = get_eligible_communities()

        return Response(
            {
                "count": communities.count(),
                "results": CommunityListSerializer(
                    communities,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CommunityDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    def get(self, request, community_id):
        community = (
            get_eligible_communities()
            .filter(id=community_id)
            .first()
        )

        if community is None:
            return Response(
                {"detail": "Community not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            CommunityDetailSerializer(
                community,
                context={"request": request},
            ).data
        )


class DonorJoinCommunityView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    @transaction.atomic
    def post(self, request, community_id):
        donor = get_onboarding_donor(request)

        if donor is None:
            return Response(
                {
                    "detail": (
                        "Only registered donors can join a community."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        community = (
            get_eligible_communities()
            .select_for_update()
            .filter(id=community_id)
            .first()
        )

        if community is None:
            return Response(
                {"detail": "Community is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        accepted_membership = (
            DonorCommunityApplication.objects
            .filter(
                donor=donor,
                status=DonorCommunityApplication.Status.ACCEPTED,
            )
            .select_related("community")
            .first()
        )

        if accepted_membership:
            return Response(
                {
                    "detail": (
                        "You are already a member of a community."
                    ),
                    "community_id": str(
                        accepted_membership.community.id
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        pending_application = (
            DonorCommunityApplication.objects
            .filter(
                donor=donor,
                status=DonorCommunityApplication.Status.PENDING,
            )
            .select_related("community")
            .first()
        )

        if pending_application:
            if pending_application.community_id == community.id:
                return Response(
                    {
                        "detail": (
                            "Your membership request is already "
                            "pending for this community."
                        ),
                        "application_id": str(
                            pending_application.id
                        ),
                        "status": pending_application.status,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            return Response(
                {
                    "detail": (
                        "You already have a pending community "
                        "membership request."
                    ),
                    "community_id": str(
                        pending_application.community.id
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        application = DonorCommunityApplication.objects.create(
            donor=donor,
            community=community,
            status=DonorCommunityApplication.Status.PENDING,
        )

        try:
            Notification.objects.create(
                recipient=community.admin,
                title="New Donor Membership Request",
                message=(
                    f"{donor.full_name} requested to join "
                    f"{community.name}."
                ),
                category=Notification.Category.VERIFICATION,
                link="/community/applications",
            )
        except Exception:
            logger.exception(
                "Failed to create community membership notification."
            )

        return Response(
            {
                "detail": (
                    "Community membership request submitted."
                ),
                "application_id": str(application.id),
                "community_id": str(community.id),
                "status": application.status,
            },
            status=status.HTTP_201_CREATED,
        )


class DonorCommunityApplicationView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    def get(self, request):
        donor = get_onboarding_donor(request)

        if donor is None:
            return Response(
                {
                    "detail": (
                        "Only registered donors can access this."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application = (
            DonorCommunityApplication.objects
            .filter(donor=donor)
            .select_related(
                "community",
                "reviewed_by",
                "donor",
            )
            .order_by("-submitted_at")
            .first()
        )

        if application is None:
            return Response(
                {
                    "has_application": False,
                    "application": None,
                }
            )

        return Response(
            {
                "has_application": True,
                "application": CommunityApplicationSerializer(
                    application
                ).data,
            }
        )


class DonorCancelCommunityApplicationView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    @transaction.atomic
    def post(self, request):
        donor = get_onboarding_donor(request)

        if donor is None:
            return Response(
                {
                    "detail": (
                        "Only registered donors can cancel this."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application = (
            DonorCommunityApplication.objects
            .select_for_update()
            .filter(
                donor=donor,
                status=DonorCommunityApplication.Status.PENDING,
            )
            .first()
        )

        if application is None:
            return Response(
                {
                    "detail": (
                        "No pending community application was found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application.status = (
            DonorCommunityApplication.Status.CANCELLED
        )
        application.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )

        return Response(
            {
                "detail": "Community application cancelled.",
                "status": application.status,
            }
        )


class CommunityReviewListCreateView(APIView):
    authentication_classes = [FirebaseUserAuthentication]

    def get(self, request, community_id):
        community = (
            get_eligible_communities()
            .filter(id=community_id)
            .first()
        )

        if community is None:
            return Response(
                {"detail": "Community not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        reviews = community.reviews.select_related("donor")
        summary = reviews.aggregate(average=Avg("rating"), count=Count("id"))

        return Response(
            {
                "count": summary["count"],
                "rating": (
                    round(float(summary["average"]), 1)
                    if summary["average"] is not None else 0
                ),
                "results": CommunityReviewSerializer(
                    reviews,
                    many=True,
                ).data,
                "my_review": (
                    CommunityReviewSerializer(
                        reviews.filter(donor_id=request.user.id).first()
                    ).data
                    if get_active_donor(request)
                    and DonorCommunityApplication.objects.filter(
                        donor=request.user,
                        community=community,
                        status=DonorCommunityApplication.Status.ACCEPTED,
                    ).exists()
                    else None
                ),
            }
        )

    def post(self, request, community_id):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {
                    "detail": (
                        "Only active donors can review a community."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        community = (
            get_eligible_communities()
            .filter(id=community_id)
            .first()
        )

        if community is None:
            return Response(
                {"detail": "Community not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        membership = (
            DonorCommunityApplication.objects
            .filter(
                donor=donor,
                community=community,
                status=DonorCommunityApplication.Status.ACCEPTED,
            )
            .first()
        )

        if membership is None:
            return Response(
                {
                    "detail": (
                        "You can review a community only after "
                        "your membership has been accepted."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CommunityReviewCreateSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                review = CommunityReview.objects.create(
                    donor=donor,
                    community=community,
                    **serializer.validated_data,
                )
        except IntegrityError:
            return Response(
                {"detail": "You have already reviewed this community."},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            CommunityReviewSerializer(review).data,
            status=status.HTTP_201_CREATED,
        )

    @transaction.atomic
    def patch(self, request, community_id):
        donor = get_active_donor(request)
        if donor is None:
            return Response({"detail": "Only active donors can review a community."}, status=status.HTTP_403_FORBIDDEN)
        community = get_eligible_communities().filter(id=community_id).first()
        if community is None:
            return Response({"detail": "Community not found."}, status=status.HTTP_404_NOT_FOUND)
        if not DonorCommunityApplication.objects.filter(donor=donor, community=community, status=DonorCommunityApplication.Status.ACCEPTED).exists():
            return Response({"detail": "You can review a community only after your membership has been accepted."}, status=status.HTTP_403_FORBIDDEN)
        review = CommunityReview.objects.select_for_update().filter(community=community, donor=donor).first()
        if review is None:
            return Response({"detail": "Your community review was not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CommunityReviewCreateSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CommunityReviewSerializer(review).data)

    @transaction.atomic
    def delete(self, request, community_id):
        donor = get_active_donor(request)
        if donor is None:
            return Response({"detail": "Only active donors can review a community."}, status=status.HTTP_403_FORBIDDEN)
        community = get_eligible_communities().filter(id=community_id).first()
        if community is None:
            return Response({"detail": "Community not found."}, status=status.HTTP_404_NOT_FOUND)
        if not DonorCommunityApplication.objects.filter(donor=donor, community=community, status=DonorCommunityApplication.Status.ACCEPTED).exists():
            return Response({"detail": "You can review a community only after your membership has been accepted."}, status=status.HTTP_403_FORBIDDEN)
        review = CommunityReview.objects.select_for_update().filter(community=community, donor=donor).first()
        if review is None:
            return Response({"detail": "Your community review was not found."}, status=status.HTTP_404_NOT_FOUND)
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityProfileView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "exists": False,
                    "community": None,
                }
            )

        return Response(
            {
                "exists": True,
                "community": CommunityProfileSerializer(
                    community,
                    context={"request": request},
                ).data,
            }
        )

    def post(self, request):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
            serializer = CommunityProfileSerializer(
                community,
                data=request.data,
                partial=True,
                context={"request": request},
            )
        except Community.DoesNotExist:
            serializer = CommunityProfileSerializer(
                data=request.data,
                context={"request": request},
            )

        serializer.is_valid(raise_exception=True)

        community = serializer.save(admin=admin)

        return Response(
            CommunityProfileSerializer(
                community,
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


class CommunityApplicationListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        applications = (
            DonorCommunityApplication.objects
            .filter(community=community)
            .select_related(
                "donor",
                "donor__donor_profile",
                "donor__verification_application",
                "reviewed_by",
                "community",
            )
            .prefetch_related(
                "donor__verification_application__documents"
            )
            .order_by("-submitted_at")
        )

        return Response(
            {
                "count": applications.count(),
                "results": CommunityApplicationSerializer(
                    applications,
                    many=True,
                ).data,
            }
        )


class CommunityApplicationDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get_application(self, request, application_id):
        admin = get_active_community_admin(request)

        if admin is None:
            return None, Response(
                {
                    "detail": (
                        "Community admin access required."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return None, Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application = (
            DonorCommunityApplication.objects
            .filter(
                id=application_id,
                community=community,
            )
            .select_related(
                "donor",
                "donor__donor_profile",
                "donor__verification_application",
                "community",
                "reviewed_by",
            )
            .prefetch_related(
                "donor__verification_application__documents"
            )
            .first()
        )

        if application is None:
            return None, Response(
                {"detail": "Community application not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return application, None

    def get(self, request, application_id):
        application, error = self.get_application(
            request,
            application_id,
        )

        if error:
            return error

        return Response(
            CommunityApplicationSerializer(application).data
        )


class CommunityApplicationApproveView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    @transaction.atomic
    def post(self, request, application_id):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application = (
            DonorCommunityApplication.objects
            .select_for_update()
            .select_related(
                "donor",
                "community",
            )
            .filter(
                id=application_id,
                community=community,
            )
            .first()
        )

        if application is None:
            return Response(
                {"detail": "Community application not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.status != (
            DonorCommunityApplication.Status.PENDING
        ):
            return Response(
                {
                    "detail": (
                        "Only pending applications can be approved."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            verification = (
                application.donor.verification_application
            )
        except VerificationApplication.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "The donor has no verification application."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        documents = {
            document.document_type: document
            for document in verification.documents.all()
            if document.document_type
            in DONOR_REQUIRED_DOCUMENT_TYPES
        }

        missing = [
            document_type
            for document_type in DONOR_REQUIRED_DOCUMENT_TYPES
            if document_type not in documents
        ]

        if missing:
            return Response(
                {
                    "detail": (
                        "The donor must upload all required documents "
                        "before approval."
                    ),
                    "missing_documents": missing,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rejected = [
            document.document_type
            for document in documents.values()
            if document.status
            == VerificationDocument.Status.REJECTED
        ]

        unverified = [
            document.document_type
            for document in documents.values()
            if document.status
            != VerificationDocument.Status.VERIFIED
        ]

        if rejected or unverified:
            return Response(
                {
                    "detail": (
                        "Every required donor document must be "
                        "verified before membership approval."
                    ),
                    "rejected_documents": rejected,
                    "unverified_documents": unverified,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_membership = (
            DonorCommunityApplication.objects
            .filter(
                donor=application.donor,
                status=DonorCommunityApplication.Status.ACCEPTED,
            )
            .exclude(id=application.id)
            .first()
        )

        if existing_membership:
            return Response(
                {
                    "detail": (
                        "This donor is already a member of another "
                        "community."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        donor = application.donor

        application.status = (
            DonorCommunityApplication.Status.ACCEPTED
        )
        application.reviewed_at = timezone.now()
        application.reviewed_by = admin
        application.rejection_reason = ""

        application.save(
            update_fields=[
                "status",
                "reviewed_at",
                "reviewed_by",
                "rejection_reason",
                "updated_at",
            ]
        )

        # Community approval is the final donor verification step.
        # Activate the donor account so DonorRoute can grant
        # dashboard access.
        donor.account_status = User.AccountStatus.ACTIVE
        donor.is_active = True

        donor.save(
            update_fields=[
                "account_status",
                "is_active",
            ]
        )

        try:
            Notification.objects.create(
                recipient=donor,
                title="Community Membership Approved",
                message=(
                    f"Your membership request for "
                    f"{community.name} has been approved. "
                    "You can now access your donor dashboard."
                ),
                category=Notification.Category.VERIFICATION,
                link="/donor/dashboard",
            )
        except Exception:
            logger.exception(
                "Failed to notify donor about membership approval."
            )

        return Response(
            {
                "detail": "Donor membership approved.",
                "status": application.status,
                "application_id": str(application.id),
                "account_status": donor.account_status,
            }
        )


class CommunityApplicationRejectView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    @transaction.atomic
    def post(self, request, application_id):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application = (
            DonorCommunityApplication.objects
            .select_for_update()
            .select_related(
                "donor",
                "community",
            )
            .filter(
                id=application_id,
                community=community,
            )
            .first()
        )

        if application is None:
            return Response(
                {"detail": "Community application not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.status != (
            DonorCommunityApplication.Status.PENDING
        ):
            return Response(
                {
                    "detail": (
                        "Only pending applications can be rejected."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "")

        if not isinstance(reason, str):
            return Response(
                {"detail": "Rejection reason must be text."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = reason.strip()

        if not reason:
            return Response(
                {
                    "detail": (
                        "A rejection reason is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        application.status = (
            DonorCommunityApplication.Status.REJECTED
        )
        application.reviewed_at = timezone.now()
        application.reviewed_by = admin
        application.rejection_reason = reason

        application.save(
            update_fields=[
                "status",
                "reviewed_at",
                "reviewed_by",
                "rejection_reason",
                "updated_at",
            ]
        )

        try:
            Notification.objects.create(
                recipient=application.donor,
                title="Community Membership Rejected",
                message=(
                    f"Your membership request for "
                    f"{community.name} was rejected. "
                    f"Reason: {reason}"
                ),
                category=Notification.Category.VERIFICATION,
                link="/donor/onboarding/community",
            )
        except Exception:
            logger.exception(
                "Failed to notify donor about membership rejection."
            )

        return Response(
            {
                "detail": "Donor membership rejected.",
                "status": application.status,
                "application_id": str(application.id),
                "rejection_reason": reason,
            }
        )


class CommunityMemberListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        members = (
            DonorCommunityApplication.objects
            .filter(
                community=community,
                status=DonorCommunityApplication.Status.ACCEPTED,
            )
            .select_related(
                "donor",
                "donor__donor_profile",
            )
            .order_by("-reviewed_at")
        )

        return Response(
            {
                "count": members.count(),
                "results": CommunityMemberDirectorySerializer(
                    members,
                    many=True,
                ).data,
            }
        )


class DonorOnboardingStatusView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonorOnboarding]

    def get(self, request):
        donor = get_onboarding_donor(request)

        if donor is None:
            return Response(
                {
                    "detail": (
                        "Only registered donors can access this."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application = (
            DonorCommunityApplication.objects
            .filter(donor=donor)
            .select_related("community")
            .order_by("-submitted_at")
            .first()
        )

        try:
            verification = donor.verification_application
        except VerificationApplication.DoesNotExist:
            verification = None

        documents = {}

        if verification is not None:
            documents = {
                document.document_type: document
                for document in verification.documents.all()
                if document.document_type
                in DONOR_REQUIRED_DOCUMENT_TYPES
            }

        required_documents_uploaded = all(
            document_type in documents
            for document_type in DONOR_REQUIRED_DOCUMENT_TYPES
        )

        required_documents_verified = all(
            document_type in documents
            and documents[document_type].status
            == VerificationDocument.Status.VERIFIED
            for document_type in DONOR_REQUIRED_DOCUMENT_TYPES
        )

        has_rejected_documents = any(
            document.status
            == VerificationDocument.Status.REJECTED
            for document in documents.values()
        )

        has_pending_documents = any(
            document.status
            == VerificationDocument.Status.PENDING
            for document in documents.values()
        )

        # -----------------------------------------------------
        # 1. No community selected yet
        # -----------------------------------------------------

        if application is None:
            next_step = "community_selection"

        # -----------------------------------------------------
        # 2. Community membership was rejected/cancelled
        # -----------------------------------------------------

        elif application.status in {
            DonorCommunityApplication.Status.REJECTED,
            DonorCommunityApplication.Status.CANCELLED,
        }:
            next_step = "community_selection"

        # -----------------------------------------------------
        # 3. Community membership is still pending
        # -----------------------------------------------------
        #
        # IMPORTANT:
        # A pending community application means the donor is
        # already inside the community-review stage.
        #
        # Even if a document is rejected and being replaced,
        # do NOT send the donor back to the old documents route.
        #
        # Replacement now happens directly inside
        # PendingVerification.
        # -----------------------------------------------------

        elif application.status == (
            DonorCommunityApplication.Status.PENDING
        ):
            if not required_documents_uploaded:
                next_step = "documents"
            else:
                next_step = "documents"

        # -----------------------------------------------------
        # 4. Community membership accepted
        # -----------------------------------------------------
        #
        # Community approval is the final donor onboarding
        # approval step.
        #
        # If the donor is already accepted but documents are
        # not fully verified, keep the donor in onboarding
        # rather than allowing dashboard access.
        # -----------------------------------------------------

        elif application.status == (
            DonorCommunityApplication.Status.ACCEPTED
        ):
            if required_documents_verified:
                next_step = "dashboard"
            else:
                next_step = "community_review"

        # -----------------------------------------------------
        # 5. Safety fallback
        # -----------------------------------------------------

        else:
            next_step = "community_selection"

        return Response(
            {
                "community_selected": (
                    application is not None
                ),
                "community_application": (
                    CommunityApplicationSerializer(
                        application
                    ).data
                    if application
                    else None
                ),
                "verification_status": (
                    verification.status
                    if verification
                    else None
                ),
                "required_documents_uploaded": (
                    required_documents_uploaded
                ),
                "required_documents_verified": (
                    required_documents_verified
                ),
                "has_rejected_documents": (
                    has_rejected_documents
                ),
                "has_pending_documents": (
                    has_pending_documents
                ),
                "next_step": next_step,
                "dashboard_access": (
                    next_step == "dashboard"
                ),
            }
        )

class CommunityDocumentReviewView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    @transaction.atomic
    def patch(self, request, application_id, document_id):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Community profile has not been configured."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        application = (
            DonorCommunityApplication.objects
            .filter(
                id=application_id,
                community=community,
            )
            .select_related("donor")
            .first()
        )

        if application is None:
            return Response(
                {"detail": "Community application not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.status != (
            DonorCommunityApplication.Status.PENDING
        ):
            return Response(
                {
                    "detail": (
                        "Documents can only be reviewed while "
                        "the membership application is pending."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            verification = application.donor.verification_application
        except VerificationApplication.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "The donor has no verification application."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        document = (
            verification.documents
            .select_for_update()
            .filter(
                id=document_id,
                document_type__in=DONOR_REQUIRED_DOCUMENT_TYPES,
            )
            .first()
        )

        if document is None:
            return Response(
                {
                    "detail": (
                        "Donor verification document not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        new_status = request.data.get("status")
        reason = request.data.get("rejection_reason", "")

        allowed_statuses = {
            VerificationDocument.Status.VERIFIED,
            VerificationDocument.Status.REJECTED,
        }

        if new_status not in allowed_statuses:
            return Response(
                {
                    "detail": (
                        "Document status must be verified or rejected."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_status == VerificationDocument.Status.REJECTED:
            if not isinstance(reason, str) or not reason.strip():
                return Response(
                    {
                        "detail": (
                            "A rejection reason is required."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            document.rejection_reason = reason.strip()

        else:
            document.rejection_reason = ""

        document.status = new_status
        document.reviewed_at = timezone.now()
        document.reviewed_by = admin

        document.save(
            update_fields=[
                "status",
                "rejection_reason",
                "reviewed_at",
                "reviewed_by",
            ]
        )

        if new_status == VerificationDocument.Status.REJECTED:
            try:
                Notification.objects.create(
                    recipient=application.donor,
                    title="Donor Document Requires Correction",
                    message=(
                        f"Your {document.get_document_type_display()} "
                        f"document was rejected by "
                        f"{community.name}. "
                        f"Reason: {document.rejection_reason}"
                    ),
                    category=Notification.Category.VERIFICATION,
                    link="/verification/pending",
                )
            except Exception:
                logger.exception(
                    "Failed to notify donor about rejected document."
                )

        return Response(
            {
                "detail": "Donor document reviewed successfully.",
                "document_id": str(document.id),
                "status": document.status,
                "rejection_reason": document.rejection_reason,
            }
        )


class CommunityDocumentDownloadView(APIView):
    """Stream a donor document only to the community reviewing it."""

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request, application_id, document_id):
        admin = get_active_community_admin(request)

        if admin is None:
            return Response(
                {"detail": "Community admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            community = admin.community
        except Community.DoesNotExist:
            return Response(
                {"detail": "Community profile has not been configured."},
                status=status.HTTP_404_NOT_FOUND,
            )

        application = DonorCommunityApplication.objects.filter(
            id=application_id,
            community=community,
            status=DonorCommunityApplication.Status.PENDING,
        ).first()
        if application is None:
            return Response(
                {"detail": "Pending community application not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            verification = application.donor.verification_application
        except VerificationApplication.DoesNotExist:
            return Response(
                {"detail": "The donor has no verification application."},
                status=status.HTTP_404_NOT_FOUND,
            )

        document = verification.documents.filter(
            id=document_id,
            document_type__in=DONOR_REQUIRED_DOCUMENT_TYPES,
        ).first()
        if document is None or not document.file:
            return Response(
                {"detail": "Donor verification document not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            document.file.open("rb")
        except (FileNotFoundError, OSError):
            logger.exception("Unable to open donor verification document.")
            return Response(
                {"detail": "The document file is unavailable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        filename = os.path.basename(document.file.name)
        response = FileResponse(
            document.file,
            as_attachment=True,
            filename=filename,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


def get_configured_active_community(request):
    admin = get_active_community_admin(request)
    if admin is None:
        return None
    try:
        community = admin.community
    except Community.DoesNotExist:
        return None
    if not community.is_active or not VerificationApplication.objects.filter(
        user=admin,
        status=VerificationApplication.Status.APPROVED,
    ).exists():
        return None
    return community


class CommunityAnnouncementListCreateView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        queryset = CommunityAnnouncement.objects.filter(community=community)
        status_filter = request.query_params.get("status")
        if status_filter in CommunityAnnouncement.Status.values:
            queryset = queryset.filter(status=status_filter)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)
        return Response({"count": queryset.count(), "results": CommunityAnnouncementSerializer(queryset, many=True).data})

    def post(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        serializer = CommunityAnnouncementSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        announcement = serializer.save(community=community)
        return Response(CommunityAnnouncementSerializer(announcement).data, status=status.HTTP_201_CREATED)


class CommunityAnnouncementDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get_object(self, request, announcement_id):
        community = get_configured_active_community(request)
        if community is None:
            return None, None
        return community, CommunityAnnouncement.objects.filter(id=announcement_id, community=community).first()

    def get(self, request, announcement_id):
        _, obj = self.get_object(request, announcement_id)
        if obj is None:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CommunityAnnouncementSerializer(obj).data)

    def patch(self, request, announcement_id):
        _, obj = self.get_object(request, announcement_id)
        if obj is None:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CommunityAnnouncementSerializer(obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(CommunityAnnouncementSerializer(serializer.save()).data)

    def delete(self, request, announcement_id):
        _, obj = self.get_object(request, announcement_id)
        if obj is None:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)
        if obj.status != CommunityAnnouncement.Status.DRAFT:
            return Response({"detail": "Only draft announcements can be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityAnnouncementActionView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def post(self, request, announcement_id, action):
        community = get_configured_active_community(request)
        obj = CommunityAnnouncement.objects.filter(id=announcement_id, community=community).first() if community else None
        if obj is None:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)
        if action == "publish":
            if obj.status == CommunityAnnouncement.Status.ARCHIVED:
                return Response({"detail": "Archived announcements cannot be published."}, status=status.HTTP_400_BAD_REQUEST)
            obj.status = CommunityAnnouncement.Status.PUBLISHED
            obj.published_at = timezone.now()
            if obj.publication_date is None:
                obj.publication_date = timezone.localdate()
        elif action == "archive":
            obj.status = CommunityAnnouncement.Status.ARCHIVED
            obj.is_pinned = False
        elif action == "pin":
            if obj.status != CommunityAnnouncement.Status.PUBLISHED:
                return Response({"detail": "Only published announcements can be pinned."}, status=status.HTTP_400_BAD_REQUEST)
            obj.is_pinned = not obj.is_pinned
        else:
            return Response({"detail": "Unsupported announcement action."}, status=status.HTTP_404_NOT_FOUND)
        obj.save()
        return Response(CommunityAnnouncementSerializer(obj).data)


class CommunityAnnouncementFeedView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonor]

    def get(self, request, community_id):
        today = timezone.localdate()
        membership = DonorCommunityApplication.objects.filter(
            donor=request.user,
            community_id=community_id,
            status=DonorCommunityApplication.Status.ACCEPTED,
            community__is_active=True,
            community__admin__account_status=User.AccountStatus.ACTIVE,
            community__admin__is_active=True,
            community__admin__verification_application__status=VerificationApplication.Status.APPROVED,
        ).exists()
        if not membership:
            return Response({"detail": "Active community membership is required."}, status=status.HTTP_403_FORBIDDEN)
        queryset = CommunityAnnouncement.objects.filter(
            community_id=community_id,
            status=CommunityAnnouncement.Status.PUBLISHED,
        ).filter(Q(publication_date__isnull=True) | Q(publication_date__lte=today))
        return Response({"count": queryset.count(), "results": CommunityAnnouncementSerializer(queryset, many=True).data})


class DonationCampListCreateView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        queryset = DonationCamp.objects.filter(community=community).prefetch_related("registrations")
        camp_status = request.query_params.get("status")
        if camp_status in DonationCamp.Status.values:
            queryset = queryset.filter(status=camp_status)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)
        return Response({"count": queryset.count(), "results": DonationCampSerializer(queryset, many=True).data})

    def post(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        serializer = DonationCampSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(DonationCampSerializer(serializer.save(community=community)).data, status=status.HTTP_201_CREATED)


class DonationCampDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get_object(self, request, camp_id, lock=False):
        community = get_configured_active_community(request)
        queryset = DonationCamp.objects.filter(community=community) if community else DonationCamp.objects.none()
        if lock:
            queryset = queryset.select_for_update()
        return community, queryset.filter(id=camp_id).first()

    def get(self, request, camp_id):
        _, camp = self.get_object(request, camp_id)
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(DonationCampSerializer(camp).data)

    @transaction.atomic
    def patch(self, request, camp_id):
        _, camp = self.get_object(request, camp_id, lock=True)
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DonationCampSerializer(camp, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(DonationCampSerializer(serializer.save()).data)


class DonationCampCloseRegistrationView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    @transaction.atomic
    def post(self, request, camp_id):
        community = get_configured_active_community(request)
        camp = DonationCamp.objects.select_for_update().filter(community=community, id=camp_id).first() if community else None
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        camp.registration_open = False
        camp.save(update_fields=["registration_open", "updated_at"])
        return Response(DonationCampSerializer(camp).data)


class DonationCampRegistrationListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request, camp_id):
        community = get_configured_active_community(request)
        camp = DonationCamp.objects.filter(community=community, id=camp_id).first() if community else None
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        registrations = camp.registrations.filter(status=DonationCampRegistration.Status.REGISTERED, donor__donor_profile__community_visibility=True).select_related("donor")
        return Response({"count": registrations.count(), "results": DonationCampRegistrationSerializer(registrations, many=True).data})


class DonorCampRegistrationView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsDonor]

    @transaction.atomic
    def post(self, request, camp_id):
        camp = DonationCamp.objects.select_for_update().filter(id=camp_id, status=DonationCamp.Status.SCHEDULED).first()
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_eligible_communities().filter(id=camp.community_id).exists():
            return Response({"detail": "This community is not currently eligible to accept camp registrations."}, status=status.HTTP_400_BAD_REQUEST)
        if not camp.registration_open or camp.starts_at <= timezone.now():
            return Response({"detail": "Registration for this camp is closed."}, status=status.HTTP_400_BAD_REQUEST)
        membership = DonorCommunityApplication.objects.filter(donor=request.user, community=camp.community, status=DonorCommunityApplication.Status.ACCEPTED).exists()
        if not membership:
            return Response({"detail": "Active membership in this community is required."}, status=status.HTTP_403_FORBIDDEN)
        profile = DonorProfile.objects.filter(user=request.user).first()
        if profile is None:
            return Response({"detail": "Donor profile not found."}, status=status.HTTP_403_FORBIDDEN)
        registration = DonationCampRegistration.objects.filter(camp=camp, donor=request.user).first()
        if registration and registration.status == DonationCampRegistration.Status.REGISTERED:
            return Response({"detail": "You are already registered for this camp."}, status=status.HTTP_409_CONFLICT)
        count = camp.registrations.filter(status=DonationCampRegistration.Status.REGISTERED).count()
        if count >= camp.capacity:
            return Response({"detail": "This camp has reached its registration capacity."}, status=status.HTTP_400_BAD_REQUEST)
        if registration:
            registration.status = DonationCampRegistration.Status.REGISTERED
            registration.save(update_fields=["status", "updated_at"])
        else:
            registration = DonationCampRegistration.objects.create(camp=camp, donor=request.user)
        return Response(DonationCampRegistrationSerializer(registration).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def delete(self, request, camp_id):
        camp = DonationCamp.objects.select_for_update().filter(id=camp_id).first()
        if camp is None:
            return Response({"detail": "Donation camp not found."}, status=status.HTTP_404_NOT_FOUND)
        registration = DonationCampRegistration.objects.filter(camp=camp, donor=request.user, status=DonationCampRegistration.Status.REGISTERED).first()
        if registration is None:
            return Response({"detail": "Active camp registration not found."}, status=status.HTTP_404_NOT_FOUND)
        registration.status = DonationCampRegistration.Status.CANCELLED
        registration.save(update_fields=["status", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityBloodCoordinationView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        shares = list(CommunityBloodRequestShare.objects.filter(community=community, is_active=True).select_related("blood_request", "blood_request__hospital", "blood_request__hospital__hospital_profile"))
        eligible_counts = {}
        invitation_counts = {}
        for share in shares:
            key = str(share.blood_request_id)
            matches = find_matching_donors(share.blood_request, require_location=True)
            matching_user_ids = {match["donor"].id for match in matches}
            matching_user_ids -= set(DonorInvitation.objects.filter(blood_request=share.blood_request).values_list("donor_id", flat=True))
            eligible_counts[key] = DonorProfile.objects.filter(
                user_id__in=matching_user_ids,
                community_visibility=True,
                user__community_applications__community=community,
                user__community_applications__status=DonorCommunityApplication.Status.ACCEPTED,
            ).distinct().count()
            grouped = DonorInvitation.objects.filter(
                blood_request=share.blood_request,
                donor__community_applications__community=community,
                donor__community_applications__status=DonorCommunityApplication.Status.ACCEPTED,
            ).values("status").annotate(total=Count("id"))
            counts = {"pending": 0, "accepted": 0, "declined": 0}
            for row in grouped:
                if row["status"] in counts:
                    counts[row["status"]] = row["total"]
            invitation_counts[key] = counts
        return Response({"count": len(shares), "results": CommunityBloodRequestShareSerializer(shares, many=True, context={"eligible_counts": eligible_counts, "invitation_counts": invitation_counts}).data})


class CommunityCoordinationNotifyHospitalView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def post(self, request, request_id):
        community = get_configured_active_community(request)
        share = CommunityBloodRequestShare.objects.filter(
            community=community,
            blood_request_id=request_id,
            is_active=True,
            blood_request__status__in=[BloodRequest.Status.OPEN, BloodRequest.Status.MATCHING, BloodRequest.Status.PARTIALLY_FULFILLED],
        ).select_related("blood_request", "blood_request__hospital").first() if community else None
        if share is None:
            return Response({"detail": "An active shared request was not found."}, status=status.HTTP_404_NOT_FOUND)
        matching_ids = {match["donor"].id for match in find_matching_donors(share.blood_request, require_location=True)}
        already_invited = set(DonorInvitation.objects.filter(blood_request=share.blood_request).values_list("donor_id", flat=True))
        eligible_count = DonorProfile.objects.filter(
            user_id__in=matching_ids - already_invited,
            community_visibility=True,
            user__community_applications__community=community,
            user__community_applications__status=DonorCommunityApplication.Status.ACCEPTED,
        ).distinct().count()
        if not eligible_count:
            return Response({"detail": "There are no eligible, uninvited members to coordinate for this request."}, status=status.HTTP_400_BAD_REQUEST)
        title = "Community coordination request"
        link = f"/requests/{share.blood_request_id}"
        existing = Notification.objects.filter(recipient=share.blood_request.hospital, title=title, category=Notification.Category.BLOOD_REQUEST, link=link, is_read=False).first()
        if existing is None:
            Notification.objects.create(
                recipient=share.blood_request.hospital,
                title=title,
                message=f"{community.name} has {eligible_count} eligible, uninvited community member(s) for blood request {share.blood_request_id}. Review matching donors to send invitations.",
                category=Notification.Category.BLOOD_REQUEST,
                link=link,
            )
        return Response({"detail": "The hospital has been notified to review matching community members.", "eligible_member_count": eligible_count, "already_notified": existing is not None}, status=status.HTTP_200_OK)


class CommunityActivityView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsCommunityAdmin]

    def get(self, request):
        community = get_configured_active_community(request)
        if community is None:
            return Response({"detail": "An active, verified community profile is required."}, status=status.HTTP_403_FORBIDDEN)
        events = []
        for application in DonorCommunityApplication.objects.filter(community=community).select_related("donor").order_by("-submitted_at")[:200]:
            occurred_at = application.reviewed_at or application.submitted_at
            events.append({"id": f"membership-{application.id}", "kind": "application", "status": application.status, "at": occurred_at, "title": "Donor membership application received" if application.status == DonorCommunityApplication.Status.PENDING else f"Membership application {application.status}", "detail": application.donor.full_name})
        for review in CommunityReview.objects.filter(community=community).select_related("donor").order_by("-created_at")[:100]:
            events.append({"id": f"review-{review.id}", "kind": "review", "status": "received", "at": review.created_at, "title": "Member review received", "detail": f"{review.donor.full_name} · {review.rating}/5"})
        for announcement in CommunityAnnouncement.objects.filter(community=community).order_by("-updated_at")[:100]:
            occurred_at = announcement.published_at or announcement.updated_at
            events.append({"id": f"announcement-{announcement.id}", "kind": "announcement", "status": announcement.status, "at": occurred_at, "title": f"Announcement {announcement.status}", "detail": announcement.title})
        for camp in DonationCamp.objects.filter(community=community).order_by("-updated_at")[:100]:
            events.append({"id": f"camp-{camp.id}", "kind": "camp", "status": camp.status, "at": camp.updated_at, "title": "Donation camp scheduled" if camp.status == DonationCamp.Status.SCHEDULED else "Donation camp cancelled", "detail": camp.title})
        registrations = DonationCampRegistration.objects.filter(
            camp__community=community,
            status=DonationCampRegistration.Status.REGISTERED,
            donor__donor_profile__community_visibility=True,
        ).select_related("camp", "donor").order_by("-created_at")[:100]
        for registration in registrations:
            events.append({"id": f"registration-{registration.id}", "kind": "camp_registration", "status": registration.status, "at": registration.created_at, "title": "Donor registered for a donation camp", "detail": f"{registration.donor.full_name} · {registration.camp.title}"})
        events.sort(key=lambda item: item["at"], reverse=True)
        return Response({"count": len(events), "results": events[:300]})


class HospitalCommunityRequestShareView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_owned_request(self, request, request_id):
        hospital = get_hospital_from_request(request)
        if hospital is None:
            return None
        return BloodRequest.objects.filter(id=request_id, hospital=hospital).first()

    def get(self, request, request_id):
        blood_request = self.get_owned_request(request, request_id)
        if blood_request is None:
            return Response({"detail": "Blood request not found."}, status=status.HTTP_404_NOT_FOUND)
        communities = get_eligible_communities().values("id", "name", "city", "state")
        shared_ids = CommunityBloodRequestShare.objects.filter(blood_request=blood_request, is_active=True).values_list("community_id", flat=True)
        return Response({"available_communities": list(communities), "shared_community_ids": [str(item) for item in shared_ids]})

    @transaction.atomic
    def put(self, request, request_id):
        blood_request = self.get_owned_request(request, request_id)
        if blood_request is None:
            return Response({"detail": "Blood request not found."}, status=status.HTTP_404_NOT_FOUND)
        community_ids = request.data.get("community_ids")
        if not isinstance(community_ids, list):
            return Response({"detail": "community_ids must be a list of unique community IDs."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            normalized_ids = [UUID(str(item)) for item in community_ids]
        except (TypeError, ValueError, AttributeError):
            return Response({"detail": "community_ids must contain valid UUIDs."}, status=status.HTTP_400_BAD_REQUEST)
        if len(normalized_ids) != len(set(normalized_ids)):
            return Response({"detail": "community_ids must be a list of unique community IDs."}, status=status.HTTP_400_BAD_REQUEST)
        eligible = get_eligible_communities().filter(id__in=normalized_ids)
        if eligible.count() != len(normalized_ids):
            return Response({"detail": "One or more communities are not eligible for request sharing."}, status=status.HTTP_400_BAD_REQUEST)
        active_request_statuses = {BloodRequest.Status.OPEN, BloodRequest.Status.MATCHING, BloodRequest.Status.PARTIALLY_FULFILLED}
        if normalized_ids and blood_request.status not in active_request_statuses:
            return Response({"detail": "Only active blood requests can be shared with communities."}, status=status.HTTP_400_BAD_REQUEST)
        CommunityBloodRequestShare.objects.filter(blood_request=blood_request).exclude(community_id__in=normalized_ids).update(is_active=False)
        for community in eligible:
            CommunityBloodRequestShare.objects.update_or_create(
                blood_request=blood_request,
                community=community,
                defaults={"shared_by": request.user, "is_active": True},
            )
        return Response({"detail": "Community request sharing updated.", "shared_community_ids": [str(item) for item in normalized_ids]})

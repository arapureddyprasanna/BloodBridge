from uuid import UUID

from drf_spectacular.utils import extend_schema

from django.core.paginator import EmptyPage, Paginator
from django.db import transaction
from django.db.models import Q, Count
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.models import User
from accounts.permission import IsSuperAdmin, IsHospitalAdmin

from notifications.models import Notification
from donors.models import DonorInvitation
from donations.models import Donation
from rest_framework import status
from .models import BloodRequest
from .serializers import (
    BloodRequestMonitorSerializer,
    BloodRequestMonitorListResponseSerializer,
    HospitalBloodRequestSerializer,
)


class BloodRequestMonitorView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    @extend_schema(
        tags=["Blood Requests"],
        operation_id="superadmin_blood_requests_list",
        responses={200: BloodRequestMonitorListResponseSerializer},
    )
    def get(self, request):
        queryset = BloodRequest.objects.select_related("hospital").all()

        search = request.query_params.get("search", "").strip()
        blood_group = request.query_params.get("blood_group", "").strip()
        urgency = request.query_params.get("urgency", "").strip()
        request_status = request.query_params.get("status", "").strip()

        if search:
            filters = (
                Q(hospital__full_name__icontains=search)
                | Q(hospital__email__icontains=search)
            )

            try:
                filters |= Q(id=UUID(search))
            except ValueError:
                pass

            queryset = queryset.filter(filters)

        valid_blood_groups = {
            choice[0] for choice in BloodRequest.BloodGroup.choices
        }

        valid_urgencies = {
            choice[0] for choice in BloodRequest.Urgency.choices
        }

        valid_statuses = {
            choice[0] for choice in BloodRequest.Status.choices
        }

        if blood_group:
            if blood_group not in valid_blood_groups:
                return Response(
                    {"detail": "Invalid blood_group filter."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                blood_group=blood_group
            )

        if urgency:
            if urgency not in valid_urgencies:
                return Response(
                    {"detail": "Invalid urgency filter."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                urgency=urgency
            )

        if request_status:
            if request_status not in valid_statuses:
                return Response(
                    {"detail": "Invalid status filter."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                status=request_status
            )

        all_requests = BloodRequest.objects.all()

        stats = all_requests.aggregate(
            total=Count("id"),
        )

        stats.update(
            {
                "open": all_requests.filter(
                    status=BloodRequest.Status.OPEN
                ).count(),
                "matching": all_requests.filter(
                    status=BloodRequest.Status.MATCHING
                ).count(),
                "urgent": all_requests.filter(
                    urgency__in=[
                        BloodRequest.Urgency.URGENT,
                        BloodRequest.Urgency.CRITICAL,
                    ],
                )
                .exclude(
                    status__in=[
                        BloodRequest.Status.FULFILLED,
                        BloodRequest.Status.CANCELLED,
                        BloodRequest.Status.EXPIRED,
                    ]
                )
                .count(),
                "fulfilled": all_requests.filter(
                    status=BloodRequest.Status.FULFILLED
                ).count(),
            }
        )

        try:
            page_number = max(
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
            return Response(
                {
                    "detail": (
                        "page and page_size must be integers."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page_size < 1 or page_size > 100:
            return Response(
                {
                    "detail": (
                        "page_size must be between 1 and 100."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        paginator = Paginator(
            queryset,
            page_size,
        )

        try:
            page = paginator.page(page_number)

        except EmptyPage:
            return Response(
                {
                    "detail": "Page does not exist."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BloodRequestMonitorSerializer(
            page.object_list,
            many=True,
        )

        return Response(
            {
                "stats": stats,
                "results": serializer.data,
                "pagination": {
                    "page": page.number,
                    "page_size": page_size,
                    "total_items": paginator.count,
                    "total_pages": paginator.num_pages,
                    "has_next": page.has_next(),
                    "has_previous": page.has_previous(),
                },
            }
        )


class BloodRequestMonitorDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    @extend_schema(
        tags=["Blood Requests"],
        operation_id="superadmin_blood_request_detail",
        responses={200: BloodRequestMonitorSerializer},
    )
    def get(self, request, request_id):
        try:
            blood_request = (
                BloodRequest.objects.select_related(
                    "hospital"
                ).get(id=request_id)
            )

        except BloodRequest.DoesNotExist:
            return Response(
                {
                    "detail": "Blood request not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BloodRequestMonitorSerializer(
            blood_request
        )

        return Response(serializer.data)


def get_hospital_from_request(request):
    """
    Resolve the authenticated Django user as the hospital.

    FirebaseTokenAuthentication already attaches the
    authenticated Django User to request.user, so use that
    as the primary source of truth.

    The Firebase UID fallback is kept for compatibility.
    """

    user = getattr(request, "user", None)

    if (
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "role", None)
        == User.Role.HOSPITAL_ADMIN
        and getattr(user, "account_status", None)
        == User.AccountStatus.ACTIVE
        and getattr(user, "is_active", False)
    ):
        return user

    claims = getattr(request, "auth", None) or {}
    uid = claims.get("uid")

    if not uid:
        return None

    return User.objects.filter(
        firebase_uid=uid,
        role=User.Role.HOSPITAL_ADMIN,
        account_status=User.AccountStatus.ACTIVE,
        is_active=True,
    ).first()


class HospitalBloodRequestListCreateView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_requests_list",
        responses={
            200: HospitalBloodRequestSerializer(many=True)
        },
    )
    def get(self, request):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {
                    "detail": "Hospital profile not found."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        queryset = BloodRequest.objects.filter(
            hospital=hospital
        ).order_by("-created_at")

        search = request.query_params.get(
            "search",
            "",
        ).strip()

        blood_group = request.query_params.get(
            "blood_group",
            "",
        ).strip()

        urgency = request.query_params.get(
            "urgency",
            "",
        ).strip()

        request_status = request.query_params.get(
            "status",
            "",
        ).strip()

        if search:
            filters = (
                Q(
                    blood_group__icontains=search
                )
                | Q(
                    hospital_notes__icontains=search
                )
            )

            try:
                filters |= Q(id=UUID(search))
            except ValueError:
                pass

            queryset = queryset.filter(filters)

        valid_blood_groups = {
            choice[0]
            for choice in BloodRequest.BloodGroup.choices
        }

        valid_urgencies = {
            choice[0]
            for choice in BloodRequest.Urgency.choices
        }

        valid_statuses = {
            choice[0]
            for choice in BloodRequest.Status.choices
        }

        if blood_group:
            if blood_group not in valid_blood_groups:
                return Response(
                    {
                        "detail": (
                            "Invalid blood_group filter."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                blood_group=blood_group
            )

        if urgency:
            if urgency not in valid_urgencies:
                return Response(
                    {
                        "detail": (
                            "Invalid urgency filter."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                urgency=urgency
            )

        if request_status:
            if request_status not in valid_statuses:
                return Response(
                    {
                        "detail": (
                            "Invalid status filter."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            queryset = queryset.filter(
                status=request_status
            )

        serializer = HospitalBloodRequestSerializer(
            queryset,
            many=True,
        )

        return Response(serializer.data)

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_request_create",
        request=HospitalBloodRequestSerializer,
        responses={
            201: HospitalBloodRequestSerializer,
        },
    )
    def post(self, request):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {
                    "detail": "Hospital profile not found."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = HospitalBloodRequestSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        blood_request = serializer.save(
            hospital=hospital,
            status=BloodRequest.Status.OPEN,
        )

        super_admins = User.objects.filter(
            role=User.Role.SUPER_ADMIN,
            account_status=User.AccountStatus.ACTIVE,
            is_active=True,
        )

        urgency_label = (
            blood_request.get_urgency_display()
        )

        for super_admin in super_admins:
            Notification.objects.create(
                recipient=super_admin,
                title="New Blood Request",
                message=(
                    f"{hospital.full_name} created a "
                    f"{urgency_label.lower()} blood "
                    f"request for "
                    f"{blood_request.blood_group} "
                    f"({blood_request.units_required} "
                    f"{'unit' if blood_request.units_required == 1 else 'units'})."
                ),
                category=(
                    Notification.Category.BLOOD_REQUEST
                ),
                link="/admin/blood-requests",
            )

        return Response(
            HospitalBloodRequestSerializer(
                blood_request
            ).data,
            status=status.HTTP_201_CREATED,
        )


class HospitalBloodRequestDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_object(self, request, request_id):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return None, None

        try:
            blood_request = BloodRequest.objects.get(
                id=request_id,
                hospital=hospital,
            )

        except BloodRequest.DoesNotExist:
            return hospital, None

        return hospital, blood_request

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_request_detail",
        responses={
            200: HospitalBloodRequestSerializer
        },
    )
    def get(self, request, request_id):
        hospital, blood_request = (
            self.get_object(
                request,
                request_id,
            )
        )

        if not hospital:
            return Response(
                {
                    "detail": (
                        "Hospital profile not found."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not blood_request:
            return Response(
                {
                    "detail": (
                        "Blood request not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = HospitalBloodRequestSerializer(
            blood_request
        )

        return Response(serializer.data)

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_request_update",
        request=HospitalBloodRequestSerializer,
        responses={
            200: HospitalBloodRequestSerializer
        },
    )
    def patch(self, request, request_id):
        hospital, blood_request = (
            self.get_object(
                request,
                request_id,
            )
        )

        if not hospital:
            return Response(
                {
                    "detail": (
                        "Hospital profile not found."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not blood_request:
            return Response(
                {
                    "detail": (
                        "Blood request not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status in [
            BloodRequest.Status.FULFILLED,
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.EXPIRED,
        ]:
            return Response(
                {
                    "detail": (
                        "This blood request can no "
                        "longer be edited."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = HospitalBloodRequestSerializer(
            blood_request,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save()

        return Response(serializer.data)


class HospitalBloodRequestCancelView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_request_cancel",
        responses={
            200: HospitalBloodRequestSerializer
        },
    )
    @transaction.atomic
    def post(self, request, request_id):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {
                    "detail": (
                        "Hospital profile not found."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            blood_request = (
                BloodRequest.objects
                .select_for_update()
                .get(id=request_id, hospital=hospital)
            )

        except BloodRequest.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Blood request not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status in [
            BloodRequest.Status.FULFILLED,
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.EXPIRED,
        ]:
            return Response(
                {
                    "detail": (
                        "This blood request cannot "
                        "be cancelled."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        blood_request.status = (
            BloodRequest.Status.CANCELLED
        )

        blood_request.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )

        DonorInvitation.objects.filter(
            blood_request=blood_request,
            status=DonorInvitation.Status.PENDING,
        ).update(
            status=DonorInvitation.Status.CANCELLED,
            updated_at=timezone.now(),
        )

        return Response(
            HospitalBloodRequestSerializer(
                blood_request
            ).data
        )

class HospitalBloodRequestTrackingView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Hospital Blood Requests"],
        operation_id="hospital_blood_request_tracking",
        responses={200: dict},
    )
    def get(self, request, request_id):

        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {"detail": "Hospital profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            blood_request = BloodRequest.objects.get(
                id=request_id,
                hospital=hospital,
            )
        except BloodRequest.DoesNotExist:
            return Response(
                {"detail": "Blood request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        invitations = DonorInvitation.objects.select_related(
            "donor", "donor__donor_profile"
        ).filter(blood_request=blood_request)

        pending_count = invitations.filter(
            status=DonorInvitation.Status.PENDING
        ).count()

        accepted_count = invitations.filter(
            status=DonorInvitation.Status.ACCEPTED
        ).count()

        declined_count = invitations.filter(
            status=DonorInvitation.Status.DECLINED
        ).count()

        expired_count = invitations.filter(
            status=DonorInvitation.Status.EXPIRED
        ).count()

        cancelled_count = invitations.filter(
            status=DonorInvitation.Status.CANCELLED
        ).count()

        selected_count = invitations.count()

        completed_donations = Donation.objects.filter(
            blood_request=blood_request,
            status=Donation.Status.COMPLETED,
        )

        units_fulfilled = sum(
            donation.units_donated
            for donation in completed_donations
        )

        units_remaining = max(
            blood_request.units_required - units_fulfilled,
            0,
        )

        if units_remaining == 0:
            current_stage = "fulfilled"
        elif accepted_count > 0:
            current_stage = "coordination"
        elif pending_count > 0:
            current_stage = "responses"
        elif selected_count > 0:
            current_stage = "donors_invited"
        elif blood_request.status == BloodRequest.Status.MATCHING:
            current_stage = "matching"
        else:
            current_stage = "created"

        timeline = [
            {
                "event": "Request created",
                "stage": "created",
                "status": "completed",
                "timestamp": blood_request.created_at,
            }
        ]

        first_invitation = invitations.order_by("selected_at").first()

        if first_invitation:
            timeline.append(
                {
                    "event": "Donor invitations sent",
                    "stage": "donors_invited",
                    "status": "completed",
                    "timestamp": first_invitation.selected_at,
                }
            )

            if pending_count > 0:
                timeline.append(
                    {
                        "event": "Waiting for donor responses",
                        "stage": "responses",
                        "status": (
                            "current"
                            if current_stage == "responses"
                            else "completed"
                        ),
                        "timestamp": first_invitation.selected_at,
                    }
                )

            if accepted_count > 0:
                first_accepted = (
                    invitations.filter(
                        status=DonorInvitation.Status.ACCEPTED
                    )
                    .order_by("responded_at")
                    .first()
                )

                timeline.append(
                    {
                        "event": "Donor accepted invitation",
                        "stage": "coordination",
                        "status": (
                            "current"
                            if current_stage == "coordination"
                            else "completed"
                        ),
                        "timestamp": (
                            first_accepted.responded_at
                            if first_accepted
                            else None
                        ),
                    }
                )

        if units_fulfilled > 0:
            first_donation = completed_donations.order_by(
                "donation_date"
            ).first()

            timeline.append(
                {
                    "event": "Donation recorded",
                    "stage": "fulfilled",
                    "status": (
                        "completed"
                        if units_remaining == 0
                        else "current"
                    ),
                    "timestamp": (
                        first_donation.donation_date
                        if first_donation
                        else None
                    ),
                }
            )

        if current_stage == "created":
            current_message = (
                "Request created and waiting for donor matching."
            )
        elif current_stage == "matching":
            current_message = (
                "Finding compatible donors for this request."
            )
        elif current_stage == "donors_invited":
            current_message = (
                "Compatible donors have been selected."
            )
        elif current_stage == "responses":
            current_message = (
                "Waiting for selected donors to respond."
            )
        elif current_stage == "coordination":
            current_message = (
                "A donor has accepted and coordination can begin."
            )
        else:
            current_message = (
                "The requested blood units have been fulfilled."
            )

        return Response(
            {
                "request": {
                    "id": str(blood_request.id),
                    "blood_group": blood_request.blood_group,
                    "units_required": blood_request.units_required,
                    "urgency": blood_request.urgency,
                    "status": blood_request.status,
                    "hospital_notes": blood_request.hospital_notes,
                    "required_by": blood_request.required_by,
                    "created_at": blood_request.created_at,
                    "updated_at": blood_request.updated_at,
                },
                "current_stage": current_stage,
                "current_message": current_message,
                "summary": {
                    "selected": selected_count,
                    "pending": pending_count,
                    "accepted": accepted_count,
                    "declined": declined_count,
                    "expired": expired_count,
                    "cancelled": cancelled_count,
                    "units_fulfilled": units_fulfilled,
                    "units_remaining": units_remaining,
                },
                "invitations": [
                    {
                        "id": str(invitation.id),
                        "donor_id": str(invitation.donor_id),
                        "donor_name": invitation.donor.full_name,
                        "blood_group": invitation.donor.donor_profile.blood_group,
                        "distance_km": float(invitation.distance_km),
                        "status": invitation.status,
                        "selected_at": invitation.selected_at,
                        "responded_at": invitation.responded_at,
                        "donor_phone": (
                            invitation.donor.mobile_number
                            if invitation.status == DonorInvitation.Status.ACCEPTED
                            and invitation.donor.account_status == User.AccountStatus.ACTIVE
                            and invitation.donor.is_active
                            and hospital.account_status == User.AccountStatus.ACTIVE
                            and hospital.is_active
                            and invitation.donor.donor_profile.share_phone_after_acceptance
                            else None
                        ),
                    }
                    for invitation in invitations
                ],
                "timeline": timeline,
            },
            status=status.HTTP_200_OK,
        )


class HospitalBloodRequestFulfillView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, request_id):
        hospital = get_hospital_from_request(request)

        if hospital is None:
            return Response(
                {"detail": "Only active Hospital Admins can fulfill blood requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        blood_request = (
            BloodRequest.objects
            .select_for_update()
            .filter(
                id=request_id,
                hospital=hospital,
            )
            .first()
        )

        if blood_request is None:
            return Response(
                {"detail": "Blood request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status == BloodRequest.Status.FULFILLED:
            return Response(
                {"detail": "This blood request is already fulfilled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if blood_request.status in {
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.EXPIRED,
        }:
            return Response(
                {"detail": "Cancelled or expired requests cannot be fulfilled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blood_request.status = BloodRequest.Status.FULFILLED
        blood_request.save(update_fields=["status", "updated_at"])

        DonorInvitation.objects.filter(
            blood_request=blood_request,
            status=DonorInvitation.Status.PENDING,
        ).update(
            status=DonorInvitation.Status.CANCELLED
        )

        return Response(
            {
                "detail": "Blood request marked as fulfilled.",
                "request_id": str(blood_request.id),
                "status": blood_request.status,
            },
            status=status.HTTP_200_OK,
        )
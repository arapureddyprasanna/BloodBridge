from django.db import transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.permission import IsHospitalAdmin
from blood_requests.models import BloodRequest
from blood_requests.views import get_hospital_from_request
from donors.models import DonorInvitation, DonorProfile
from donations.models import Donation
from matching.services import (
    find_matching_donors,
    get_donor_distance_for_request,
    is_donor_eligible_for_request,
)
from notifications.models import Notification

from .serializers import (
    DonorInvitationSerializer,
    DonorMatchListResponseSerializer,
    SelectDonorsSerializer,
)


class HospitalDonorMatchesView(APIView):
    """
    Return eligible donors for a hospital's blood request.

    Donor personal address and coordinates are never returned.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Donor Matching"],
        operation_id="hospital_donor_matches",
        responses={200: DonorMatchListResponseSerializer},
    )
    def get(self, request, request_id):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {"detail": "Hospital profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            blood_request = (
                BloodRequest.objects
                .select_related(
                    "hospital",
                    "hospital__hospital_profile",
                )
                .get(
                    id=request_id,
                    hospital=hospital,
                )
            )
        except BloodRequest.DoesNotExist:
            return Response(
                {"detail": "Blood request not found."},
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
                        "Donor matching is unavailable for this "
                        "blood request."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        matches = find_matching_donors(
            blood_request,
            require_location=True,
        )

        already_invited_donors = set(
            DonorInvitation.objects.filter(
                blood_request=blood_request,
            ).values_list("donor_id", flat=True)
        )
        matches = [
            match
            for match in matches
            if match["donor"].id not in already_invited_donors
        ]

        results = []

        for match in matches:
            donor = match["donor"]
            donor_profile = match["donor_profile"]
            distance_km = match["distance_km"]

            results.append({
                "donor_id": donor.id,
                "blood_group": donor_profile.blood_group,
                "distance_km": round(distance_km, 2) if distance_km is not None else None,
                "is_available": donor_profile.is_available,
                "max_travel_distance_km": donor_profile.max_travel_distance_km,
                "compatibility": "Compatible",
            })

        return Response(
            {
                "blood_request_id": blood_request.id,
                "requested_blood_group": blood_request.blood_group,
                "total_matches": len(results),
                "results": results,
            }
        )


class HospitalSelectDonorsView(APIView):
    """
    Allow a hospital to select up to seven eligible donors.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Donor Matching"],
        operation_id="hospital_select_donors",
        request=SelectDonorsSerializer,
        responses={201: DonorInvitationSerializer(many=True)},
    )
    @transaction.atomic
    def post(self, request, request_id):
        hospital = get_hospital_from_request(request)

        if not hospital:
            return Response(
                {"detail": "Hospital profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            blood_request = (
                BloodRequest.objects
                .select_for_update()
                .get(
                    id=request_id,
                    hospital=hospital,
                )
            )
        except BloodRequest.DoesNotExist:
            return Response(
                {"detail": "Blood request not found."},
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
                        "Donors cannot be selected for this "
                        "blood request."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SelectDonorsSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        donor_ids = serializer.validated_data["donor_ids"]

        # Prevent duplicate donor IDs inside the request.
        if len(donor_ids) != len(set(donor_ids)):
            return Response(
                {
                    "detail": (
                        "Each donor can only be selected once."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_invitation_count = (
            DonorInvitation.objects
            .filter(
                blood_request=blood_request,
                status__in=[
                    DonorInvitation.Status.PENDING,
                    DonorInvitation.Status.ACCEPTED,
                ],
            )
            .count()
        )

        if active_invitation_count + len(donor_ids) > 7:
            remaining_slots = max(
                0,
                7 - active_invitation_count,
            )

            return Response(
                {
                    "detail": (
                        f"Only {remaining_slots} donor "
                        f"selection slot(s) remain."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        donor_profiles = (
            DonorProfile.objects
            .select_related("user")
            .filter(
                user_id__in=donor_ids,
                user__role="donor",
            )
        )

        donor_profile_map = {
            profile.user_id: profile
            for profile in donor_profiles
        }

        missing_donors = [
            str(donor_id)
            for donor_id in donor_ids
            if donor_id not in donor_profile_map
        ]

        if missing_donors:
            return Response(
                {
                    "detail": "One or more selected donors were not found.",
                    "donor_ids": missing_donors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_donors = set(
            DonorInvitation.objects
            .filter(
                blood_request=blood_request,
                donor_id__in=donor_ids,
            )
            .values_list("donor_id", flat=True)
        )

        if existing_donors:
            return Response(
                {
                    "detail": (
                        "One or more donors have already been "
                        "selected for this request."
                    ),
                    "donor_ids": [
                        str(donor_id)
                        for donor_id in existing_donors
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        eligible_donors = []
        for donor_id in donor_ids:
            donor_profile = donor_profile_map[donor_id]

            if not is_donor_eligible_for_request(
                blood_request,
                donor_profile,
                require_location=True,
            ):
                return Response(
                    {
                        "detail": (
                            f"{donor_profile.user.full_name} is no longer "
                            "eligible for this blood request."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            distance_km = get_donor_distance_for_request(
                blood_request,
                donor_profile,
            )
            if distance_km is None:
                return Response(
                    {
                        "detail": (
                            f"Location information is unavailable for "
                            f"{donor_profile.user.full_name}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            eligible_donors.append((donor_profile, distance_km))

        invitations = []

        with transaction.atomic():
            for donor_profile, distance_km in eligible_donors:
                invitation = DonorInvitation.objects.create(
                    blood_request=blood_request,
                    donor=donor_profile.user,
                    selected_by=hospital,
                    distance_km=round(distance_km, 2),
                    status=DonorInvitation.Status.PENDING,
                )

                invitations.append(invitation)

                if donor_profile.invitation_notifications:
                    Notification.objects.create(
                        recipient=donor_profile.user,
                        title="New Blood Donation Request",
                        message=(
                            f"{hospital.full_name} selected you for "
                            f"a {blood_request.blood_group} blood "
                            f"request. The hospital is approximately "
                            f"{round(distance_km, 1)} km away."
                        ),
                        category=Notification.Category.BLOOD_REQUEST,
                        link=(
                            f"/donor/requests/"
                            f"{blood_request.id}"
                        ),
                    )

            if blood_request.status == BloodRequest.Status.OPEN:
                blood_request.status = BloodRequest.Status.MATCHING
                blood_request.save(
                    update_fields=[
                        "status",
                        "updated_at",
                    ]
                )

        response_data = [
            {
                "id": invitation.id,
                "donor_id": invitation.donor.id,
                "donor_name": invitation.donor.full_name,
                "blood_group": invitation.donor.donor_profile.blood_group,
                "distance_km": float(invitation.distance_km),
                "status": invitation.status,
                "selected_at": invitation.selected_at,
                "responded_at": invitation.responded_at,
            }
            for invitation in invitations
        ]

        return Response(
            response_data,
            status=status.HTTP_201_CREATED,
        )


class HospitalSelectedDonorsView(APIView):
    """
    Return donors already selected for a hospital's request.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    @extend_schema(
        tags=["Donor Matching"],
        operation_id="hospital_selected_donors",
        responses={200: DonorInvitationSerializer(many=True)},
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

        invitations = (
            DonorInvitation.objects
            .select_related(
                "donor",
                "donor__donor_profile",
            )
            .filter(
                blood_request=blood_request,
            )
        )

        response_data = [
            {
                "id": invitation.id,
                "donor_id": invitation.donor.id,
                "donor_name": invitation.donor.full_name,
                "blood_group": (
                    invitation.donor.donor_profile.blood_group
                ),
                "distance_km": float(
                    invitation.distance_km
                ),
                "status": invitation.status,
                "selected_at": invitation.selected_at,
                "responded_at": invitation.responded_at,
                "donor_phone": (
                    invitation.donor.mobile_number
                    if invitation.status == DonorInvitation.Status.ACCEPTED
                    and invitation.donor.account_status == "active"
                    and invitation.donor.is_active
                    and invitation.blood_request.hospital.account_status == "active"
                    and invitation.blood_request.hospital.is_active
                    and invitation.donor.donor_profile.share_phone_after_acceptance
                    else None
                ),
            }
            for invitation in invitations
        ]

        return Response(response_data)

class HospitalBloodRequestTrackingView(APIView):
    """
    Return the current lifecycle and progress of a hospital blood request.
    """

    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

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

        invitations = DonorInvitation.objects.filter(
            blood_request=blood_request
        )

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

        # Determine the current lifecycle stage.
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

        first_invitation = invitations.order_by(
            "selected_at"
        ).first()

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
                "timeline": timeline,
            },
            status=status.HTTP_200_OK,
        )

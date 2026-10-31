from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication
from blood_requests.models import BloodRequest
from donations.models import Donation
from donations.serializers import DonationSerializer
from notifications.models import Notification

from .models import DonorInvitation, DonorProfile


def get_active_donor(request):
    user = request.user

    if (
        not user.is_authenticated
        or user.role != "donor"
        or user.account_status != "active"
        or not user.is_active
    ):
        return None

    return user


def serialize_invitation(invitation):
    blood_request = invitation.blood_request
    hospital = blood_request.hospital

    hospital_profile = getattr(hospital, "hospital_profile", None)

    return {
        "invitation_id": str(invitation.id),
        "blood_request_id": str(blood_request.id),
        "blood_group": blood_request.blood_group,
        "units_required": blood_request.units_required,
        "urgency": blood_request.urgency,
        "status": invitation.status,
        "request_status": blood_request.status,
        "required_by": blood_request.required_by,
        "hospital_name": (
            hospital_profile.hospital_name
            if hospital_profile
            else hospital.full_name
        ),
        "hospital_city": (
            hospital_profile.city
            if hospital_profile
            else None
        ),
        "hospital_state": (
            hospital_profile.state
            if hospital_profile
            else None
        ),
        "distance_km": float(invitation.distance_km),
        "selected_at": invitation.selected_at,
        "responded_at": invitation.responded_at,
    }


class DonorRequestListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can access donor requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        invitations = (
            DonorInvitation.objects
            .filter(donor=donor)
            .select_related(
                "blood_request",
                "blood_request__hospital",
                "blood_request__hospital__hospital_profile",
            )
            .order_by("-selected_at")
        )

        return Response(
            {
                "count": invitations.count(),
                "results": [
                    serialize_invitation(invitation)
                    for invitation in invitations
                ],
            }
        )


class DonorRequestDetailView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can access donor requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        invitation = (
            DonorInvitation.objects
            .filter(
                blood_request_id=request_id,
                donor=donor,
            )
            .select_related(
                "blood_request",
                "blood_request__hospital",
                "blood_request__hospital__hospital_profile",
            )
            .first()
        )

        if invitation is None:
            return Response(
                {"detail": "Blood request invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = serialize_invitation(invitation)

        data["hospital_notes"] = invitation.blood_request.hospital_notes

        return Response(data)


class DonorRequestAcceptView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, request_id):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can accept requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        blood_request = (
            BloodRequest.objects
            .select_for_update()
            .filter(pk=request_id)
            .first()
        )
        if blood_request is None:
            return Response(
                {"detail": "Blood request invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        invitation = (
            DonorInvitation.objects
            .select_for_update()
            .select_related(
                "blood_request",
                "selected_by",
            )
            .filter(
                blood_request_id=request_id,
                donor=donor,
            )
            .first()
        )

        if invitation is None:
            return Response(
                {"detail": "Blood request invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status in {
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.FULFILLED,
            BloodRequest.Status.EXPIRED,
        }:
            if invitation.status == DonorInvitation.Status.PENDING:
                invitation.status = DonorInvitation.Status.CANCELLED
                invitation.responded_at = timezone.now()
                invitation.save(
                    update_fields=["status", "responded_at", "updated_at"]
                )
            return Response(
                {"detail": "This blood request is closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invitation.status != DonorInvitation.Status.PENDING:
            return Response(
                {
                    "detail": (
                        "This invitation has already been "
                        f"{invitation.status}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.status = DonorInvitation.Status.ACCEPTED
        invitation.responded_at = timezone.now()
        invitation.save(
            update_fields=[
                "status",
                "responded_at",
                "updated_at",
            ]
        )

        Notification.objects.create(
            recipient=invitation.selected_by,
            title="Donor Accepted Blood Request",
            message=(
                f"{donor.full_name} accepted your blood request "
                f"{invitation.blood_request.id}."
            ),
            category="blood_request",
            link=f"/requests/{invitation.blood_request.id}",
        )

        return Response(
            {
                "detail": "Blood request accepted successfully.",
                "request_id": str(invitation.blood_request.id),
                "status": invitation.status,
            },
            status=status.HTTP_200_OK,
        )


class DonorRequestDeclineView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, request_id):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can decline requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        blood_request = (
            BloodRequest.objects
            .select_for_update()
            .filter(pk=request_id)
            .first()
        )
        if blood_request is None:
            return Response(
                {"detail": "Blood request invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        invitation = (
            DonorInvitation.objects
            .select_for_update()
            .select_related(
                "blood_request",
                "selected_by",
            )
            .filter(
                blood_request_id=request_id,
                donor=donor,
            )
            .first()
        )

        if invitation is None:
            return Response(
                {"detail": "Blood request invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status in {
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.FULFILLED,
            BloodRequest.Status.EXPIRED,
        }:
            if invitation.status == DonorInvitation.Status.PENDING:
                invitation.status = DonorInvitation.Status.CANCELLED
                invitation.responded_at = timezone.now()
                invitation.save(
                    update_fields=["status", "responded_at", "updated_at"]
                )
            return Response(
                {"detail": "This blood request is closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invitation.status != DonorInvitation.Status.PENDING:
            return Response(
                {
                    "detail": (
                        "This invitation has already been "
                        f"{invitation.status}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.status = DonorInvitation.Status.DECLINED
        invitation.responded_at = timezone.now()
        invitation.save(
            update_fields=[
                "status",
                "responded_at",
                "updated_at",
            ]
        )

        Notification.objects.create(
            recipient=invitation.selected_by,
            title="Donor Declined Blood Request",
            message=(
                f"{donor.full_name} declined your blood request "
                f"{invitation.blood_request.id}."
            ),
            category="blood_request",
            link=f"/requests/{invitation.blood_request.id}",
        )

        return Response(
            {
                "detail": "Blood request declined successfully.",
                "request_id": str(invitation.blood_request.id),
                "status": invitation.status,
            },
            status=status.HTTP_200_OK,
        )


class DonorProfileView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can access this profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            profile = donor.donor_profile
        except DonorProfile.DoesNotExist:
            return Response(
                {"detail": "Donor profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "blood_group": profile.blood_group,
                "is_available": profile.is_available,
                "availability_start": profile.availability_start,
                "availability_end": profile.availability_end,
                "preferred_start_time": profile.preferred_start_time,
                "preferred_end_time": profile.preferred_end_time,
                "preferred_days": profile.preferred_days,
                "timezone": profile.timezone,
                "latitude": (
                    float(profile.latitude)
                    if profile.latitude is not None
                    else None
                ),
                "longitude": (
                    float(profile.longitude)
                    if profile.longitude is not None
                    else None
                ),
                "max_travel_distance_km": profile.max_travel_distance_km,
                "location_updated_at": profile.location_updated_at,
                "allow_verified_hospital_matching": (
                    profile.allow_verified_hospital_matching
                ),
                "invitation_notifications": (
                    profile.invitation_notifications
                ),
                "share_phone_after_acceptance": (
                    profile.share_phone_after_acceptance
                ),
                "community_visibility": profile.community_visibility,
            }
        )

    def patch(self, request):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can update this profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            profile = donor.donor_profile
        except DonorProfile.DoesNotExist:
            return Response(
                {"detail": "Donor profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        allowed_fields = {
            "is_available",
            "availability_start",
            "availability_end",
            "preferred_start_time",
            "preferred_end_time",
            "preferred_days",
            "timezone",
            "latitude",
            "longitude",
            "max_travel_distance_km",
            "allow_verified_hospital_matching",
            "invitation_notifications",
            "share_phone_after_acceptance",
            "community_visibility",
        }

        unknown_fields = set(request.data.keys()) - allowed_fields

        if unknown_fields:
            return Response(
                {
                    "detail": "Unsupported donor profile fields.",
                    "fields": sorted(unknown_fields),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        location_changed = False

        for field in allowed_fields:
            if field not in request.data:
                continue

            value = request.data[field]

            if field in {"latitude", "longitude"}:
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    return Response(
                        {"detail": f"{field} must be a valid number."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if field == "latitude" and not -90 <= value <= 90:
                    return Response(
                        {"detail": "Latitude must be between -90 and 90."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if field == "longitude" and not -180 <= value <= 180:
                    return Response(
                        {"detail": "Longitude must be between -180 and 180."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                location_changed = True

            if field == "max_travel_distance_km":
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    return Response(
                        {
                            "detail": (
                                "max_travel_distance_km must be "
                                "a positive integer."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if value <= 0:
                    return Response(
                        {
                            "detail": (
                                "max_travel_distance_km must be "
                                "greater than zero."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if field == "preferred_days" and not isinstance(value, list):
                return Response(
                    {"detail": "preferred_days must be an array."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            setattr(profile, field, value)

        if location_changed:
            profile.location_updated_at = timezone.now()

        profile.save()

        return Response(
            {
                "detail": "Donor profile updated successfully."
            }
        )


class DonorDonationHistoryView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        donor = get_active_donor(request)

        if donor is None:
            return Response(
                {"detail": "Only active donors can access donation history."},
                status=status.HTTP_403_FORBIDDEN,
            )

        donations = (
            Donation.objects
            .filter(donor=donor)
            .select_related(
                "donor",
                "blood_request",
            )
        )

        serializer = DonationSerializer(
            donations,
            many=True,
        )

        return Response(
            {
                "count": donations.count(),
                "results": serializer.data,
            }
        )

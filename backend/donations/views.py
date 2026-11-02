from django.db import transaction
from django.db.models import Sum
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.models import User
from blood_requests.models import BloodRequest
from donors.models import DonorInvitation

from .models import Donation
from .serializers import (
    DonationSerializer,
    DonationCreateSerializer,
)


def validate_active_hospital(user):
    if (
        user.role != User.Role.HOSPITAL_ADMIN
        or user.account_status != User.AccountStatus.ACTIVE
        or not user.is_active
    ):
        raise PermissionDenied(
            "Only active Hospital Admins can manage donations."
        )


def validate_active_donor(user):
    if (
        user.role != User.Role.DONOR
        or user.account_status != User.AccountStatus.ACTIVE
        or not user.is_active
    ):
        raise PermissionDenied(
            "Only active Donors can access donation history."
        )


def update_blood_request_status(blood_request):
    completed_units = (
        Donation.objects
        .filter(
            blood_request=blood_request,
            status=Donation.Status.COMPLETED,
        )
        .aggregate(total=Sum("units_donated"))
        .get("total")
        or 0
    )

    if completed_units >= blood_request.units_required:
        blood_request.status = BloodRequest.Status.FULFILLED
        blood_request.save(
            update_fields=["status", "updated_at"]
        )

        DonorInvitation.objects.filter(
            blood_request=blood_request,
            status=DonorInvitation.Status.PENDING,
        ).update(
            status=DonorInvitation.Status.CANCELLED
        )

        return

    if completed_units > 0:
        blood_request.status = BloodRequest.Status.PARTIALLY_FULFILLED

        blood_request.save(
            update_fields=["status", "updated_at"]
        )


class HospitalDonationCreateView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        hospital = request.user

        validate_active_hospital(hospital)

        serializer = DonationCreateSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        blood_request_id = serializer.validated_data[
            "blood_request_id"
        ]
        donor_id = serializer.validated_data["donor_id"]
        units_donated = serializer.validated_data[
            "units_donated"
        ]
        donation_date = serializer.validated_data[
            "donation_date"
        ]
        notes = serializer.validated_data.get("notes", "")

        blood_request = (
            BloodRequest.objects
            .select_for_update()
            .filter(
                id=blood_request_id,
                hospital=hospital,
            )
            .first()
        )

        if blood_request is None:
            return Response(
                {
                    "detail": (
                        "Blood request not found or does not "
                        "belong to this hospital."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if blood_request.status in {
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.EXPIRED,
            BloodRequest.Status.FULFILLED,
        }:
            raise ValidationError(
                {
                    "detail": (
                        "A donation cannot be recorded for a "
                        "cancelled, expired, or fulfilled request."
                    )
                }
            )

        donor = (
            User.objects
            .filter(
                id=donor_id,
                role=User.Role.DONOR,
                account_status=User.AccountStatus.ACTIVE,
                is_active=True,
            )
            .first()
        )

        if donor is None:
            return Response(
                {
                    "detail": (
                        "The selected donor is not an active donor."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation = (
            DonorInvitation.objects
            .select_for_update()
            .filter(
                blood_request=blood_request,
                donor=donor,
                status=DonorInvitation.Status.ACCEPTED,
            )
            .first()
        )

        if invitation is None:
            raise ValidationError(
                {
                    "detail": (
                        "A donation can only be recorded for "
                        "a donor who accepted an invitation for "
                        "this blood request."
                    )
                }
            )

        completed_units = (
            Donation.objects
            .filter(
                blood_request=blood_request,
                status=Donation.Status.COMPLETED,
            )
            .aggregate(total=Sum("units_donated"))
            .get("total")
            or 0
        )

        scheduled_units = (
            Donation.objects
            .filter(
                blood_request=blood_request,
                status=Donation.Status.SCHEDULED,
            )
            .aggregate(total=Sum("units_donated"))
            .get("total")
            or 0
        )

        remaining_units = (
            blood_request.units_required
            - completed_units
            - scheduled_units
        )

        if units_donated > remaining_units:
            raise ValidationError(
                {
                    "units_donated": (
                        f"Only {max(remaining_units, 0)} unit(s) "
                        "remain available to be recorded."
                    )
                }
            )

        existing_scheduled = Donation.objects.filter(
            blood_request=blood_request,
            donor=donor,
            status=Donation.Status.SCHEDULED,
        ).exists()

        if existing_scheduled:
            raise ValidationError(
                {
                    "detail": (
                        "This donor already has a scheduled "
                        "donation for this blood request."
                    )
                }
            )

        donation = Donation.objects.create(
            blood_request=blood_request,
            donor=donor,
            units_donated=units_donated,
            donation_date=donation_date,
            status=Donation.Status.SCHEDULED,
            notes=notes,
        )

        response_serializer = DonationSerializer(
            donation
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class HospitalDonationCompleteView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, id):
        hospital = request.user

        validate_active_hospital(hospital)

        donation = (
            Donation.objects
            .select_for_update()
            .select_related(
                "blood_request",
                "donor",
            )
            .filter(
                id=id,
                blood_request__hospital=hospital,
            )
            .first()
        )

        if donation is None:
            return Response(
                {"detail": "Donation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if donation.status == Donation.Status.COMPLETED:
            raise ValidationError(
                {
                    "detail": (
                        "This donation has already been completed."
                    )
                }
            )

        if donation.status == Donation.Status.CANCELLED:
            raise ValidationError(
                {
                    "detail": (
                        "A cancelled donation cannot be completed."
                    )
                }
            )

        blood_request = (
            BloodRequest.objects
            .select_for_update()
            .get(id=donation.blood_request_id)
        )

        if blood_request.status in {
            BloodRequest.Status.CANCELLED,
            BloodRequest.Status.EXPIRED,
            BloodRequest.Status.FULFILLED,
        }:
            raise ValidationError(
                {
                    "detail": (
                        "This blood request can no longer "
                        "receive donations."
                    )
                }
            )

        completed_units = (
            Donation.objects
            .filter(
                blood_request=blood_request,
                status=Donation.Status.COMPLETED,
            )
            .aggregate(total=Sum("units_donated"))
            .get("total")
            or 0
        )

        if (
            completed_units + donation.units_donated
            > blood_request.units_required
        ):
            raise ValidationError(
                {
                    "detail": (
                        "Completing this donation would exceed "
                        "the units required for the blood request."
                    )
                }
            )

        donation.status = Donation.Status.COMPLETED
        donation.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )

        update_blood_request_status(
            blood_request
        )

        donation.refresh_from_db()

        response_serializer = DonationSerializer(
            donation
        )

        return Response(
            {
                "detail": "Donation confirmed successfully.",
                "donation": response_serializer.data,
                "request_status": blood_request.status,
            },
            status=status.HTTP_200_OK,
        )


class HospitalDonationHistoryView(generics.ListAPIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = DonationSerializer

    def get_queryset(self):
        user = self.request.user

        validate_active_hospital(user)

        return (
            Donation.objects
            .filter(
                blood_request__hospital=user
            )
            .select_related(
                "donor",
                "blood_request",
            )
        )


class DonorDonationHistoryView(generics.ListAPIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = DonationSerializer

    def get_queryset(self):
        user = self.request.user

        validate_active_donor(user)

        return (
            Donation.objects
            .filter(
                donor=user
            )
            .select_related(
                "donor",
                "blood_request",
            )
        )


class DonationDetailView(generics.RetrieveAPIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = DonationSerializer
    lookup_field = "id"

    def get_queryset(self):
        user = self.request.user

        if (
            user.account_status != User.AccountStatus.ACTIVE
            or not user.is_active
            or user.role not in {
                User.Role.HOSPITAL_ADMIN,
                User.Role.DONOR,
            }
        ):
            raise PermissionDenied(
                "Only active Hospital Admins and Donors "
                "can access donations."
            )

        if user.role == User.Role.HOSPITAL_ADMIN:
            return (
                Donation.objects
                .filter(
                    blood_request__hospital=user
                )
                .select_related(
                    "donor",
                    "blood_request",
                )
            )

        if user.role == User.Role.DONOR:
            return (
                Donation.objects
                .filter(
                    donor=user
                )
                .select_related(
                    "donor",
                    "blood_request",
                )
            )

        return Donation.objects.none()
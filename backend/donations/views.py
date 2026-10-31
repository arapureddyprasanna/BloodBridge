from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.models import User
from rest_framework.exceptions import PermissionDenied

from .models import Donation
from .serializers import DonationSerializer


class HospitalDonationHistoryView(generics.ListAPIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated,]
    serializer_class = DonationSerializer

    def get_queryset(self):
        user = self.request.user
        

        if (
            user.role != User.Role.HOSPITAL_ADMIN
            or user.account_status != User.AccountStatus.ACTIVE
            or not user.is_active
        ):
            raise PermissionDenied("Only active Hospital Admins can access donation history.")

        return (
            Donation.objects
            .filter(blood_request__hospital=user)
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

        if (
            user.role != User.Role.DONOR
            or user.account_status != User.AccountStatus.ACTIVE
            or not user.is_active
        ):
            raise PermissionDenied("Only active Donors can access donation history.")

        return (
            Donation.objects
            .filter(donor=user)
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
            or user.role not in {User.Role.HOSPITAL_ADMIN, User.Role.DONOR}
        ):
            raise PermissionDenied("Only active Hospital Admins and Donors can access donations.")

        if user.role == User.Role.HOSPITAL_ADMIN:
            return (
                Donation.objects
                .filter(blood_request__hospital=user)
                .select_related(
                    "donor",
                    "blood_request",
                )
            )

        if user.role == User.Role.DONOR:
            return (
                Donation.objects
                .filter(donor=user)
                .select_related(
                    "donor",
                    "blood_request",
                )
            )

        return Donation.objects.none()

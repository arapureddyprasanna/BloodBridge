import uuid

from django.conf import settings
from django.db import models


class DonorProfile(models.Model):
    class BloodGroup(models.TextChoices):
        A_POSITIVE = "A+", "A+"
        A_NEGATIVE = "A-", "A-"
        B_POSITIVE = "B+", "B+"
        B_NEGATIVE = "B-", "B-"
        AB_POSITIVE = "AB+", "AB+"
        AB_NEGATIVE = "AB-", "AB-"
        O_POSITIVE = "O+", "O+"
        O_NEGATIVE = "O-", "O-"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="donor_profile",
        limit_choices_to={"role": "donor"},
    )

    blood_group = models.CharField(
        max_length=3,
        choices=BloodGroup.choices,
    )

    # Availability
    is_available = models.BooleanField(default=True)

    availability_start = models.DateField(
        null=True,
        blank=True,
    )
    availability_end = models.DateField(
        null=True,
        blank=True,
    )

    preferred_start_time = models.TimeField(
        null=True,
        blank=True,
    )
    preferred_end_time = models.TimeField(
        null=True,
        blank=True,
    )

    preferred_days = models.JSONField(
        default=list,
        blank=True,
    )

    timezone = models.CharField(
        max_length=100,
        default="Asia/Kolkata",
    )

    # Location
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )

    max_travel_distance_km = models.PositiveIntegerField(
        default=25,
    )

    location_updated_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    # Privacy / communication preferences
    allow_verified_hospital_matching = models.BooleanField(
        default=True,
    )

    invitation_notifications = models.BooleanField(
        default=True,
    )

    share_phone_after_acceptance = models.BooleanField(
        default=True,
    )

    community_visibility = models.BooleanField(
        default=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["blood_group", "is_available"]),
            models.Index(fields=["is_available"]),
        ]

    def __str__(self):
        return f"{self.user.full_name} - {self.blood_group}"


class DonorInvitation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    blood_request = models.ForeignKey(
        "blood_requests.BloodRequest",
        on_delete=models.PROTECT,
        related_name="donor_invitations",
    )

    donor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="donor_invitations",
        limit_choices_to={"role": "donor"},
    )

    selected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="selected_donor_invitations",
        limit_choices_to={"role": "hospital_admin"},
    )

    distance_km = models.DecimalField(
        max_digits=7,
        decimal_places=2,
    )

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
    )

    selected_at = models.DateTimeField(
        auto_now_add=True,
    )

    responded_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-selected_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["blood_request", "donor"],
                name="unique_donor_invitation_per_request",
            ),
        ]
        indexes = [
            models.Index(fields=["donor", "status"]),
            models.Index(fields=["blood_request", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.donor.full_name} - "
            f"{self.blood_request.id} - "
            f"{self.status}"
        )
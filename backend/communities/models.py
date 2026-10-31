import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Community(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    admin = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community",
        limit_choices_to={
            "role": "community_admin",
        },
    )

    name = models.CharField(
        max_length=200,
    )

    description = models.TextField(
        blank=True,
    )

    logo = models.ImageField(
        upload_to="community_logos/",
        blank=True,
        null=True,
    )

    email = models.EmailField(
        blank=True,
    )

    mobile_number = models.CharField(
        max_length=20,
        blank=True,
    )

    address = models.TextField(
        blank=True,
    )

    city = models.CharField(
        max_length=100,
        blank=True,
    )

    state = models.CharField(
        max_length=100,
        blank=True,
    )

    pincode = models.CharField(
        max_length=10,
        blank=True,
    )

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

    is_active = models.BooleanField(
        default=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["city", "state"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.name


class DonorCommunityApplication(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    donor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="community_applications",
        limit_choices_to={
            "role": "donor",
        },
    )

    community = models.ForeignKey(
        Community,
        on_delete=models.PROTECT,
        related_name="donor_applications",
    )

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
    )

    submitted_at = models.DateTimeField(
        auto_now_add=True,
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_community_applications",
        limit_choices_to={
            "role": "community_admin",
        },
    )

    rejection_reason = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-submitted_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["donor", "community"],
                condition=Q(
                    status__in=[
                        "pending",
                        "accepted",
                    ]
                ),
                name="unique_active_donor_community_application",
            ),
        ]

        indexes = [
            models.Index(
                fields=["community", "status"],
            ),
            models.Index(
                fields=["donor", "status"],
            ),
        ]

    def __str__(self):
        return (
            f"{self.donor.full_name} - "
            f"{self.community.name} - "
            f"{self.status}"
        )


class CommunityReview(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="reviews",
    )

    donor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="community_reviews",
        limit_choices_to={
            "role": "donor",
        },
    )

    rating = models.PositiveSmallIntegerField()

    review = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["community", "donor"],
                name="unique_community_review_per_donor",
            ),
        ]

        indexes = [
            models.Index(
                fields=["community", "-created_at"],
            ),
        ]

    def __str__(self):
        return (
            f"{self.community.name} - "
            f"{self.donor.full_name} - "
            f"{self.rating}"
        )


class CommunityAnnouncement(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Audience(models.TextChoices):
        MEMBERS = "members", "Community members"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="announcements")
    title = models.CharField(max_length=200)
    message = models.TextField(max_length=10000)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.MEMBERS)
    publication_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    is_pinned = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-published_at", "-created_at"]
        indexes = [models.Index(fields=["community", "status", "publication_date"])]

    def __str__(self):
        return f"{self.community.name}: {self.title} ({self.status})"


class DonationCamp(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="donation_camps")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, max_length=5000)
    starts_at = models.DateTimeField()
    venue = models.CharField(max_length=250)
    city = models.CharField(max_length=100, blank=True)
    capacity = models.PositiveSmallIntegerField()
    registration_open = models.BooleanField(default=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SCHEDULED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at"]
        indexes = [models.Index(fields=["community", "starts_at", "status"])]

    def __str__(self):
        return f"{self.title} - {self.starts_at:%Y-%m-%d}"


class DonationCampRegistration(models.Model):
    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    camp = models.ForeignKey(DonationCamp, on_delete=models.CASCADE, related_name="registrations")
    donor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="camp_registrations")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REGISTERED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["camp", "donor"], name="unique_donor_camp_registration")]
        indexes = [models.Index(fields=["camp", "status"]), models.Index(fields=["donor", "status"])]

    def __str__(self):
        return f"{self.donor.full_name} - {self.camp.title} - {self.status}"


class CommunityBloodRequestShare(models.Model):
    """Explicit hospital authorization for a verified community to view request metadata."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    blood_request = models.ForeignKey("blood_requests.BloodRequest", on_delete=models.CASCADE, related_name="community_shares")
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="blood_request_shares")
    shared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shared_community_requests")
    shared_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-shared_at"]
        constraints = [models.UniqueConstraint(fields=["blood_request", "community"], name="unique_community_request_share")]
        indexes = [models.Index(fields=["community", "is_active"])]

    def __str__(self):
        return f"{self.blood_request_id} shared with {self.community.name}"

import uuid

from django.conf import settings
from django.db import models


class Donation(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    blood_request = models.ForeignKey(
        "blood_requests.BloodRequest",
        on_delete=models.PROTECT,
        related_name="donations",
    )

    donor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="donations",
        limit_choices_to={"role": "donor"},
    )

    units_donated = models.PositiveSmallIntegerField()

    donation_date = models.DateTimeField()

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )

    notes = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-donation_date"]
        indexes = [
            models.Index(
                fields=["donor", "status"]
            ),
            models.Index(
                fields=["blood_request", "status"]
            ),
            models.Index(
                fields=["donation_date"]
            ),
        ]

    def __str__(self):
        return (
            f"{self.donor} - "
            f"{self.units_donated} units - "
            f"{self.status}"
        )
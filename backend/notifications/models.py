
import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Category(models.TextChoices):
        VERIFICATION = "verification", "Verification"
        BLOOD_REQUEST = "blood_request", "Blood Request"
        SECURITY = "security", "Security"
        DONATION = "donation", "Donation"
        SYSTEM = "system", "System"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    title = models.CharField(max_length=150)
    message = models.TextField()
    category = models.CharField(
        max_length=30,
        choices=Category.choices,
        default=Category.SYSTEM,
    )

    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read"]),
            models.Index(fields=["recipient", "created_at"]),
        ]

    def __str__(self):
        return f"{self.title} → {self.recipient.email}"

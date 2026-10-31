
import uuid

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class ActionType(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"
        SUSPEND = "suspend", "Suspend"
        REACTIVATE = "reactivate", "Reactivate"
        OTHER = "other", "Other"

    class Outcome(models.TextChoices):
        SUCCESS = "success", "Success"
        BLOCKED = "blocked", "Blocked"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(
        max_length=20,
        choices=ActionType.choices,
        default=ActionType.OTHER,
    )
    description = models.TextField()
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    outcome = models.CharField(
        max_length=10,
        choices=Outcome.choices,
        default=Outcome.SUCCESS,
        db_index=True,
    )
    reason = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["outcome", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.action}: {self.description[:60]}"

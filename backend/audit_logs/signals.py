
from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import User
from audit_logs.models import AuditLog
from notifications.models import Notification


@receiver(post_save, sender=AuditLog)
def notify_super_admins_of_blocked_event(
    sender, instance, created, **kwargs
):
    if not created or instance.outcome != AuditLog.Outcome.BLOCKED:
        return

    super_admins = User.objects.filter(
        role=User.Role.SUPER_ADMIN,
        account_status=User.AccountStatus.ACTIVE,
        is_active=True,
        is_superuser=True,
    )

    Notification.objects.bulk_create([
        Notification(
            recipient=admin,
            title="Security Alert",
            message=(
                f"A blocked security event was recorded: "
                f"{instance.description}. "
                f"Reason: {instance.reason or 'Not provided'}"
            ),
            category=Notification.Category.SECURITY,
            link="/admin/audit-logs",
        )
        for admin in super_admins
    ])

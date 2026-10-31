
from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_email = serializers.EmailField(
        source="actor.email",
        read_only=True,
        default=None,
    )
    action_display = serializers.CharField(
        source="get_action_display",
        read_only=True,
    )
    outcome_display = serializers.CharField(
        source="get_outcome_display",
        read_only=True,
    )

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "actor_email",
            "action",
            "action_display",
            "description",
            "target_type",
            "target_id",
            "outcome",
            "outcome_display",
            "reason",
            "ip_address",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return "System"

        return (
            getattr(obj.actor, "full_name", "")
            or obj.actor.email
        )

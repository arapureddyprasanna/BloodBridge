
from django.contrib import admin

from .models import BloodRequest


@admin.register(BloodRequest)
class BloodRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hospital",
        "blood_group",
        "units_required",
        "urgency",
        "status",
        "created_at",
    )

    list_filter = ("blood_group", "urgency", "status")
    search_fields = ("id", "hospital__full_name", "hospital__email")
    readonly_fields = ("id", "created_at", "updated_at")

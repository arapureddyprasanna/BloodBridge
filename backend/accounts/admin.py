

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "email",
        "full_name",
        "role",
        "account_status",
        "email_verified",
        "is_staff",
    )

    search_fields = ("email", "full_name", "firebase_uid")
    list_filter = ("role", "account_status", "email_verified", "is_staff")

    ordering = ("email",)

    fieldsets = UserAdmin.fieldsets + (
        (
            "BloodBridge Information",
            {
                "fields": (
                    "firebase_uid",
                    "full_name",
                    "mobile_number",
                    "role",
                    "account_status",
                    "email_verified",
                )
            },
        ),
    )

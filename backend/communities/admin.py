from django.contrib import admin

from .models import (
    Community,
    CommunityReview,
    DonorCommunityApplication,
)


@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "admin",
        "city",
        "state",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
        "state",
    )

    search_fields = (
        "name",
        "admin__full_name",
        "admin__email",
        "city",
        "state",
    )

    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
    )


@admin.register(DonorCommunityApplication)
class DonorCommunityApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "donor",
        "community",
        "status",
        "submitted_at",
        "reviewed_at",
        "reviewed_by",
    )

    list_filter = (
        "status",
        "community",
    )

    search_fields = (
        "donor__full_name",
        "donor__email",
        "community__name",
    )

    readonly_fields = (
        "id",
        "submitted_at",
        "reviewed_at",
        "created_at",
        "updated_at",
    )


@admin.register(CommunityReview)
class CommunityReviewAdmin(admin.ModelAdmin):
    list_display = (
        "community",
        "donor",
        "rating",
        "created_at",
    )

    list_filter = (
        "rating",
        "community",
    )

    search_fields = (
        "community__name",
        "donor__full_name",
        "donor__email",
        "review",
    )

    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
    )
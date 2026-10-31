from django.urls import path

from .views import (
    DonorDonationHistoryView,
    DonorProfileView,
    DonorRequestAcceptView,
    DonorRequestDeclineView,
    DonorRequestDetailView,
    DonorRequestListView,
)

urlpatterns = [
    path(
        "requests/",
        DonorRequestListView.as_view(),
        name="donor-request-list",
    ),
    path(
        "requests/<uuid:request_id>/",
        DonorRequestDetailView.as_view(),
        name="donor-request-detail",
    ),
    path(
        "requests/<uuid:request_id>/accept/",
        DonorRequestAcceptView.as_view(),
        name="donor-request-accept",
    ),
    path(
        "requests/<uuid:request_id>/decline/",
        DonorRequestDeclineView.as_view(),
        name="donor-request-decline",
    ),
    path(
        "profile/",
        DonorProfileView.as_view(),
        name="donor-profile",
    ),
    path(
        "donations/",
        DonorDonationHistoryView.as_view(),
        name="donor-donation-history",
    ),
]
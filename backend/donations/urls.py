from django.urls import path

from .views import (
    DonationDetailView,
    DonorDonationHistoryView,
    HospitalDonationCreateView,
    HospitalDonationCompleteView,
    HospitalDonationHistoryView,
)


urlpatterns = [
    path(
        "",
        HospitalDonationHistoryView.as_view(),
        name="donation-history",
    ),
    path(
        "create/",
        HospitalDonationCreateView.as_view(),
        name="donation-create",
    ),
    path(
        "donor-history/",
        DonorDonationHistoryView.as_view(),
        name="donor-donation-history",
    ),
    path(
        "<uuid:id>/complete/",
        HospitalDonationCompleteView.as_view(),
        name="donation-complete",
    ),
    path(
        "<uuid:id>/",
        DonationDetailView.as_view(),
        name="donation-detail",
    ),
]
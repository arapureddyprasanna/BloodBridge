from django.urls import path

from .views import (
    DonationDetailView,
     DonorDonationHistoryView,
    HospitalDonationHistoryView,
)

urlpatterns = [
    path(
        "",
        HospitalDonationHistoryView.as_view(),
        name="donation-history",
    ),
    path(
        "donor-history/",
        DonorDonationHistoryView.as_view(),
        name="donor-donation-history",
    ),
    path(
        "<uuid:id>/",
        DonationDetailView.as_view(),
        name="donation-detail",
    ),
]
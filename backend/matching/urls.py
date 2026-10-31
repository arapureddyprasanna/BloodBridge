from django.urls import path

from .views import (
    HospitalDonorMatchesView,
    HospitalSelectDonorsView,
    HospitalSelectedDonorsView,
)


urlpatterns = [
    path(
        "hospital/blood-requests/<uuid:request_id>/matches/",
        HospitalDonorMatchesView.as_view(),
        name="hospital-donor-matches",
    ),
    path(
        "hospital/blood-requests/<uuid:request_id>/matches/select/",
        HospitalSelectDonorsView.as_view(),
        name="hospital-select-donors",
    ),
    path(
        "hospital/blood-requests/<uuid:request_id>/matches/selected/",
        HospitalSelectedDonorsView.as_view(),
        name="hospital-selected-donors",
    ),
]
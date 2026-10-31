from django.urls import path

from .views import (
    BloodRequestMonitorView,
    BloodRequestMonitorDetailView,
    HospitalBloodRequestListCreateView,
    HospitalBloodRequestDetailView,
    HospitalBloodRequestCancelView,
    HospitalBloodRequestTrackingView,
    HospitalBloodRequestFulfillView,
)


urlpatterns = [
    # Super Admin
    path(
        "superadmin/blood-requests/",
        BloodRequestMonitorView.as_view(),
        name="superadmin-blood-requests",
    ),
    path(
        "superadmin/blood-requests/<uuid:request_id>/",
        BloodRequestMonitorDetailView.as_view(),
        name="superadmin-blood-request-detail",
    ),

    # Hospital Admin
    path(
        "hospital/blood-requests/",
        HospitalBloodRequestListCreateView.as_view(),
        name="hospital-blood-requests",
    ),
    path(
        "hospital/blood-requests/<uuid:request_id>/",
        HospitalBloodRequestDetailView.as_view(),
        name="hospital-blood-request-detail",
    ),
    path(
        "hospital/blood-requests/<uuid:request_id>/cancel/",
        HospitalBloodRequestCancelView.as_view(),
        name="hospital-blood-request-cancel",
    ),
    path(
    "hospital/blood-requests/<uuid:request_id>/tracking/",
    HospitalBloodRequestTrackingView.as_view(),
    name="hospital-blood-request-tracking",
),
path(
    "hospital/blood-requests/<uuid:request_id>/fulfill/",
    HospitalBloodRequestFulfillView.as_view(),
    name="hospital-blood-request-fulfill",
),
]
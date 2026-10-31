from django.urls import path

from .views import ReportsAnalyticsView

urlpatterns = [
    path(
        "superadmin/reports/analytics/",
        ReportsAnalyticsView.as_view(),
        name="superadmin-reports-analytics",
    ),
]
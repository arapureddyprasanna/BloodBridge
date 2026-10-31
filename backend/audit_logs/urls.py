
from django.urls import path

from .views import AuditLogListView, AuditLogOverviewView

urlpatterns = [
    path(
        "superadmin/audit-logs/",
        AuditLogListView.as_view(),
        name="audit-log-list",
    ),
    path(
        "superadmin/audit-logs/overview/",
        AuditLogOverviewView.as_view(),
        name="audit-log-overview",
    ),
]

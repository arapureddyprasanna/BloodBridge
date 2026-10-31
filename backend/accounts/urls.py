from django.urls import path

from .views import (
    RegisterView,
    MeView,
    EmailDomainCheckView,
    ProfilePictureView,
    VerificationStatusView,
)
from .verification_views import (
    VerificationDocumentUploadView,
    VerificationDocumentDeleteView,
    VerificationDocumentViewView,
    VerificationSubmitView,
)
from .superadmin_views import (
    SuperAdminDashboardView,
    PendingApplicationsView,
    VerificationApplicationDetailView,
    VerificationDocumentDownloadView,
    VerificationDocumentDecisionView,
    ApplicationDecisionView,
    UserManagementView,
    UserAccountStatusView,
)


urlpatterns = [
    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------
    path(
        "auth/register/",
        RegisterView.as_view(),
        name="register",
    ),
    path(
        "auth/me/",
        MeView.as_view(),
        name="me",
    ),
    path(
        "auth/me/photo/",
        ProfilePictureView.as_view(),
        name="profile-picture",
    ),
    path(
        "auth/verification/",
        VerificationStatusView.as_view(),
        name="verification-status",
    ),
    path(
        "auth/check-email/",
        EmailDomainCheckView.as_view(),
        name="check-email",
    ),

    # ------------------------------------------------------------------
    # Super Admin
    # ------------------------------------------------------------------
    path(
        "superadmin/dashboard/",
        SuperAdminDashboardView.as_view(),
        name="superadmin-dashboard",
    ),
    path(
        "superadmin/pending-applications/",
        PendingApplicationsView.as_view(),
        name="pending-applications",
    ),
    path(
        "superadmin/applications/<uuid:user_id>/",
        ApplicationDecisionView.as_view(),
        name="application-decision",
    ),
    path(
        "superadmin/applications/<uuid:user_id>/details/",
        VerificationApplicationDetailView.as_view(),
        name="verification-application-detail",
    ),
    path(
        "superadmin/users/",
        UserManagementView.as_view(),
        name="superadmin-users",
    ),
    path(
        "superadmin/users/<uuid:user_id>/status/",
        UserAccountStatusView.as_view(),
        name="superadmin-user-status",
    ),

    # ------------------------------------------------------------------
    # Verification Documents
    # ------------------------------------------------------------------
    path(
        "auth/verification/documents/",
        VerificationDocumentUploadView.as_view(),
        name="verification-document-upload",
    ),
    path(
        "auth/verification/documents/<uuid:document_id>/",
        VerificationDocumentDeleteView.as_view(),
        name="verification-document-delete",
    ),
    path(
        "auth/verification/submit/",
        VerificationSubmitView.as_view(),
        name="verification-submit",
    ),

    # Super Admin document review
    path(
        "superadmin/verification/documents/<uuid:document_id>/download/",
        VerificationDocumentDownloadView.as_view(),
        name="verification-document-download",
    ),
    path(
        "superadmin/verification/documents/<uuid:document_id>/decision/",
        VerificationDocumentDecisionView.as_view(),
        name="verification-document-decision",
    ),
    path(
    "auth/verification/documents/<uuid:document_id>/view/",
    VerificationDocumentViewView.as_view(),
    name="verification-document-view",
),
]
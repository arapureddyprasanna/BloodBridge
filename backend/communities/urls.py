from django.urls import path

from .views import (
    CommunityApplicationApproveView,
    CommunityApplicationDetailView,
    CommunityApplicationListView,
    CommunityApplicationRejectView,
    CommunityAnnouncementActionView,
    CommunityAnnouncementDetailView,
    CommunityAnnouncementFeedView,
    CommunityAnnouncementListCreateView,
    CommunityActivityView,
    CommunityBloodCoordinationView,
    CommunityCoordinationNotifyHospitalView,
    CommunityDocumentReviewView,
    CommunityDocumentDownloadView,
    CommunityDetailView,
    CommunityListView,
    CommunityMemberListView,
    CommunityProfileView,
    CommunityReviewListCreateView,
    DonorCancelCommunityApplicationView,
    DonorCommunityApplicationView,
    DonorJoinCommunityView,
    DonorOnboardingStatusView,
    DonationCampCloseRegistrationView,
    DonationCampDetailView,
    DonationCampListCreateView,
    DonationCampRegistrationListView,
    DonorCampRegistrationView,
    HospitalCommunityRequestShareView,
)


urlpatterns = [
    # Explicit hospital-authorized sharing and community coordination.
    path("hospital/requests/<uuid:request_id>/share/", HospitalCommunityRequestShareView.as_view(), name="hospital-community-request-share"),
    path("my/blood-coordination/", CommunityBloodCoordinationView.as_view(), name="community-blood-coordination"),
    path("my/blood-coordination/<uuid:request_id>/notify-hospital/", CommunityCoordinationNotifyHospitalView.as_view(), name="community-notify-hospital-coordination"),
    path("my/activity/", CommunityActivityView.as_view(), name="community-activity"),

    # Community announcements.
    path("my/announcements/", CommunityAnnouncementListCreateView.as_view(), name="community-announcements"),
    path("my/announcements/<uuid:announcement_id>/", CommunityAnnouncementDetailView.as_view(), name="community-announcement-detail"),
    path("my/announcements/<uuid:announcement_id>/<str:action>/", CommunityAnnouncementActionView.as_view(), name="community-announcement-action"),
    path("<uuid:community_id>/announcements/", CommunityAnnouncementFeedView.as_view(), name="community-announcement-feed"),

    # Community donation camps and member registrations.
    path("my/camps/", DonationCampListCreateView.as_view(), name="community-camps"),
    path("my/camps/<uuid:camp_id>/", DonationCampDetailView.as_view(), name="community-camp-detail"),
    path("my/camps/<uuid:camp_id>/close-registration/", DonationCampCloseRegistrationView.as_view(), name="community-camp-close-registration"),
    path("my/camps/<uuid:camp_id>/registrations/", DonationCampRegistrationListView.as_view(), name="community-camp-registrations"),
    path("camps/<uuid:camp_id>/register/", DonorCampRegistrationView.as_view(), name="donor-camp-registration"),

    # Public / donor community discovery
    path(
        "",
        CommunityListView.as_view(),
        name="community-list",
    ),
    path(
        "<uuid:community_id>/",
        CommunityDetailView.as_view(),
        name="community-detail",
    ),

    # Donor membership
    path(
        "<uuid:community_id>/join/",
        DonorJoinCommunityView.as_view(),
        name="community-join",
    ),
    path(
        "my-application/",
        DonorCommunityApplicationView.as_view(),
        name="my-community-application",
    ),
    path(
        "my-application/cancel/",
        DonorCancelCommunityApplicationView.as_view(),
        name="cancel-community-application",
    ),

    # Donor onboarding
    path(
        "onboarding/status/",
        DonorOnboardingStatusView.as_view(),
        name="donor-onboarding-status",
    ),

    # Reviews
    path(
        "<uuid:community_id>/reviews/",
        CommunityReviewListCreateView.as_view(),
        name="community-reviews",
    ),

    # Community Admin
    path(
        "my/",
        CommunityProfileView.as_view(),
        name="my-community",
    ),
    path(
        "my/applications/",
        CommunityApplicationListView.as_view(),
        name="community-applications",
    ),
    path(
        "my/applications/<uuid:application_id>/",
        CommunityApplicationDetailView.as_view(),
        name="community-application-detail",
    ),
    path(
        "my/applications/<uuid:application_id>/approve/",
        CommunityApplicationApproveView.as_view(),
        name="community-application-approve",
    ),
    path(
        "my/applications/<uuid:application_id>/reject/",
        CommunityApplicationRejectView.as_view(),
        name="community-application-reject",
    ),
    path(
        "my/applications/<uuid:application_id>/documents/<uuid:document_id>/",
        CommunityDocumentReviewView.as_view(),
        name="community-document-review",
    ),
    path(
        "my/applications/<uuid:application_id>/documents/<uuid:document_id>/download/",
        CommunityDocumentDownloadView.as_view(),
        name="community-document-download",
    ),
    path(
        "my/members/",
        CommunityMemberListView.as_view(),
        name="community-members",
    ),
]

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)


urlpatterns = [
    path("admin/", admin.site.urls),

    # BloodBridge API
    path("api/", include("accounts.urls")),
    path("api/", include("notifications.urls")),
    path("api/", include("blood_requests.urls")),
    path("api/", include("matching.urls")),
    path("api/", include("reports.urls")),
    path("api/", include("audit_logs.urls")),
    path("api/donor/", include("donors.urls")),
    path(
    "api/communities/",
    include("communities.urls"),
),
    path(
    "api/donations/",
    include("donations.urls"),
),

    # API documentation
    path(
        "api/schema/",
        SpectacularAPIView.as_view(),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
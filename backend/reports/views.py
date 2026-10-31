from datetime import date, timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.permission import IsSuperAdmin
from accounts.models import User
from blood_requests.models import BloodRequest
from .serializers import ReportOverviewSerializer


class ReportsAnalyticsView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    @extend_schema(
        tags=["Reports"],
        operation_id="superadmin_reports_analytics",
        responses={200: ReportOverviewSerializer},
    )
    def get(self, request):
        today = timezone.localdate()
        default_start = today - timedelta(days=364)

        start_date_raw = request.query_params.get("start_date")
        end_date_raw = request.query_params.get("end_date")

        try:
            start_date = (
                date.fromisoformat(start_date_raw)
                if start_date_raw
                else default_start
            )
            end_date = (
                date.fromisoformat(end_date_raw)
                if end_date_raw
                else today
            )
        except ValueError:
            return Response(
                {"detail": "Dates must use YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start_date > end_date:
            return Response(
                {"detail": "start_date cannot be after end_date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        users = User.objects.all()
        donors = users.filter(role="donor")
        hospitals = users.filter(role="hospital_admin")
        communities = users.filter(role="community_admin")

        period_requests = BloodRequest.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        )

        total_requests = period_requests.count()
        fulfilled_requests = period_requests.filter(
            status=BloodRequest.Status.FULFILLED
        ).count()

        active_requests = period_requests.filter(
            status__in=[
                BloodRequest.Status.OPEN,
                BloodRequest.Status.MATCHING,
                BloodRequest.Status.PARTIALLY_FULFILLED,
            ]
        ).count()

        cancelled_requests = period_requests.filter(
            status__in=[
                BloodRequest.Status.CANCELLED,
                BloodRequest.Status.EXPIRED,
            ]
        ).count()

        fulfillment_rate = (
            round((fulfilled_requests / total_requests) * 100, 2)
            if total_requests
            else 0.0
        )

        blood_group_distribution = list(
            period_requests.values("blood_group")
            .annotate(count=Count("id"), units=Sum("units_required"))
            .order_by("blood_group")
        )

        urgency_distribution = list(
            period_requests.values("urgency")
            .annotate(count=Count("id"))
            .order_by("urgency")
        )

        status_distribution = list(
            period_requests.values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )

        monthly_requests = list(
            period_requests.annotate(
                month=TruncMonth("created_at")
            )
            .values("month")
            .annotate(count=Count("id"))
            .order_by("month")
        )

        monthly_requests = [
            {
                "month": item["month"].strftime("%Y-%m"),
                "count": item["count"],
            }
            for item in monthly_requests
        ]

        data = {
            "total_users": users.count(),
            "active_users": users.filter(
                account_status=User.AccountStatus.ACTIVE,
                is_active=True,
            ).count(),
            "total_donors": donors.count(),
            "total_hospitals": hospitals.count(),
            "total_communities": communities.count(),
            "total_requests": total_requests,
            "active_requests": active_requests,
            "fulfilled_requests": fulfilled_requests,
            "cancelled_requests": cancelled_requests,
            "fulfillment_rate": fulfillment_rate,
            "blood_group_distribution": blood_group_distribution,
            "urgency_distribution": urgency_distribution,
            "status_distribution": status_distribution,
            "monthly_requests": monthly_requests,
        }

        serializer = ReportOverviewSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        return Response(serializer.data)
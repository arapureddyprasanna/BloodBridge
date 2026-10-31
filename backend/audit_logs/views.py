
from datetime import timedelta

from django.db.models import Q, Count
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from rest_framework import generics, pagination
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication
from accounts.permission import IsSuperAdmin
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogPagination(pagination.PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = AuditLogPagination

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor").all()
        params = self.request.query_params

        start_date = params.get("start_date")
        end_date = params.get("end_date")
        actor_id = params.get("actor")
        action = params.get("action")
        outcome = params.get("outcome")
        search = params.get("search", "").strip()

        if start_date:
            parsed_start = parse_date(start_date)
            if not parsed_start:
                raise ValidationError({
                    "start_date": "Use YYYY-MM-DD format."
                })
            queryset = queryset.filter(
                created_at__date__gte=parsed_start
            )

        if end_date:
            parsed_end = parse_date(end_date)
            if not parsed_end:
                raise ValidationError({
                    "end_date": "Use YYYY-MM-DD format."
                })
            queryset = queryset.filter(
                created_at__date__lte=parsed_end
            )

        if start_date and end_date and parsed_start > parsed_end:
            raise ValidationError({
                "date_range": "start_date cannot be after end_date."
            })

        if actor_id:
            if actor_id == "system":
                queryset = queryset.filter(actor__isnull=True)
            else:
                queryset = queryset.filter(actor_id=actor_id)

        if action:
            if action not in AuditLog.ActionType.values:
                raise ValidationError({
                    "action": "Invalid action filter."
                })
            queryset = queryset.filter(action=action)

        if outcome:
            if outcome not in AuditLog.Outcome.values:
                raise ValidationError({
                    "outcome": "Use success or blocked."
                })
            queryset = queryset.filter(outcome=outcome)

        if search:
            queryset = queryset.filter(
                Q(description__icontains=search)
                | Q(actor__full_name__icontains=search)
                | Q(actor__email__icontains=search)
                | Q(target_type__icontains=search)
                | Q(target_id__icontains=search)
                | Q(ip_address__icontains=search)
                | Q(reason__icontains=search)
            )

        return queryset.order_by("-created_at")


class AuditLogOverviewView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        now = timezone.now()
        today = timezone.localdate()
        week_start = today - timedelta(days=6)

        today_logs = AuditLog.objects.filter(
            created_at__date=today
        )

        week_logs = AuditLog.objects.filter(
            created_at__date__gte=week_start,
            created_at__date__lte=today,
        )

        active_admins = (
            week_logs.filter(actor__isnull=False)
            .values("actor_id")
            .distinct()
            .count()
        )

        return Response({
            "events_today": today_logs.count(),
            "active_administrators": active_admins,
            "blocked_events": today_logs.filter(
                outcome=AuditLog.Outcome.BLOCKED
            ).count(),
            "log_retention_days": 365,
        })

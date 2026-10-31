from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.firebase_authentication import FirebaseUserAuthentication

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(
            recipient=request.user
        )

        serializer = NotificationSerializer(
            notifications,
            many=True,
        )

        return Response({
            "results": serializer.data,
            "unread_count": notifications.filter(
                is_read=False
            ).count(),
        })


class UnreadNotificationCountView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).count()

        return Response({
            "unread_count": count,
        })


class MarkNotificationReadView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        try:
            notification = Notification.objects.get(
                id=notification_id,
                recipient=request.user,
            )
        except Notification.DoesNotExist:
            return Response(
                {"detail": "Notification not found."},
                status=404,
            )

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(
                update_fields=["is_read", "read_at"]
            )

        return Response(
            NotificationSerializer(notification).data
        )


class MarkAllNotificationsReadView(APIView):
    authentication_classes = [FirebaseUserAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).update(
            is_read=True,
            read_at=timezone.now(),
        )

        return Response({
            "detail": "Unread notifications marked as read.",
            "updated_count": updated,
        })
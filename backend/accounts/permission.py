from rest_framework.permissions import BasePermission

from .models import User


class IsSuperAdmin(BasePermission):
    message = "Only Super Admins can perform this action."

    def has_permission(self, request, view):
        user = request.user

        return (
            isinstance(user, User)
            and user.is_authenticated
            and user.role == User.Role.SUPER_ADMIN
            and user.account_status == User.AccountStatus.ACTIVE
            and user.is_active
        )
from rest_framework.permissions import BasePermission


class IsHospitalAdmin(BasePermission):
    message = "Only active Hospital Admins can perform this action."

    def has_permission(self, request, view):
        claims = getattr(request, "auth", None) or {}
        firebase_uid = claims.get("uid")

        if firebase_uid:
            user = User.objects.filter(
                firebase_uid=firebase_uid,
                role=User.Role.HOSPITAL_ADMIN,
                account_status=User.AccountStatus.ACTIVE,
                is_active=True,
            ).first()

            if user:
                request.user = user
                return True

        user = getattr(request, "user", None)

        return (
            user is not None
            and user.is_authenticated
            and getattr(user, "role", None) == User.Role.HOSPITAL_ADMIN
            and getattr(user, "account_status", None) == User.AccountStatus.ACTIVE
            and getattr(user, "is_active", False)
        )
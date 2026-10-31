from rest_framework.permissions import BasePermission

from accounts.models import User


class IsDonor(BasePermission):
    message = "Only active donors can perform this action."

    def has_permission(self, request, view):
        user = request.user

        return (
            isinstance(user, User)
            and user.is_authenticated
            and user.role == User.Role.DONOR
            and user.account_status == User.AccountStatus.ACTIVE
            and user.is_active
        )


class IsCommunityAdmin(BasePermission):
    message = "Only active community administrators can perform this action."

    def has_permission(self, request, view):
        user = request.user

        return (
            isinstance(user, User)
            and user.is_authenticated
            and user.role == User.Role.COMMUNITY_ADMIN
            and user.account_status == User.AccountStatus.ACTIVE
            and user.is_active
        )


class IsDonorOnboarding(BasePermission):
    message = "Only registered donors can access donor onboarding."

    def has_permission(self, request, view):
        user = request.user

        return (
            isinstance(user, User)
            and user.is_authenticated
            and user.role == User.Role.DONOR
            and user.account_status in {
                User.AccountStatus.PENDING,
                User.AccountStatus.ACTIVE,
            }
            and user.is_active
        )
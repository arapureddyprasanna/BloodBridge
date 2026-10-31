from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User


class FirebaseIdentity:
    """Temporary identity verified by Firebase."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, claims):
        self.uid = claims["uid"]
        self.email = claims.get("email", "")
        self.email_verified = claims.get("email_verified", False)


def verify_firebase_token(token):
    try:
        try:
            app = firebase_admin.get_app()
        except ValueError:
            credential_path = Path(settings.BASE_DIR) / "firebaseAcc.json"

            if not credential_path.is_file():
                raise AuthenticationFailed(
                    "Firebase service-account configuration is missing."
                )

            app = firebase_admin.initialize_app(
                credentials.Certificate(str(credential_path))
            )

        return auth.verify_id_token(token, app=app)

    except AuthenticationFailed:
        raise
    except Exception:
        raise AuthenticationFailed("Invalid or expired Firebase token.")


class FirebaseTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        parts = header.split()

        if not parts:
            return None

        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise AuthenticationFailed(
                "Use Authorization: Bearer <Firebase ID token>."
            )

        claims = verify_firebase_token(parts[1])

        if not claims.get("uid"):
            raise AuthenticationFailed("Firebase token has no user ID.")

        return FirebaseIdentity(claims), claims

    def authenticate_header(self, request):
        return "Bearer"


class FirebaseUserAuthentication(BaseAuthentication):
    """
    Verify the Firebase ID token and resolve it to the
    corresponding BloodBridge Django User.

    Primary identity:
        Firebase UID

    A verified email is not sufficient to silently relink a
    BloodBridge account. UID relinking belongs in an explicit,
    separately verified account-recovery flow.
    """

    def authenticate(self, request):
        result = FirebaseTokenAuthentication().authenticate(request)

        if result is None:
            return None

        identity, claims = result

        firebase_uid = identity.uid
        firebase_email = (
            claims.get("email") or ""
        ).strip().lower()
        firebase_email_verified = bool(
            claims.get("email_verified", False)
        )
        try:
            user = User.objects.get(
                firebase_uid=firebase_uid
            )
        except User.DoesNotExist:
            # Preserve verified-email recovery for existing accounts,
            # but never change the stored Firebase UID implicitly.
            user = None
            if firebase_email and firebase_email_verified:
                user = User.objects.filter(
                    email__iexact=firebase_email
                ).first()

            if user is None:
                raise AuthenticationFailed(
                    "No BloodBridge account is linked to this Firebase user."
                )

        if not user.is_active:
            raise AuthenticationFailed(
                "This account is inactive."
            )

        return user, claims

    def authenticate_header(self, request):
        return "Bearer"

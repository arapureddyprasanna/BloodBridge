"""Small helpers for authenticated BloodBridge API integration tests."""

from io import BytesIO
import tempfile
import uuid
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User, VerificationApplication


class FirebaseAPITestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.firebase_tokens = {}
        self.firebase_patch = patch(
            "accounts.firebase_authentication.verify_firebase_token",
            side_effect=self.verify_firebase_token,
        )
        self.firebase_patch.start()
        self.addCleanup(self.firebase_patch.stop)

        media_directory = tempfile.TemporaryDirectory()
        self.addCleanup(media_directory.cleanup)
        media_override = override_settings(MEDIA_ROOT=media_directory.name)
        media_override.enable()
        self.addCleanup(media_override.disable)

    def verify_firebase_token(self, token):
        try:
            return self.firebase_tokens[token]
        except KeyError as error:
            raise ValueError("Unknown test Firebase token") from error

    def make_user(
        self,
        role=User.Role.DONOR,
        account_status=User.AccountStatus.ACTIVE,
        is_active=True,
        is_superuser=False,
        email=None,
    ):
        uid = f"test-{uuid.uuid4()}"
        user = User.objects.create_user(
            username=uid,
            password="test-password",
            firebase_uid=uid,
            email=email or f"{uid}@example.test",
            full_name=f"User {uid[:12]}",
            mobile_number="9000000000",
            role=role,
            account_status=account_status,
            is_active=is_active,
            is_superuser=is_superuser,
        )
        if role != User.Role.SUPER_ADMIN:
            VerificationApplication.objects.create(user=user)
        if role == User.Role.DONOR:
            from donors.models import DonorProfile

            DonorProfile.objects.create(user=user, blood_group="O+")
        elif role == User.Role.COMMUNITY_ADMIN:
            from communities.models import Community

            Community.objects.create(
                admin=user,
                name=user.full_name,
                email=user.email,
            )
        elif role == User.Role.HOSPITAL_ADMIN:
            from hospitals.models import HospitalProfile

            HospitalProfile.objects.create(
                user=user,
                hospital_name=user.full_name,
                address_line1="1 Test Road",
                city="Test City",
                state="Test State",
                postal_code="00000",
            )
        return user

    def auth_headers(self, user=None, *, uid=None, email=None, email_verified=True):
        uid = uid or (user.firebase_uid if user else f"test-{uuid.uuid4()}")
        email = email or (user.email if user else f"{uid}@example.test")
        token = f"test-token-{uuid.uuid4()}"
        self.firebase_tokens[token] = {
            "uid": uid,
            "email": email,
            "email_verified": email_verified,
        }
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def png_upload(self, name="test.png"):
        output = BytesIO()
        Image.new("RGB", (2, 2), color="red").save(output, format="PNG")
        return SimpleUploadedFile(
            name,
            output.getvalue(),
            content_type="image/png",
        )

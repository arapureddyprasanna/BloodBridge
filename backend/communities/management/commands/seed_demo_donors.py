"""Seed deterministic donor demo accounts, accepted memberships, and reviews."""

from datetime import time, timedelta
from decimal import Decimal
import re

import firebase_admin
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.utils import timezone
from firebase_admin import auth, credentials

from accounts.models import User, VerificationApplication
from communities.models import (
    Community,
    CommunityReview,
    DonorCommunityApplication,
)
from donors.models import DonorProfile


DEMO_MARKER = "[BloodBridge Demo Donor]"
PASSWORD = "Donor@123"
BLOOD_GROUPS = ("O+", "A+", "B+", "O-", "A-", "AB+", "B-", "AB-")
FIRST_NAMES = (
    "Aarav", "Priya", "Arjun", "Ananya", "Rohan", "Kavya", "Vikram",
    "Meera", "Ishaan", "Neha", "Aditya", "Sana", "Rahul", "Divya",
    "Kiran", "Pooja", "Nikhil", "Aisha", "Siddharth", "Lakshmi",
    "Varun", "Ira", "Manav", "Sreya", "Dev", "Tanvi", "Kabir", "Anika",
    "Yash", "Maya",
)
LAST_NAMES = (
    "Reddy", "Sharma", "Patel", "Nair", "Iyer", "Khan", "Das", "Rao",
    "Menon", "Joshi", "Kapoor", "Singh", "Kulkarni", "Bose", "Pillai",
)
REVIEW_TEMPLATES = (
    "{community} keeps donation drives organized, and the team shares clear updates with members.",
    "I appreciate how {community} coordinates donor availability and communicates when help is needed.",
    "The volunteers at {community} are welcoming, and joining local donation activities has been easy.",
    "{community} makes it simple to stay informed about blood donation events and community needs.",
    "The team at {community} responds promptly and helps donors coordinate their participation.",
    "I have had a positive experience with {community}; its event details and member updates are useful.",
    "{community} brings donors together well, with thoughtful coordination around local blood drives.",
    "Communication from {community} is helpful, and the donation activities are easy to follow.",
)


def firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        from django.conf import settings

        credential_path = settings.BASE_DIR / "firebaseAcc.json"
        if not credential_path.is_file():
            raise CommandError("Firebase service-account configuration is missing.")
        try:
            return firebase_admin.initialize_app(
                credentials.Certificate(str(credential_path))
            )
        except Exception as exc:
            raise CommandError("Firebase Admin initialization failed.") from exc


def get_or_create_firebase_user(email, app):
    try:
        firebase_user = auth.get_user_by_email(email, app=app)
        if firebase_user.email_verified is not True:
            firebase_user = auth.update_user(
                firebase_user.uid, email_verified=True, app=app
            )
        return firebase_user, False
    except auth.UserNotFoundError:
        try:
            return auth.create_user(
                email=email,
                password=PASSWORD,
                email_verified=True,
                app=app,
            ), True
        except Exception as exc:
            # Handle a concurrent create safely without exposing SDK details.
            try:
                return auth.get_user_by_email(email, app=app), False
            except Exception:
                raise CommandError(
                    f"Could not create or find Firebase account for {email}."
                ) from exc
    except Exception as exc:
        raise CommandError(
            f"Could not look up Firebase account for {email}."
        ) from exc


class Command(BaseCommand):
    help = "Create 150 deterministic demo donors, memberships, and community reviews."

    def handle(self, *args, **options):
        communities = list(Community.objects.order_by("name", "id"))
        if len(communities) != 6:
            raise CommandError(
                f"Expected exactly 6 existing communities; found {len(communities)}."
            )

        app = firebase_app()
        firebase_created = 0
        donor_created = 0
        membership_created = 0
        review_created = 0
        membership_reused = 0
        review_reused = 0
        collisions = []
        today = timezone.localdate()
        base_lat = Decimal("12.971600")
        base_lon = Decimal("77.594600")

        for community_index, community in enumerate(communities):
            for donor_index in range(25):
                sequence = community_index * 25 + donor_index + 1
                first = FIRST_NAMES[(sequence - 1) % len(FIRST_NAMES)]
                last = LAST_NAMES[((sequence - 1) // len(FIRST_NAMES)) % len(LAST_NAMES)]
                name = f"{first} {last} {sequence:03d}"
                slug = re.sub(r"[^a-z0-9]+", "_", f"{first}_{last}".lower()).strip("_")
                email = f"{slug}{sequence:03d}@gmail.com"
                phone = f"+9198{sequence:08d}"

                existing = User.objects.filter(email__iexact=email).first()
                if existing and not (
                    existing.full_name == name
                    and DEMO_MARKER in existing.first_name
                    and existing.role == User.Role.DONOR
                ):
                    collisions.append(email)
                    continue

                firebase_user, was_created = get_or_create_firebase_user(email, app)
                firebase_created += int(was_created)

                # Never relink a Firebase account to an unrelated Django account.
                uid_owner = User.objects.filter(firebase_uid=firebase_user.uid).first()
                if uid_owner and uid_owner.email.casefold() != email.casefold():
                    collisions.append(email)
                    continue

                other_accepted_membership = DonorCommunityApplication.objects.filter(
                    donor__email__iexact=email,
                    status=DonorCommunityApplication.Status.ACCEPTED,
                ).exclude(community=community).first()
                if other_accepted_membership:
                    collisions.append(email)
                    continue

                with transaction.atomic():
                    user, created = User.objects.get_or_create(
                        email=email,
                        defaults={
                            "username": email,
                            "first_name": f"{DEMO_MARKER} {first}",
                            "last_name": f"{last} {sequence:03d}",
                            "full_name": name,
                            "mobile_number": phone,
                            "role": User.Role.DONOR,
                            "account_status": User.AccountStatus.ACTIVE,
                            "is_active": True,
                            "email_verified": True,
                            "firebase_uid": firebase_user.uid,
                        },
                    )
                    if not created and not (
                        user.full_name == name
                        and DEMO_MARKER in user.first_name
                        and user.role == User.Role.DONOR
                    ):
                        collisions.append(email)
                        continue
                    donor_created += int(created)
                    if not created:
                        user.username = user.username or email
                        user.first_name = f"{DEMO_MARKER} {first}"
                        user.last_name = f"{last} {sequence:03d}"
                        user.full_name = name
                        user.mobile_number = phone
                        user.role = User.Role.DONOR
                        user.account_status = User.AccountStatus.ACTIVE
                        user.is_active = True
                        user.email_verified = True
                        user.firebase_uid = firebase_user.uid
                        user.save()
                    user.set_password(PASSWORD)
                    user.save(update_fields=["password"])

                    profile, _ = DonorProfile.objects.get_or_create(
                        user=user,
                        defaults={
                            "blood_group": BLOOD_GROUPS[(sequence - 1) % 8],
                            "is_available": sequence % 5 != 0,
                            "availability_start": today,
                            "availability_end": today + timedelta(days=365),
                            "preferred_start_time": time(8, 0),
                            "preferred_end_time": time(18, 0),
                            "preferred_days": ["Monday", "Wednesday", "Saturday"],
                            "latitude": base_lat + Decimal(community_index) * Decimal("0.012") + Decimal(donor_index) * Decimal("0.0001"),
                            "longitude": base_lon + Decimal(community_index) * Decimal("0.009") + Decimal(donor_index) * Decimal("0.0001"),
                            "max_travel_distance_km": 25 + donor_index % 4 * 5,
                            "location_updated_at": timezone.now(),
                        },
                    )

                    verification, _ = VerificationApplication.objects.get_or_create(
                        user=user,
                        defaults={"status": VerificationApplication.Status.APPROVED},
                    )
                    if verification.status != VerificationApplication.Status.APPROVED:
                        verification.status = VerificationApplication.Status.APPROVED
                        verification.submitted_at = verification.submitted_at or timezone.now()
                        verification.reviewed_at = timezone.now()
                        verification.reviewed_by = community.admin
                        verification.save()

                    membership, membership_was_created = DonorCommunityApplication.objects.get_or_create(
                        donor=user,
                        community=community,
                        defaults={
                            "status": DonorCommunityApplication.Status.ACCEPTED,
                            "reviewed_at": timezone.now(),
                            "reviewed_by": community.admin,
                        },
                    )
                    if membership.status != DonorCommunityApplication.Status.ACCEPTED:
                        membership.status = DonorCommunityApplication.Status.ACCEPTED
                        membership.reviewed_at = timezone.now()
                        membership.reviewed_by = community.admin
                        membership.rejection_reason = ""
                        membership.save()
                    membership_created += int(membership_was_created)
                    membership_reused += int(not membership_was_created)

                    rating = (5, 4, 5, 3, 4)[donor_index % 5]
                    review, review_was_created = CommunityReview.objects.get_or_create(
                        community=community,
                        donor=user,
                        defaults={
                            "rating": rating,
                            "review": REVIEW_TEMPLATES[sequence % len(REVIEW_TEMPLATES)].format(
                                community=community.name
                            ),
                        },
                    )
                    if not review_was_created:
                        review.rating = rating
                        review.review = REVIEW_TEMPLATES[sequence % len(REVIEW_TEMPLATES)].format(
                            community=community.name
                        )
                        review.save(update_fields=["rating", "review", "updated_at"])
                    review_created += int(review_was_created)
                    review_reused += int(not review_was_created)

        if collisions:
            self.stderr.write(
                self.style.WARNING(
                    f"Skipped {len(collisions)} email collision(s); no unrelated accounts were overwritten."
                )
            )
        seeded_count = User.objects.filter(first_name__startswith=DEMO_MARKER).count()
        self.stdout.write(f"Communities: {len(communities)}")
        self.stdout.write(f"Donors created/reused: {seeded_count}")
        self.stdout.write(
            f"Memberships created/reused: {membership_created + membership_reused}"
        )
        self.stdout.write(f"Reviews created/reused: {review_created + review_reused}")
        self.stdout.write(
            f"Firebase users created/reused: {firebase_created}/"
            f"{seeded_count - firebase_created}"
        )
        self.stdout.write(
            "Blood groups: "
            + ", ".join(
                f"{group}={DonorProfile.objects.filter(user__first_name__startswith=DEMO_MARKER, blood_group=group).count()}"
                for group in BLOOD_GROUPS
            )
        )
        if collisions or seeded_count != 150:
            raise CommandError(
                "Seed incomplete: resolve the reported collisions and rerun the command."
            )

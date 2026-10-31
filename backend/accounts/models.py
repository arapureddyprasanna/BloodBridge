import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        HOSPITAL_ADMIN = "hospital_admin", "Hospital Admin"
        COMMUNITY_ADMIN = "community_admin", "Community Admin"
        DONOR = "donor", "Donor"

    class AccountStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    firebase_uid = models.CharField(
        max_length=128,
        unique=True,
        null=True,
        blank=True,
    )

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    mobile_number = models.CharField(max_length=20, blank=True)

    profile_picture = models.ImageField(
        upload_to="profile_pictures/",
        blank=True,
        null=True,
    )

    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.DONOR,
    )

    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.PENDING,
    )

    email_verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.full_name} ({self.role})"


class VerificationApplication(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="verification_application",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_verification_applications",
    )

    rejection_reason = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def __str__(self):
        return (
            f"{self.user.full_name} - "
            f"{self.get_status_display()}"
        )


class VerificationDocument(models.Model):
    class DocumentType(models.TextChoices):
        # Hospital
        HOSPITAL_REGISTRATION = (
            "hospital_registration",
            "Hospital Registration Certificate",
        )
        HOSPITAL_OPERATING_LICENSE = (
            "hospital_operating_license",
            "Hospital Operating / Clinical Registration",
        )
        REPRESENTATIVE_IDENTITY = (
            "representative_identity",
            "Authorized Representative Identity Proof",
        )
        AUTHORIZATION_LETTER = (
            "authorization_letter",
            "Authorization Letter",
        )
        ADDRESS_PROOF = (
            "address_proof",
            "Organization Address Proof",
        )
        BLOOD_CENTRE_LICENSE = (
            "blood_centre_license",
            "Blood Centre Licence",
        )

        # Community
        ORGANIZATION_REGISTRATION = (
            "organization_registration",
            "Organization Registration Certificate",
        )
        TAX_REGISTRATION = (
            "tax_registration",
            "Tax / PAN Registration",
        )

        # Donor
        DONOR_IDENTITY = (
            "donor_identity",
            "Government Identity Proof",
        )
        AGE_VERIFICATION = (
            "age_verification",
            "Age / Date of Birth Verification",
        )
        DONOR_DECLARATION = (
            "donor_declaration",
            "Donor Declaration and Consent",
        )

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    application = models.ForeignKey(
        VerificationApplication,
        on_delete=models.CASCADE,
        related_name="documents",
    )

    document_type = models.CharField(
        max_length=50,
        choices=DocumentType.choices,
    )

    file = models.FileField(
        upload_to="verification_documents/%Y/%m/",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    rejection_reason = models.TextField(
        blank=True,
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True,
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_verification_documents",
    )

    def __str__(self):
        return (
            f"{self.application.user.full_name} - "
            f"{self.get_document_type_display()}"
        )
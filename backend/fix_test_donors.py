from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from accounts.models import (
    User,
    VerificationApplication,
    VerificationDocument,
)


def main():
    donors = User.objects.filter(
        role=User.Role.DONOR
    ).order_by("email")

    print(f"Found {donors.count()} donor(s).\n")

    # Find three existing real uploaded test files.
    source_documents = {}

    for document_type in [
        VerificationDocument.DocumentType.DONOR_IDENTITY,
        VerificationDocument.DocumentType.AGE_VERIFICATION,
        VerificationDocument.DocumentType.DONOR_DECLARATION,
    ]:
        source = (
            VerificationDocument.objects
            .filter(
                document_type=document_type,
                file__isnull=False,
            )
            .exclude(file="")
            .first()
        )

        if not source or not source.file:
            raise RuntimeError(
                f"No existing file found for {document_type}. "
                "Cannot continue safely."
            )

        source_documents[document_type] = source.file

        print(
            f"Source for {document_type}: "
            f"{source.file.name}"
        )

    print()

    required_documents = list(source_documents.keys())

    for donor in donors:
        print(
            f"Updating: {donor.full_name} "
            f"({donor.email})"
        )

        # ---------------------------------------------------------
        # Activate donor
        # ---------------------------------------------------------
        donor.account_status = User.AccountStatus.ACTIVE
        donor.is_active = True

        donor.save(
            update_fields=[
                "account_status",
                "is_active",
                "updated_at",
            ]
        )

        # ---------------------------------------------------------
        # Approve verification application
        # ---------------------------------------------------------
        application, _ = (
            VerificationApplication.objects.get_or_create(
                user=donor,
                defaults={
                    "status":
                        VerificationApplication.Status.APPROVED,
                },
            )
        )

        now = timezone.now()

        application.status = (
            VerificationApplication.Status.APPROVED
        )

        application.submitted_at = (
            application.submitted_at or now
        )

        application.reviewed_at = (
            application.reviewed_at or now
        )

        application.rejection_reason = ""

        application.save(
            update_fields=[
                "status",
                "submitted_at",
                "reviewed_at",
                "rejection_reason",
                "updated_at",
            ]
        )

        # ---------------------------------------------------------
        # Create/update required documents
        # ---------------------------------------------------------
        for document_type in required_documents:
            source_file = source_documents[document_type]

            document = (
                VerificationDocument.objects
                .filter(
                    application=application,
                    document_type=document_type,
                )
                .first()
            )

            if document is None:
                document = VerificationDocument(
                    application=application,
                    document_type=document_type,
                )

            document.status = (
                VerificationDocument.Status.VERIFIED
            )

            document.rejection_reason = ""
            document.reviewed_at = (
                document.reviewed_at or now
            )

            # Read the existing uploaded file.
            source_file.open("rb")

            try:
                file_content = source_file.read()
            finally:
                source_file.close()

            # Give every donor their own stored copy.
            filename = (
                f"test_{donor.id}_"
                f"{document_type}.png"
            )

            document.file.save(
                filename,
                ContentFile(file_content),
                save=False,
            )

            document.save()

            print(
                f"  ✓ {document_type}: VERIFIED "
                f"| file={bool(document.file)}"
            )

        print()

    # -------------------------------------------------------------
    # Final verification
    # -------------------------------------------------------------
    print("=" * 70)
    print("FINAL DONOR VERIFICATION STATUS")
    print("=" * 70)

    for donor in donors:
        application = (
            VerificationApplication.objects
            .filter(user=donor)
            .first()
        )

        documents = (
            VerificationDocument.objects
            .filter(
                application=application,
                document_type__in=required_documents,
            )
        )

        uploaded = (
            documents.count() == 3
            and all(bool(document.file) for document in documents)
        )

        verified = (
            documents.count() == 3
            and all(
                document.status
                == VerificationDocument.Status.VERIFIED
                and bool(document.file)
                for document in documents
            )
        )

        print(f"\n{donor.email}")
        print(f"  account_status: {donor.account_status}")
        print(
            f"  verification: "
            f"{application.status if application else None}"
        )
        print(f"  documents_uploaded: {uploaded}")
        print(f"  documents_verified: {verified}")

    print("\nDONE.")


if __name__ == "__main__":
    main()
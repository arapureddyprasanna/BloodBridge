from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from config.supabase_storage import SupabaseStorage


class Command(BaseCommand):
    help = "Upload existing local BloodBridge media files to Supabase Storage."

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)

        if not media_root.exists():
            self.stdout.write(
                self.style.ERROR(
                    f"Media directory does not exist: {media_root}"
                )
            )
            return

        storage = SupabaseStorage()

        files = [
            path
            for path in media_root.rglob("*")
            if path.is_file()
        ]

        if not files:
            self.stdout.write(
                self.style.WARNING(
                    "No media files found."
                )
            )
            return

        self.stdout.write(
            f"Found {len(files)} media file(s)."
        )

        uploaded = 0
        failed = 0

        for file_path in files:
            relative_path = file_path.relative_to(media_root)
            storage_path = str(relative_path).replace("\\", "/")

            try:
                with file_path.open("rb") as file:
                    storage._save(storage_path, file)

                uploaded += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Uploaded: {storage_path}"
                    )
                )

            except Exception as exc:
                failed += 1

                self.stdout.write(
                    self.style.ERROR(
                        f"Failed: {storage_path} -> {exc}"
                    )
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Migration complete. Uploaded: {uploaded}, Failed: {failed}"
            )
        )
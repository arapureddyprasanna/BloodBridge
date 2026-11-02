import io
import os

from django.core.files.storage import Storage
from django.core.files.base import ContentFile
from django.core.exceptions import ImproperlyConfigured
from supabase import create_client


class SupabaseStorage(Storage):
    """
    Django storage backend for the private BloodBridge Supabase bucket.

    Database values remain normal relative paths such as:
        profile_pictures/example.jpg
        community_logos/example.png
        verification_documents/2026/11/example.pdf
    """

    signed_url_expiry = 3600

    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL", "").strip()
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        self.bucket_name = os.getenv(
            "SUPABASE_STORAGE_BUCKET",
            "bloodbridge-media",
        ).strip()

        if not self.supabase_url:
            raise ImproperlyConfigured("SUPABASE_URL is required.")

        if not self.supabase_key:
            raise ImproperlyConfigured(
                "SUPABASE_SERVICE_ROLE_KEY is required."
            )

        self.client = create_client(
            self.supabase_url,
            self.supabase_key,
        )

    def _bucket(self):
        return self.client.storage.from_(self.bucket_name)

    def _normalize_name(self, name):
        return str(name).replace("\\", "/").lstrip("/")

    def _save(self, name, content):
        name = self._normalize_name(name)

        if hasattr(content, "seek"):
            content.seek(0)

        file_bytes = content.read()

        content_type = getattr(
            content,
            "content_type",
            None,
        ) or "application/octet-stream"

        self._bucket().upload(
            path=name,
            file=file_bytes,
            file_options={
                "content-type": content_type,
                "cache-control": "3600",
                "upsert": "true",
            },
        )

        return name

    def delete(self, name):
        if not name:
            return

        name = self._normalize_name(name)

        try:
            self._bucket().remove([name])
        except Exception:
            # Deleting an already-missing object should not break model deletion.
            pass

    def exists(self, name):
        # We deliberately avoid an expensive remote existence check.
        # Django will generate unique names before saving when necessary.
        return False

    def url(self, name):
        name = self._normalize_name(name)

        response = self._bucket().create_signed_url(
            name,
            self.signed_url_expiry,
        )

        if isinstance(response, dict):
            return (
                response.get("signedURL")
                or response.get("signedUrl")
                or response.get("signed_url")
            )

        raise RuntimeError(
            "Supabase did not return a signed URL."
        )

    def open(self, name, mode="rb"):
        name = self._normalize_name(name)

        if "w" in mode:
            raise ValueError(
                "SupabaseStorage does not support write mode through open()."
            )

        file_bytes = self._bucket().download(name)

        return ContentFile(file_bytes, name=name)

    def size(self, name):
        name = self._normalize_name(name)

        response = self._bucket().info(name)

        if isinstance(response, dict):
            metadata = response.get("metadata") or {}
            size = metadata.get("size")

            if size is not None:
                return int(size)

        raise NotImplementedError(
            "Supabase storage size could not be determined."
        )
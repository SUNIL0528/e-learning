from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from botocore.config import Config
from botocore.signers import CloudFrontSigner
from django.conf import settings
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


class S3MediaStore:
    """Resolve private course media to short-lived URLs for local or deployed use."""

    def __init__(self):
        self.bucket = str(getattr(settings, "AWS_S3_BUCKET", "")).strip()
        self.region = getattr(settings, "AWS_REGION", "us-east-1")

    @property
    def enabled(self):
        return bool(self.bucket)

    @property
    def cloudfront_enabled(self):
        return bool(
            getattr(settings, "AWS_CLOUDFRONT_DOMAIN", "")
            and getattr(settings, "AWS_CLOUDFRONT_KEY_ID", "")
            and (
                getattr(settings, "AWS_CLOUDFRONT_PRIVATE_KEY", "")
                or getattr(settings, "AWS_CLOUDFRONT_PRIVATE_KEY_PATH", "")
            )
        )

    @lru_cache(maxsize=1)
    def cloudfront_signer(self):
        private_key = str(getattr(settings, "AWS_CLOUDFRONT_PRIVATE_KEY", ""))
        private_key_path = str(getattr(settings, "AWS_CLOUDFRONT_PRIVATE_KEY_PATH", ""))
        if private_key_path:
            private_key = Path(private_key_path).read_text(encoding="utf-8")

        # JSON secrets often store PEM newlines as the two characters "\\n".
        private_key = private_key.replace("\\n", "\n")
        key = serialization.load_pem_private_key(
            private_key.encode("utf-8"),
            password=None,
        )

        def rsa_signer(message: bytes) -> bytes:
            return key.sign(message, padding.PKCS1v15(), hashes.SHA1())

        return CloudFrontSigner(
            str(getattr(settings, "AWS_CLOUDFRONT_KEY_ID")),
            rsa_signer,
        )

    def cloudfront_url(self, key: str | None) -> str | None:
        if not self.cloudfront_enabled or not key:
            return None

        try:
            domain = str(getattr(settings, "AWS_CLOUDFRONT_DOMAIN")).strip().rstrip("/")
            resource_url = f"https://{domain}/{quote(key, safe='/~')}"
            expires_in = int(
                getattr(
                    settings,
                    "AWS_CLOUDFRONT_URL_EXPIRY",
                    getattr(settings, "AWS_S3_URL_EXPIRY", 3600),
                )
            )
            return self.cloudfront_signer().generate_presigned_url(
                resource_url,
                date_less_than=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
            )
        except (OSError, TypeError, ValueError):
            return None

    @lru_cache(maxsize=1)
    def client(self):
        if not self.enabled:
            return None

        try:
            import boto3
        except ModuleNotFoundError:
            return None

        return boto3.client(
            "s3",
            region_name=self.region,
            endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None) or None,
            config=Config(
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=15,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )

    def find_key(
        self,
        chapter_folder: str,
        language: str,
        media_type: str,
        candidates: Iterable[str],
    ) -> str | None:
        client = self.client()
        if client is None:
            return None

        prefix = f"{chapter_folder}/{language}/{media_type}/"
        candidate_names = [str(candidate).strip() for candidate in candidates if str(candidate).strip()]

        # Resolve all candidates from one prefix listing.  The old implementation
        # made a HEAD request for every candidate and then listed the prefix again
        # when a name differed, which becomes very slow for a chapter with many
        # slide videos and audio files.
        keys_by_name = {
            key.rsplit("/", 1)[-1].lower(): key
            for key in self.list_keys(chapter_folder, language, media_type)
        }
        for candidate in candidate_names:
            key = keys_by_name.get(candidate.lower())
            if key:
                return key
        return None

    @lru_cache(maxsize=64)
    def list_keys(self, chapter_folder: str, language: str, media_type: str) -> list[str]:
        client = self.client()
        if client is None:
            return []

        prefix = f"{chapter_folder}/{language}/{media_type}/"
        keys: list[str] = []
        paginator = client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                keys.extend(
                    str(item.get("Key", ""))
                    for item in page.get("Contents", [])
                    if item.get("Key")
                )
        except (ClientError, BotoCoreError, NoCredentialsError):
            return []
        return keys

    def first_key_with_suffixes(
        self,
        chapter_folder: str,
        language: str,
        media_type: str,
        suffixes: Iterable[str],
    ) -> str | None:
        suffixes = tuple(str(suffix).lower() for suffix in suffixes)
        for key in self.list_keys(chapter_folder, language, media_type):
            if key.lower().endswith(suffixes):
                return key
        return None

    def presigned_url(
        self,
        chapter_folder: str,
        language: str,
        media_type: str,
        candidates: Iterable[str],
    ) -> str | None:
        client = self.client()
        key = self.find_key(chapter_folder, language, media_type, candidates)
        if client is None or key is None:
            return None

        cloudfront_url = self.cloudfront_url(key)
        if cloudfront_url:
            return cloudfront_url

        try:
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=int(getattr(settings, "AWS_S3_URL_EXPIRY", 3600)),
            )
        except (ClientError, BotoCoreError, NoCredentialsError):
            return None

    def presigned_key_url(self, key: str | None) -> str | None:
        client = self.client()
        if client is None or not key:
            return None

        # Do not issue a URL for a stale database attachment. CloudFront/S3
        # otherwise returns an opaque XML error to the browser when the object
        # has already been removed from the bucket.
        try:
            client.head_object(Bucket=self.bucket, Key=key)
        except (ClientError, BotoCoreError, NoCredentialsError):
            return None

        cloudfront_url = self.cloudfront_url(key)
        if cloudfront_url:
            return cloudfront_url

        try:
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=int(getattr(settings, "AWS_S3_URL_EXPIRY", 3600)),
            )
        except (ClientError, BotoCoreError, NoCredentialsError):
            return None

    def presigned_upload_url(self, key: str, content_type: str) -> str | None:
        client = self.client()
        if client is None or not key:
            return None
        try:
            return client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=int(getattr(settings, "AWS_S3_UPLOAD_URL_EXPIRY", 900)),
                HttpMethod="PUT",
            )
        except (ClientError, BotoCoreError, NoCredentialsError):
            return None

    def upload_file(self, source, key: str, content_type: str) -> bool:
        client = self.client()
        if client is None or not key:
            return False
        try:
            client.upload_file(
                str(source),
                self.bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "private, max-age=3600",
                },
            )
        except (ClientError, BotoCoreError, NoCredentialsError, OSError):
            return False
        return True

    def delete_key(self, key: str | None) -> bool:
        client = self.client()
        if client is None or not key:
            return False
        try:
            client.delete_object(Bucket=self.bucket, Key=key)
        except (ClientError, BotoCoreError, NoCredentialsError):
            return False
        return True

    def download(
        self,
        chapter_folder: str,
        language: str,
        media_type: str,
        candidates: Iterable[str],
        destination,
    ) -> str | None:
        client = self.client()
        key = self.find_key(chapter_folder, language, media_type, candidates)
        if client is None or key is None:
            return None

        try:
            client.download_file(self.bucket, key, str(destination))
        except (ClientError, BotoCoreError, NoCredentialsError):
            return None
        return str(destination)

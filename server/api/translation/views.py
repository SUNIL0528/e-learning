"""Authenticated PowerPoint translation API."""

from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..authentication import CognitoJWTAuthentication
from ..models import PPTTranslationJob
from ..storage import S3MediaStore
from .tasks import translate_ppt_task


AUTHENTICATION = [CognitoJWTAuthentication]
PERMISSIONS = [IsAuthenticated]


def _input_path(module_no: int) -> Path:
    return Path(settings.MEDIA_ROOT) / "translation" / "input" / f"module_{module_no}.pptx"


@api_view(["POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def translate_ppt_api(request):
    language = str(request.data.get("language") or "").strip()
    language_code = str(request.data.get("language_code") or "").strip()
    if not language or not language_code:
        return Response(
            {"error": "language and language_code are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        module_no = int(request.data.get("module_no"))
    except (TypeError, ValueError):
        return Response(
            {"error": "module_no must be an integer."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if module_no < 1:
        return Response(
            {"error": "module_no must be greater than 0."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    input_path = _input_path(module_no)
    input_path.parent.mkdir(parents=True, exist_ok=True)
    if not input_path.exists():
        downloaded = S3MediaStore().download(
            f"chapter{module_no}",
            "en",
            "ppt",
            [
                f"module_{module_no}.pptx",
                f"module_{module_no}.ppt",
                f"chapter{module_no}.pptx",
                f"chapter{module_no}.ppt",
            ],
            input_path,
        )
        if downloaded is None:
            legacy_path = Path(settings.MEDIA_ROOT) / f"module_{module_no}.pptx"
            if legacy_path.exists():
                input_path = legacy_path
            else:
                return Response(
                    {"error": "Module PowerPoint not found.", "module_no": module_no},
                    status=status.HTTP_404_NOT_FOUND,
                )

    job = PPTTranslationJob.objects.create(
        course_id=str(request.data.get("course_id") or ""),
        module_no=module_no,
        lesson_id=str(request.data.get("lesson_id") or ""),
        language=language,
        language_code=language_code,
        status="pending",
        input_file=str(input_path),
    )
    translate_ppt_task.delay(str(job.id))
    return Response(
        {
            "job_id": str(job.id),
            "status": "processing",
            "module_no": module_no,
            "language": language,
            "message": "PowerPoint translation started successfully.",
        },
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def translate_ppt_status(request, job_id):
    try:
        job = PPTTranslationJob.objects.get(id=job_id)
    except PPTTranslationJob.DoesNotExist:
        return Response({"error": "Translation job not found."}, status=status.HTTP_404_NOT_FOUND)

    response = {
        "job_id": str(job.id),
        "status": job.status,
        "course_id": job.course_id,
        "module_no": job.module_no,
        "lesson_id": job.lesson_id,
        "language": job.language,
        "language_code": job.language_code,
    }

    if job.status == "completed" and job.output_file:
        output_path = Path(job.output_file)
        media_root = Path(settings.MEDIA_ROOT).resolve()
        try:
            relative_path = output_path.resolve().relative_to(media_root).as_posix()
        except ValueError:
            relative_path = ""
        if relative_path and output_path.exists():
            response["download_url"] = (
                f"{request.build_absolute_uri(settings.MEDIA_URL).rstrip('/')}/{relative_path}"
            )
        else:
            response.update(status="failed", error="Translated PowerPoint file no longer exists.")
    elif job.status == "failed":
        response["error"] = job.error_message

    return Response(response)

from datetime import timedelta
import re
import uuid

from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from django.conf import settings
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .authentication import CognitoJWTAuthentication
from .models import DoubtAttachment, DoubtTicket, Enrollment, LearnerProfile, ModuleProgress
from .progress_views import LearnerOnlyPermission, _profile_for_request
from .storage import S3MediaStore


AUTHENTICATION = [CognitoJWTAuthentication]
PERMISSIONS = [IsAuthenticated]
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
AUDIO_CONTENT_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 50 * 1024 * 1024


def _is_instructor(request):
    configured_group = str(getattr(settings, "COGNITO_INSTRUCTOR_GROUP", "instructors"))
    allowed_groups = {
        configured_group.casefold(),
        "instructor",
        "instructors",
        "admin",
        "admins",
    }
    groups = request.auth.get("cognito:groups", []) if request.auth else []
    if isinstance(groups, str):
        groups = [groups]
    return any(str(group).casefold() in allowed_groups for group in groups)


def _iso(value):
    return value.isoformat() if value else None


def _serialize_doubt(ticket):
    now = timezone.now()
    media_store = S3MediaStore()
    return {
        "id": ticket.id,
        "courseId": ticket.course_id,
        "courseTitle": ticket.course_title,
        "title": ticket.title,
        "body": ticket.body,
        "status": ticket.status,
        "reply": ticket.reply or None,
        "instructorName": ticket.instructor_name or None,
        "askedAt": _iso(ticket.created_at),
        "responseDueAt": _iso(ticket.response_due_at),
        "repliedAt": _iso(ticket.replied_at),
        "isOverdue": ticket.status == "pending" and ticket.response_due_at < now,
        "attachments": [
            {
                "id": attachment.id,
                "kind": attachment.kind,
                "fileName": attachment.file_name,
                "contentType": attachment.content_type,
                "url": media_store.presigned_key_url(attachment.s3_key),
            }
            for attachment in ticket.attachments.all()
        ],
        "learner": {
            "candidateNumber": ticket.learner.candidate_number or "",
            "name": ticket.learner.name or "",
            "email": ticket.learner.email or "",
        },
    }


@api_view(["GET", "POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes([LearnerOnlyPermission])
def learner_doubts(request):
    profile = _profile_for_request(request)

    if request.method == "GET":
        tickets = (
            DoubtTicket.objects.filter(learner=profile)
            .select_related("learner")
            .prefetch_related("attachments")
        )
        return Response([_serialize_doubt(ticket) for ticket in tickets])

    course_id = str(request.data.get("courseId") or "").strip()
    course_title = str(request.data.get("courseTitle") or "").strip()
    title = str(request.data.get("title") or "").strip()
    body = str(request.data.get("body") or "").strip()
    if not course_id or not title or not body:
        return Response(
            {"error": "courseId, title, and body are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ticket = DoubtTicket.objects.create(
        learner=profile,
        course_id=course_id,
        course_title=course_title,
        title=title[:255],
        body=body,
        response_due_at=timezone.now() + timedelta(hours=24),
    )
    return Response(_serialize_doubt(ticket), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_doubts(request):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    course_id = str(request.query_params.get("courseId") or "").strip()
    tickets = DoubtTicket.objects.select_related("learner").prefetch_related("attachments")
    if course_id:
        tickets = tickets.filter(course_id=course_id)
    return Response([_serialize_doubt(ticket) for ticket in tickets])


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_dashboard(request):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    enrollments = Enrollment.objects.all()
    doubts = DoubtTicket.objects.all()
    course_rows = (
        enrollments.values("course_id", "course_title")
        .annotate(
            enrolled=Count("id"),
            average_progress=Avg("progress_percent"),
            completed=Count("id", filter=Q(status="completed")),
        )
        .order_by("course_title", "course_id")
    )
    course_stats = []
    for row in course_rows:
        course_id = row["course_id"]
        course_stats.append(
            {
                "courseId": course_id,
                "courseTitle": row["course_title"] or course_id,
                "enrolled": row["enrolled"],
                "averageProgress": round(float(row["average_progress"] or 0)),
                "completed": row["completed"],
                "pendingDoubts": doubts.filter(course_id=course_id, status="pending").count(),
            }
        )

    recent_doubts = (
        doubts.select_related("learner")
        .prefetch_related("attachments")
        .order_by("-created_at")[:8]
    )
    return Response(
        {
            "stats": {
                "totalLearners": LearnerProfile.objects.filter(enrollments__isnull=False).distinct().count(),
                "totalEnrollments": enrollments.count(),
                "averageProgress": round(float(enrollments.aggregate(value=Avg("progress_percent"))["value"] or 0)),
                "completedModules": ModuleProgress.objects.filter(status="completed").count(),
                "pendingDoubts": doubts.filter(status="pending").count(),
                "answeredDoubts": doubts.filter(status="answered").count(),
            },
            "courses": course_stats,
            "recentDoubts": [_serialize_doubt(ticket) for ticket in recent_doubts],
        }
    )


def _instructor_ticket(request, doubt_id):
    if not _is_instructor(request):
        return None, Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)
    return (
        get_object_or_404(DoubtTicket.objects.select_related("learner"), pk=doubt_id),
        None,
    )


def _safe_file_name(value):
    name = str(value or "attachment").strip().split("\\")[-1].split("/")[-1]
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:180]
    return name or "attachment"


def _attachment_limits(kind, content_type):
    if kind == "image" and content_type in IMAGE_CONTENT_TYPES:
        return MAX_IMAGE_BYTES
    if kind == "audio" and content_type in AUDIO_CONTENT_TYPES:
        return MAX_AUDIO_BYTES
    return None


@api_view(["POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_attachment_upload(request, doubt_id):
    ticket, error = _instructor_ticket(request, doubt_id)
    if error:
        return error

    kind = str(request.data.get("kind") or "").strip().lower()
    content_type = str(request.data.get("contentType") or "").split(";", 1)[0].strip().lower()
    file_name = _safe_file_name(request.data.get("fileName"))
    if _attachment_limits(kind, content_type) is None:
        return Response(
            {"error": "Only supported image and audio file types are allowed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    key = f"doubts/{ticket.id}/{uuid.uuid4().hex}-{file_name}"
    media_store = S3MediaStore()
    upload_url = media_store.presigned_upload_url(key, content_type)
    if not upload_url:
        return Response(
            {"error": "S3 attachment storage is not configured or unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(
        {
            "key": key,
            "uploadUrl": upload_url,
            "contentType": content_type,
            "expiresIn": int(getattr(settings, "AWS_S3_UPLOAD_URL_EXPIRY", 900)),
        }
    )


@api_view(["POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_attachment_complete(request, doubt_id):
    ticket, error = _instructor_ticket(request, doubt_id)
    if error:
        return error

    kind = str(request.data.get("kind") or "").strip().lower()
    key = str(request.data.get("key") or "").strip()
    file_name = _safe_file_name(request.data.get("fileName"))
    prefix = f"doubts/{ticket.id}/"
    if not key.startswith(prefix):
        return Response({"error": "Invalid attachment key."}, status=status.HTTP_400_BAD_REQUEST)

    media_store = S3MediaStore()
    client = media_store.client()
    if client is None:
        return Response(
            {"error": "S3 attachment storage is not configured or unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        metadata = client.head_object(Bucket=media_store.bucket, Key=key)
    except (ClientError, BotoCoreError, NoCredentialsError):
        return Response(
            {"error": "The attachment upload was not found in S3."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    content_type = str(metadata.get("ContentType") or "").split(";", 1)[0].strip().lower()
    max_size = _attachment_limits(kind, content_type)
    if max_size is None or int(metadata.get("ContentLength", 0)) > max_size:
        return Response(
            {"error": "The uploaded attachment type or size is not allowed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    attachment, _ = DoubtAttachment.objects.get_or_create(
        ticket=ticket,
        s3_key=key,
        defaults={
            "kind": kind,
            "file_name": file_name,
            "content_type": content_type,
            "uploaded_by_cognito_sub": request.user.user_id,
        },
    )
    return Response(
        {
            "id": attachment.id,
            "kind": attachment.kind,
            "fileName": attachment.file_name,
            "contentType": attachment.content_type,
            "url": media_store.presigned_key_url(attachment.s3_key),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_attachment_delete(request, doubt_id, attachment_id):
    ticket, error = _instructor_ticket(request, doubt_id)
    if error:
        return error

    attachment = get_object_or_404(
        DoubtAttachment,
        pk=attachment_id,
        ticket=ticket,
    )
    if not S3MediaStore().delete_key(attachment.s3_key):
        return Response(
            {"error": "Unable to remove the attachment from S3."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    attachment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_reply(request, doubt_id):
    ticket, error = _instructor_ticket(request, doubt_id)
    if error:
        return error
    reply = str(request.data.get("reply") or "").strip()
    if not reply and not ticket.attachments.exists():
        return Response({"error": "Add reply text or an image/audio attachment."}, status=status.HTTP_400_BAD_REQUEST)

    claims = request.auth or {}
    ticket.reply = reply
    ticket.status = "answered"
    ticket.instructor_cognito_sub = request.user.user_id
    ticket.instructor_name = str(claims.get("name") or claims.get("username") or request.user.username)
    ticket.replied_at = timezone.now()
    ticket.save(
        update_fields=[
            "reply",
            "status",
            "instructor_cognito_sub",
            "instructor_name",
            "replied_at",
            "updated_at",
        ]
    )
    return Response(_serialize_doubt(ticket))

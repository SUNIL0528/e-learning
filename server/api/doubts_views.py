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
from .models import (
    DoubtAttachment,
    DoubtTicket,
    Enrollment,
    LearnerProfile,
    ModuleProgress,
)
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
    configured_admin_group = str(getattr(settings, "COGNITO_ADMIN_GROUP", "admins"))
    allowed_groups = {
        configured_group.casefold(),
        configured_admin_group.casefold(),
        "instructor",
        "instructors",
        "admin",
        "admins",
    }
    groups = (request.auth or {}).get("cognito:groups") or []
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
            .order_by("-created_at", "-id")
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
    tickets = (
        DoubtTicket.objects
        .select_related("learner")
        .prefetch_related("attachments")
        .order_by("-created_at", "-id")
    )
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
        .order_by("-created_at", "-id")[:8]
    )

    learner_enrollments = (
        Enrollment.objects.select_related("learner")
        .prefetch_related("modules__quiz_attempts")
        .order_by("course_title", "course_id", "learner__name", "learner__email")
    )
    course_learners = {}
    for enrollment in learner_enrollments:
        course = course_learners.setdefault(
            enrollment.course_id,
            {
                "courseId": enrollment.course_id,
                "courseTitle": enrollment.course_title or enrollment.course_id,
                "learners": [],
            },
        )
        course["learners"].append(
            {
                "uid": enrollment.learner.cognito_sub,
                "name": enrollment.learner.name or "",
                "candidateNumber": enrollment.learner.candidate_number or "",
                "email": enrollment.learner.email or "",
                "progressPercent": enrollment.progress_percent,
                "status": enrollment.status,
                "modules": [
                    {
                        "moduleId": module.module_id,
                        "title": module.title or module.module_id,
                        "progressPercent": module.progress_percent,
                        "score": module.qa_score,
                        "passed": module.qa_passed,
                        "attempts": module.attempts,
                        "quizAttempts": [
                            {
                                "score": attempt.score,
                                "passed": attempt.passed,
                                "createdAt": attempt.created_at.isoformat(),
                            }
                            for attempt in module.quiz_attempts.all()
                        ],
                    }
                    for module in enrollment.modules.all()
                ],
            }
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
            "courseLearners": list(course_learners.values()),
            "recentDoubts": [_serialize_doubt(ticket) for ticket in recent_doubts],
        }
    )


def _serialize_instructor_answer(answer):
    return {
        "id": answer.id,
        "questionId": answer.question_id,
        "question": answer.question,
        "answer": answer.answer,
        "status": answer.status,
        "score": answer.score,
        "maxScore": answer.max_score,
        "feedback": answer.feedback,
        "reviewerName": answer.reviewer_name or None,
        "reviewedAt": answer.reviewed_at.isoformat() if answer.reviewed_at else None,
    }


def _serialize_instructor_submission(answers):
    first = answers[0]
    return {
        "submissionId": str(first.submission_id),
        "courseId": first.course_id,
        "courseTitle": first.course_title or first.course_id,
        "moduleId": first.module_id,
        "moduleTitle": first.module_title or first.module_id,
        "submittedAt": first.submitted_at.isoformat(),
        "status": "reviewed" if all(answer.status == "reviewed" for answer in answers) else "pending",
        "answers": [_serialize_instructor_answer(answer) for answer in answers],
    }


def _serialize_learner_summary(profile, enrollments, written_submissions):
    progress_values = [enrollment.progress_percent for enrollment in enrollments]
    pending_answers = sum(
        1 for submission in written_submissions for answer in submission if answer.status == "pending"
    )
    return {
        "id": profile.id,
        "uid": profile.cognito_sub,
        "candidateNumber": profile.candidate_number or "",
        "name": profile.name or "",
        "email": profile.email or "",
        "phone": profile.phone or "",
        "gender": profile.gender or "",
        "position": profile.position or "",
        "company": profile.company or "",
        "location": profile.location or "",
        "courseCount": len(enrollments),
        "averageProgress": round(sum(progress_values) / len(progress_values)) if progress_values else 0,
        "pendingDescriptiveAnswers": pending_answers,
        "descriptiveSubmissionCount": len(written_submissions),
    }


def _serialize_learner_detail(profile, enrollments, written_submissions):
    grouped_submissions = {}
    for submission in written_submissions:
        serialized = _serialize_instructor_submission(submission)
        grouped_submissions.setdefault((submission[0].course_id, submission[0].module_id), []).append(serialized)

    courses = []
    known_course_ids = set()
    for enrollment in enrollments:
        known_course_ids.add(enrollment.course_id)
        modules = []
        module_map = {module.module_id: module for module in enrollment.modules.all()}
        module_ids = list(module_map)
        for submission in written_submissions:
            if submission[0].course_id == enrollment.course_id and submission[0].module_id not in module_map:
                module_ids.append(submission[0].module_id)

        for module_id in module_ids:
            module = module_map.get(module_id)
            attempts = list(module.quiz_attempts.all()) if module else []
            submissions = grouped_submissions.get((enrollment.course_id, module_id), [])
            modules.append(
                {
                    "moduleId": module_id,
                    "title": (module.title if module and module.title else submissions[0]["moduleTitle"] if submissions else module_id),
                    "progressPercent": module.progress_percent if module else 0,
                    "status": module.status if module else "not-started",
                    "score": module.qa_score if module else None,
                    "passed": module.qa_passed if module else False,
                    "attempts": module.attempts if module else 0,
                    "quizAttempts": [
                        {
                            "score": attempt.score,
                            "passed": attempt.passed,
                            "createdAt": attempt.created_at.isoformat(),
                        }
                        for attempt in attempts
                    ],
                    "descriptiveSubmissions": submissions,
                }
            )

        courses.append(
            {
                "courseId": enrollment.course_id,
                "courseTitle": enrollment.course_title or enrollment.course_id,
                "status": enrollment.status,
                "progressPercent": enrollment.progress_percent,
                "enrolledAt": enrollment.enrolled_at.isoformat(),
                "modules": modules,
            }
        )

    # Keep written submissions visible even if an old record has no matching enrollment.
    standalone_courses = {}
    for (course_id, module_id), submissions in grouped_submissions.items():
        if course_id in known_course_ids:
            continue
        standalone_course = standalone_courses.setdefault(
            course_id,
            {
                "courseId": course_id,
                "courseTitle": submissions[0]["courseTitle"],
                "status": "not-enrolled",
                "progressPercent": 0,
                "enrolledAt": None,
                "modules": [],
            },
        )
        standalone_course["modules"].append(
            {
                "moduleId": module_id,
                "title": submissions[0]["moduleTitle"],
                "progressPercent": 0,
                "status": "not-started",
                "score": None,
                "passed": False,
                "attempts": 0,
                "quizAttempts": [],
                "descriptiveSubmissions": submissions,
            }
        )
    courses.extend(standalone_courses.values())

    return {
        "learner": _serialize_learner_summary(profile, enrollments, written_submissions),
        "courses": courses,
        "descriptiveSubmissions": [
            serialized
            for submissions in written_submissions
            for serialized in [_serialize_instructor_submission(submissions)]
        ],
    }


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_learners(request):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    search = str(request.query_params.get("search") or "").strip()
    profiles = LearnerProfile.objects.all()
    if search:
        profiles = profiles.filter(
            name__icontains=search
        ) | profiles.filter(
            email__icontains=search
        ) | profiles.filter(
            candidate_number__icontains=search
        )
    profiles = profiles.order_by("name", "email", "id")
    response = []
    for profile in profiles:
        enrollments = list(
            profile.enrollments.all().prefetch_related("modules__quiz_attempts")
        )
        answer_rows = list(
            profile.written_answer_submissions.all().order_by("submission_id", "id")
        )
        grouped = {}
        for answer in answer_rows:
            grouped.setdefault(str(answer.submission_id), []).append(answer)
        response.append(_serialize_learner_summary(profile, enrollments, list(grouped.values())))
    return Response(response)


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def instructor_learner_detail(request, learner_id):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    profile = LearnerProfile.objects.filter(pk=learner_id).first()
    if profile is None:
        return Response({"error": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)

    enrollments = list(
        profile.enrollments.all()
        .prefetch_related("modules__quiz_attempts")
        .order_by("course_title", "course_id")
    )
    answer_rows = list(
        profile.written_answer_submissions.all().order_by("submission_id", "id")
    )
    grouped = {}
    for answer in answer_rows:
        grouped.setdefault(str(answer.submission_id), []).append(answer)
    return Response(_serialize_learner_detail(profile, enrollments, list(grouped.values())))


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

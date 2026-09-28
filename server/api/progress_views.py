from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .authentication import (
    CognitoJWTAuthentication,
    CognitoJWTAuthenticationWithoutSession,
)
from .models import (
    ChapterProgress,
    Enrollment,
    LearnerProfile,
    ModuleProgress,
    QuizAttempt,
)


AUTHENTICATION = [CognitoJWTAuthentication]


class LearnerOnlyPermission(IsAuthenticated):
    """Keep instructor accounts out of learner profile/progress endpoints."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        configured_group = str(getattr(settings, "COGNITO_INSTRUCTOR_GROUP", "instructors"))
        instructor_groups = {
            configured_group.casefold(),
            "instructor",
            "instructors",
            "admin",
            "admins",
        }
        claims = request.auth or {}
        groups = claims.get("cognito:groups", [])
        if isinstance(groups, str):
            groups = [groups]
        return not any(str(group).casefold() in instructor_groups for group in groups)


PERMISSIONS = [LearnerOnlyPermission]


@api_view(["POST"])
@authentication_classes([CognitoJWTAuthenticationWithoutSession])
@permission_classes([IsAuthenticated])
def register_active_session(request):
    session_id = str(request.data.get("sessionId") or "").strip()
    if not session_id or len(session_id) > 128:
        return Response(
            {"error": "A valid session ID is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claims = request.auth or {}
    profile, _ = LearnerProfile.objects.get_or_create(
        cognito_sub=request.user.user_id,
        defaults={
            "email": str(claims.get("email", "")),
            "name": str(claims.get("name", "")),
        },
    )
    profile.active_session_id = session_id
    profile.save(update_fields=["active_session_id", "updated_at"])
    return Response({"status": "active"})


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes([IsAuthenticated])
def validate_active_session(request):
    return Response({"status": "active"})


def _profile_for_request(request):
    claims = request.auth or {}
    cognito_sub = request.user.user_id
    profile, _ = LearnerProfile.objects.get_or_create(
        cognito_sub=cognito_sub,
        defaults={
            "candidate_number": request.user.username or None,
            "email": str(claims.get("email", "")),
            "name": str(claims.get("name", "")),
        },
    )
    if not profile.candidate_number and request.user.username:
        profile.candidate_number = request.user.username
        profile.save(update_fields=["candidate_number", "updated_at"])
    if not profile.email and claims.get("email"):
        profile.email = str(claims["email"])
        profile.save(update_fields=["email", "updated_at"])
    return profile


def _bounded_percent(value):
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 0


@api_view(["GET", "PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def learner_profile(request):
    profile = _profile_for_request(request)

    if request.method == "PATCH":
        for field in ("name", "position", "company", "location", "bio", "email", "phone", "gender"):
            if field in request.data:
                setattr(profile, field, str(request.data.get(field) or "").strip())
        profile.save()

    return Response(
        {
            "uid": profile.cognito_sub,
            "candidateNumber": profile.candidate_number or "",
            "email": profile.email,
            "name": profile.name,
            "phone": profile.phone,
            "gender": profile.gender,
            "position": profile.position,
            "company": profile.company,
            "location": profile.location,
            "bio": profile.bio,
        }
    )


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def learner_enrollments(request):
    profile = _profile_for_request(request)
    enrollments = Enrollment.objects.filter(learner=profile)
    return Response(
        {
            enrollment.course_id: {
                "courseId": enrollment.course_id,
                "courseTitle": enrollment.course_title,
                "progressPercent": enrollment.progress_percent,
                "status": enrollment.status,
            }
            for enrollment in enrollments
        }
    )


def _course_progress_payload(enrollment):
    enrollment = (
        Enrollment.objects.filter(pk=enrollment.pk)
        .prefetch_related(
            Prefetch(
                "modules",
                queryset=ModuleProgress.objects.order_by("order", "module_id").prefetch_related(
                    Prefetch("chapters", queryset=ChapterProgress.objects.order_by("order", "chapter_id"))
                ),
            )
        )
        .get()
    )
    return {
        "chapters": {
            chapter.chapter_id: {
                "completed": chapter.completed,
                "currentSlideIndex": chapter.current_slide_index,
                "highestCompletedSlideIndex": max(
                    chapter.highest_completed_slide_index,
                    chapter.current_slide_index,
                ),
                "currentSlideId": chapter.current_slide_id,
            }
            for module in enrollment.modules.all()
            for chapter in module.chapters.all()
        },
        "modules": {
            module.module_id: {"qaPassed": module.qa_passed}
            for module in enrollment.modules.all()
        },
    }


@api_view(["POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def ensure_course_structure(request, course_id):
    profile = _profile_for_request(request)
    course = request.data.get("course") or {}
    modules = course.get("modules") or []

    with transaction.atomic():
        enrollment, _ = Enrollment.objects.get_or_create(
            learner=profile,
            course_id=course_id,
            defaults={
                "course_title": str(course.get("title") or ""),
                "current_module_id": str((modules[0] or {}).get("id") or "") or None,
            },
        )
        course_title = str(course.get("title") or enrollment.course_title)
        if enrollment.course_title != course_title:
            enrollment.course_title = course_title
            enrollment.save(update_fields=["course_title", "updated_at"])

        module_specs = []
        for module_index, module in enumerate(modules):
            module_id = str(module.get("id") or "").strip()
            if module_id:
                module_specs.append((module_index, module_id, module))

        module_ids = [module_id for _, module_id, _ in module_specs]
        existing_modules = {
            module.module_id: module
            for module in ModuleProgress.objects.filter(enrollment=enrollment, module_id__in=module_ids)
        }
        now = timezone.now()
        modules_to_create = []
        modules_to_update = []
        for module_index, module_id, module in module_specs:
            title = str(module.get("title") or "")
            module_progress = existing_modules.get(module_id)
            if module_progress is None:
                modules_to_create.append(
                    ModuleProgress(
                        enrollment=enrollment,
                        module_id=module_id,
                        title=title,
                        order=module_index,
                    )
                )
            else:
                module_progress.title = title or module_progress.title
                module_progress.order = module_index
                module_progress.updated_at = now
                modules_to_update.append(module_progress)

        if modules_to_create:
            ModuleProgress.objects.bulk_create(modules_to_create)
        if modules_to_update:
            ModuleProgress.objects.bulk_update(modules_to_update, ["title", "order", "updated_at"])

        all_modules = {
            module.module_id: module
            for module in ModuleProgress.objects.filter(enrollment=enrollment, module_id__in=module_ids)
        }
        chapter_specs = []
        for module_index, module_id, module in module_specs:
            module_progress = all_modules[module_id]
            for chapter_index, chapter in enumerate(module.get("chapters") or []):
                chapter_id = str(chapter.get("id") or "").strip()
                if chapter_id:
                    chapter_specs.append(
                        (
                            module_progress,
                            chapter_index,
                            chapter_id,
                            str(chapter.get("title") or ""),
                            str(chapter.get("duration") or ""),
                        )
                    )

        existing_chapters = {
            (chapter.module_progress_id, chapter.chapter_id): chapter
            for chapter in ChapterProgress.objects.filter(
                module_progress_id__in=[module.id for module in all_modules.values()],
                chapter_id__in=[chapter_id for _, _, chapter_id, _, _ in chapter_specs],
            )
        }
        chapters_to_create = []
        chapters_to_update = []
        for module_progress, chapter_index, chapter_id, title, duration in chapter_specs:
            chapter_progress = existing_chapters.get((module_progress.id, chapter_id))
            if chapter_progress is None:
                chapters_to_create.append(
                    ChapterProgress(
                        module_progress=module_progress,
                        chapter_id=chapter_id,
                        title=title,
                        duration=duration,
                        order=chapter_index,
                    )
                )
            else:
                chapter_progress.title = title or chapter_progress.title
                chapter_progress.duration = duration or chapter_progress.duration
                chapter_progress.order = chapter_index
                chapter_progress.updated_at = now
                chapters_to_update.append(chapter_progress)

        if chapters_to_create:
            ChapterProgress.objects.bulk_create(chapters_to_create)
        if chapters_to_update:
            ChapterProgress.objects.bulk_update(
                chapters_to_update,
                ["title", "duration", "order", "updated_at"],
            )

    return Response({"courseId": course_id, "status": "ready", **_course_progress_payload(enrollment)})


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def course_progress(request, course_id):
    profile = _profile_for_request(request)
    enrollment = Enrollment.objects.filter(learner=profile, course_id=course_id).first()
    if enrollment is None:
        return Response({"chapters": {}, "modules": {}})

    return Response(_course_progress_payload(enrollment))


@api_view(["PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def chapter_progress(request, course_id):
    profile = _profile_for_request(request)
    module_id = str(request.data.get("moduleId") or "")
    chapter_id = str(request.data.get("chapterId") or "")
    try:
        module = ModuleProgress.objects.get(
            enrollment__learner=profile,
            enrollment__course_id=course_id,
            module_id=module_id,
        )
        chapter = module.chapters.get(chapter_id=chapter_id)
    except (ModuleProgress.DoesNotExist, ChapterProgress.DoesNotExist):
        return Response({"error": "Progress structure not found."}, status=status.HTTP_404_NOT_FOUND)

    chapter.completed = True
    chapter.completed_at = timezone.now()
    chapter.save(update_fields=["completed", "completed_at", "updated_at"])
    module.progress_percent = _bounded_percent(request.data.get("moduleProgressPercent"))
    module.save(update_fields=["progress_percent", "updated_at"])
    enrollment = module.enrollment
    enrollment.progress_percent = _bounded_percent(request.data.get("courseProgressPercent"))
    if enrollment.progress_percent >= 100:
        enrollment.status = "completed"
        enrollment.completed_at = timezone.now()
    enrollment.save(update_fields=["progress_percent", "status", "completed_at", "updated_at"])
    return Response({"status": "saved"})


@api_view(["PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def slide_progress(request, course_id):
    profile = _profile_for_request(request)
    module_id = str(request.data.get("moduleId") or "")
    chapter_id = str(request.data.get("chapterId") or "")
    try:
        module = ModuleProgress.objects.get(
            enrollment__learner=profile,
            enrollment__course_id=course_id,
            module_id=module_id,
        )
        chapter = module.chapters.get(chapter_id=chapter_id)
    except (ModuleProgress.DoesNotExist, ChapterProgress.DoesNotExist):
        return Response({"error": "Progress structure not found."}, status=status.HTTP_404_NOT_FOUND)

    requested_slide_index = max(0, int(request.data.get("currentSlideIndex") or 0))
    slide_was_completed = bool(request.data.get("completed"))
    completed_slide_index = requested_slide_index
    if slide_was_completed and request.data.get("completedSlideIndex") is not None:
        try:
            completed_slide_index = max(0, int(request.data.get("completedSlideIndex")))
        except (TypeError, ValueError):
            completed_slide_index = requested_slide_index
    # Preserve the furthest point reached even when the learner revisits an
    # earlier slide. The old current_slide_index also seeds this value for
    # progress records created before the high-water field existed.
    chapter.highest_completed_slide_index = max(
        chapter.highest_completed_slide_index,
        chapter.current_slide_index,
        completed_slide_index if slide_was_completed else -1,
    )
    chapter.current_slide_index = requested_slide_index
    chapter.current_slide_id = request.data.get("currentSlideId")
    chapter.last_viewed_at = timezone.now()
    chapter.save(
        update_fields=[
            "current_slide_index",
            "highest_completed_slide_index",
            "current_slide_id",
            "last_viewed_at",
            "updated_at",
        ]
    )
    module.current_chapter_id = chapter_id
    module.current_slide_index = chapter.current_slide_index
    module.save(update_fields=["current_chapter_id", "current_slide_index", "updated_at"])
    module.enrollment.current_module_id = module_id
    module.enrollment.save(update_fields=["current_module_id", "updated_at"])
    return Response({"status": "saved"})


@api_view(["POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def quiz_result(request, course_id):
    profile = _profile_for_request(request)
    module_id = str(request.data.get("moduleId") or "")
    try:
        module = ModuleProgress.objects.get(
            enrollment__learner=profile,
            enrollment__course_id=course_id,
            module_id=module_id,
        )
    except ModuleProgress.DoesNotExist:
        return Response({"error": "Progress structure not found."}, status=status.HTTP_404_NOT_FOUND)

    score = _bounded_percent(request.data.get("score"))
    passed = bool(request.data.get("passed"))
    QuizAttempt.objects.create(module_progress=module, score=score, passed=passed)
    module.qa_score = score
    module.qa_passed = passed
    module.attempts += 1
    module.status = "completed" if passed else "active"
    if passed:
        module.completed_at = timezone.now()
    module.save(update_fields=["qa_score", "qa_passed", "attempts", "status", "completed_at", "updated_at"])
    return Response({"status": "saved"})

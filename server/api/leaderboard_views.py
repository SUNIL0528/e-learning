from datetime import timedelta

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .models import ChapterProgress, Enrollment, ModuleProgress, QuizAttempt
from .progress_views import AUTHENTICATION, PERMISSIONS, _profile_for_request


def _public_name(profile, current):
    if current:
        return profile.name or "You"
    parts = (profile.name or "").split()
    if not parts:
        return "Learner"
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")


def _active_streak(days, today):
    day = today if today in days else today - timedelta(days=1)
    count = 0
    while day in days:
        count += 1
        day -= timedelta(days=1)
    return count


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def course_leaderboard(request, course_id):
    profile = _profile_for_request(request)
    enrolled = Enrollment.objects.filter(
        learner=profile, course_id=course_id, status__in=("active", "completed")
    ).exists()
    if not enrolled:
        return Response({"error": "Course enrollment required."}, status=status.HTTP_404_NOT_FOUND)

    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    enrollments = Enrollment.objects.filter(
        course_id=course_id, status__in=("active", "completed")
    ).select_related("learner").prefetch_related(
        Prefetch(
            "modules",
            queryset=ModuleProgress.objects.prefetch_related(
                Prefetch("chapters", queryset=ChapterProgress.objects.all()),
                Prefetch("quiz_attempts", queryset=QuizAttempt.objects.filter(passed=True)),
            ),
        )
    )

    rows = []
    for enrollment in enrollments:
        completed_lessons = 0
        score = 0
        this_week = 0
        activity_days = set()
        for module in enrollment.modules.all():
            for chapter in module.chapters.all():
                if not chapter.completed:
                    continue
                completed_lessons += 1
                score += 100
                if chapter.completed_at:
                    day = timezone.localdate(chapter.completed_at)
                    activity_days.add(day)
                    if day >= week_start:
                        this_week += 100

            attempts = list(module.quiz_attempts.all())
            if attempts:
                score += max(attempt.score for attempt in attempts)
                previous_best = max(
                    (attempt.score for attempt in attempts if timezone.localdate(attempt.created_at) < week_start),
                    default=0,
                )
                this_week += max(0, max(attempt.score for attempt in attempts) - previous_best)
                activity_days.update(timezone.localdate(attempt.created_at) for attempt in attempts)

        current = enrollment.learner_id == profile.pk
        rows.append({
            "id": enrollment.pk,
            "name": _public_name(enrollment.learner, current),
            "score": score,
            "completedLessons": completed_lessons,
            "streak": _active_streak(activity_days, today),
            "thisWeek": this_week,
            "current": current,
        })

    rows.sort(key=lambda row: (-row["score"], -row["completedLessons"], row["id"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return Response({"courseId": course_id, "basis": "Completed lessons and passed module quizzes", "rows": rows[:50]})

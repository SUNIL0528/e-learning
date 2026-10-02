from collections import OrderedDict
import uuid

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .authentication import CognitoJWTAuthentication
from .models import WrittenAnswerSubmission
from .progress_views import LearnerOnlyPermission, _profile_for_request


AUTHENTICATION = [CognitoJWTAuthentication]
PERMISSIONS = [LearnerOnlyPermission]


def _is_instructor(request):
    configured_group = str(getattr(settings, "COGNITO_INSTRUCTOR_GROUP", "instructors"))
    instructor_groups = {
        configured_group.casefold(),
        "instructor",
        "instructors",
        "admin",
        "admins",
    }
    groups = (request.auth or {}).get("cognito:groups") or []
    if isinstance(groups, str):
        groups = [groups]
    return any(str(group).casefold() in instructor_groups for group in groups)


def _iso(value):
    return value.isoformat() if value else None


def _serialize_answer(answer):
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
        "reviewedAt": _iso(answer.reviewed_at),
    }


def _serialize_submission(answers):
    first = answers[0]
    return {
        "submissionId": str(first.submission_id),
        "courseId": first.course_id,
        "courseTitle": first.course_title,
        "moduleId": first.module_id,
        "moduleTitle": first.module_title,
        "submittedAt": _iso(first.submitted_at),
        "status": "reviewed" if all(answer.status == "reviewed" for answer in answers) else "pending",
        "learner": {
            "candidateNumber": first.learner.candidate_number or "",
            "name": first.learner.name or "",
            "email": first.learner.email or "",
        },
        "answers": [_serialize_answer(answer) for answer in answers],
    }


def _group_submissions(queryset):
    grouped = OrderedDict()
    for answer in queryset:
        key = str(answer.submission_id)
        grouped.setdefault(key, []).append(answer)
    return [_serialize_submission(answers) for answers in grouped.values()]


@api_view(["GET", "POST"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def learner_written_answers(request, course_id):
    profile = _profile_for_request(request)
    module_id = str(
        (
            request.query_params.get("moduleId")
            if request.method == "GET"
            else request.data.get("moduleId")
        )
        or ""
    ).strip()
    if not module_id:
        return Response({"error": "moduleId is required."}, status=status.HTTP_400_BAD_REQUEST)

    if request.method == "GET":
        answers = WrittenAnswerSubmission.objects.filter(
            learner=profile,
            course_id=course_id,
            module_id=module_id,
        ).order_by("-submitted_at", "-id")
        latest = next(iter(answers), None)
        if latest is None:
            return Response({"submission": None})
        latest_answers = answers.filter(submission_id=latest.submission_id).order_by("id")
        return Response({"submission": _serialize_submission(list(latest_answers))})

    raw_answers = request.data.get("answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        return Response({"error": "At least one written answer is required."}, status=status.HTTP_400_BAD_REQUEST)

    module_title = str(request.data.get("moduleTitle") or "").strip()[:255]
    course_title = str(request.data.get("courseTitle") or "").strip()[:255]
    cleaned_answers = []
    seen_question_ids = set()
    for item in raw_answers:
        if not isinstance(item, dict):
            return Response({"error": "Each answer must be an object."}, status=status.HTTP_400_BAD_REQUEST)
        question_id = str(item.get("questionId") or "").strip()[:255]
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if not question_id or not question or not answer:
            return Response(
                {"error": "Every written question must have a question and answer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if question_id in seen_question_ids:
            return Response({"error": "Duplicate written question submitted."}, status=status.HTTP_400_BAD_REQUEST)
        if len(answer) > 20000:
            return Response({"error": "Written answers must be 20,000 characters or fewer."}, status=status.HTTP_400_BAD_REQUEST)
        seen_question_ids.add(question_id)
        cleaned_answers.append({"question_id": question_id, "question": question, "answer": answer})

    submission_id = uuid.uuid4()
    WrittenAnswerSubmission.objects.bulk_create(
        [
            WrittenAnswerSubmission(
                submission_id=submission_id,
                learner=profile,
                course_id=course_id,
                course_title=course_title,
                module_id=module_id,
                module_title=module_title,
                question_id=item["question_id"],
                question=item["question"],
                answer=item["answer"],
            )
            for item in cleaned_answers
        ]
    )
    saved = list(
        WrittenAnswerSubmission.objects.filter(submission_id=submission_id)
        .select_related("learner")
        .order_by("id")
    )
    return Response({"submission": _serialize_submission(saved)}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes([IsAuthenticated])
def instructor_written_answers(request):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    queryset = (
        WrittenAnswerSubmission.objects.select_related("learner")
        .order_by("-submitted_at", "-id")
    )
    course_id = str(request.query_params.get("courseId") or "").strip()
    module_id = str(request.query_params.get("moduleId") or "").strip()
    review_status = str(request.query_params.get("status") or "").strip()
    if course_id:
        queryset = queryset.filter(course_id=course_id)
    if module_id:
        queryset = queryset.filter(module_id=module_id)
    if review_status in {"pending", "reviewed"}:
        queryset = queryset.filter(status=review_status)

    return Response({"submissions": _group_submissions(queryset)})


@api_view(["PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes([IsAuthenticated])
def instructor_review_written_answers(request, submission_id):
    if not _is_instructor(request):
        return Response({"error": "Instructor access required."}, status=status.HTTP_403_FORBIDDEN)

    answers = list(
        WrittenAnswerSubmission.objects.filter(submission_id=submission_id)
        .select_related("learner")
        .order_by("id")
    )
    if not answers:
        return Response({"error": "Written submission not found."}, status=status.HTTP_404_NOT_FOUND)

    reviews = request.data.get("answers")
    if not isinstance(reviews, list) or len(reviews) != len(answers):
        return Response(
            {"error": "A score and feedback entry is required for every written answer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    answer_by_id = {answer.id: answer for answer in answers}
    cleaned_reviews = {}
    for item in reviews:
        if not isinstance(item, dict):
            return Response({"error": "Each review must be an object."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            answer_id = int(item.get("id"))
            score = int(item.get("score"))
        except (TypeError, ValueError):
            return Response({"error": "Each review needs a numeric answer ID and score."}, status=status.HTTP_400_BAD_REQUEST)
        if answer_id not in answer_by_id or answer_id in cleaned_reviews:
            return Response({"error": "The review contains an invalid or duplicate answer."}, status=status.HTTP_400_BAD_REQUEST)
        if score < 0 or score > answer_by_id[answer_id].max_score:
            return Response(
                {"error": f"Scores must be between 0 and {answer_by_id[answer_id].max_score}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cleaned_reviews[answer_id] = {
            "score": score,
            "feedback": str(item.get("feedback") or "").strip()[:20000],
        }

    if set(cleaned_reviews) != set(answer_by_id):
        return Response(
            {"error": "A score and feedback entry is required for every written answer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claims = request.auth or {}
    reviewer_name = str(claims.get("name") or request.user.username or "Instructor")[:240]
    reviewer_sub = str(request.user.user_id or "")
    reviewed_at = timezone.now()
    for answer in answers:
        review = cleaned_reviews[answer.id]
        answer.status = "reviewed"
        answer.score = review["score"]
        answer.feedback = review["feedback"]
        answer.reviewer_name = reviewer_name
        answer.reviewer_cognito_sub = reviewer_sub
        answer.reviewed_at = reviewed_at
        answer.updated_at = reviewed_at
    WrittenAnswerSubmission.objects.bulk_update(
        answers,
        [
            "status",
            "score",
            "feedback",
            "reviewer_name",
            "reviewer_cognito_sub",
            "reviewed_at",
            "updated_at",
        ],
    )
    return Response({"submission": _serialize_submission(answers)})

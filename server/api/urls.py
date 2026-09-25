from django.urls import path

from .views import (
    chapter_detail,
    module_questions,
    module_resources,
)
from .progress_views import (
    chapter_progress,
    course_progress,
    ensure_course_structure,
    learner_enrollments,
    learner_profile,
    quiz_result,
    slide_progress,
)
from .doubts_views import (
    instructor_dashboard,
    instructor_attachment_complete,
    instructor_attachment_delete,
    instructor_attachment_upload,
    instructor_doubts,
    instructor_reply,
    learner_doubts,
)
from .translation.views import translate_ppt_api, translate_ppt_status


urlpatterns = [

    # ========================================================
    # CHAPTER
    # ========================================================

    path(
        "chapter/<str:chapter_id>/",
        chapter_detail,
        name="chapter-detail"
    ),


    path(
        "course/<str:course_id>/module/<int:module_no>/resources/",
        module_resources,
        name="module-resources"
    ),

    path(
        "course/<str:course_id>/module/<int:module_no>/questions/",
        module_questions,
        name="module-questions"
    ),


    # ========================================================
    # PPT TRANSLATION
    # ========================================================

    path(
        "translate-ppt/",
        translate_ppt_api,
        name="translate-ppt"
    ),


    # ========================================================
    # PPT TRANSLATION STATUS
    # ========================================================

    path(
        "translate-ppt/status/<uuid:job_id>/",
        translate_ppt_status,
        name="translate-ppt-status"
    ),

    path("me/profile/", learner_profile, name="learner-profile"),
    path("me/enrollments/", learner_enrollments, name="learner-enrollments"),
    path(
        "me/courses/<str:course_id>/structure/",
        ensure_course_structure,
        name="ensure-course-structure",
    ),
    path(
        "me/courses/<str:course_id>/progress/",
        course_progress,
        name="course-progress",
    ),
    path(
        "me/courses/<str:course_id>/progress/chapter/",
        chapter_progress,
        name="chapter-progress",
    ),
    path(
        "me/courses/<str:course_id>/progress/slide/",
        slide_progress,
        name="slide-progress",
    ),
    path(
        "me/courses/<str:course_id>/progress/quiz/",
        quiz_result,
        name="quiz-result",
    ),
    path("me/doubts/", learner_doubts, name="learner-doubts"),
    path("instructor/doubts/", instructor_doubts, name="instructor-doubts"),
    path(
        "instructor/doubts/<int:doubt_id>/attachments/upload/",
        instructor_attachment_upload,
        name="instructor-doubt-attachment-upload",
    ),
    path(
        "instructor/doubts/<int:doubt_id>/attachments/complete/",
        instructor_attachment_complete,
        name="instructor-doubt-attachment-complete",
    ),
    path(
        "instructor/doubts/<int:doubt_id>/attachments/<int:attachment_id>/",
        instructor_attachment_delete,
        name="instructor-doubt-attachment-delete",
    ),
    path("instructor/doubts/<int:doubt_id>/", instructor_reply, name="instructor-reply"),
    path("instructor/dashboard/", instructor_dashboard, name="instructor-dashboard"),
]

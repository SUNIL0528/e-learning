from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import ChapterProgress, Enrollment, LearnerProfile, ModuleProgress, QuizAttempt


@override_settings(LOCAL_DEV=True, DEBUG=True)
class CourseLeaderboardTests(TestCase):
    def setUp(self):
        self.client = APIClient(REMOTE_ADDR="127.0.0.1")
        self.url = "/api/me/courses/coating-inspection/leaderboard/"

    def test_only_enrolled_learners_can_view_real_scores(self):
        denied = self.client.get(self.url, HTTP_X_LOCAL_ROLE="learner")
        self.assertEqual(denied.status_code, 404)

        current = LearnerProfile.objects.get(cognito_sub="local-dev-learner")
        current.name = "Local Learner"
        current.save(update_fields=["name"])
        own = Enrollment.objects.create(learner=current, course_id="coating-inspection")
        own_module = ModuleProgress.objects.create(enrollment=own, module_id="m1")
        ChapterProgress.objects.create(
            module_progress=own_module,
            chapter_id="m1-video",
            completed=True,
            completed_at=timezone.now(),
        )
        QuizAttempt.objects.create(module_progress=own_module, score=72, passed=True)
        QuizAttempt.objects.create(module_progress=own_module, score=60, passed=True)
        QuizAttempt.objects.create(module_progress=own_module, score=90, passed=False)

        other = LearnerProfile.objects.create(cognito_sub="another-learner", name="Sam Example")
        other_enrollment = Enrollment.objects.create(learner=other, course_id="coating-inspection")
        other_module = ModuleProgress.objects.create(enrollment=other_enrollment, module_id="m1")
        ChapterProgress.objects.create(module_progress=other_module, chapter_id="m1-video", completed=True)
        expired = LearnerProfile.objects.create(cognito_sub="expired-learner", name="Expired Learner")
        Enrollment.objects.create(learner=expired, course_id="coating-inspection", status="expired")

        response = self.client.get(self.url, HTTP_X_LOCAL_ROLE="learner")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["rows"]), 2)
        self.assertEqual([row["score"] for row in response.data["rows"]], [172, 100])
        self.assertEqual(response.data["rows"][0]["name"], "Local Learner")
        self.assertTrue(response.data["rows"][0]["current"])
        self.assertEqual(response.data["rows"][0]["thisWeek"], 172)
        self.assertEqual(response.data["rows"][1]["name"], "Sam E.")


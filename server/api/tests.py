import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(LOCAL_DEV=True, DEBUG=True)
class LocalDevelopmentTests(TestCase):
    def setUp(self):
        self.client = APIClient(REMOTE_ADDR="127.0.0.1")

    def test_local_roles_can_use_their_endpoints(self):
        learner = self.client.get("/api/me/profile/", HTTP_X_LOCAL_ROLE="learner")
        self.assertEqual(learner.status_code, 200)
        self.assertEqual(learner.data["uid"], "local-dev-learner")

        instructor = self.client.get("/api/instructor/learners/", HTTP_X_LOCAL_ROLE="instructor")
        self.assertEqual(instructor.status_code, 200)

        admin = self.client.get("/api/admin/users/", HTTP_X_LOCAL_ROLE="admin")
        self.assertEqual(admin.status_code, 200)

    @override_settings(LOCAL_DEV=False)
    def test_local_role_header_is_rejected_outside_local_mode(self):
        response = self.client.get("/api/me/profile/", HTTP_X_LOCAL_ROLE="learner")
        self.assertGreaterEqual(response.status_code, 400)

    def test_local_attachment_round_trip(self):
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            ticket = self.client.post(
                "/api/me/doubts/",
                {"courseId": "coating-inspection", "title": "Test", "body": "Question"},
                format="json",
                HTTP_X_LOCAL_ROLE="learner",
            )
            self.assertEqual(ticket.status_code, 201)
            ticket_id = ticket.data["id"]
            upload = self.client.post(
                f"/api/instructor/doubts/{ticket_id}/attachments/upload/",
                {"kind": "image", "fileName": "example.png", "contentType": "image/png"},
                format="json",
                HTTP_X_LOCAL_ROLE="instructor",
            )
            self.assertEqual(upload.status_code, 200)
            local_path = upload.data["uploadUrl"].replace("http://testserver", "")
            stored = self.client.put(
                local_path, b"local image data", content_type="image/png", HTTP_X_LOCAL_ROLE="instructor"
            )
            self.assertEqual(stored.status_code, 201)
            complete = self.client.post(
                f"/api/instructor/doubts/{ticket_id}/attachments/complete/",
                {
                    "key": upload.data["key"], "kind": "image", "fileName": "example.png",
                    "contentType": "image/png",
                },
                format="json",
                HTTP_X_LOCAL_ROLE="instructor",
            )
            self.assertEqual(complete.status_code, 201)
            self.assertTrue(Path(directory, upload.data["key"]).is_file())
            self.assertIn("/media/doubts/", complete.data["url"])

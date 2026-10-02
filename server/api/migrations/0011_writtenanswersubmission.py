import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_learnerprofile_active_session_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="WrittenAnswerSubmission",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("submission_id", models.UUIDField(db_index=True, default=uuid.uuid4)),
                ("course_id", models.CharField(max_length=255)),
                ("course_title", models.CharField(blank=True, max_length=255)),
                ("module_id", models.CharField(max_length=255)),
                ("module_title", models.CharField(blank=True, max_length=255)),
                ("question_id", models.CharField(max_length=255)),
                ("question", models.TextField()),
                ("answer", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending review"), ("reviewed", "Reviewed")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("score", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("max_score", models.PositiveSmallIntegerField(default=10)),
                ("feedback", models.TextField(blank=True)),
                ("reviewer_cognito_sub", models.CharField(blank=True, max_length=255)),
                ("reviewer_name", models.CharField(blank=True, max_length=240)),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "learner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="written_answer_submissions",
                        to="api.learnerprofile",
                    ),
                ),
            ],
            options={
                "ordering": ["-submitted_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["course_id", "module_id", "status", "submitted_at"],
                        name="api_written_course_module_idx",
                    ),
                    models.Index(
                        fields=["learner", "course_id", "module_id", "submitted_at"],
                        name="api_written_learner_module_idx",
                    ),
                ],
            },
        ),
    ]

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0007_chapterprogress_highest_completed_slide_index"),
    ]

    operations = [
        migrations.CreateModel(
            name="DoubtTicket",
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
                ("course_id", models.CharField(max_length=255)),
                ("course_title", models.CharField(blank=True, max_length=255)),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("answered", "Answered")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("reply", models.TextField(blank=True)),
                ("instructor_cognito_sub", models.CharField(blank=True, max_length=255)),
                ("instructor_name", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("response_due_at", models.DateTimeField()),
                ("replied_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "learner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="doubts",
                        to="api.learnerprofile",
                    ),
                ),
            ],
            options={
                "ordering": ["status", "created_at"],
                "indexes": [
                    models.Index(
                        fields=["course_id", "status", "created_at"],
                        name="api_doubtti_course__bcd546_idx",
                    ),
                    models.Index(
                        fields=["learner", "created_at"],
                        name="api_doubtti_learner_213671_idx",
                    ),
                ],
            },
        ),
    ]

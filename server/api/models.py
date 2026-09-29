from django.db import models

class User(models.Model):
    name = models.CharField("Name", max_length=240)
    email = models.EmailField()
    document = models.CharField("Document", max_length=20)
    phone = models.CharField(max_length=20)
    registrationDate = models.DateField("Registration Date", auto_now_add=True)

    def __str__(self):
        return self.name


class LearnerProfile(models.Model):
    """Application profile keyed by Cognito's immutable `sub` claim."""

    cognito_sub = models.CharField(max_length=255, unique=True)
    candidate_number = models.CharField(max_length=80, unique=True, null=True, blank=True)
    email = models.EmailField(blank=True)
    name = models.CharField(max_length=240, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    gender = models.CharField(max_length=80, blank=True)
    position = models.CharField(max_length=240, blank=True)
    company = models.CharField(max_length=240, blank=True)
    location = models.CharField(max_length=240, blank=True)
    bio = models.TextField(blank=True)
    active_session_id = models.CharField(max_length=128, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name or self.email or self.cognito_sub


class Enrollment(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("expired", "Expired"),
    ]

    learner = models.ForeignKey(
        LearnerProfile,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    course_id = models.CharField(max_length=255)
    course_title = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    progress_percent = models.PositiveSmallIntegerField(default=0)
    learning_seconds = models.PositiveIntegerField(default=0)
    current_module_id = models.CharField(max_length=255, blank=True, null=True)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner", "course_id"],
                name="unique_learner_course_enrollment",
            )
        ]


class ModuleProgress(models.Model):
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        related_name="modules",
    )
    module_id = models.CharField(max_length=255)
    title = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)
    progress_percent = models.PositiveSmallIntegerField(default=0)
    current_chapter_id = models.CharField(max_length=255, blank=True, null=True)
    current_slide_index = models.PositiveIntegerField(default=0)
    qa_score = models.PositiveSmallIntegerField(blank=True, null=True)
    qa_passed = models.BooleanField(default=False)
    attempts = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default="active")
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "module_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["enrollment", "module_id"],
                name="unique_enrollment_module_progress",
            )
        ]


class ChapterProgress(models.Model):
    module_progress = models.ForeignKey(
        ModuleProgress,
        on_delete=models.CASCADE,
        related_name="chapters",
    )
    chapter_id = models.CharField(max_length=255)
    title = models.CharField(max_length=255, blank=True)
    duration = models.CharField(max_length=50, blank=True)
    order = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    current_slide_index = models.PositiveIntegerField(default=0)
    highest_completed_slide_index = models.IntegerField(default=-1)
    current_slide_id = models.CharField(max_length=255, blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    last_viewed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "chapter_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["module_progress", "chapter_id"],
                name="unique_module_chapter_progress",
            )
        ]


class QuizAttempt(models.Model):
    module_progress = models.ForeignKey(
        ModuleProgress,
        on_delete=models.CASCADE,
        related_name="quiz_attempts",
    )
    score = models.PositiveSmallIntegerField()
    passed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class DoubtTicket(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("answered", "Answered"),
    ]

    learner = models.ForeignKey(
        LearnerProfile,
        on_delete=models.CASCADE,
        related_name="doubts",
    )
    course_id = models.CharField(max_length=255)
    course_title = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    reply = models.TextField(blank=True)
    instructor_cognito_sub = models.CharField(max_length=255, blank=True)
    instructor_name = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    response_due_at = models.DateTimeField()
    replied_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "created_at"]
        indexes = [
            models.Index(
                fields=["course_id", "status", "created_at"],
                name="api_doubtti_course__bcd546_idx",
            ),
            models.Index(
                fields=["learner", "created_at"],
                name="api_doubtti_learner_213671_idx",
            ),
        ]


class DoubtAttachment(models.Model):
    KIND_CHOICES = [
        ("image", "Image"),
        ("audio", "Audio"),
    ]

    ticket = models.ForeignKey(
        DoubtTicket,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    s3_key = models.CharField(max_length=1024)
    file_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120)
    uploaded_by_cognito_sub = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

import uuid

from django.db import models


class PPTTranslationJob(models.Model):

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    course_id = models.CharField(
        max_length=255
    )

    module_no = models.PositiveIntegerField()

    lesson_id = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    language = models.CharField(
        max_length=100
    )

    language_code = models.CharField(
        max_length=50
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending"
    )

    input_file = models.CharField(
        max_length=1000,
        blank=True,
        null=True
    )

    output_file = models.CharField(
        max_length=1000,
        blank=True,
        null=True
    )

    error_message = models.TextField(
        blank=True,
        null=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return (
            f"Module {self.module_no} - "
            f"{self.language} - "
            f"{self.status}"
        )

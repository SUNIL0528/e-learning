from datetime import timedelta
from math import ceil

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .authentication import CognitoJWTAuthentication
from .models import LearnerProfile


AUTHENTICATION = [CognitoJWTAuthentication]
PERMISSIONS = [IsAuthenticated]


def _is_admin(request):
    configured_group = str(getattr(settings, "COGNITO_ADMIN_GROUP", "admins"))
    allowed_groups = {configured_group.casefold(), "admin", "admins"}
    groups = (request.auth or {}).get("cognito:groups") or []
    if isinstance(groups, str):
        groups = [groups]
    return any(str(group).casefold() in allowed_groups for group in groups)


def _days_remaining(expires_at):
    if not expires_at:
        return None
    return max(0, ceil((expires_at - timezone.now()).total_seconds() / 86400))


def _status(profile):
    if not profile.is_enabled:
        return "disabled"
    if profile.account_expires_at and profile.account_expires_at <= timezone.now():
        return "expired"
    return "active"


def _serialize_profile(profile):
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
        "createdAt": profile.created_at.isoformat(),
        "validityDays": profile.account_validity_days,
        "expiresAt": profile.account_expires_at.isoformat() if profile.account_expires_at else None,
        "daysRemaining": _days_remaining(profile.account_expires_at),
        "enabled": profile.is_enabled,
        "status": _status(profile),
        "enrollmentCount": profile.enrollment_count,
    }


def _admin_error(request):
    if not _is_admin(request):
        return Response({"error": "Administrator access required."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def admin_users(request):
    error = _admin_error(request)
    if error:
        return error

    search = str(request.query_params.get("search") or "").strip()
    profiles = LearnerProfile.objects.annotate(enrollment_count=Count("enrollments", distinct=True))
    if search:
        profiles = profiles.filter(
            name__icontains=search
        ) | profiles.filter(
            email__icontains=search
        ) | profiles.filter(
            candidate_number__icontains=search
        )
    profiles = profiles.order_by("name", "email", "id")
    return Response([_serialize_profile(profile) for profile in profiles])


@api_view(["PATCH"])
@authentication_classes(AUTHENTICATION)
@permission_classes(PERMISSIONS)
def admin_user_detail(request, profile_id):
    error = _admin_error(request)
    if error:
        return error

    profile = LearnerProfile.objects.annotate(
        enrollment_count=Count("enrollments", distinct=True)
    ).filter(pk=profile_id).first()
    if profile is None:
        return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    changed_fields = []
    if "enabled" in request.data:
        value = request.data.get("enabled")
        if not isinstance(value, bool):
            return Response({"error": "enabled must be a boolean."}, status=status.HTTP_400_BAD_REQUEST)
        profile.is_enabled = value
        changed_fields.append("is_enabled")

    if "validityDays" in request.data:
        try:
            validity_days = int(request.data.get("validityDays"))
        except (TypeError, ValueError):
            return Response({"error": "validityDays must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
        if validity_days < 0 or validity_days > 3650:
            return Response(
                {"error": "validityDays must be between 0 and 3650."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.account_validity_days = validity_days
        profile.account_expires_at = timezone.now() + timedelta(days=validity_days)
        changed_fields.extend(["account_validity_days", "account_expires_at"])

    if not changed_fields:
        return Response({"error": "Send enabled or validityDays."}, status=status.HTTP_400_BAD_REQUEST)

    changed_fields.append("updated_at")
    profile.save(update_fields=changed_fields)
    return Response(_serialize_profile(profile))

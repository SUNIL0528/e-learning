from datetime import timedelta

from django.db import migrations, models
from django.utils import timezone


def populate_account_expiry(apps, schema_editor):
    LearnerProfile = apps.get_model("api", "LearnerProfile")
    for profile in LearnerProfile.objects.filter(account_expires_at__isnull=True):
        profile.account_expires_at = profile.created_at + timedelta(
            days=profile.account_validity_days or 30
        )
        profile.save(update_fields=["account_expires_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0011_writtenanswersubmission"),
    ]

    operations = [
        migrations.AddField(
            model_name="learnerprofile",
            name="account_validity_days",
            field=models.PositiveIntegerField(default=30),
        ),
        migrations.AddField(
            model_name="learnerprofile",
            name="account_expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="learnerprofile",
            name="is_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(populate_account_expiry, migrations.RunPython.noop),
    ]

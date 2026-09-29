from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0010_learnerprofile_active_session_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="doubtticket",
            name="chapter_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="doubtticket",
            name="chapter_title",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

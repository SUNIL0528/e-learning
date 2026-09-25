from pathlib import Path

from celery import shared_task
from django.conf import settings

from ..models import PPTTranslationJob
from ..storage import S3MediaStore


@shared_task
def translate_ppt_task(job_id):

    try:
        job = PPTTranslationJob.objects.get(id=job_id)

        job.status = "processing"
        job.save(update_fields=["status", "updated_at"])

        # ============================================================
        # FILE PATHS
        # ============================================================

        input_path = Path(settings.MEDIA_ROOT) / "translation" / "input" / f"module_{job.module_no}.pptx"
        input_path.parent.mkdir(parents=True, exist_ok=True)

        if not input_path.exists():
            downloaded = S3MediaStore().download(
                f"chapter{job.module_no}",
                "en",
                "ppt",
                [
                    f"module_{job.module_no}.pptx",
                    f"module_{job.module_no}.ppt",
                    f"chapter{job.module_no}.pptx",
                    f"chapter{job.module_no}.ppt",
                ],
                input_path,
            )
            if downloaded is None:
                legacy_path = Path(settings.MEDIA_ROOT) / f"module_{job.module_no}.pptx"
                if legacy_path.exists():
                    input_path = legacy_path

        output_dir = (
            Path(settings.MEDIA_ROOT)
            / "translation"
            / "output"
        )

        output_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        language_suffix = (
            job.language
            .lower()
            .replace(" ", "_")
            .replace("(", "")
            .replace(")", "")
        )

        output_filename = (
            f"module_{job.module_no}_"
            f"{language_suffix}_"
            f"{job.id}.pptx"
        )

        output_path = output_dir / output_filename

        # ============================================================
        # LOG
        # ============================================================

        print()
        print("=" * 70)
        print("STARTING PPT TRANSLATION")
        print("=" * 70)

        print(f"Job ID       : {job.id}")
        print(f"Input        : {input_path}")
        print(f"Output       : {output_path}")
        print(f"Language     : {job.language}")
        print(f"Language code: {job.language_code}")

        print("=" * 70)

        # ============================================================
        # VALIDATE INPUT
        # ============================================================

        if not input_path.exists():
            raise FileNotFoundError(
                f"PowerPoint not found: {input_path}"
            )

        job.input_file = str(input_path)

        job.save(
            update_fields=[
                "input_file",
                "updated_at"
            ]
        )

        # ============================================================
        # IMPORTANT:
        # IMPORT TRANSLATION ROUTER HERE
        # ============================================================

        from .translation_router import translate_presentation

        # ============================================================
        # EXTRACT PPT
        # ============================================================

        print()
        print("Extracting PPT text...")

        from .extractor import extract_presentation

        presentation_data = extract_presentation(
            str(input_path)
        )

        print()
        print("PPT extraction completed.")

        # ============================================================
        # TRANSLATION ROUTER
        # ============================================================

        print()
        print("=" * 70)
        print("SELECTING TRANSLATION ENGINE")
        print("=" * 70)

        print(f"Source language : eng_Latn")
        print(f"Target language : {job.language}")
        print(f"Target code     : {job.language_code}")

        # THIS IS THE IMPORTANT LINE
        translated_data = translate_presentation(
            presentation_data,
            "eng_Latn",
            job.language_code
        )

        # ============================================================
        # WRITE PPT
        # ============================================================

        print()
        print("Writing translated PowerPoint...")

        from .writer import create_translated_ppt

        create_translated_ppt(
            str(input_path),
            str(output_path),
            translated_data
        )

        # ============================================================
        # VERIFY OUTPUT
        # ============================================================

        if not output_path.exists():
            raise FileNotFoundError(
                "Translation finished but output PowerPoint "
                "was not created."
            )

        # ============================================================
        # COMPLETED
        # ============================================================

        job.output_file = str(output_path)
        job.status = "completed"
        job.error_message = None

        job.save(
            update_fields=[
                "output_file",
                "status",
                "error_message",
                "updated_at"
            ]
        )

        print()
        print("=" * 70)
        print("PPT TRANSLATION COMPLETED")
        print("=" * 70)

        print(f"Output: {output_path}")

        return {
            "job_id": str(job.id),
            "status": "completed",
            "output_file": str(output_path),
        }

    except Exception as e:

        print()
        print("=" * 70)
        print("PPT TRANSLATION FAILED")
        print("=" * 70)

        print(str(e))

        try:

            job = PPTTranslationJob.objects.get(
                id=job_id
            )

            job.status = "failed"
            job.error_message = str(e)

            job.save(
                update_fields=[
                    "status",
                    "error_message",
                    "updated_at"
                ]
            )

        except PPTTranslationJob.DoesNotExist:
            pass

        raise

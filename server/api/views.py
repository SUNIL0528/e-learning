from pathlib import Path
import json
import re
from urllib.parse import quote

from django.conf import settings
from django.http import JsonResponse

from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework import status

from .models import User

from .serializers import UserSerializer
from .storage import S3MediaStore
from .question_generation import (
    generate_module_questions,
    generate_module_questions_from_bank,
)



# ============================================================
# USERS LIST
# ============================================================

@api_view(["GET", "POST"])
def users_list(request):

    if request.method == "GET":

        data = User.objects.all()

        serializer = UserSerializer(
            data,
            context={"request": request},
            many=True
        )

        return Response(serializer.data)

    elif request.method == "POST":

        serializer = UserSerializer(
            data=request.data
        )

        if serializer.is_valid():

            serializer.save()

            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


# ============================================================
# USER DETAIL
# ============================================================

@api_view(["PUT", "DELETE"])
def users_detail(request, id):

    try:

        user = User.objects.get(id=id)

    except User.DoesNotExist:

        return Response(
            {
                "error": "User not found"
            },
            status=status.HTTP_404_NOT_FOUND
        )

    # --------------------------------------------------------
    # PUT
    # --------------------------------------------------------

    if request.method == "PUT":

        serializer = UserSerializer(
            user,
            data=request.data,
            context={"request": request}
        )

        if serializer.is_valid():

            serializer.save()

            return Response(
                serializer.data,
                status=status.HTTP_200_OK
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

    # --------------------------------------------------------
    # DELETE
    # --------------------------------------------------------

    elif request.method == "DELETE":

        user.delete()

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )


# ============================================================
# CHAPTER DETAIL
# ============================================================


def _natural_path_key(path):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def _media_url(base_url, *parts):
    return f"{base_url}/" + "/".join(quote(str(part), safe="") for part in parts)


def _find_slide_video(chapter_media_path, video_folder, slide_id, slide_index):
    video_paths = [chapter_media_path / video_folder]
    # Older local module 1 media was stored in this nested folder. Keep it as
    # a fallback while the canonical S3 path remains chapterN/en/videos/.
    if video_folder == "videos":
        video_paths.append(chapter_media_path / "videos" / "module-1")

    extensions = ("mp4", "webm", "m4v")
    number_match = re.search(r"(\d+)$", slide_id)
    number = number_match.group(1) if number_match else str(slide_index + 1)
    number_value = str(int(number))
    for video_path in video_paths:
        if not video_path.is_dir():
            continue

        candidates = []
        for extension in extensions:
            candidates.extend(
                [
                    video_path / f"{slide_id}.{extension}",
                    video_path / f"slide_{number}.{extension}",
                    video_path / f"slide-{number}.{extension}",
                    video_path / f"slide_{number_value}.{extension}",
                    video_path / f"slide-{number_value}.{extension}",
                    video_path / f"{number}.{extension}",
                    video_path / f"{number_value}.{extension}",
                ]
            )

        for candidate in candidates:
            if candidate.is_file():
                return candidate

        files = sorted(
            [
                path
                for path in video_path.iterdir()
                if path.is_file() and path.suffix.lower().lstrip(".") in extensions
            ],
            key=_natural_path_key,
        )
        if slide_index < len(files):
            return files[slide_index]

    return None


def _discover_slide_ids(chapter_media_path, video_folder, chapter_folder, media_store):
    """Build slide IDs when a chapter has videos but no slides.json metadata."""
    extensions = {".mp4", ".webm", ".m4v"}
    local_video_paths = [chapter_media_path / video_folder]
    if video_folder == "videos":
        local_video_paths.append(chapter_media_path / "videos" / "module-1")
    names = []

    for local_video_path in local_video_paths:
        if not local_video_path.is_dir():
            continue
        names.extend(
            path.name
            for path in local_video_path.iterdir()
            if path.is_file()
            and path.suffix.lower() in extensions
            and re.fullmatch(r"slide[_-]\d+", path.stem, re.IGNORECASE)
        )

    if media_store is not None:
        names.extend(
            Path(key).name
            for key in media_store.list_keys(chapter_folder, "en", "videos")
            if Path(key).suffix.lower() in extensions
            and re.fullmatch(r"slide[_-]\d+", Path(key).stem, re.IGNORECASE)
        )

    return [
        Path(name).stem
        for name in sorted(set(names), key=lambda name: _natural_path_key(Path(name)))
    ]


def chapter_detail(request, chapter_id):

    # ========================================================
    # Only GET allowed
    # ========================================================

    if request.method != "GET":

        return JsonResponse(
            {
                "error": "Only GET requests are allowed."
            },
            status=405
        )

    # ========================================================
    # Chapter configuration
    #
    # API ID  -> l1
    # Folder  -> chapter1
    # ========================================================

    chapters = {
        "l1": {
            "id": "l1",
            "title": "Inspector Roles and Behaviour",
            "video": "chapter1.mp4",
            "media_folder": "chapter1",
            "video_folder": "videos",
            "module_number": 1,
        },
        "coating-m1": {
            "id": "coating-m1",
            "title": "Role of the Inspector / Inspector Work",
            "video": None,
            "media_folder": "chapter1",
            "video_folder": "videos",
            "module_number": 1,
        },
    }

    # Allow the same API shape for additional coating modules when their
    # chapter media folder and module_<no>.json script are present.
    module_match = re.fullmatch(r"coating-m(\d+)", chapter_id)
    if chapter_id not in chapters and module_match:
        module_number = int(module_match.group(1))
        chapters[chapter_id] = {
            "id": chapter_id,
            "title": f"Coating Inspection Module {module_number}",
            "video": None,
            "media_folder": f"chapter{module_number}",
            # All coating module media uses chapterN/en/videos in S3,
            # including module 1. The legacy local module-1 subfolder is
            # still handled by the local fallback in _find_slide_video().
            "video_folder": "videos",
            "module_number": module_number,
        }

    # ========================================================
    # Available audio languages
    # ========================================================

    languages = [

        {
            "code": "en",
            "name": "English"
        },

        {
            "code": "zh",
            "name": "中文"
        }
    ]

    # ========================================================
    # Check chapter exists
    # ========================================================

    if chapter_id not in chapters:

        return JsonResponse(
            {
                "error":
                    "Chapter not found.",

                "chapter_id":
                    chapter_id,

                "available_chapters":
                    list(chapters.keys()),
            },
            status=404
        )

    chapter = chapters[chapter_id]
    # The client can request metadata only and create its own short-lived S3
    # URLs through Cognito Identity Pool credentials. This avoids making the
    # Django request discover and sign every media object in the chapter.
    client_media = request.GET.get("media") == "client"
    s3_media = None if client_media else S3MediaStore()
    metadata_media_store = S3MediaStore() if client_media else s3_media

    # ========================================================
    # Media folder
    # ========================================================

    media_folder = chapter["media_folder"]

    chapter_media_path = (
        Path(settings.MEDIA_ROOT)
        /
        media_folder
    )

    # ========================================================
    # Base media URL
    # ========================================================

    base_url = (
        request.build_absolute_uri(
            settings.MEDIA_URL
        )
        .rstrip("/")
    )

    # ========================================================
    # Video
    # ========================================================

    video_filename = chapter.get("video")
    video_folder = chapter.get("video_folder", "videos")

    if video_filename:
        video_path = chapter_media_path / video_folder / video_filename
        video_url = (
            s3_media.presigned_url(
                media_folder,
                "en",
                "videos",
                [video_filename],
            )
            if s3_media
            else None
        )
        if video_url is None and video_path.is_file():
            video_url = _media_url(base_url, media_folder, video_folder, video_filename)
    else:
        video_url = None
        if s3_media:
            video_key = s3_media.first_key_with_suffixes(
                media_folder,
                "en",
                "videos",
                (".mp4", ".webm", ".m4v"),
            )
            video_url = s3_media.presigned_key_url(video_key)

    # Load the matching module script before discovering slides. This lets
    # audio-only modules use their JSON slide IDs when no slides.json or
    # per-slide videos are available.
    module_script = {}
    module_number = chapter.get("module_number")
    if module_number:
        script_path = settings.BASE_DIR / f"module_{module_number}.json"
        if script_path.is_file():
            try:
                with open(script_path, "r", encoding="utf-8") as file:
                    loaded_script = json.load(file)
                if isinstance(loaded_script, dict):
                    # S3 filenames are not always consistently cased. Store
                    # slide keys case-insensitively so captions still match.
                    module_script = {
                        str(key).lower(): value
                        for key, value in loaded_script.items()
                    }
            except (OSError, json.JSONDecodeError):
                module_script = {}

    # ========================================================
    # slides.json
    # ========================================================

    slides_json_path = (
        chapter_media_path
        / "slides.json"
    )

    if not slides_json_path.exists():
        slide_ids = _discover_slide_ids(
            chapter_media_path,
            video_folder,
            media_folder,
            metadata_media_store,
        )
        if not slide_ids:
            # Modules 6 and 8 currently have slide audio and module JSON but
            # no per-slide video objects. Keep those modules usable instead
            # of returning 404; the client will show the slide placeholder and
            # can still use the available audio.
            slide_ids = sorted(
                [
                    key
                    for key in module_script
                    if re.fullmatch(r"slide_\d+", key, re.IGNORECASE)
                ],
                key=lambda key: _natural_path_key(Path(key)),
            )
        if slide_ids:
            slide_data = {
                "chapter": chapter_id,
                "slides": [
                    {"id": slide_id, "start": 0, "end": 0}
                    for slide_id in slide_ids
                ],
            }
        else:
            return JsonResponse(
                {
                    "error": "slides.json not found and no slide videos were discovered.",
                    "path": str(slides_json_path),
                },
                status=404,
            )
    else:
        try:
            with open(
                slides_json_path,
                "r",
                encoding="utf-8"
            ) as file:
                slide_data = json.load(file)
        except json.JSONDecodeError:
            return JsonResponse(
                {
                    "error":
                        "Invalid slides.json."
                },
                status=500
            )

    # The legacy l1 chapter intentionally keeps its hand-authored timeline.
    # For coating modules, however, the per-slide media is the source of
    # truth. Reconcile stale slides.json files with the discovered media so
    # newly uploaded slides are not silently omitted (module 1 currently has
    # two more S3 slides than its old slides.json file).
    if chapter_id.startswith("coating-m"):
        discovered_slide_ids = _discover_slide_ids(
            chapter_media_path,
            video_folder,
            media_folder,
            metadata_media_store,
        )
        if discovered_slide_ids:
            existing_slides = {
                str(slide.get("id")).lower(): slide
                for slide in slide_data.get("slides", [])
                if isinstance(slide, dict) and slide.get("id")
            }
            slide_data["slides"] = [
                existing_slides.get(
                    slide_id.lower(),
                    {"id": slide_id, "start": 0, "end": 0},
                )
                for slide_id in discovered_slide_ids
            ]

    # ========================================================
    # Load slides.json
    # ========================================================

    # ========================================================
    # Get slides
    # ========================================================

    slides = slide_data.get(
        "slides",
        []
    )

    # Normalize optional caption data while preserving the rest of the JSON
    # shape. A slide may provide either a string (English caption) or a
    # language map such as {"en": "...", "hi": "..."}.
    chapter_captions = slide_data.get("captions", {})
    if not isinstance(chapter_captions, dict):
        chapter_captions = {}

    for slide in slides:
        if not isinstance(slide, dict):
            continue

        caption_value = slide.get("captions")
        if caption_value is None:
            caption_value = slide.get("caption", slide.get("subtitle"))
        if caption_value is None:
            caption_value = chapter_captions.get(slide.get("id"))
        if caption_value is None:
            script_slide = module_script.get(str(slide.get("id") or "").lower())
            if isinstance(script_slide, dict):
                caption_value = script_slide.get("text")

        if isinstance(caption_value, str):
            slide["captions"] = {"en": caption_value}
        elif isinstance(caption_value, dict):
            slide["captions"] = {
                str(language): str(text)
                for language, text in caption_value.items()
                if text is not None and str(text).strip()
            }
        else:
            slide["captions"] = {}

    # ========================================================
    # Convert audio paths
    # ========================================================

    for slide_index, slide in enumerate(slides):

        slide_id = slide.get("id")

        if not slide_id:
            continue

        # ====================================================
        # English audio
        # ====================================================

        en_audio_path = (
            chapter_media_path
            / "audio"
            / "en"
            / f"{slide_id}.wav"
        )
        slide["en"] = (
            s3_media.presigned_url(
                media_folder,
                "en",
                "audios",
                [f"{slide_id}.wav", f"{slide_id}.mp3"],
            )
            if s3_media
            else None
        )
        if slide["en"] is None and en_audio_path.exists():
            slide["en"] = _media_url(base_url, media_folder, "audio", "en", en_audio_path.name)

        # ====================================================
        # Chinese audio
        # ====================================================

        zh_audio_path = (
            chapter_media_path
            / "audio"
            / "zh"
            / f"{slide_id}.mp3"
        )

        slide["zh"] = (
            s3_media.presigned_url(
                media_folder,
                "zh",
                "audios",
                [f"{slide_id}.mp3", f"{slide_id}.wav"],
            )
            if s3_media
            else None
        )
        if slide["zh"] is None and zh_audio_path.exists():
            slide["zh"] = _media_url(base_url, media_folder, "audio", "zh", zh_audio_path.name)

        # ====================================================
        # Optional per-slide video
        # ====================================================

        number_match = re.search(r"(\d+)$", slide_id)
        number = number_match.group(1) if number_match else str(slide_index + 1)
        slide_video_url = (
            s3_media.presigned_url(
                media_folder,
                "en",
                "videos",
                [
                    f"{slide_id}.mp4",
                    f"slide_{number}.mp4",
                    f"slide-{number}.mp4",
                    f"{number}.mp4",
                ],
            )
            if s3_media
            else None
        )
        if slide_video_url is None:
            slide_video_path = _find_slide_video(
                chapter_media_path,
                video_folder,
                slide_id,
                slide_index,
            )
            if slide_video_path:
                slide_video_url = _media_url(
                    base_url,
                    media_folder,
                    video_folder,
                    slide_video_path.name,
                )

        slide["video"] = slide_video_url

    # ========================================================
    # Response
    # ========================================================

    response = {

        "chapter":
            slide_data.get(
                "chapter",
                chapter_id
            ),

        "id":
            chapter["id"],

        "title":
            chapter["title"],

        "languages":
            languages,

        "video": {

            "filename":
                video_filename or "",

            "url":
                video_url,
        },

        "slides":
            slides,
    }

    return JsonResponse(
        response
    )


def module_questions(request, course_id, module_no):
    if request.method != "GET":
        return JsonResponse({"error": "Only GET requests are allowed."}, status=405)

    if course_id != "coating-inspection" or module_no < 1:
        return JsonResponse({"error": "Module not found."}, status=404)

    script_path = settings.BASE_DIR / f"module_{module_no}.json"
    if not script_path.is_file():
        return JsonResponse({"error": "Module question source not found."}, status=404)

    try:
        with open(script_path, "r", encoding="utf-8") as file:
            module_script = json.load(file)
    except (OSError, json.JSONDecodeError):
        return JsonResponse({"error": "Invalid module JSON."}, status=500)

    if not isinstance(module_script, dict):
        return JsonResponse({"error": "Invalid module JSON format."}, status=500)

    question_bank_path = settings.BASE_DIR / "question_bank.json"
    try:
        with open(question_bank_path, "r", encoding="utf-8") as file:
            question_bank = json.load(file)
    except (OSError, json.JSONDecodeError):
        question_bank = {}

    bank_items = question_bank.get(str(module_no)) if isinstance(question_bank, dict) else None
    if isinstance(bank_items, list) and bank_items:
        return JsonResponse(generate_module_questions_from_bank(module_no, bank_items))

    return JsonResponse(generate_module_questions(module_no, module_script))


# ============================================================
# COURSE MODULE RESOURCES
# ============================================================


def module_resources(request, course_id, module_no):

    if request.method != "GET":

        return JsonResponse(
            {
                "error": "Only GET requests are allowed."
            },
            status=405
        )

    if course_id != "coating-inspection":

        return JsonResponse(
            {
                "error": "Course not found."
            },
            status=404
        )

    if module_no < 1:

        return JsonResponse(
            {
                "error": "Module number must be at least 1."
            },
            status=400
        )

    media_folder = f"chapter{module_no}"
    module_folder = f"module_{module_no}"
    ppt_root = Path(settings.MEDIA_ROOT) / media_folder / "ppt"
    module_ppt_folder = ppt_root / module_folder

    ppt_files = []
    if module_ppt_folder.is_dir():
        ppt_files = sorted(
            [
                path
                for path in module_ppt_folder.iterdir()
                if path.is_file() and path.suffix.lower() in {".ppt", ".pptx"}
            ],
            key=_natural_path_key,
        )

    # Keep compatibility with the older layout, where the file was stored as
    # chapter1/ppt/module_1.pptx instead of inside chapter1/ppt/module_1/.
    if not ppt_files:
        legacy_file = ppt_root / f"{module_folder}.pptx"
        if legacy_file.is_file():
            ppt_files = [legacy_file]

    base_url = request.build_absolute_uri(settings.MEDIA_URL).rstrip("/")
    ppt = None
    s3_media = S3MediaStore()
    s3_url = s3_media.presigned_url(
        media_folder,
        "en",
        "ppt",
        [f"module_{module_no}.pptx", f"module_{module_no}.ppt"],
    )
    if not s3_url:
        s3_url = s3_media.presigned_key_url(
            s3_media.first_key_with_suffixes(
                media_folder,
                "en",
                "ppt",
                (".pptx", ".ppt"),
            )
        )
    if s3_url:
        ppt = {
            "filename": f"module_{module_no}.pptx",
            "url": s3_url,
        }
    elif ppt_files:
        ppt_file = ppt_files[0]
        relative_parts = (
            (media_folder, "ppt", module_folder, ppt_file.name)
            if ppt_file.parent == module_ppt_folder
            else (media_folder, "ppt", ppt_file.name)
        )
        ppt = {
            "filename": ppt_file.name,
            "url": _media_url(base_url, *relative_parts),
        }

    return JsonResponse(
        {
            "course_id": course_id,
            "module": module_no,
            "ppt": ppt,
        }
    )

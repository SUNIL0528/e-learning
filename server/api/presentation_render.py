from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings

from .storage import S3MediaStore


class PresentationRenderError(RuntimeError):
    """Raised when a PowerPoint cannot be converted to slide images."""


@dataclass(frozen=True)
class RenderedPresentation:
    filename: str
    local_paths: tuple[Path, ...] = ()
    s3_keys: tuple[str, ...] = ()


def _natural_key(path: Path):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def _local_source(module_number: int) -> Path | None:
    media_root = Path(settings.MEDIA_ROOT)
    ppt_root = media_root / f"chapter{module_number}" / "ppt"
    module_folder = ppt_root / f"module_{module_number}"

    candidates: list[Path] = []
    if module_folder.is_dir():
        candidates.extend(
            sorted(
                (
                    path
                    for path in module_folder.iterdir()
                    if path.is_file() and path.suffix.lower() in {".ppt", ".pptx"}
                ),
                key=_natural_key,
            )
        )

    for extension in (".pptx", ".ppt"):
        candidates.append(ppt_root / f"module_{module_number}{extension}")

    return next((path for path in candidates if path.is_file()), None)


def _local_rendered_slides(module_number: int) -> tuple[Path, ...]:
    slide_root = (
        Path(settings.MEDIA_ROOT)
        / f"chapter{module_number}"
        / "ppt-slides"
        / f"module_{module_number}"
    )
    return tuple(
        sorted(
            (path for path in slide_root.glob("slide_*.png") if path.is_file()),
            key=_natural_key,
        )
    )


def _s3_rendered_slides(store: S3MediaStore, module_number: int) -> tuple[str, ...]:
    prefix = f"chapter{module_number}/en/ppt-slides/module_{module_number}/"
    return tuple(
        sorted(
            (
                key
                for key in store.list_keys(f"chapter{module_number}", "en", "ppt-slides")
                if key.startswith(prefix) and key.lower().endswith(".png")
            ),
            key=lambda key: _natural_key(Path(key)),
        )
    )


def _convert_to_png(source: Path, target_dir: Path) -> tuple[Path, ...]:
    office = shutil.which("soffice") or shutil.which("libreoffice")
    pdftoppm = shutil.which("pdftoppm")
    if not office or not pdftoppm:
        raise PresentationRenderError(
            "PPT preview conversion requires LibreOffice and pdftoppm on the server."
        )

    with tempfile.TemporaryDirectory(prefix="hts-ppt-render-") as temp_name:
        work_dir = Path(temp_name)
        profile_dir = work_dir / "libreoffice-profile"
        profile_dir.mkdir()

        try:
            subprocess.run(
                [
                    office,
                    "--headless",
                    f"-env:UserInstallation={profile_dir.as_uri()}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(work_dir),
                    str(source),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=180,
            )
            pdf_path = work_dir / f"{source.stem}.pdf"
            if not pdf_path.is_file():
                pdf_path = next(iter(work_dir.glob("*.pdf")), None)
            if pdf_path is None:
                raise PresentationRenderError("LibreOffice did not produce a PDF preview.")

            image_prefix = work_dir / "rendered-slide"
            subprocess.run(
                [
                    pdftoppm,
                    "-png",
                    "-r",
                    "120",
                    str(pdf_path),
                    str(image_prefix),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=180,
            )
        except FileNotFoundError as error:
            raise PresentationRenderError(
                "PPT preview conversion requires LibreOffice and pdftoppm on the server."
            ) from error
        except subprocess.CalledProcessError as error:
            detail = (error.stderr or error.stdout or "conversion failed").strip()
            raise PresentationRenderError(f"Unable to render PPT slides: {detail[-400:]}") from error
        except subprocess.TimeoutExpired as error:
            raise PresentationRenderError("PPT preview conversion timed out.") from error

        rendered = sorted(work_dir.glob("rendered-slide-*.png"), key=_natural_key)
        if not rendered:
            raise PresentationRenderError("No slide images were produced from the PPT.")

        target_dir.mkdir(parents=True, exist_ok=True)
        output_paths: list[Path] = []
        for index, image_path in enumerate(rendered, start=1):
            output_path = target_dir / f"slide_{index:04d}.png"
            shutil.copy2(image_path, output_path)
            output_paths.append(output_path)
        return tuple(output_paths)


def render_presentation(module_number: int) -> RenderedPresentation:
    """Return cached slide images, rendering the private PPT only when needed."""

    store = S3MediaStore()
    cached_s3_keys = _s3_rendered_slides(store, module_number) if store.enabled else ()
    if cached_s3_keys:
        return RenderedPresentation(
            filename=f"module_{module_number}.pptx",
            s3_keys=cached_s3_keys,
        )

    local_source = _local_source(module_number)
    local_slides = _local_rendered_slides(module_number)
    if local_slides:
        return RenderedPresentation(
            filename=local_source.name if local_source else f"module_{module_number}.pptx",
            local_paths=local_slides,
        )

    source_name = local_source.name if local_source else f"module_{module_number}.pptx"
    with tempfile.TemporaryDirectory(prefix="hts-ppt-source-") as temp_name:
        source_path = local_source
        if source_path is None:
            source_path = Path(temp_name) / source_name
            downloaded = store.download(
                f"chapter{module_number}",
                "en",
                "ppt",
                [f"module_{module_number}.pptx", f"module_{module_number}.ppt"],
                source_path,
            )
            if downloaded is None:
                raise PresentationRenderError("Presentation file was not found.")

        target_dir = (
            Path(settings.MEDIA_ROOT)
            / f"chapter{module_number}"
            / "ppt-slides"
            / f"module_{module_number}"
        )
        local_paths = _convert_to_png(source_path, target_dir)

    if store.enabled and store.client() is not None:
        s3_keys: list[str] = []
        for path in local_paths:
            key = f"chapter{module_number}/en/ppt-slides/module_{module_number}/{path.name}"
            if not store.upload_file(path, key, "image/png"):
                s3_keys = []
                break
            s3_keys.append(key)
        if s3_keys:
            return RenderedPresentation(filename=source_name, s3_keys=tuple(s3_keys))

    return RenderedPresentation(filename=source_name, local_paths=local_paths)

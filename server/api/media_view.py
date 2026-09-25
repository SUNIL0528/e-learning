"""
Range-aware media serving for local development.

Django's built-in static file serving (django.views.static.serve,
used by the `static()` helper in urls.py) does NOT support HTTP
Range requests -- it always returns the whole file with a 200 OK.
That's fine for images/JSON, but it breaks seeking in <video> and
<audio> elements: the browser asks for a byte range starting at
the seeked-to position, the server ignores that and sends the
entire file from byte 0 again, and the element ends up back at
the start.

This view adds minimal, dependency-free Range support so seeking
actually works. It's intended for local development. In
production, serve MEDIA_ROOT through nginx, S3/CloudFront, or
another proper static/CDN layer -- they support ranges natively
and will be far more efficient than this.
"""

import mimetypes
import os
import re

from django.conf import settings
from django.http import (
    HttpResponse,
    HttpResponseNotFound,
    HttpResponseNotModified,
    StreamingHttpResponse,
)

# Matches headers like "bytes=1000-2000", "bytes=1000-", "bytes=-500"
RANGE_RE = re.compile(r"bytes\s*=\s*(\d*)-(\d*)", re.IGNORECASE)

# How much to read per chunk when streaming a range/file.
CHUNK_SIZE = 8192 * 16  # 128 KB


def _file_iterator(file_path, offset=0, length=None, chunk_size=CHUNK_SIZE):
    with open(file_path, "rb") as f:
        f.seek(offset)

        remaining = length

        while True:
            read_size = (
                chunk_size
                if remaining is None
                else min(chunk_size, remaining)
            )

            if read_size <= 0:
                break

            data = f.read(read_size)

            if not data:
                break

            if remaining is not None:
                remaining -= len(data)

            yield data


def serve_media(request, path):
    """
    Serve a file under MEDIA_ROOT, honoring Range requests.

    Wire this up in urls.py in place of the usual
    static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    helper, e.g.:

        from django.urls import re_path
        from myapp.media_views import serve_media

        urlpatterns = [
            ...,
            re_path(r"^media/(?P<path>.*)$", serve_media),
        ]

    (Remove/replace any existing static() call for MEDIA_URL so
    there's only one route handling it.)
    """

    # --------------------------------------------------------
    # Resolve and validate the path
    # --------------------------------------------------------

    # Prevent path traversal outside MEDIA_ROOT.
    full_path = os.path.normpath(
        os.path.join(settings.MEDIA_ROOT, path)
    )

    media_root = os.path.normpath(str(settings.MEDIA_ROOT))

    if not full_path.startswith(media_root):
        return HttpResponseNotFound()

    if not os.path.isfile(full_path):
        return HttpResponseNotFound()

    file_size = os.path.getsize(full_path)

    content_type, _ = mimetypes.guess_type(full_path)
    content_type = content_type or "application/octet-stream"
    is_presentation = os.path.splitext(full_path)[1].lower() in {".ppt", ".pptx"}

    # --------------------------------------------------------
    # No Range header: behave like a normal, full-file response
    # --------------------------------------------------------

    range_header = request.META.get("HTTP_RANGE", "").strip()
    range_match = RANGE_RE.match(range_header) if range_header else None

    if not range_match:
        response = StreamingHttpResponse(
            _file_iterator(full_path),
            content_type=content_type,
        )

        response["Content-Length"] = str(file_size)
        response["Accept-Ranges"] = "bytes"
        if is_presentation:
            response["Content-Disposition"] = (
                f'attachment; filename="{os.path.basename(full_path)}"'
            )

        return response

    # --------------------------------------------------------
    # Range header present: return 206 Partial Content
    # --------------------------------------------------------

    start_str, end_str = range_match.groups()

    if start_str:
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
    else:
        # Suffix range, e.g. "bytes=-500" (last 500 bytes).
        suffix_length = int(end_str)
        start = max(0, file_size - suffix_length)
        end = file_size - 1

    end = min(end, file_size - 1)

    if start > end or start >= file_size:
        response = HttpResponse(status=416)  # Range Not Satisfiable
        response["Content-Range"] = f"bytes */{file_size}"
        return response

    length = end - start + 1

    response = StreamingHttpResponse(
        _file_iterator(full_path, offset=start, length=length),
        status=206,
        content_type=content_type,
    )

    response["Content-Length"] = str(length)
    response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    response["Accept-Ranges"] = "bytes"
    if is_presentation:
        response["Content-Disposition"] = (
            f'attachment; filename="{os.path.basename(full_path)}"'
        )

    return response

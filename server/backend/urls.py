from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from api import views
from api.media_view import serve_media


def home(request):
    return JsonResponse({
        "message": "Backend API is running"
    })


urlpatterns = [
    path("", home),

    path("admin/", admin.site.urls),

    re_path(r"^api/users$", views.users_list),
    re_path(r"^api/users/([0-9]+)$", views.users_detail),

    path("api/", include("api.urls")),
    re_path(r"^media/(?P<path>.*)$", serve_media),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
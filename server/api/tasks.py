"""Celery task compatibility exports.

Translation tasks live under ``api.translation`` so the feature has one
cohesive backend package while existing Celery setup can keep importing
``api.tasks``.
"""

from .translation.tasks import translate_ppt_task

__all__ = ["translate_ppt_task"]

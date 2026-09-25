from pathlib import Path


# ============================================================
# PROJECT DIRECTORIES
# ============================================================

BASE_DIR = Path(
    __file__
).resolve().parent

INPUT_DIR = (
    BASE_DIR / "input"
)

OUTPUT_DIR = (
    BASE_DIR / "output"
)

INPUT_DIR.mkdir(
    exist_ok=True
)

OUTPUT_DIR.mkdir(
    exist_ok=True
)


# ============================================================
# PPT SHAPE NAMING
# ============================================================

ENGLISH_PREFIX = "EN_"

TRANSLATION_PREFIX = "TR_"


# ============================================================
# TRANSLATION PLACEHOLDER
# ============================================================

TRANSLATION_PLACEHOLDER = (
    "{{TRANSLATION}}"
)


# ============================================================
# FONT SETTINGS
# ============================================================

# Used when the English box doesn't
# explicitly define a font size.

DEFAULT_FONT_SIZE = 18


# Do not make translated text
# smaller than this.

MIN_FONT_SIZE = 12


# Reduce one point at a time.

FONT_REDUCTION_STEP = 1
"""
Gemma translator for Indic-language PowerPoint narration.

Designed for a local Gemma model served by LM Studio's native REST API
/api/v1/chat endpoint. The native endpoint is used so reasoning can be explicitly
disabled for fast translation-only inference.

Public API intentionally kept compatible with translation_router.py:
    translate_presentation_gemma(
        presentation_data,
        source_language,
        target_language,
    )

Main reliability changes compared with the previous implementation:
- Small paragraph batches instead of one entire slide per request.
- Dynamic output-token budget instead of max_tokens=8192 every time.
- Separate connect/read timeouts.
- Automatic recursive batch splitting after timeout/malformed output.
- Sentence/word-boundary fallback for a single long paragraph.
- Language-specific Indic instructions are actually included in each request.
- LM Studio model ID is cached instead of queried before every batch.
- Native LM Studio reasoning is explicitly disabled when the model supports it.
- Loaded Gemma models are preferred over unrelated loaded models.
- Native response token stats are logged for diagnosis.
- Clear Gemma naming throughout the implementation.
"""

from __future__ import annotations

from functools import lru_cache
import json
import re
import time
from typing import Dict, List, Sequence

import requests


GEMMA_TRANSLATOR_VERSION = "2026-09-11-v3-native-no-reasoning"
print(f"[GEMMA MODULE LOADED] version={GEMMA_TRANSLATOR_VERSION} file={__file__}")


# ============================================================================
# LM STUDIO CONFIGURATION
# ============================================================================

LM_STUDIO_HOST = "http://127.0.0.1:1234"

# LM Studio native REST API. We intentionally use this instead of the
# OpenAI-compatible /v1/chat/completions endpoint because the native chat API
# exposes a first-class `reasoning` setting. For translation, reasoning adds
# latency and can consume the entire output-token budget before final text.
LM_STUDIO_CHAT_URL = f"{LM_STUDIO_HOST}/api/v1/chat"
LM_STUDIO_MODELS_URL = f"{LM_STUDIO_HOST}/api/v1/models"

# Optional: set this to the exact Gemma model key/instance ID shown by LM
# Studio. If left as None, the code automatically selects a LOADED LLM whose
# key/display name/architecture contains "gemma". It only falls back to another
# loaded LLM if no loaded Gemma is found.
PREFERRED_GEMMA_MODEL = None

# Translation does not need chain-of-thought/reasoning. The native API will
# receive reasoning="off" whenever the selected model exposes that option.
GEMMA_REASONING = "off"

# Keep these deliberately bounded. A 300+ second timeout should not be needed
# for a small translation batch; if a batch is too hard, this module splits it.
GEMMA_CONNECT_TIMEOUT = 10
GEMMA_READ_TIMEOUT = 150

# Generation behavior.
GEMMA_TEMPERATURE = 0.10

# Small batches are much safer for a local model than sending an entire slide.
GEMMA_MAX_BATCH_PARAGRAPHS = 3
GEMMA_MAX_BATCH_CHARS = 1800

# Dynamic completion-token limits.
GEMMA_MIN_OUTPUT_TOKENS = 256
GEMMA_MAX_OUTPUT_TOKENS = 1200

# If a *single* paragraph still fails, split it into smaller chunks.
GEMMA_SINGLE_PARAGRAPH_CHUNK_CHARS = 1000

# Number of retries only for a single already-small request. Large failed
# batches are never blindly retried; they are split immediately.
GEMMA_SINGLE_REQUEST_RETRIES = 1
GEMMA_RETRY_SLEEP_SECONDS = 1.0

# Reuse the HTTP connection to LM Studio.
HTTP_SESSION = requests.Session()


# ============================================================================
# LANGUAGE CONFIGURATION
# ============================================================================

GEMMA_LANGUAGE_CODES = {
    "tam_Taml": ("ta", "Tamil"),
    "hin_Deva": ("hi", "Hindi"),
    "tel_Telu": ("te", "Telugu"),
    "kan_Knda": ("kn", "Kannada"),
    "mal_Mlym": ("ml", "Malayalam"),
    "por_BR": ("pt-br", "Brazilian Portuguese"),
}

# ============================================================
# TECHNICAL TTS SETTINGS
# ============================================================

# These values are available for future pronunciation
# preprocessing.
#
# Do NOT blindly replace terms such as ISO / ASTM / FROSIO
# until you have listened to how each TTS engine handles them.

TECHNICAL_ABBREVIATIONS = {

    "DFT": "D F T",

    "WFT": "W F T",

    "NDFT": "N D F T",

    "QC": "Q C",

    "QA": "Q A",

    "ITP": "I T P",

    "PDS": "P D S",

    "MSDS": "M S D S",

    "SDS": "S D S",

    "NCR": "N C R",

    "RFI": "R F I",

    "HSE": "H S E",

    "PQT": "P Q T",

    "PQR": "P Q R",
}

# ============================================================
# TECHNICAL TERMS
# ============================================================

TECHNICAL_TERMS = [

    # --------------------------------------------------------
    # STANDARDS
    # --------------------------------------------------------

    "ISO 12944",
    "ISO 8501-1",
    "ISO 8501-2",
    "ISO 8502",
    "ISO 9000",
    "ISO 9001",
    "ISO 19840",

    "SSPC PA 2",
    "SSPC SP1",

    "ASTM D4285",


    # --------------------------------------------------------
    # ABBREVIATIONS
    # --------------------------------------------------------

    "QC",
    "QA",
    "ITP",
    "PDS",
    "MSDS",
    "SDS",
    "NCR",
    "RFI",

    "DFT",
    "WFT",
    "NDFT",

    "PIG",
    "PQT",
    "PQR",

    "HSE",


    # --------------------------------------------------------
    # IMPORTANT COATING TERMINOLOGY
    # --------------------------------------------------------

    "coating",
    "Coating Inspection",
    "inspector",
    "inspection",

    "surface preparation",
    "blast cleaning",
    "abrasive blasting",

    "primer",
    "intermediate coat",
    "topcoat",

    "paint",

    "dry film thickness",
    "wet film thickness",

    "holiday testing",
    "adhesion testing",

    "ambient conditions",
    "relative humidity",
    "dew point",

    "Non-Conformance Report",
    "Inspection and Test Plan",
]


# ============================================================
# COMMON REQUIREMENTS
# ============================================================

COMMON_LANGUAGE_RULES = """
The output is for spoken professional industrial e-learning.

VERY IMPORTANT:

- Do NOT translate word-for-word.
- Preserve the original meaning exactly.
- Do NOT add information.
- Do NOT remove technical information.
- Make the narration sound like a real instructor speaking.
- Prefer natural modern spoken language.
- Avoid unnecessarily literary, academic, archaic or formal wording.
- Keep sentences reasonably short for text-to-speech.
- Use natural punctuation for pauses.
- Preserve numbers accurately.
- Preserve ISO, ASTM and SSPC references accurately.
- Preserve abbreviations such as DFT, WFT, NDFT, QA, QC,
  ITP, PDS, MSDS, SDS, NCR, RFI and HSE.

The training subject is industrial protective coating inspection.

Industrial terminology must sound technically correct.

If an English industrial term is normally used by professionals
in the target language, keeping that term in English is preferred
over producing an awkward literal translation.

Do not translate "course" into an unrelated word such as
"display", "scene", "view", "presentation" or similar.

Return ONLY the narration.
"""


# ============================================================
# LANGUAGE-SPECIFIC INSTRUCTIONS
# ============================================================

LANGUAGE_INSTRUCTIONS = {

    # ========================================================
    # TAMIL
    # ========================================================

    "ta": """
Use natural spoken Tamil for professional industrial training.

Write Tamil portions using Tamil script.

Do NOT romanize ordinary Tamil sentences.

Use natural Tamil-English code mixing where Indian technical
professionals would normally use English.

Keep terms such as these in English when appropriate:

Coating
Coating Inspection
course
inspector
inspection
surface preparation
primer
topcoat
DFT
WFT
NDFT
QA
QC
ITP
PDS
NCR
ISO
ASTM
SSPC

Do NOT translate "coating" as "பூச்சு" when referring to the
professional coating-inspection discipline if "Coating" sounds
more natural.

Do NOT translate "inspection" into unnecessarily formal Tamil
when "Inspection" is natural in technical training.

Avoid literary Tamil.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Coating Inspection course-க்கு உங்களை வரவேற்கிறோம்.

BAD:
பூச்சு பரிசோதனை காட்சி வரவேற்பு.

Use the example only to understand style.
Do not copy it unless the source sentence is actually the same.
""",


    # ========================================================
    # TELUGU
    # ========================================================

    "te": """
Use natural conversational Telugu suitable for professional
industrial e-learning.

Write Telugu portions using Telugu script.

Do NOT romanize Telugu.

Use natural Telugu-English code mixing.

Keep common industrial technical terminology in English where
professionals naturally use English.

Prefer terms such as:

Coating
Coating Inspection
course
inspector
inspection
surface preparation
primer
topcoat
DFT
WFT
QA
QC
ITP
NCR
ISO
ASTM
SSPC

Avoid overly literary Telugu.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Coating Inspection courseకి స్వాగతం.

The narration should sound like a Telugu technical instructor,
not like a literal machine translation.
""",


    # ========================================================
    # KANNADA
    # ========================================================

    "kn": """
Use natural conversational Kannada suitable for professional
industrial e-learning.

Write Kannada portions using Kannada script.

Do NOT romanize Kannada.

Use natural Kannada-English code mixing.

Keep common industrial terminology in English where appropriate.

Prefer retaining terms such as:

Coating
Coating Inspection
course
inspector
inspection
surface preparation
primer
topcoat
DFT
WFT
QA
QC
ITP
NCR
ISO
ASTM
SSPC

Avoid formal or literary Kannada when a normal spoken expression
would sound more natural.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Coating Inspection courseಗೆ ಸ್ವಾಗತ.

The result should sound like a professional instructor speaking.
""",


    # ========================================================
    # MALAYALAM
    # ========================================================

    "ml": """
Use natural conversational Malayalam suitable for professional
industrial training.

Write Malayalam portions using Malayalam script.

Do NOT romanize Malayalam.

Use natural Malayalam-English code mixing.

Keep technical terminology in English when professionals would
normally use the English terminology.

Prefer terms such as:

Coating
Coating Inspection
course
inspector
inspection
surface preparation
primer
topcoat
DFT
WFT
QA
QC
ITP
NCR
ISO
ASTM
SSPC

Avoid overly literary Malayalam.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Coating Inspection courseലേക്ക് സ്വാഗതം.

The narration should sound natural when spoken aloud.
""",


    # ========================================================
    # HINDI
    # ========================================================

    "hi": """
Use natural conversational Indian Hindi suitable for
professional industrial e-learning.

Write Hindi portions using Devanagari script.

Do NOT romanize Hindi.

Use natural Hindi-English code mixing.

Do not make the language unnecessarily Sanskritized.

Professional Indian speakers commonly use English terminology,
so keep terms such as:

Coating
Coating Inspection
course
inspector
inspection
surface preparation
primer
topcoat
DFT
WFT
QA
QC
ITP
NCR
ISO
ASTM
SSPC

in English when natural.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Coating Inspection course में आपका स्वागत है.

The result should sound like professional spoken Indian Hindi.
""",


    # ========================================================
    # ENGLISH
    # ========================================================

    "en": """
Use clear professional international English suitable for
industrial e-learning.

Use natural instructor-style speech.

Avoid overly complicated sentences.

Preserve all technical terminology exactly.

EXAMPLE:

Source:
Welcome to the coating inspection course.

GOOD:
Welcome to the coating inspection course.
""",


    # ========================================================
    # CHINESE - MANDARIN
    # ========================================================

    "zh": """
Use natural Simplified Chinese suitable for professional
technical e-learning narration.

Use Mandarin Chinese.

Write normal Chinese sentences using Chinese characters.

Do not translate technical abbreviations such as:

DFT
WFT
QA
QC
ITP
NCR

Translate ordinary descriptive terminology naturally when a
well-established Chinese technical term exists.

Keep ISO, ASTM and SSPC references unchanged.

Avoid awkward word-for-word English sentence structure.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
欢迎参加涂层检验课程。

The output should sound natural when spoken by a Mandarin
technical instructor.
""",


    # ========================================================
    # BAHASA INDONESIA
    # ========================================================

    "id": """
Use natural Bahasa Indonesia suitable for professional
industrial e-learning.

Do not use unnecessarily formal or old-fashioned Indonesian.

Keep international technical abbreviations unchanged.

English coating terminology may remain in English where that
sounds more natural to Indonesian technical professionals.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Selamat datang di kursus Coating Inspection.

Use professional conversational Indonesian.
""",


    # ========================================================
    # YORUBA
    # ========================================================

    "yo": """
Use natural standard Yoruba suitable for professional
educational narration.

IMPORTANT:

Preserve correct Yoruba characters and tonal marks where
linguistically appropriate.

Do not remove characters such as:

ẹ
ọ
ṣ

Do not convert Yoruba text to ASCII.

Technical English terminology may remain in English where a
natural Yoruba technical equivalent is uncommon.

Keep standards and abbreviations unchanged.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Ẹ káàbọ̀ sí ẹ̀kọ́ Coating Inspection.

Prioritize intelligibility and natural Yoruba grammar.
""",


    # ========================================================
    # VIETNAMESE
    # ========================================================

    "vi": """
Use natural Vietnamese suitable for professional technical
e-learning.

Preserve Vietnamese tone marks correctly.

Keep standards and technical abbreviations unchanged.

English industrial terminology may remain in English where
commonly used.

Avoid literal English sentence structure.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Chào mừng bạn đến với khóa học Coating Inspection.

Use natural professional Vietnamese.
""",


    # ========================================================
    # PORTUGUESE - PORTUGAL
    # ========================================================

    "pt": """
Use European Portuguese.

Do NOT use Brazilian-specific vocabulary or grammar unless it is
also normal in Portugal.

Use professional but natural e-learning narration.

Translate established technical terminology naturally.

Keep ISO, ASTM, SSPC and abbreviations unchanged.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Bem-vindo ao curso de inspeção de revestimentos.

Use European Portuguese pronunciation-oriented wording.
""",


    # ========================================================
    # BRAZILIAN PORTUGUESE
    # ========================================================

    "pt-br": """
Use natural, casual Brazilian Portuguese suitable for spoken e-learning.

Do NOT use European Portuguese-specific vocabulary, grammar, or phrasing when a natural Brazilian form exists.

Use everyday Brazilian vocabulary and sentence structure while preserving the technical meaning exactly.

Do NOT mix English words into the Portuguese narration. Translate ordinary and technical terms into natural Brazilian Portuguese whenever a clear Portuguese equivalent exists.

Keep only proper names, standard references such as ISO, ASTM and SSPC, and required technical abbreviations such as DFT, WFT, NDFT, QA, QC, ITP, PDS, NCR and HSE unchanged.

Avoid unnecessary English loanwords and code-switching.

Use professional but relaxed, natural Brazilian speech appropriate for an instructor.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Bem-vindo ao curso de inspeção de revestimentos.

Use natural Brazilian Portuguese sentence structure.
""",


    # ========================================================
    # FRENCH
    # ========================================================

    "fr": """
Use natural professional French suitable for industrial
e-learning narration.

Translate established coating terminology naturally.

Keep technical abbreviations and standards unchanged.

Avoid excessively formal or literary French.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Bienvenue dans le cours d'inspection des revêtements.

The narration should sound like a professional instructor.
""",


    # ========================================================
    # ARABIC
    # ========================================================

    "ar": """
Use clear Modern Standard Arabic suitable for professional
technical e-learning.

Do not use highly literary or classical constructions when
simpler Modern Standard Arabic sounds more natural.

Keep Latin technical abbreviations such as DFT, WFT, QA, QC,
ITP and NCR unchanged.

Keep ISO, ASTM and SSPC references unchanged.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
مرحبًا بكم في دورة فحص الطلاءات.

Use clear sentences that work well for text-to-speech.
""",


    # ========================================================
    # SPANISH
    # ========================================================

    "es": """
Use neutral international Spanish suitable for professional
technical e-learning.

Avoid strongly regional expressions.

Translate established technical terminology naturally.

Keep technical abbreviations and standards unchanged.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Bienvenidos al curso de inspección de recubrimientos.

Use natural instructor-style Spanish.
""",


    # ========================================================
    # GERMAN
    # ========================================================

    "de": """
Use clear standard German suitable for professional industrial
e-learning.

Use technically accurate terminology.

Avoid unnecessarily complex or bureaucratic German sentences.

Keep ISO, ASTM, SSPC and technical abbreviations unchanged.

EXAMPLE:

English:
Welcome to the coating inspection course.

GOOD:
Willkommen zum Kurs für Beschichtungsinspektion.

Use clear narration-friendly sentence structure.
""",
}


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are a multilingual professional e-learning narration adapter.

Your task is NOT ordinary literal translation.

Your task is to convert English industrial training narration
into natural spoken narration in the requested target language.

The course subject is:

INDUSTRIAL PROTECTIVE COATING INSPECTION.

Accuracy is extremely important.

The narration will be converted directly into speech using a
text-to-speech system.

Follow these requirements strictly:

1. Preserve the source meaning.

2. Never invent information.

3. Never remove technical information.

4. Do not perform awkward word-for-word translation.

5. Make the narration sound like a human technical instructor.

6. Preserve ISO, ASTM and SSPC standard references.

7. Preserve important abbreviations.

8. Preserve numbers accurately.

9. Use the target language's normal native script.

10. English technical words may remain in English when that is
    how professionals naturally speak.

11. Do not translate familiar industrial terminology into
    strange, literary or misleading terminology.

12. Do not produce explanations.

13. Do not produce headings.

14. Do not say "Translation:".

15. Do not use markdown.

16. Do not put the output inside quotation marks.

17. Return ONLY the final narration.

18. Use punctuation appropriate for natural TTS pauses.

19. Keep sentences reasonably short.

20. The result must be suitable for professional e-learning
    voice narration.
"""

# ============================================================================
# ERRORS
# ============================================================================

class GemmaTranslationError(RuntimeError):
    """Base error for Gemma translation failures."""


class GemmaRetryableError(GemmaTranslationError):
    """A failure that can often be solved by reducing the request size."""


class GemmaResponseFormatError(GemmaRetryableError):
    """Gemma returned incomplete or malformed marker-delimited output."""


# ============================================================================
# MODEL DISCOVERY
# ============================================================================

@lru_cache(maxsize=1)
def get_loaded_model_info() -> dict:
    """
    Select a loaded LM Studio LLM and return its relevant metadata.

    Preference order:
      1. PREFERRED_GEMMA_MODEL, when configured and loaded.
      2. A loaded LLM that looks like Gemma.
      3. Any loaded LLM (with a warning).

    The native /api/v1/models endpoint also tells us whether reasoning can be
    disabled. This is critical for reasoning-capable Gemma releases.
    """

    try:
        response = HTTP_SESSION.get(
            LM_STUDIO_MODELS_URL,
            timeout=(GEMMA_CONNECT_TIMEOUT, 30),
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise GemmaTranslationError(
            "Unable to query LM Studio models at "
            f"{LM_STUDIO_MODELS_URL}: {error}"
        ) from error

    try:
        data = response.json()
    except ValueError as error:
        raise GemmaTranslationError(
            "LM Studio returned a non-JSON model list."
        ) from error

    models = data.get("models", [])
    loaded_llms = []

    for model in models:
        if not isinstance(model, dict):
            continue
        if model.get("type") != "llm":
            continue

        loaded_instances = model.get("loaded_instances") or []
        if not loaded_instances:
            continue

        for instance in loaded_instances:
            if not isinstance(instance, dict):
                continue
            instance_id = instance.get("id")
            if not instance_id:
                continue

            entry = {
                "model": model,
                "instance": instance,
                "model_id": instance_id,
                "key": model.get("key") or instance_id,
                "display_name": model.get("display_name") or model.get("key") or instance_id,
                "architecture": model.get("architecture") or "",
            }
            loaded_llms.append(entry)

    if not loaded_llms:
        raise GemmaTranslationError(
            "No loaded LLM instance was found in LM Studio. Load Gemma first."
        )

    selected = None

    if PREFERRED_GEMMA_MODEL:
        preferred = PREFERRED_GEMMA_MODEL.lower().strip()
        for entry in loaded_llms:
            candidates = {
                str(entry["model_id"]).lower(),
                str(entry["key"]).lower(),
                str(entry["display_name"]).lower(),
            }
            if preferred in candidates:
                selected = entry
                break

        if selected is None:
            available = ", ".join(
                str(entry["model_id"]) for entry in loaded_llms
            )
            raise GemmaTranslationError(
                f"PREFERRED_GEMMA_MODEL={PREFERRED_GEMMA_MODEL!r} is not "
                f"currently loaded. Loaded LLMs: {available}"
            )

    if selected is None:
        for entry in loaded_llms:
            searchable = " ".join(
                [
                    str(entry["model_id"]),
                    str(entry["key"]),
                    str(entry["display_name"]),
                    str(entry["architecture"]),
                ]
            ).lower()
            if "gemma" in searchable:
                selected = entry
                break

    if selected is None:
        selected = loaded_llms[0]
        print(
            "[GEMMA WARNING] No loaded model name contained 'gemma'. "
            f"Falling back to loaded model {selected['model_id']!r}."
        )

    model = selected["model"]
    capabilities = model.get("capabilities") or {}
    reasoning_info = capabilities.get("reasoning") or {}
    allowed_reasoning = reasoning_info.get("allowed_options") or []
    reasoning_default = reasoning_info.get("default")

    selected["reasoning_allowed"] = list(allowed_reasoning)
    selected["reasoning_default"] = reasoning_default
    selected["reasoning_off_supported"] = GEMMA_REASONING in allowed_reasoning
    selected["reasoning_exposed"] = bool(reasoning_info)
    selected["context_length"] = (selected["instance"].get("config") or {}).get(
        "context_length"
    )

    if reasoning_info and reasoning_default in {"on", "low", "medium", "high"}:
        if not selected["reasoning_off_supported"]:
            raise GemmaTranslationError(
                "The selected model has reasoning enabled by default, but LM "
                "Studio does not expose a reasoning='off' option for it. "
                "Use a translation/non-reasoning model or configure the model "
                "in LM Studio before running this PPT job."
            )

    print(
        f"[GEMMA MODEL] {selected['model_id']} | "
        f"reasoning_default={reasoning_default!r} | "
        f"reasoning_allowed={allowed_reasoning!r}"
    )

    return selected


@lru_cache(maxsize=1)
def get_loaded_model() -> str:
    """Backward-compatible helper returning only the selected model ID."""
    return get_loaded_model_info()["model_id"]

# ============================================================================
# TOKEN BUDGET
# ============================================================================

def calculate_max_tokens(texts: Sequence[str]) -> int:
    """
    Estimate a safe completion-token budget for an English -> Indic batch.

    English is roughly estimated at ~4 characters/token. Indic scripts often
    tokenize less efficiently, so the output allowance is intentionally
    generous. The hard cap prevents accidental 8k-token generations.
    """

    total_chars = sum(len(text) for text in texts)
    estimated_input_tokens = max(1, total_chars // 4)

    estimated_output_tokens = int(estimated_input_tokens * 2.2) + 128

    return max(
        GEMMA_MIN_OUTPUT_TOKENS,
        min(GEMMA_MAX_OUTPUT_TOKENS, estimated_output_tokens),
    )


# ============================================================================
# RESPONSE EXTRACTION
# ============================================================================

def extract_native_content(data: dict) -> str:
    """Extract final message text from LM Studio's native /api/v1/chat response."""

    candidates = []
    output = data.get("output") or []

    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "message":
                continue

            content = item.get("content", "")

            if isinstance(content, str) and content.strip():
                candidates.append(content.strip())
            elif isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, str) and part.strip():
                        parts.append(part.strip())
                    elif isinstance(part, dict):
                        value = part.get("text") or part.get("content")
                        if isinstance(value, str) and value.strip():
                            parts.append(value.strip())
                if parts:
                    candidates.append("\n".join(parts))

    # Defensive compatibility fallback in case an older LM Studio build returns
    # OpenAI-shaped content even though the native endpoint was requested.
    choices = data.get("choices") or []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        content = message.get("content", "") if isinstance(message, dict) else ""
        if isinstance(content, str) and content.strip():
            candidates.append(content.strip())

    return candidates[0] if candidates else ""


def get_native_stats(data: dict) -> dict:
    stats = data.get("stats") or {}
    return stats if isinstance(stats, dict) else {}


def debug_empty_response(data: dict) -> None:
    """Print native LM Studio output metadata when no final message is found."""

    output = data.get("output") or []
    output_types = []
    if isinstance(output, list):
        output_types = [
            item.get("type")
            for item in output
            if isinstance(item, dict)
        ]

    stats = get_native_stats(data)

    try:
        preview = json.dumps(
            data,
            ensure_ascii=False,
            default=str,
        )[:3000]
    except Exception:
        preview = repr(data)[:3000]

    print("[GEMMA EMPTY RESPONSE]")
    print(f"  output_types={output_types!r}")
    print(f"  input_tokens={stats.get('input_tokens')!r}")
    print(f"  total_output_tokens={stats.get('total_output_tokens')!r}")
    print(f"  reasoning_output_tokens={stats.get('reasoning_output_tokens')!r}")
    print(f"  raw_preview={preview}")


def clean_result(text: str) -> str:
    """Remove a few harmless wrappers if the model adds them."""

    if not text:
        return ""

    text = text.strip()

    prefixes = (
        "Translation:",
        "Translated text:",
        "Translated narration:",
        "Narration:",
        "Answer:",
        "Output:",
    )

    for prefix in prefixes:
        if text.lower().startswith(prefix.lower()):
            text = text[len(prefix):].strip()
            break

    if len(text) >= 2:
        if (text[0] == '"' and text[-1] == '"') or (
            text[0] == "'" and text[-1] == "'"
        ):
            text = text[1:-1].strip()

    return text

# ============================================================================
# LM STUDIO REQUEST
# ============================================================================

def send_gemma_request(
    model_name: str,
    prompt: str,
    max_tokens: int,
) -> dict:
    """
    Send one bounded translation request through LM Studio's native REST API.

    For reasoning-capable models, `reasoning: "off"` is explicitly sent. This
    prevents the model from burning the completion budget on internal reasoning
    before producing the translation.
    """

    model_info = get_loaded_model_info()

    payload = {
        "model": model_name,
        "input": prompt,
        "system_prompt": SYSTEM_PROMPT,
        "temperature": GEMMA_TEMPERATURE,
        "max_output_tokens": max_tokens,
        "stream": False,
        "store": False,
    }

    if model_info.get("reasoning_off_supported"):
        payload["reasoning"] = GEMMA_REASONING

    try:
        response = HTTP_SESSION.post(
            LM_STUDIO_CHAT_URL,
            json=payload,
            timeout=(
                GEMMA_CONNECT_TIMEOUT,
                GEMMA_READ_TIMEOUT,
            ),
        )

    except requests.exceptions.ReadTimeout as error:
        raise GemmaRetryableError(
            "LM Studio Gemma request exceeded the read timeout "
            f"({GEMMA_READ_TIMEOUT}s)."
        ) from error

    except requests.exceptions.ConnectTimeout as error:
        raise GemmaRetryableError(
            "Timed out while connecting to LM Studio."
        ) from error

    except requests.exceptions.ConnectionError as error:
        raise GemmaRetryableError(
            "Could not connect to LM Studio."
        ) from error

    except requests.RequestException as error:
        raise GemmaRetryableError(
            f"LM Studio request failed: {error}"
        ) from error

    if not response.ok:
        body = response.text[:2500]

        if response.status_code in {
            400, 408, 409, 413, 422, 429, 500, 502, 503, 504
        }:
            raise GemmaRetryableError(
                "LM Studio returned "
                f"HTTP {response.status_code}: {body}"
            )

        raise GemmaTranslationError(
            "LM Studio returned "
            f"HTTP {response.status_code}: {body}"
        )

    try:
        data = response.json()
    except ValueError as error:
        raise GemmaRetryableError(
            "LM Studio returned a non-JSON response."
        ) from error

    stats = get_native_stats(data)
    input_tokens = stats.get("input_tokens")
    total_output_tokens = stats.get("total_output_tokens")
    reasoning_tokens = stats.get("reasoning_output_tokens")

    print(
        "[GEMMA STATS] "
        f"input={input_tokens!r} "
        f"output={total_output_tokens!r} "
        f"reasoning={reasoning_tokens!r}"
    )

    if (
        model_info.get("reasoning_off_supported")
        and isinstance(reasoning_tokens, int)
        and reasoning_tokens > 0
    ):
        print(
            "[GEMMA WARNING] LM Studio reported reasoning tokens even though "
            "reasoning='off' was requested."
        )

    final_text = extract_native_content(data)

    # The native endpoint does not need an OpenAI finish_reason check. Accept a
    # valid final message even if token usage happens to equal the configured
    # maximum. Only treat the token ceiling as a failure when final text is absent.
    if not final_text:
        if (
            isinstance(total_output_tokens, int)
            and total_output_tokens >= max_tokens
        ):
            if isinstance(reasoning_tokens, int) and reasoning_tokens > 0:
                raise GemmaRetryableError(
                    "Gemma used the output-token budget without producing final "
                    f"translation text (reasoning tokens={reasoning_tokens})."
                )
            raise GemmaRetryableError(
                "Gemma reached the output-token budget without producing final "
                "translation text."
            )

    return data

# ============================================================================
# BATCH CREATION
# ============================================================================

def build_gemma_batches(
    paragraphs: Sequence[str],
) -> List[List[dict]]:
    """Create small ordered paragraph batches for a slide."""

    batches: List[List[dict]] = []
    current_batch: List[dict] = []
    current_chars = 0

    for index, raw_text in enumerate(paragraphs):
        text = raw_text.strip()

        if not text:
            continue

        text_chars = len(text)

        exceeds_count = (
            len(current_batch) >= GEMMA_MAX_BATCH_PARAGRAPHS
        )

        exceeds_chars = (
            bool(current_batch)
            and current_chars + text_chars > GEMMA_MAX_BATCH_CHARS
        )

        if exceeds_count or exceeds_chars:
            batches.append(current_batch)
            current_batch = []
            current_chars = 0

        current_batch.append(
            {
                "index": index,
                "text": text,
            }
        )
        current_chars += text_chars

    if current_batch:
        batches.append(current_batch)

    return batches


# ============================================================================
# PROMPT BUILDING
# ============================================================================

def build_batch_prompt(
    records: Sequence[dict],
    language_code: str,
    language_name: str,
) -> str:
    """Build a concise marker-preserving translation prompt."""

    language_style = LANGUAGE_INSTRUCTIONS.get(
        language_code,
        "Use natural professional spoken language.",
    )

    marked_source = "\n\n".join(
        f"[P_{record['index']}]\n{record['text']}"
        for record in records
    )

    return f"""
Translate the following English paragraphs into natural spoken {language_name}.

TARGET-LANGUAGE STYLE:
{language_style}

OUTPUT RULES:
- Preserve every marker exactly: [P_number]
- Return exactly one translation for every marker.
- Keep the same marker order.
- Do not merge paragraphs.
- Do not repeat the English source.
- Return only markers and translated text.

SOURCE:
{marked_source}
""".strip()


# ============================================================================
# MARKER PARSING
# ============================================================================

MARKER_PATTERN = re.compile(
    r"\[P_(\d+)\]\s*(.*?)"
    r"(?=(?:\n\s*)?\[P_\d+\]|\Z)",
    flags=re.DOTALL,
)


def parse_marked_translations(
    response_text: str,
    expected_records: Sequence[dict],
) -> Dict[int, str]:
    """Parse and validate marker-delimited Gemma output."""

    matches = MARKER_PATTERN.findall(response_text)

    translations: Dict[int, str] = {}

    for index_text, translated_text in matches:
        index = int(index_text)
        cleaned = clean_result(translated_text)

        if cleaned:
            translations[index] = cleaned

    expected_indexes = [record["index"] for record in expected_records]
    missing = [
        index
        for index in expected_indexes
        if index not in translations
    ]

    if missing:
        raise GemmaResponseFormatError(
            "Gemma returned an incomplete batch. "
            f"Missing paragraph indexes: {missing}. "
            f"Raw response preview: {response_text[:500]!r}"
        )

    return {
        index: translations[index]
        for index in expected_indexes
    }


# ============================================================================
# ONE BATCH ATTEMPT
# ============================================================================

def translate_batch_once(
    records: Sequence[dict],
    language_code: str,
    language_name: str,
) -> Dict[int, str]:
    """Translate one already-bounded batch exactly once."""

    model_name = get_loaded_model()

    prompt = build_batch_prompt(
        records=records,
        language_code=language_code,
        language_name=language_name,
    )

    max_tokens = calculate_max_tokens(
        [record["text"] for record in records]
    )

    indexes = [record["index"] for record in records]
    source_chars = sum(len(record["text"]) for record in records)

    print(
        f"[GEMMA REQUEST] paragraphs={indexes} "
        f"chars={source_chars} max_tokens={max_tokens}"
    )

    data = send_gemma_request(
        model_name=model_name,
        prompt=prompt,
        max_tokens=max_tokens,
    )

    result = clean_result(extract_native_content(data))

    if not result:
        debug_empty_response(data)
        raise GemmaRetryableError(
            "Gemma returned an empty translation response."
        )

    translations = parse_marked_translations(
        response_text=result,
        expected_records=records,
    )

    print(
        f"[GEMMA OK] paragraphs={indexes} "
        f"output_chars={len(result)}"
    )

    return translations


# ============================================================================
# TEXT SPLITTING FOR ONE LONG PARAGRAPH
# ============================================================================

def split_text_safely(
    text: str,
    max_chars: int = GEMMA_SINGLE_PARAGRAPH_CHUNK_CHARS,
) -> List[str]:
    """
    Split a long paragraph preferably at sentence boundaries, then whitespace.
    """

    text = text.strip()

    if not text:
        return []

    if len(text) <= max_chars:
        return [text]

    # Sentence-ish splitting while retaining terminal punctuation.
    sentence_parts = re.split(
        r"(?<=[.!?;:])\s+|(?<=\n)\s*",
        text,
    )

    sentence_parts = [part.strip() for part in sentence_parts if part.strip()]

    chunks: List[str] = []
    current = ""

    for part in sentence_parts:
        # One sentence itself may exceed the limit. Split on word boundaries.
        if len(part) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""

            words = part.split()
            word_chunk = ""

            for word in words:
                candidate = (
                    f"{word_chunk} {word}".strip()
                    if word_chunk
                    else word
                )

                if len(candidate) <= max_chars:
                    word_chunk = candidate
                else:
                    if word_chunk:
                        chunks.append(word_chunk.strip())
                    word_chunk = word

            if word_chunk:
                chunks.append(word_chunk.strip())

            continue

        candidate = f"{current} {part}".strip() if current else part

        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current.strip())
            current = part

    if current:
        chunks.append(current.strip())

    return chunks


# ============================================================================
# SINGLE-PARAGRAPH FALLBACK
# ============================================================================

def translate_small_single_record(
    record: dict,
    language_code: str,
    language_name: str,
) -> Dict[int, str]:
    """Retry one already-small paragraph a very limited number of times."""

    last_error: Exception | None = None

    for attempt in range(GEMMA_SINGLE_REQUEST_RETRIES + 1):
        try:
            return translate_batch_once(
                records=[record],
                language_code=language_code,
                language_name=language_name,
            )
        except GemmaRetryableError as error:
            last_error = error

            if attempt >= GEMMA_SINGLE_REQUEST_RETRIES:
                break

            print(
                f"[GEMMA SINGLE RETRY] paragraph={record['index']} "
                f"attempt={attempt + 2}: {error}"
            )
            time.sleep(GEMMA_RETRY_SLEEP_SECONDS)

    raise GemmaRetryableError(
        f"Gemma could not translate paragraph {record['index']} "
        f"after the small-request retry: {last_error}"
    )


GEMMA_MIN_FALLBACK_CHARS = 250


def translate_text_piece_resilient(
    text: str,
    language_code: str,
    language_name: str,
) -> str:
    """
    Translate one text piece. If even a small piece times out or returns an
    invalid response, keep splitting it until a conservative minimum size.
    """

    text = text.strip()

    if not text:
        return ""

    temp_record = {
        "index": 0,
        "text": text,
    }

    try:
        translated = translate_small_single_record(
            record=temp_record,
            language_code=language_code,
            language_name=language_name,
        )
        return translated[0]

    except GemmaRetryableError:
        if len(text) <= GEMMA_MIN_FALLBACK_CHARS:
            raise

        smaller_limit = max(
            GEMMA_MIN_FALLBACK_CHARS,
            min(
                GEMMA_SINGLE_PARAGRAPH_CHUNK_CHARS,
                len(text) // 2,
            ),
        )

        parts = split_text_safely(
            text,
            max_chars=smaller_limit,
        )

        # If natural splitting could not divide the text, use a conservative
        # whitespace-aware hard split so recursion always makes progress.
        if len(parts) <= 1:
            cut = min(smaller_limit, len(text) - 1)
            space = text.rfind(" ", 0, cut + 1)

            if space < GEMMA_MIN_FALLBACK_CHARS // 2:
                space = cut

            parts = [
                text[:space].strip(),
                text[space:].strip(),
            ]
            parts = [part for part in parts if part]

        print(
            f"[GEMMA DEEP SPLIT] chars={len(text)} "
            f"parts={len(parts)}"
        )

        translated_parts = [
            translate_text_piece_resilient(
                text=part,
                language_code=language_code,
                language_name=language_name,
            )
            for part in parts
        ]

        return " ".join(
            part.strip()
            for part in translated_parts
            if part.strip()
        ).strip()


def translate_single_paragraph_fallback(
    record: dict,
    language_code: str,
    language_name: str,
) -> Dict[int, str]:
    """
    Translate one problematic paragraph by splitting it further if necessary.
    """

    text = record["text"].strip()
    original_index = record["index"]

    chunks = split_text_safely(text)

    print(
        f"[GEMMA PARAGRAPH FALLBACK] paragraph={original_index} "
        f"chunks={len(chunks)}"
    )

    translated_chunks: List[str] = []

    for chunk_number, chunk in enumerate(chunks, start=1):
        print(
            f"  [GEMMA CHUNK] paragraph={original_index} "
            f"chunk={chunk_number}/{len(chunks)} chars={len(chunk)}"
        )

        translated_chunks.append(
            translate_text_piece_resilient(
                text=chunk,
                language_code=language_code,
                language_name=language_name,
            )
        )

    combined = " ".join(
        chunk.strip()
        for chunk in translated_chunks
        if chunk.strip()
    ).strip()

    if not combined:
        raise GemmaTranslationError(
            f"Gemma produced no text for paragraph {original_index}."
        )

    return {
        original_index: combined,
    }


# ============================================================================
# RESILIENT RECURSIVE BATCH TRANSLATION
# ============================================================================

def translate_batch_resilient(
    records: Sequence[dict],
    language_code: str,
    language_name: str,
) -> Dict[int, str]:
    """
    Translate a batch; if it fails, recursively divide it instead of failing
    the whole slide/presentation.
    """

    if not records:
        return {}

    try:
        return translate_batch_once(
            records=records,
            language_code=language_code,
            language_name=language_name,
        )

    except GemmaRetryableError as error:
        indexes = [record["index"] for record in records]

        print(
            f"[GEMMA RECOVER] paragraphs={indexes}: {error}"
        )

        # Never blindly retry the same multi-paragraph request.
        if len(records) > 1:
            middle = len(records) // 2

            left = translate_batch_resilient(
                records=records[:middle],
                language_code=language_code,
                language_name=language_name,
            )

            right = translate_batch_resilient(
                records=records[middle:],
                language_code=language_code,
                language_name=language_name,
            )

            merged = {}
            merged.update(left)
            merged.update(right)
            return merged

        # One paragraph remains: split the paragraph or perform a final small
        # retry if it is already below the chunk threshold.
        return translate_single_paragraph_fallback(
            record=records[0],
            language_code=language_code,
            language_name=language_name,
        )


# ============================================================================
# TRANSLATE ONE SLIDE
# ============================================================================

def translate_slide_with_gemma(
    elements: Sequence[dict],
    language_code: str,
    language_name: str,
) -> Dict[int, str]:
    """Translate all non-empty paragraphs on one slide safely."""

    paragraphs: List[str] = []

    for element in elements:
        for paragraph in element["paragraphs"]:
            text = paragraph["text"]
            if text.strip():
                paragraphs.append(text.strip())

    if not paragraphs:
        return {}

    batches = build_gemma_batches(paragraphs)

    print(
        f"[GEMMA SLIDE] paragraphs={len(paragraphs)} "
        f"batches={len(batches)}"
    )

    translations: Dict[int, str] = {}

    for batch_number, batch in enumerate(batches, start=1):
        print(
            f"  [GEMMA BATCH] {batch_number}/{len(batches)}"
        )

        batch_result = translate_batch_resilient(
            records=batch,
            language_code=language_code,
            language_name=language_name,
        )

        translations.update(batch_result)

    expected_indexes = set(range(len(paragraphs)))

    if set(translations) != expected_indexes:
        missing = sorted(expected_indexes - set(translations))
        extras = sorted(set(translations) - expected_indexes)

        raise GemmaTranslationError(
            "Gemma slide translation validation failed. "
            f"Missing={missing}; unexpected={extras}."
        )

    return translations


# ============================================================================
# PUBLIC PRESENTATION TRANSLATION API
# ============================================================================

def translate_presentation_gemma(
    presentation_data: Sequence[dict],
    source_language: str,
    target_language: str,
) -> List[dict]:
    """
    Translate the extracted presentation while preserving the data structure
    expected by writer.py.
    """

    # Current Gemma route assumes the extractor is providing English source
    # narration, as in the existing pipeline.
    del source_language

    try:
        language_code, language_name = GEMMA_LANGUAGE_CODES[target_language]
    except KeyError as error:
        raise ValueError(
            f"Gemma does not support target language: {target_language}"
        ) from error

    # Resolve/cache the model once at the beginning so configuration problems
    # fail early rather than halfway through the presentation.
    model_info = get_loaded_model_info()
    model_name = model_info["model_id"]

    print()
    print("=" * 70)
    print("GEMMA INDIC TRANSLATION")
    print("=" * 70)
    print(f"Model    : {model_name}")
    print(f"Language : {language_name} ({target_language})")
    print(
        "Batching  : "
        f"max {GEMMA_MAX_BATCH_PARAGRAPHS} paragraphs / "
        f"{GEMMA_MAX_BATCH_CHARS} chars"
    )
    print(
        "Tokens    : "
        f"dynamic {GEMMA_MIN_OUTPUT_TOKENS}-"
        f"{GEMMA_MAX_OUTPUT_TOKENS} output tokens"
    )
    print(
        "Timeout   : "
        f"connect {GEMMA_CONNECT_TIMEOUT}s / "
        f"read {GEMMA_READ_TIMEOUT}s"
    )
    print(
        "Reasoning : "
        f"requested={GEMMA_REASONING!r} / "
        f"default={model_info.get('reasoning_default')!r} / "
        f"allowed={model_info.get('reasoning_allowed')!r}"
    )
    print(f"Endpoint  : {LM_STUDIO_CHAT_URL}")
    print("=" * 70)

    translated_presentation: List[dict] = []
    total_slides = len(presentation_data)

    for slide_index, slide_data in enumerate(
        presentation_data,
        start=1,
    ):
        print()
        print(
            f"Gemma translating slide {slide_index}/{total_slides}"
        )

        slide_translations = translate_slide_with_gemma(
            elements=slide_data["elements"],
            language_code=language_code,
            language_name=language_name,
        )

        translated_index = 0
        translated_elements: List[dict] = []

        for element in slide_data["elements"]:
            output_paragraphs: List[dict] = []

            for paragraph in element["paragraphs"]:
                source_text = paragraph["text"]

                if source_text.strip():
                    translated_text = slide_translations[translated_index]
                    translated_index += 1
                else:
                    translated_text = ""

                output_paragraphs.append(
                    {
                        "source_text": source_text,
                        "translated_text": translated_text,
                    }
                )

            translated_elements.append(
                {
                    "shape_name": element["shape_name"],
                    "paragraphs": output_paragraphs,
                }
            )

        translated_presentation.append(
            {
                "slide_number": slide_data["slide_number"],
                "elements": translated_elements,
            }
        )

        print(
            f"[GEMMA SLIDE OK] {slide_index}/{total_slides}"
        )

    print()
    print("=" * 70)
    print("GEMMA PRESENTATION TRANSLATION COMPLETED")
    print("=" * 70)

    return translated_presentation


# ============================================================================
# OPTIONAL COMPATIBILITY WRAPPERS
# ============================================================================
# Keep these only in case some older code imports the previous function names.
# The router itself only imports translate_presentation_gemma().


def translate_with_qwen(
    english_text: str,
    language_code: str,
    language_name: str,
) -> str:
    """Backward-compatible wrapper around the new Gemma implementation."""

    text = english_text.strip()
    if not text:
        raise ValueError("English source text is empty.")

    record = {
        "index": 0,
        "text": text,
    }

    result = translate_batch_resilient(
        records=[record],
        language_code=language_code,
        language_name=language_name,
    )

    return result[0]


def translate_batch_with_qwen(
    batch_prompt: str,
    language_code: str,
    language_name: str,
) -> str:
    """
    Compatibility helper for legacy callers.

    New presentation code does not use this function. It is intentionally kept
    narrow: it sends the already-built legacy prompt as a bounded Gemma request.
    """

    if not batch_prompt.strip():
        raise ValueError("Batch translation prompt is empty.")

    model_name = get_loaded_model()

    # Legacy prompt size is unknown, so use the normal hard cap rather than
    # 8192 tokens. New code should use translate_batch_resilient() instead.
    data = send_gemma_request(
        model_name=model_name,
        prompt=batch_prompt,
        max_tokens=GEMMA_MAX_OUTPUT_TOKENS,
    )

    result = clean_result(extract_native_content(data))

    if not result:
        raise GemmaTranslationError(
            "Gemma returned an empty legacy batch translation."
        )

    return result

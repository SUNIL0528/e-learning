# api/translator.py

import torch

from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
)


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_NAME = "facebook/nllb-200-distilled-600M"

DEVICE = (
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)


# ============================================================
# GLOBAL MODEL VARIABLES
# ============================================================

tokenizer = None
model = None


# ============================================================
# LOAD NLLB
# ============================================================

def load_nllb():
    global tokenizer
    global model

    if tokenizer is not None and model is not None:
        return tokenizer, model

    print("=" * 60)
    print("Loading NLLB model")
    print("=" * 60)

    print(f"Model  : {MODEL_NAME}")
    print(f"Device : {DEVICE}")

    print("=" * 60)

    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME
    )

    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME
    )

    model = model.to(DEVICE)
    model.eval()

    print("NLLB model loaded successfully.")
    print("=" * 60)

    return tokenizer, model


# ============================================================
# TECHNICAL CONTEXT NORMALIZATION
# ============================================================

TECHNICAL_REPLACEMENTS = {
    "paint": "protective coating paint",
    "painting": "protective coating painting",
    "check": "inspect and verify",
    "checking": "inspection and verification",
    "primer": "coating primer",
    "coat": "coating layer",
    "coating": "protective coating",
    "blast": "abrasive blast",
    "blasting": "abrasive blasting",
    "holiday": "coating holiday defect",
    "film": "coating film",
    "scale": "mill scale",
}


def normalize_technical_context(text):

    if not text:
        return text

    normalized = text

    for source, replacement in TECHNICAL_REPLACEMENTS.items():

        normalized = normalized.replace(
            source,
            replacement
        )

        normalized = normalized.replace(
            source.capitalize(),
            replacement.capitalize()
        )

    return normalized


# ============================================================
# TRANSLATE TEXT WITH NLLB
# ============================================================

def translate_text_nllb(
    text,
    source_language,
    target_language
):

    if not text or not text.strip():
        return ""

    text = text.strip()

    text = normalize_technical_context(text)

    tokenizer, model = load_nllb()

    tokenizer.src_lang = source_language

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512
    )

    inputs = {
        key: value.to(DEVICE)
        for key, value in inputs.items()
    }

    forced_bos_token_id = (
        tokenizer.convert_tokens_to_ids(
            target_language
        )
    )

    with torch.no_grad():

        translated_tokens = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=512,
            num_beams=4
        )

    translated_text = tokenizer.batch_decode(
        translated_tokens,
        skip_special_tokens=True
    )[0]

    return translated_text.strip()


# ============================================================
# TRANSLATE SLIDE WITH NLLB
# ============================================================

def translate_slide_nllb(
    slide_data,
    source_language,
    target_language
):

    translated_elements = []

    for element in slide_data["elements"]:

        shape_name = element["shape_name"]

        translated_paragraphs = []

        for paragraph in element["paragraphs"]:

            source_text = paragraph["text"]

            if not source_text.strip():

                translated_text = ""

            else:

                print(
                    f"  NLLB translating: "
                    f"{source_text[:100]}"
                )

                translated_text = translate_text_nllb(
                    source_text,
                    source_language,
                    target_language
                )

            translated_paragraphs.append(
                {
                    "source_text": source_text,
                    "translated_text": translated_text
                }
            )

        translated_elements.append(
            {
                "shape_name": shape_name,
                "paragraphs": translated_paragraphs
            }
        )

    return {
        "slide_number": slide_data["slide_number"],
        "elements": translated_elements
    }


# ============================================================
# TRANSLATE PRESENTATION WITH NLLB
# ============================================================

def translate_presentation_nllb(
    presentation_data,
    source_language,
    target_language
):

    translated_presentation = []

    total_slides = len(presentation_data)

    for slide_index, slide_data in enumerate(
        presentation_data,
        start=1
    ):

        print(
            f"\nNLLB translating slide "
            f"{slide_index}/{total_slides}"
        )

        translated_slide = translate_slide_nllb(
            slide_data,
            source_language,
            target_language
        )

        translated_presentation.append(
            translated_slide
        )

    return translated_presentation
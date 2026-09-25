# ============================================================
# TRANSLATION ROUTER
# ============================================================

INDIC_LANGUAGES = {
    "tam_Taml": "Tamil",
    "hin_Deva": "Hindi",
    "tel_Telu": "Telugu",
    "kan_Knda": "Kannada",
    "mal_Mlym": "Malayalam",
    "por_BR": "Brazilian Portuguese",
}

INDIC_LANGUAGE_ALIASES = {
    "ta": "tam_Taml",
    "hi": "hin_Deva",
    "te": "tel_Telu",
    "kn": "kan_Knda",
    "ml": "mal_Mlym",
    "tamil": "tam_Taml",
    "hindi": "hin_Deva",
    "telugu": "tel_Telu",
    "kannada": "kan_Knda",
    "malayalam": "mal_Mlym",
    "pt-br": "por_BR",
    "brazilian portuguese": "por_BR",
    "portuguese (brazil)": "por_BR",
}


def translate_presentation(
    presentation_data,
    source_language,
    target_language
):

    target_language = str(target_language).strip()
    target_language = INDIC_LANGUAGE_ALIASES.get(
        target_language.lower(),
        target_language,
    )

    print()
    print("=" * 70)
    print("!!! TRANSLATION ROUTER CALLED !!!")
    print("=" * 70)

    print(f"Source language : {source_language}")
    print(f"Target language : {target_language}")

    # ========================================================
    # INDIC -> GEMMA
    # ========================================================

    if target_language in INDIC_LANGUAGES:

        language_name = INDIC_LANGUAGES[target_language]

        print()
        print("############################################################")
        print("#                  GEMMA SELECTED                         #")
        print("############################################################")
        print(f"# Language : {language_name}")
        print(f"# Code     : {target_language}")
        print("############################################################")
        print()

        from .gemma_translator import (
            translate_presentation_gemma
        )

        return translate_presentation_gemma(
            presentation_data,
            source_language,
            target_language
        )

    # ========================================================
    # EVERYTHING ELSE -> NLLB
    # ========================================================

    print()
    print("############################################################")
    print("#                   NLLB SELECTED                          #")
    print("############################################################")
    print(f"# Language : {target_language}")
    print("############################################################")
    print()

    from .translator import (
        translate_presentation_nllb
    )

    return translate_presentation_nllb(
        presentation_data,
        source_language,
        target_language
    )
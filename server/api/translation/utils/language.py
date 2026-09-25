# ============================================================
# NLLB LANGUAGE CODES
# ============================================================

# api/utils/language.py


LANGUAGES = {

    "English":
        "eng_Latn",

    "Chinese (Simplified)":
        "zho_Hans",

    "Chinese (Traditional)":
        "zho_Hant",

    "Vietnamese":
        "vie_Latn",

    "Tamil":
        "tam_Taml",

    "Hindi":
        "hin_Deva",

    "Malayalam":
        "mal_Mlym",

    "Telugu":
        "tel_Telu",

    "Kannada":
        "kan_Knda",

    "French":
        "fra_Latn",

    "German":
        "deu_Latn",

    "Spanish":
        "spa_Latn",

    "Portuguese":
        "por_Latn",

    "Italian":
        "ita_Latn",

    "Japanese":
        "jpn_Jpan",

    "Korean":
        "kor_Hang",

    "Arabic":
        "arb_Arab",

    "Russian":
        "rus_Cyrl",
}


def get_language_code(language_name):

    if language_name not in LANGUAGES:

        raise ValueError(
            f"Unsupported language: "
            f"{language_name}"
        )

    return LANGUAGES[language_name]
from pathlib import Path

from .extractor import (
    extract_presentation
)

from .translation_router import (
    translate_presentation
)

from .writer import (
    create_translated_ppt
)

from .utils.language import (
    get_language_code
)


# ============================================================
# TRANSLATE PPT
# ============================================================

def translate_ppt(
    input_ppt,
    output_ppt,
    target_language
):

    print("=" * 60)
    print("PPT TRANSLATION")
    print("=" * 60)

    # --------------------------------------------------------
    # Languages
    # --------------------------------------------------------

    source_language = "eng_Latn"

    target_language_code = (
        get_language_code(
            target_language
        )
    )

    print(
        f"Source language : "
        f"{source_language}"
    )

    print(
        f"Target language : "
        f"{target_language}"
    )

    print(
        f"NLLB code       : "
        f"{target_language_code}"
    )

    # --------------------------------------------------------
    # STEP 1
    # Extract PPT
    # --------------------------------------------------------

    print(
        "\nExtracting PPT text..."
    )

    presentation_data = (
        extract_presentation(
            input_ppt
        )
    )

    print(
        f"Found "
        f"{len(presentation_data)} "
        f"slides."
    )

    # --------------------------------------------------------
    # STEP 2
    # Translate
    # --------------------------------------------------------

    print(
        "\nTranslating..."
    )

    translated_data = (
        translate_presentation(

            presentation_data,

            source_language,

            target_language_code

        )
    )

    # --------------------------------------------------------
    # STEP 3
    # Create translated copy
    # --------------------------------------------------------

    print(
        "\nCreating translated PPT..."
    )

    create_translated_ppt(

        input_ppt,

        output_ppt,

        translated_data

    )

    print(
        "\nDONE!"
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    input_file = (
        "input/chapter_1.pptx"
    )

    # --------------------------------------------------------
    # Automatically create output filename
    # --------------------------------------------------------

    input_path = Path(
        input_file
    )

    target_language = (
        "Chinese (Simplified)"
    )

    # Make filename language-friendly

    language_suffix = (
        target_language
        .lower()
        .replace(" ", "_")
        .replace("(", "")
        .replace(")", "")
    )

    output_file = (
        Path("output")
        /
        f"{input_path.stem}_"
        f"{language_suffix}"
        f"{input_path.suffix}"
    )

    translate_ppt(

        str(input_path),

        str(output_file),

        target_language

    )

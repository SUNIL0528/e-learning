from copy import deepcopy
import re

from pptx.util import Pt
from pptx.enum.text import PP_ALIGN


# ============================================================
# CONSTANTS
# ============================================================

TRANSLATION_FONT_NAME = "Calibri"

TITLE_FONT_SIZE = 33
DESCRIPTION_FONT_SIZE = 20

DESCRIPTION_LINE_SPACING = 1.5
TITLE_LINE_SPACING = 1.0


# ============================================================
# DETERMINE TRANSLATION TYPE
# ============================================================

def get_translation_format(target_shape):
    """
    Determine the required formatting based on the
    translation shape name.

    Examples:
        TR_title
        TR_title_01
        TR_description
        TR_description_01

    Returns:
        {
            "font_name": str,
            "font_size": int,
            "line_spacing": float
        }
    """

    shape_name = target_shape.name.lower()

    # --------------------------------------------------------
    # Remove TR_ prefix
    # --------------------------------------------------------

    if shape_name.startswith("tr_"):
        shape_name = shape_name[3:]

    # --------------------------------------------------------
    # TITLE
    #
    # Matches:
    #   title
    #   title_01
    #   title_02
    # --------------------------------------------------------

    if re.match(r"^title(?:_\d+)?$", shape_name):

        return {
            "font_name": TRANSLATION_FONT_NAME,
            "font_size": TITLE_FONT_SIZE,
            "line_spacing": TITLE_LINE_SPACING
        }

    # --------------------------------------------------------
    # DESCRIPTION
    #
    # Matches:
    #   description
    #   description_01
    #   description_02
    # --------------------------------------------------------

    if re.match(r"^description(?:_\d+)?$", shape_name):

        return {
            "font_name": TRANSLATION_FONT_NAME,
            "font_size": DESCRIPTION_FONT_SIZE,
            "line_spacing": DESCRIPTION_LINE_SPACING
        }

    # --------------------------------------------------------
    # OTHER TRANSLATION BOXES
    # --------------------------------------------------------

    return {
        "font_name": TRANSLATION_FONT_NAME,
        "font_size": DESCRIPTION_FONT_SIZE,
        "line_spacing": DESCRIPTION_LINE_SPACING
    }


# ============================================================
# COPY FONT COLOR
# ============================================================

def copy_font_color(
    source_font,
    target_font
):
    """
    Copy font color from the English run.

    Font name and font size are intentionally NOT copied.
    """

    try:

        if source_font.color.type:

            target_font.color.type = (
                source_font.color.type
            )

            if source_font.color.rgb:

                target_font.color.rgb = (
                    source_font.color.rgb
                )

    except Exception:

        pass


# ============================================================
# COPY RUN STYLE
# ============================================================

def copy_run_style(
    source_run,
    target_run
):
    """
    Copy only the visual style that should be preserved
    from the English text.

    IMPORTANT:
        Font name and font size are NOT copied.

    This prevents the English font size from overriding
    the custom translation formatting.
    """

    source_font = source_run.font
    target_font = target_run.font

    # --------------------------------------------------------
    # Bold
    # --------------------------------------------------------

    if source_font.bold is not None:

        target_font.bold = (
            source_font.bold
        )

    # --------------------------------------------------------
    # Italic
    # --------------------------------------------------------

    if source_font.italic is not None:

        target_font.italic = (
            source_font.italic
        )

    # --------------------------------------------------------
    # Underline
    # --------------------------------------------------------

    if source_font.underline is not None:

        target_font.underline = (
            source_font.underline
        )

    # --------------------------------------------------------
    # Font color
    # --------------------------------------------------------

    copy_font_color(
        source_font,
        target_font
    )


# ============================================================
# COPY PARAGRAPH FORMAT
# ============================================================

def copy_paragraph_format(
    source_paragraph,
    target_paragraph
):
    """
    Copy paragraph-level formatting from English to
    translated paragraph.

    This preserves:
        - Alignment
        - Bullet structure
        - Paragraph level
        - Indentation
        - Paragraph properties
    """

    # --------------------------------------------------------
    # Alignment
    # --------------------------------------------------------

    target_paragraph.alignment = (
        source_paragraph.alignment
    )

    # --------------------------------------------------------
    # Paragraph level
    # --------------------------------------------------------

    target_paragraph.level = (
        source_paragraph.level
    )

    # --------------------------------------------------------
    # Copy paragraph XML properties
    #
    # This preserves bullet formatting and indentation.
    # --------------------------------------------------------

    try:

        source_pPr = (
            source_paragraph._p
            .get_or_add_pPr()
        )

        target_pPr = (
            target_paragraph._p
            .get_or_add_pPr()
        )

        # Remove existing paragraph properties
        for child in list(target_pPr):

            target_pPr.remove(child)

        # Copy source paragraph properties
        for child in source_pPr:

            target_pPr.append(
                deepcopy(child)
            )

    except Exception:

        pass


# ============================================================
# COPY TEXT FRAME FORMAT
# ============================================================

def copy_text_frame_format(
    source_shape,
    target_shape
):
    """
    Copy the text-frame layout from the English box.

    Preserves:
        - Word wrapping
        - Margins
        - Vertical alignment

    Does NOT copy font settings.
    """

    source_frame = (
        source_shape.text_frame
    )

    target_frame = (
        target_shape.text_frame
    )

    # --------------------------------------------------------
    # Word wrapping
    # --------------------------------------------------------

    target_frame.word_wrap = True

    # --------------------------------------------------------
    # Margins
    # --------------------------------------------------------

    target_frame.margin_left = (
        source_frame.margin_left
    )

    target_frame.margin_right = (
        source_frame.margin_right
    )

    target_frame.margin_top = (
        source_frame.margin_top
    )

    target_frame.margin_bottom = (
        source_frame.margin_bottom
    )

    # --------------------------------------------------------
    # Vertical alignment
    # --------------------------------------------------------

    try:

        target_frame.vertical_anchor = (
            source_frame.vertical_anchor
        )

    except Exception:

        pass


# ============================================================
# SET TRANSLATION FONT
# ============================================================

def set_translation_font(
    target_shape,
    font_name,
    font_size
):
    """
    Explicitly apply the translation font to every run.

    This is the important part that prevents the English
    font size from being inherited.
    """

    text_frame = (
        target_shape.text_frame
    )

    for paragraph in text_frame.paragraphs:

        for run in paragraph.runs:
            
            # ------------------------------------------------
            # Font name
            # ------------------------------------------------

            run.font.name = font_name

            # ------------------------------------------------
            # Font size
            # ------------------------------------------------

            run.font.size = Pt(
                font_size
            )


# ============================================================
# SET TRANSLATION PARAGRAPH SPACING
# ============================================================

def set_translation_paragraph_format(
    target_shape,
    line_spacing
):
    """
    Apply line spacing to every translated paragraph.

    For description boxes:
        1.5

    For title boxes:
        1.0
    """

    text_frame = (
        target_shape.text_frame
    )

    for paragraph in text_frame.paragraphs:

        paragraph.alignment = PP_ALIGN.LEFT

        # ----------------------------------------------------
        # Line spacing
        # ----------------------------------------------------

        paragraph.line_spacing = (
            line_spacing
        )


# ============================================================
# APPLY TRANSLATION FORMATTING
# ============================================================

def apply_translation_format(
    target_shape
):
    """
    Apply the final formatting rules to the translation box.
    """

    formatting = get_translation_format(
        target_shape
    )

    font_name = formatting[
        "font_name"
    ]

    font_size = formatting[
        "font_size"
    ]

    line_spacing = formatting[
        "line_spacing"
    ]

    # --------------------------------------------------------
    # Apply font
    # --------------------------------------------------------

    set_translation_font(
        target_shape,
        font_name,
        font_size
    )

    # --------------------------------------------------------
    # Apply paragraph spacing
    # --------------------------------------------------------

    set_translation_paragraph_format(
        target_shape,
        line_spacing
    )

    # --------------------------------------------------------
    # Debug information
    # --------------------------------------------------------

    print(
        f"    Translation formatting: "
        f"{target_shape.name} | "
        f"{font_name} | "
        f"{font_size} pt | "
        f"Line spacing {line_spacing}"
    )


# ============================================================
# INSERT TRANSLATED TEXT
# ============================================================

def insert_translation(
    source_shape,
    target_shape,
    translated_paragraphs
):
    """
    Insert translated paragraphs into the TR text box.

    Parameters
    ----------
    source_shape:
        English EN_* shape.

    target_shape:
        Translation TR_* shape.

    translated_paragraphs:
        List containing translated paragraph data.

    Example:
        [
            {
                "translated_text": "..."
            },
            {
                "translated_text": "..."
            }
        ]
    """

    source_frame = (
        source_shape.text_frame
    )

    target_frame = (
        target_shape.text_frame
    )

    # ========================================================
    # COPY TEXT FRAME LAYOUT
    # ========================================================

    copy_text_frame_format(
        source_shape,
        target_shape
    )

    # ========================================================
    # REMOVE EXISTING TRANSLATION
    # ========================================================

    target_frame.clear()

    # ========================================================
    # NOTHING TO TRANSLATE
    # ========================================================

    if not translated_paragraphs:

        target_frame.clear()

        return

    # ========================================================
    # CREATE TRANSLATED PARAGRAPHS
    # ========================================================

    for index, translated_data in enumerate(
        translated_paragraphs
    ):

        translated_text = (
            translated_data.get(
                "translated_text",
                ""
            )
        )

        # ----------------------------------------------------
        # First paragraph
        # ----------------------------------------------------

        if index == 0:

            target_paragraph = (
                target_frame.paragraphs[0]
            )

        # ----------------------------------------------------
        # Additional paragraphs
        # ----------------------------------------------------

        else:

            target_paragraph = (
                target_frame.add_paragraph()
            )

        # ====================================================
        # COPY ENGLISH PARAGRAPH STRUCTURE
        # ====================================================

        if index < len(
            source_frame.paragraphs
        ):

            source_paragraph = (
                source_frame.paragraphs[index]
            )

            copy_paragraph_format(
                source_paragraph,
                target_paragraph
            )

            # ------------------------------------------------
            # Add translated text
            # ------------------------------------------------

            target_run = (
                target_paragraph.add_run()
            )

            target_run.text = (
                translated_text
            )

            # ------------------------------------------------
            # Copy ONLY visual style
            #
            # Font name and font size are NOT copied.
            # ------------------------------------------------

            if source_paragraph.runs:

                source_run = (
                    source_paragraph.runs[0]
                )

                copy_run_style(
                    source_run,
                    target_run
                )

        else:

            # ------------------------------------------------
            # If there is no corresponding EN paragraph
            # ------------------------------------------------

            target_run = (
                target_paragraph.add_run()
            )

            target_run.text = (
                translated_text
            )

    # ========================================================
    # APPLY CUSTOM TRANSLATION FORMATTING
    # ========================================================

    apply_translation_format(
        target_shape
    )


# ============================================================
# END OF FILE
# ============================================================

import re
from typing import Any


SLIDE_KEY_PATTERN = re.compile(r"^slide[_-]\d+$", re.IGNORECASE)


def _slide_number(slide_id: str) -> int:
    match = re.search(r"(\d+)$", slide_id)
    return int(match.group(1)) if match else 0


def _short_summary(value: Any, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return "the main inspection concepts presented in this module"

    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary = next((sentence.strip() for sentence in sentences if len(sentence.split()) >= 5), text)
    if len(summary) <= limit:
        return summary

    shortened = summary[: limit - 1].rsplit(" ", 1)[0].rstrip(" .,;:")
    return f"{shortened}…"


def _slide_summaries(module_script: dict[str, Any]) -> list[tuple[str, str]]:
    slides = []
    for key, value in module_script.items():
        slide_id = str(key).strip()
        if not SLIDE_KEY_PATTERN.fullmatch(slide_id) or not isinstance(value, dict):
            continue
        slides.append((slide_id, _short_summary(value.get("text"))))
    return sorted(slides, key=lambda item: _slide_number(item[0]))


def _evenly_spaced(items: list[tuple[str, str]], count: int) -> list[tuple[str, str]]:
    if not items:
        return []
    if len(items) <= count:
        return items

    positions = [round(index * (len(items) - 1) / (count - 1)) for index in range(count)]
    return [items[position] for position in positions]


def generate_module_questions(module_number: int, module_script: dict[str, Any]) -> dict[str, Any]:
    """Create a deterministic question set from a module narration JSON file.

    The JSON files contain one narration entry per slide. The generated MCQs
    test recognition of the material at evenly distributed points in the
    module, while the written prompts ask the learner to explain and apply it.
    """
    slides = _slide_summaries(module_script)
    if not slides:
        return {"module": module_number, "mcqs": [], "descriptive": []}

    mcq_slides = _evenly_spaced(slides, 15)
    mcqs = []
    for index, (slide_id, correct_summary) in enumerate(mcq_slides):
        distractors = []
        for offset in range(1, len(slides) + 1):
            candidate = slides[(index * 7 + offset) % len(slides)][1]
            if candidate.casefold() != correct_summary.casefold() and candidate.casefold() not in {
                item.casefold() for item in distractors
            }:
                distractors.append(candidate)
            if len(distractors) == 3:
                break

        options = [correct_summary, *distractors]
        while len(options) < 4:
            options.append("A topic that is not covered by this slide")

        rotation = index % 4
        rotated_options = options[rotation:] + options[:rotation]
        mcqs.append(
            {
                "id": f"module-{module_number}-mcq-{index + 1}",
                "question": f"Which statement best summarizes {slide_id.replace('_', ' ')}?",
                "options": rotated_options,
                "answer": (4 - rotation) % 4,
            }
        )

    descriptive_slides = _evenly_spaced(slides, 5)
    descriptive = [
        {
            "id": f"module-{module_number}-written-{index + 1}",
            "question": (
                f"Explain the key lesson from {slide_id.replace('_', ' ')} "
                f"({summary}) in your own words. Include the relevant inspection action, "
                "risk, or practical application."
            ),
        }
        for index, (slide_id, summary) in enumerate(descriptive_slides)
    ]

    return {"module": module_number, "mcqs": mcqs, "descriptive": descriptive}


def generate_module_questions_from_bank(
    module_number: int,
    question_bank: list[dict[str, str]],
) -> dict[str, Any]:
    """Return a fixed 15-question/5-question set from supplied chapter material.

    The bank contains source questions and their trainer answers.  MCQ options
    use the source answer as the correct option and answers from other source
    questions as deterministic distractors.  The descriptive questions remain
    the original trainer prompts so they can be answered in the course's own
    terminology.
    """
    items = [
        item
        for item in question_bank
        if str(item.get("question") or "").strip()
        and str(item.get("answer") or "").strip()
    ]
    if not items:
        return {"module": module_number, "mcqs": [], "descriptive": []}

    mcq_items = _evenly_spaced(items, 15)
    mcqs = []
    for index, item in enumerate(mcq_items):
        correct_answer = str(item["answer"]).strip()
        distractors = []
        for offset in range(1, len(items) + 1):
            candidate = str(items[(index * 7 + offset) % len(items)]["answer"]).strip()
            if candidate.casefold() != correct_answer.casefold() and candidate.casefold() not in {
                value.casefold() for value in distractors
            }:
                distractors.append(candidate)
            if len(distractors) == 3:
                break

        options = [correct_answer, *distractors]
        while len(options) < 4:
            options.append("This requirement is not covered by the supplied chapter material.")

        rotation = index % 4
        mcqs.append(
            {
                "id": f"module-{module_number}-mcq-{index + 1}",
                "question": str(item["question"]).strip(),
                "options": options[rotation:] + options[:rotation],
                "answer": (4 - rotation) % 4,
            }
        )

    descriptive = [
        {
            "id": f"module-{module_number}-written-{index + 1}",
            "question": str(item["question"]).strip(),
        }
        for index, item in enumerate(_evenly_spaced(items, 5))
    ]
    return {"module": module_number, "mcqs": mcqs, "descriptive": descriptive}

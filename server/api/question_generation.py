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
    """Return 15 unique MCQs and 5 unique descriptive questions.

    The bank contains source questions and their trainer answers.  MCQ options
    use the source answer as the correct option and answers from other source
    questions as deterministic distractors.  The descriptive questions remain
    the original trainer prompts so they can be answered in the course's own
    terminology. If fewer than 20 source questions are available, derived MCQ
    prompts are created from the available question-and-answer material.
    """
    items = []
    seen_questions: set[str] = set()
    for item in question_bank:
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        question_key = re.sub(r"\W+", "", question).casefold()
        if not question or not answer or not question_key or question_key in seen_questions:
            continue
        seen_questions.add(question_key)
        items.append({"question": question, "answer": answer})

    if not items:
        return {"module": module_number, "mcqs": [], "descriptive": []}

    # Reserve five source questions for the written section first. This keeps
    # the two sections disjoint even when the bank contains exactly 20 items.
    descriptive_items = items[-5:]
    mcq_items = items[:-5]

    # A few chapters may have fewer than 20 source questions. Derive additional
    # MCQs from existing chapter material instead of repeating a prompt in both
    # sections. The wording is deliberately different so every displayed
    # question remains unique while preserving the supplied answer.
    supplement_index = 0
    while len(mcq_items) < 15:
        source = items[supplement_index % len(items)]
        supplement_index += 1
        derived_question = (
            "According to the chapter material, which statement best answers "
            f"this topic question: {source['question']}"
        )
        derived_key = re.sub(r"\W+", "", derived_question).casefold()
        if any(re.sub(r"\W+", "", item["question"]).casefold() == derived_key for item in mcq_items):
            derived_question += f" (additional question {supplement_index})"
        mcq_items.append({"question": derived_question, "answer": source["answer"]})

    # This is only a safety net for an unusually short source document. Normal
    # chapters use five original descriptive questions from the bank.
    descriptive_index = 0
    while len(descriptive_items) < 5:
        source = items[descriptive_index % len(items)]
        descriptive_index += 1
        descriptive_items.append(
            {
                "question": f"Explain the chapter material related to: {source['question']}",
                "answer": source["answer"],
            }
        )

    mcqs = []
    for index, item in enumerate(mcq_items):
        correct_answer = str(item["answer"]).strip()
        distractors = []
        answer_pool = [str(candidate["answer"]).strip() for candidate in items + mcq_items]
        for offset in range(1, len(answer_pool) + 1):
            candidate = answer_pool[(index * 7 + offset) % len(answer_pool)]
            if candidate.casefold() != correct_answer.casefold() and candidate.casefold() not in {
                value.casefold() for value in distractors
            }:
                distractors.append(candidate)
            if len(distractors) == 3:
                break

        options = [correct_answer, *distractors]
        fallback_options = [
            "This statement is not supported by the supplied chapter material.",
            "This is unrelated to the topic covered in the chapter.",
            "The chapter does not identify this as the correct requirement.",
        ]
        for fallback in fallback_options:
            if len(options) == 4:
                break
            options.append(fallback)

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
        for index, item in enumerate(descriptive_items[:5])
    ]
    return {"module": module_number, "mcqs": mcqs, "descriptive": descriptive}

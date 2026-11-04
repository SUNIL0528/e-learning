import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import { courses, ENABLED_COURSE_ID } from "@/data/platform";
import { getCurrentAuthUser } from "@/lib/auth";
import questionBank from "@/data/question_bank.json";
import "@/knowledge-check.css";

type Question = { question: string; answer: string };
type Bank = Record<string, Question[]>;
type Grade = "known" | "review";
type Progress = { grades: Record<string, Grade>; missions: Record<string, boolean> };
type MissionId = "sequence" | "weather" | "dft";

const emptyProgress = (): Progress => ({ grades: {}, missions: {} });
const course = courses.find((item) => item.id === ENABLED_COURSE_ID)!;
const chapters = course.modules.map((module, index) => ({
  id: String(index + 1),
  title:
    (
      {
        8: "Standards, Specifications and Procedures",
        9: "Health, Safety and Environment",
        10: "IMO Requirements",
      } as Record<number, string>
    )[index + 1] ?? module.title.replace(/^Module \d+ — /, ""),
}));
const missionForChapter: Record<string, MissionId> = {
  "1": "sequence",
  "5": "weather",
  "7": "dft",
};
const missionNames: Record<MissionId, string> = {
  sequence: "Arrange the inspection sequence",
  weather: "Go / No-Go inspection",
  dft: "Virtual DFT measurement",
};
const ranks = [
  { name: "Trainee", min: 0 },
  { name: "Field Observer", min: 150 },
  { name: "Coating Inspector", min: 400 },
  { name: "Lead Inspector", min: 850 },
  { name: "Master Inspector", min: 1500 },
];

function Icon({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}
function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </Icon>
  );
}
function ArrowLeft({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M19 12H5m6-6-6 6 6 6" />
    </Icon>
  );
}
function Check({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m5 12 4 4L19 6" />
    </Icon>
  );
}
function RotateCcw({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 11a9 9 0 1 1 3 7M3 4v7h7" />
    </Icon>
  );
}
function Trophy({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M8 21h8m-4-4v4M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4" />
    </Icon>
  );
}

function readProgress(key: string): Progress {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null") as Progress | null;
    if (value && typeof value.grades === "object" && typeof value.missions === "object")
      return value;
  } catch {
    /* Start fresh if local data is invalid. */
  }
  return emptyProgress();
}

export const Route = createFileRoute("/knowledge-check")({
  head: () => ({
    meta: [
      { title: "Knowledge check — HTS" },
      {
        name: "description",
        content: "Chapter-wise coating inspection practice and field missions.",
      },
    ],
  }),
  component: KnowledgeCheck,
});

function KnowledgeCheck() {
  const bank = questionBank as Bank;
  const [selectedChapter, setSelectedChapter] = useState("1");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<"path" | "practice" | "mission">("path");
  const [reviewOnly, setReviewOnly] = useState(false);
  const userId = getCurrentAuthUser()?.uid ?? "guest";
  const storageKey = `hts-knowledge-check-v1:${userId}`;
  const [progress, setProgress] = useState<Progress>(emptyProgress);

  useEffect(() => setProgress(readProgress(storageKey)), [storageKey]);

  const save = (next: Progress) => {
    setProgress(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  };
  const totalQuestions = Object.values(bank).reduce((sum, items) => sum + items.length, 0);
  const practiced = Object.keys(progress.grades).length;
  const known = Object.values(progress.grades).filter((grade) => grade === "known").length;
  const completedMissions = Object.values(progress.missions).filter(Boolean).length;
  const xp = known * 10 + (practiced - known) * 5 + completedMissions * 40;
  const rank = [...ranks].reverse().find((item) => xp >= item.min)!;
  const nextRank = ranks.find((item) => item.min > xp);
  const selected = chapters.find((chapter) => chapter.id === selectedChapter)!;
  const questions = bank[selectedChapter] ?? [];
  const activeQuestions = reviewOnly
    ? questions
        .map((item, index) => ({ ...item, index }))
        .filter((item) => progress.grades[`${selectedChapter}:${item.index}`] === "review")
    : questions.map((item, index) => ({ ...item, index }));
  const active = activeQuestions[questionIndex];

  const openPractice = (id: string, onlyReview = false) => {
    setSelectedChapter(id);
    setReviewOnly(onlyReview);
    const firstUnpracticed = (bank[id] ?? []).findIndex(
      (_, index) => !progress.grades[`${id}:${index}`],
    );
    setQuestionIndex(onlyReview ? 0 : Math.max(0, firstUnpracticed));
    setRevealed(false);
    setMode("practice");
  };
  const markAnswer = (grade: Grade) => {
    if (!active) return;
    save({
      ...progress,
      grades: { ...progress.grades, [`${selectedChapter}:${active.index}`]: grade },
    });
    setRevealed(false);
    if (questionIndex < activeQuestions.length - 1)
      setQuestionIndex((index) => (reviewOnly && grade === "known" ? index : index + 1));
    else setMode("path");
  };
  const completeMission = (id: MissionId) => {
    save({ ...progress, missions: { ...progress.missions, [id]: true } });
  };

  return (
    <main className="kc-page">
      <div className="kc-wrap">
        <div className="kc-heading">
          <div>
            <p className="kc-breadcrumb">
              <Link to="/">Dashboard</Link> <span>/</span> Knowledge check
            </p>
            <h1>Knowledge check</h1>
            <p className="kc-subtitle">
              Practice the real chapter questions. Make decisions like an inspector.
            </p>
          </div>
          <div className="kc-rank" aria-label={`${rank.name} rank, ${xp} experience points`}>
            <Trophy size={20} aria-hidden="true" />
            <div>
              <strong>{rank.name}</strong>
              <span>
                {xp} XP{nextRank ? ` · ${nextRank.min - xp} to ${nextRank.name}` : " · top rank"}
              </span>
            </div>
          </div>
        </div>

        <div className="kc-layout">
          <section className="kc-main" aria-label="Chapter practice">
            {mode === "path" ? (
              <>
                <div className="kc-progress-head">
                  <div>
                    <h2>Your practice path</h2>
                    <p>
                      {practiced} of {totalQuestions} questions practiced
                    </p>
                  </div>
                  <strong>{Math.round((practiced / totalQuestions) * 100)}%</strong>
                </div>
                <div className="kc-track">
                  <span style={{ width: `${(practiced / totalQuestions) * 100}%` }} />
                </div>
                <div className="kc-chapters">
                  {chapters.map((chapter, index) => {
                    const count = bank[chapter.id]?.length ?? 0;
                    const done = Array.from(
                      { length: count },
                      (_, i) => progress.grades[`${chapter.id}:${i}`],
                    ).filter(Boolean).length;
                    const reviewCount = Array.from(
                      { length: count },
                      (_, i) => progress.grades[`${chapter.id}:${i}`],
                    ).filter((grade) => grade === "review").length;
                    const mission = missionForChapter[chapter.id];
                    return (
                      <article className="kc-chapter" key={chapter.id}>
                        <div
                          className={`kc-node ${done === count && count ? "is-done" : ""}`}
                          aria-hidden="true"
                        >
                          {done === count && count ? <Check size={19} /> : index + 1}
                        </div>
                        <div className="kc-chapter-body">
                          <div className="kc-chapter-top">
                            <div>
                              <span className="kc-chapter-caption">Chapter {chapter.id}</span>
                              <h3>{chapter.title}</h3>
                            </div>
                            <strong>
                              {done}/{count}
                            </strong>
                          </div>
                          <div className="kc-mini-track">
                            <span style={{ width: `${(done / count) * 100}%` }} />
                          </div>
                          <div className="kc-actions">
                            <button
                              className="kc-start"
                              disabled={!count}
                              onClick={() => openPractice(chapter.id)}
                            >
                              {done ? "Continue practice" : "Start practice"}{" "}
                              <ArrowRight size={16} />
                            </button>
                            {reviewCount > 0 && (
                              <button
                                className="kc-text-button"
                                onClick={() => openPractice(chapter.id, true)}
                              >
                                Review {reviewCount} again
                              </button>
                            )}
                          </div>
                          {mission && (
                            <button
                              className="kc-mission-link"
                              onClick={() => {
                                setSelectedChapter(chapter.id);
                                setMode("mission");
                              }}
                            >
                              <span>
                                {progress.missions[mission] ? "Mission complete" : "Field mission"}
                              </span>
                              <strong>{missionNames[mission]}</strong>
                              <ArrowRight size={17} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : mode === "practice" ? (
              <>
                <button className="kc-back" onClick={() => setMode("path")}>
                  <ArrowLeft size={16} /> Practice path
                </button>
                <div className="kc-exercise-head">
                  <span>
                    Chapter {selectedChapter} · {selected.title}
                  </span>
                  <strong>
                    {questionIndex + 1} / {activeQuestions.length}
                  </strong>
                </div>
                <div className="kc-track">
                  <span
                    style={{
                      width: `${((questionIndex + 1) / Math.max(1, activeQuestions.length)) * 100}%`,
                    }}
                  />
                </div>
                {active ? (
                  <div className="kc-exercise">
                    <h2>{active.question}</h2>
                    {!revealed ? (
                      <div className="kc-reveal-zone">
                        <p>Think through your answer, then compare it with the question bank.</p>
                        <button className="kc-primary" onClick={() => setRevealed(true)}>
                          Reveal answer
                        </button>
                      </div>
                    ) : (
                      <div className="kc-answer">
                        <span>
                          {active.answer.trim().endsWith("?")
                            ? "Reference note · incomplete in source"
                            : "Reference answer"}
                        </span>
                        <p>{active.answer}</p>
                        {active.answer.trim().endsWith("?") && (
                          <p className="kc-source-warning">
                            This answer is cut off in the supplied question bank. Check the chapter
                            lesson before marking your understanding.
                          </p>
                        )}
                        <div className="kc-answer-actions">
                          <button className="kc-secondary" onClick={() => markAnswer("review")}>
                            <RotateCcw size={16} /> Review again
                          </button>
                          <button className="kc-primary" onClick={() => markAnswer("known")}>
                            <Check size={17} /> I got it
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="kc-exercise">
                    <h2>No questions to review</h2>
                    <button className="kc-primary" onClick={() => setMode("path")}>
                      Back to path
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button className="kc-back" onClick={() => setMode("path")}>
                  <ArrowLeft size={16} /> Practice path
                </button>
                <div className="kc-exercise-head">
                  <span>Chapter {selectedChapter} · Field mission</span>
                  <strong>
                    {missionForChapter[selectedChapter] &&
                    progress.missions[missionForChapter[selectedChapter]!]
                      ? "Completed"
                      : "+40 XP"}
                  </strong>
                </div>
                {missionForChapter[selectedChapter] === "sequence" && (
                  <SequenceMission onComplete={() => completeMission("sequence")} />
                )}
                {missionForChapter[selectedChapter] === "weather" && (
                  <WeatherMission onComplete={() => completeMission("weather")} />
                )}
                {missionForChapter[selectedChapter] === "dft" && (
                  <DftMission onComplete={() => completeMission("dft")} />
                )}
              </>
            )}
          </section>
          <aside className="kc-side" aria-label="Your progress">
            <h2>Inspector record</h2>
            <div className="kc-stat">
              <strong>{xp}</strong>
              <span>Experience points</span>
            </div>
            <div className="kc-stat">
              <strong>{known}</strong>
              <span>Answers understood</span>
            </div>
            <div className="kc-stat">
              <strong>{completedMissions}/3</strong>
              <span>Field missions</span>
            </div>
            <p>
              Earn XP when you check an answer for the first time or complete a field mission. Your
              progress stays on this device.
            </p>
            <Link
              to="/courses/$courseId"
              params={{ courseId: ENABLED_COURSE_ID }}
              className="kc-course-link"
            >
              Back to course <ArrowRight size={16} />
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

const initialSequence = [
  "Record final inspection",
  "Apply the coating",
  "Check ambient conditions",
  "Prepare and assess the surface",
];
const correctSequence = [
  "Check ambient conditions",
  "Prepare and assess the surface",
  "Apply the coating",
  "Record final inspection",
];

function SequenceMission({ onComplete }: { onComplete: () => void }) {
  const [cards, setCards] = useState(initialSequence);
  const [message, setMessage] = useState("");
  const move = (from: number, to: number) => {
    const next = [...cards];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setCards(next);
    setMessage("");
  };
  return (
    <div className="kc-exercise kc-mission">
      <h2>Arrange the inspection sequence</h2>
      <p>Put these project activities in a sensible order. Drag cards, or use the move buttons.</p>
      <div className="kc-sequence">
        {cards.map((card, index) => (
          <div
            key={card}
            className="kc-sequence-card"
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData("text/plain"));
              if (Number.isInteger(from) && from >= 0 && from < cards.length) move(from, index);
            }}
          >
            <span>{card}</span>
            <div>
              <button
                disabled={index === 0}
                aria-label={`Move ${card} up`}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                disabled={index === cards.length - 1}
                aria-label={`Move ${card} down`}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="kc-primary"
        onClick={() => {
          const correct = cards.every((card, index) => card === correctSequence[index]);
          setMessage(
            correct
              ? "Correct. Confirm conditions and surface readiness before application, then document the final result."
              : "Not quite. Check what must be verified before coating is applied.",
          );
          if (correct) onComplete();
        }}
      >
        Check sequence
      </button>
      {message && (
        <p className="kc-feedback" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function WeatherMission({ onComplete }: { onComplete: () => void }) {
  const [choice, setChoice] = useState<"go" | "no-go" | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <div className="kc-exercise kc-mission">
      <h2>Can coating proceed?</h2>
      <p>Read the project condition and make the inspection call.</p>
      <div className="kc-readings">
        <div>
          <strong>30°C</strong>
          <span>Air</span>
        </div>
        <div>
          <strong>50%</strong>
          <span>Relative humidity</span>
        </div>
        <div>
          <strong>20°C</strong>
          <span>Steel</span>
        </div>
        <div>
          <strong>18°C</strong>
          <span>Dew point</span>
        </div>
      </div>
      <p className="kc-spec">
        Project requirement: steel temperature at least 3°C above dew point; relative humidity at or
        below 85%.
      </p>
      <div className="kc-choice">
        <button
          className={choice === "go" ? "selected" : ""}
          onClick={() => {
            setChoice("go");
            setChecked(false);
          }}
        >
          Go — proceed
        </button>
        <button
          className={choice === "no-go" ? "selected" : ""}
          onClick={() => {
            setChoice("no-go");
            setChecked(false);
          }}
        >
          No-go — hold work
        </button>
      </div>
      <button
        className="kc-primary"
        disabled={!choice}
        onClick={() => {
          setChecked(true);
          if (choice === "no-go") onComplete();
        }}
      >
        Check decision
      </button>
      {checked && (
        <p className="kc-feedback" role="status">
          {choice === "no-go"
            ? "Correct. Steel is only 2°C above dew point, below the project's 3°C margin. Hold work and recheck conditions."
            : "Hold work. The 50% RH passes, but the steel is only 2°C above dew point; the project requires 3°C."}
        </p>
      )}
    </div>
  );
}

const dftReadings = [198, 205, 172, 214, 183];
function DftMission({ onComplete }: { onComplete: () => void }) {
  const [measured, setMeasured] = useState<number[]>([]);
  const [average, setAverage] = useState("");
  const [decision, setDecision] = useState<"pass" | "hold" | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = Number(average) === 194.4 && decision === "hold";
  return (
    <div className="kc-exercise kc-mission">
      <h2>Measure the coating</h2>
      <p>
        Place the gauge on all five locations. Calculate the average DFT and decide whether the area
        passes.
      </p>
      <p className="kc-spec">
        Project requirement: average 180–240 μm, with no individual reading below 180 μm.
      </p>
      <div className="kc-steel" aria-label="Five simulated gauge locations">
        {dftReadings.map((reading, index) => (
          <button
            key={index}
            className={measured.includes(index) ? "measured" : ""}
            onClick={() =>
              setMeasured((current) => (current.includes(index) ? current : [...current, index]))
            }
            aria-label={`Measure location ${index + 1}`}
          >
            {measured.includes(index) ? `${reading} μm` : `Measure ${index + 1}`}
          </button>
        ))}
      </div>
      <div className="kc-dft-form">
        <label>
          Average DFT (μm)
          <input
            inputMode="decimal"
            type="number"
            step="0.1"
            value={average}
            onChange={(event) => {
              setAverage(event.target.value);
              setChecked(false);
            }}
            placeholder="e.g. 194.4"
          />
        </label>
        <div className="kc-choice">
          <button
            className={decision === "pass" ? "selected" : ""}
            onClick={() => {
              setDecision("pass");
              setChecked(false);
            }}
          >
            Pass
          </button>
          <button
            className={decision === "hold" ? "selected" : ""}
            onClick={() => {
              setDecision("hold");
              setChecked(false);
            }}
          >
            Hold for correction
          </button>
        </div>
      </div>
      <button
        className="kc-primary"
        disabled={measured.length < 5 || !average || !decision}
        onClick={() => {
          setChecked(true);
          if (correct) onComplete();
        }}
      >
        Check readings
      </button>
      {checked && (
        <p className="kc-feedback" role="status">
          {correct
            ? "Correct. The average is 194.4 μm, but location 3 is 172 μm. It fails the individual minimum, so hold for correction."
            : "Recheck the arithmetic and the individual minimum. The average is 194.4 μm; one location is below 180 μm."}
        </p>
      )}
    </div>
  );
}

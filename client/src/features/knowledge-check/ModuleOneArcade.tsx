import { lazy, Suspense, useEffect, useState } from "react";
import {
  documentQuestions,
  moduleOneGames,
  roleQuestions,
  type ChoiceItem,
  type GameId,
} from "./module-one-data";
import { FlashcardDeck3D } from "./FlashcardDeck3D";
import { DefectLab3D } from "./DefectLab3D";
import {
  playCorrect,
  playWrong,
  playClick,
  playCombo,
  playLevelUp,
  isSoundEnabled,
  setSoundEnabled,
} from "./audio";
import { triggerConfetti } from "./confetti";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";

const ThreeKnowledgeGame = lazy(() =>
  import("./ThreeKnowledgeGames").then((module) => ({ default: module.ThreeKnowledgeGame })),
);

type Answer = { choice: string; correct: boolean };
export type GameRecord = {
  attempts: number;
  completed: boolean;
  best: number;
  answers: Answer[];
  order: string[];
  matches: Record<string, string>;
  ratings: Record<string, string>;
  cardIndex: number;
  updatedAt: string;
};

const emptyRecord = (): GameRecord => ({
  attempts: 1,
  completed: false,
  best: 0,
  answers: [],
  order: ["Report", "Observation", "Document", "Assessment"],
  matches: {},
  ratings: {},
  cardIndex: 0,
  updatedAt: "",
});

const keyFor = (userId: string, gameId: GameId) => `hts-module-one-practice-v1:${userId}:${gameId}`;

export function readGameRecord(userId: string, gameId: GameId): GameRecord {
  if (typeof window === "undefined") return emptyRecord();
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(keyFor(userId, gameId)) || "null",
    ) as Partial<GameRecord> | null;
    if (saved && typeof saved === "object") return { ...emptyRecord(), ...saved };
  } catch {
    /* Invalid local practice state starts fresh. */
  }
  return emptyRecord();
}

function useGameRecord(userId: string, gameId: GameId) {
  const [record, setRecord] = useState<GameRecord>(() => readGameRecord(userId, gameId));
  useEffect(() => setRecord(readGameRecord(userId, gameId)), [userId, gameId]);
  const save = (next: GameRecord) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setRecord(updated);
    window.localStorage.setItem(keyFor(userId, gameId), JSON.stringify(updated));
  };
  const replay = () => {
    playClick();
    save({ ...emptyRecord(), attempts: record.attempts + 1, best: record.best });
  };
  return { record, save, replay };
}

function ChoiceGame({
  items,
  record,
  save,
  userId,
  isDocumentGame = false,
}: {
  items: ChoiceItem[];
  record: GameRecord;
  save: (next: GameRecord) => void;
  userId: string;
  isDocumentGame?: boolean;
}) {
  const [combo, setCombo] = useState(0);
  const step = Math.min(record.cardIndex, items.length - 1);
  const item = items[step]!;
  const answer = record.answers[step];
  const finished = record.completed && record.cardIndex >= items.length;
  const correctCount = record.answers.filter((entry) => entry.correct).length;

  const choose = (choice: string) => {
    if (answer) return;
    const isCorrect = item.accepted.includes(choice);
    const nextAnswers = [...record.answers, { choice, correct: isCorrect }];

    if (isCorrect) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      if (nextCombo >= 3) {
        playCombo(nextCombo);
      } else {
        playCorrect();
      }
      awardXp(userId, 25, "Prompt answered correctly");
      recordStreak(userId, true);
    } else {
      setCombo(0);
      playWrong();
      recordStreak(userId, false);
    }

    save({
      ...record,
      answers: nextAnswers,
      best: Math.max(record.best, nextAnswers.filter((entry) => entry.correct).length),
    });
  };

  const nextStep = () => {
    playClick();
    const nextIdx = step + 1;
    const isNowDone = nextIdx >= items.length;
    if (isNowDone) {
      triggerConfetti(0.5, 0.4, 80);
      playLevelUp();
      if (isDocumentGame && correctCount + (answer?.correct ? 1 : 0) === items.length) {
        unlockAchievement(userId, "doc_detective");
      }
      unlockAchievement(userId, "first_game");
    }
    save({ ...record, cardIndex: nextIdx, completed: isNowDone });
  };

  if (finished)
    return (
      <div className="arc-debrief" role="status">
        <div className="arc-debrief-badge">🏆 Practice Complete</div>
        <h3>
          {correctCount} of {items.length} Prompts Mastered
        </h3>
        <p>
          You demonstrated solid coating inspection recall. Technical explanations are based on
          applicable project specifications and ITP criteria. Replay anytime to beat your record!
        </p>
        <div className="arc-debrief-actions">
          <button
            type="button"
            className="arc-button"
            onClick={() => save({ ...record, cardIndex: 0, answers: [] })}
          >
            🔄 Practice Again
          </button>
        </div>
      </div>
    );

  return (
    <div className="arc-play">
      <div className="arc-progress-bar-row">
        <div className="arc-progress">
          <span style={{ width: `${(record.answers.length / items.length) * 100}%` }} />
        </div>
        {combo >= 2 && (
          <span className="arc-combo-badge" role="status">
            🔥 {combo} STREAK
          </span>
        )}
      </div>

      <p className="arc-step">
        Prompt {step + 1} of {items.length} · {item.slides}
      </p>
      <h3>{item.prompt}</h3>

      <div className="arc-options">
        {item.options.map((option) => (
          <button
            type="button"
            key={option}
            disabled={Boolean(answer)}
            className={`arc-option-btn ${
              answer
                ? item.accepted.includes(option)
                  ? "is-accepted"
                  : answer.choice === option
                    ? "is-wrong"
                    : ""
                : ""
            }`}
            onClick={() => choose(option)}
          >
            <span>{option}</span>
            <span className="arc-opt-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>

      {answer && (
        <div className="arc-feedback" role="status">
          <strong>
            {answer.correct ? "✓ Correct Decision (+25 XP)" : "⚠️ Review Specification"}
          </strong>
          <p>{item.explanation}</p>
          {!answer.correct && (
            <p className="arc-answer-note">Reference answer: {item.accepted.join(" or ")}</p>
          )}
          <button type="button" className="arc-button" onClick={nextStep}>
            {step + 1 >= items.length ? "View debrief" : "Next prompt"} →
          </button>
        </div>
      )}
    </div>
  );
}

const phases = ["Observation", "Assessment", "Document", "Report"];
const phaseActions = [
  ["Monitor contractor activity", "Observation"],
  ["Inspect and compare results with approved criteria", "Assessment"],
  ["Record observations and assessment", "Document"],
  ["Route the report through the approved workflow", "Report"],
] as const;

function OadrGame({
  record,
  save,
  userId,
}: {
  record: GameRecord;
  save: (next: GameRecord) => void;
  userId: string;
}) {
  const [message, setMessage] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const ordered = record.order.every((phase, index) => phase === phases[index]);
  const matchCount = phaseActions.filter(
    ([action, phase]) => record.matches[action] === phase,
  ).length;

  const move = (from: number, to: number) => {
    playClick();
    const order = [...record.order];
    order.splice(to, 0, order.splice(from, 1)[0]!);
    const sequenceCorrect = order.every((phase, index) => phase === phases[index]);
    if (sequenceCorrect && !ordered) {
      playCorrect();
      awardXp(userId, 30, "OADR sequence ordered");
    }
    save({ ...record, order, completed: sequenceCorrect && matchCount === phaseActions.length });
    setMessage("");
  };

  const handleMatch = (action: string, choice: string, expected: string) => {
    playClick();
    const isCorrect = choice === expected;
    if (isCorrect) {
      playCorrect();
      awardXp(userId, 15, "OADR match");
    } else {
      playWrong();
    }
    const matches = { ...record.matches, [action]: choice };
    const done = phaseActions.every(([prompt, exp]) => matches[prompt] === exp) && ordered;
    if (done) {
      triggerConfetti(0.5, 0.4, 75);
      playLevelUp();
    }
    save({
      ...record,
      matches,
      completed: done,
      best: Math.max(
        record.best,
        phaseActions.filter(([prompt, exp]) => matches[prompt] === exp).length,
      ),
    });
  };

  return (
    <div className="arc-play">
      <div className="arc-progress">
        <span
          style={{ width: `${Number(ordered) * 40 + (matchCount / phaseActions.length) * 60}%` }}
        />
      </div>
      <p className="arc-step">
        Slides 5, 21, 35–36 ·{" "}
        {record.completed
          ? "Complete"
          : ordered
            ? "Step 2: Match field actions"
            : "Step 1: Put the phases in order"}
      </p>
      <h3>Make the evidence chain.</h3>
      <p className="arc-instruction">
        Sequence the four core phases of inspection from initial field observation to final report
        release. Drag cards or use arrow buttons.
      </p>

      {/* 3D-styled Evidence Conduit Pipeline */}
      <div className="arc-sequence">
        {record.order.map((phase, index) => (
          <div
            key={phase}
            className={`arc-sequence-card ${ordered ? "is-correct" : ""}`}
            draggable
            onDragStart={() => setDragged(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null) move(dragged, index);
              setDragged(null);
            }}
          >
            <div className="arc-seq-num">{index + 1}</div>
            <span className="arc-seq-title">{phase}</span>
            <div className="arc-seq-arrows">
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Move ${phase} up`}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === record.order.length - 1}
                aria-label={`Move ${phase} down`}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="arc-button"
        onClick={() => {
          if (ordered) {
            playCorrect();
            setMessage(
              "Correct! An observation is assessed against criteria, documented, then reported.",
            );
          } else {
            playWrong();
            setMessage("Check sequence: What must happen before a report can be issued?");
          }
        }}
      >
        Check sequence
      </button>

      {message && (
        <p className="arc-feedback" role="status">
          {message}
        </p>
      )}

      {ordered && (
        <div className="arc-match">
          <h4>Match each site action to its phase</h4>
          {phaseActions.map(([action, phase]) => (
            <div key={action} className="arc-match-row">
              <span>{action}</span>
              <div role="group" aria-label={`Phase for ${action}`}>
                {phases.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={record.matches[action] === choice}
                    className={record.matches[action] === choice ? "is-selected" : ""}
                    onClick={() => handleMatch(action, choice, phase)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <small>
                {record.matches[action] &&
                  (record.matches[action] === phase ? "✓ Correct" : "Try another phase")}
              </small>
            </div>
          ))}
        </div>
      )}

      {record.completed && (
        <div className="arc-debrief" role="status">
          <strong>Evidence chain complete! (+50 XP)</strong>
          <p>
            Observation → Assessment → Document → Report. All evidence is securely traced from field
            measurement to client authorization.
          </p>
        </div>
      )}
    </div>
  );
}

export function ModuleOneArcade({
  gameId,
  userId,
  onBack,
}: {
  gameId: GameId;
  userId: string;
  onBack: () => void;
}) {
  const game = moduleOneGames.find((entry) => entry.id === gameId)!;
  const { record, save, replay } = useGameRecord(userId, gameId);
  const [showHelp, setShowHelp] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClick();
  };

  return (
    <section className="arc-shell" aria-label={game.title}>
      {/* Top Arcade Navigation & Sound Control */}
      <div className="arc-toolbar">
        <button type="button" className="arc-text-button" onClick={onBack}>
          ← Back to Arcade Lobby
        </button>
        <div className="arc-toolbar-right">
          <button
            type="button"
            className="arc-sound-btn"
            onClick={toggleSound}
            aria-label={soundOn ? "Mute arcade sound effects" : "Unmute arcade sound effects"}
          >
            {soundOn ? "🔊 Sound ON" : "🔇 Sound OFF"}
          </button>
          <button
            type="button"
            className="arc-text-button"
            onClick={() => setShowHelp(!showHelp)}
            aria-expanded={showHelp}
          >
            Help
          </button>
          <button type="button" className="arc-text-button" onClick={replay}>
            Replay
          </button>
        </div>
      </div>

      <div className="arc-heading">
        <div className="arc-heading-top">
          <span className="arc-kind-badge">{game.kind}</span>
          <span className="arc-minutes-pill">{game.minutes}</span>
        </div>
        <h2>{game.title}</h2>
        <p className="arc-objective-text">{game.objective}</p>
        <span className="arc-slides-ref">
          {game.slides} · {game.review}
        </span>
      </div>

      {showHelp && (
        <div className="arc-help" role="note">
          Interact with buttons, 3D scenes, or keyboard shortcuts. Every activity saves progress
          locally on this device and awards XP toward your Coating Inspector Rank!
        </div>
      )}

      {/* Games Switcher */}
      {gameId === "role-match" && (
        <ChoiceGame items={roleQuestions} record={record} save={save} userId={userId} />
      )}
      {gameId === "documents" && (
        <ChoiceGame
          items={documentQuestions}
          record={record}
          save={save}
          userId={userId}
          isDocumentGame
        />
      )}
      {gameId === "oadr" && <OadrGame record={record} save={save} userId={userId} />}

      {/* 3D Animated Flashcards */}
      {gameId === "vault" && <FlashcardDeck3D record={record} save={save} userId={userId} />}

      {/* 3D Coating Defect Lab */}
      {gameId === "defect-lab" && <DefectLab3D record={record} save={save} userId={userId} />}

      {/* 3D Site & Tool Room Games */}
      {(gameId === "first-day" || gameId === "tool-room") && (
        <Suspense
          fallback={
            <div className="kc-loading" role="status">
              Preparing 3D simulation environment…
            </div>
          }
        >
          <ThreeKnowledgeGame
            key={record.attempts}
            gameId={gameId}
            record={record}
            save={save}
            userId={userId}
          />
        </Suspense>
      )}

      <p className="arc-local-note">
        Interactive LMS Practice · Saved locally · Attempt #{record.attempts}
      </p>
    </section>
  );
}

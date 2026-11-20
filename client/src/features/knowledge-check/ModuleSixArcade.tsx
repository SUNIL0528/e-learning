import { useEffect, useMemo, useState } from "react";
import {
  decodeTrainingTip,
  familyCards,
  ingredientPairs,
  moduleSixGames,
  moduleSixSeed,
  processDecks,
  slideLabel,
  specialtyPairs,
  type ModuleSixGameId,
} from "./module-six-data";
import {
  freshRecord,
  readModuleSixRecord,
  storageKey,
  type PracticeRecord,
} from "./module-six-progress";
import { ThreeSpraySimulator } from "./ThreeSpraySimulator";
import { ThreePfpFlameLab } from "./ThreePfpFlameLab";
import { VaultSixDeck3D } from "./VaultSixDeck3D";
import {
  playCorrect,
  playWrong,
  playClick,
  playLevelUp,
  isSoundEnabled,
  setSoundEnabled,
} from "./audio";
import { triggerConfetti } from "./confetti";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";
import "./module-six.css";

function usePractice(userId: string, id: ModuleSixGameId) {
  const [record, setRecord] = useState(() => readModuleSixRecord(userId, id));
  useEffect(() => setRecord(readModuleSixRecord(userId, id)), [userId, id]);
  const update = (change: Partial<PracticeRecord>) => {
    const next = { ...record, ...change, updatedAt: new Date().toISOString() };
    setRecord(next);
    localStorage.setItem(storageKey(userId, id), JSON.stringify(next));
  };
  return {
    record,
    update,
    replay: () => {
      playClick();
      update(freshRecord());
    },
  };
}

function ReviewNotice() {
  return (
    <div className="m6-review" role="note">
      <strong>Interactive Chapter 6 Training Lab</strong>
      <span>
        Practice inspection concepts, operate 3D spray & fire simulators, and earn XP toward your
        Inspector certification rank.
      </span>
    </div>
  );
}

function Source({ slides }: { slides: number[] }) {
  return <small className="m6-source">Source: {slideLabel(slides)} · Module 6 Curriculum</small>;
}

function Feedback({ children }: { children: React.ReactNode }) {
  return (
    <div className="m6-feedback" role="status">
      {children}
    </div>
  );
}

// G02 Match Component
function MatchGame({
  pairs,
  slides,
  record,
  update,
  userId,
}: {
  pairs: { left: string; right: string }[];
  slides: number[];
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState(
    "Choose a term, then its function. Every card is keyboard and touch accessible.",
  );
  const rightCards = useMemo(
    () => [...pairs].sort((a, b) => a.right.localeCompare(b.right)),
    [pairs],
  );
  const count = pairs.filter((pair) => record.answers[pair.left] === pair.right).length;

  const match = (right: string) => {
    if (!chosen) {
      playClick();
      setMessage("Choose a term first.");
      return;
    }
    const pair = pairs.find((item) => item.left === chosen)!;
    if (pair.right === right) {
      playCorrect();
      awardXp(userId, 15, `Matched: ${chosen}`);
      recordStreak(userId, true);
      const answers = { ...record.answers, [chosen]: right };
      const done = pairs.every((item) => answers[item.left] === item.right);
      if (done) {
        triggerConfetti(0.5, 0.4, 75);
        playLevelUp();
        unlockAchievement(userId, "chemistry_scholar");
      }
      update({ answers, completed: done });
      setMessage(`✓ ${chosen}: ${right}. (+15 XP)`);
      setChosen("");
    } else {
      playWrong();
      recordStreak(userId, false);
      setMessage(`${chosen} does not match that function. Review its role and try again.`);
    }
  };

  return (
    <>
      <div className="m6-meter">
        <span>
          {count} / {pairs.length} pairs matched
        </span>
        <span style={{ width: `${(count / pairs.length) * 100}%` }} />
      </div>
      <div className="m6-match-grid" data-selection={Boolean(chosen)}>
        <div>
          <h3>Terms</h3>
          {pairs.map((pair) => (
            <button
              type="button"
              key={pair.left}
              className={`m6-card ${chosen === pair.left ? "is-selected" : ""} ${record.answers[pair.left] ? "is-done" : ""}`}
              disabled={Boolean(record.answers[pair.left])}
              aria-pressed={chosen === pair.left}
              onClick={() => {
                playClick();
                setChosen(pair.left);
              }}
            >
              {pair.left}
              <span>
                {record.answers[pair.left]
                  ? "✓ Matched"
                  : chosen === pair.left
                    ? "Selected · choose function ➔"
                    : "Tap to select"}
              </span>
            </button>
          ))}
        </div>
        <div>
          <h3>Functions</h3>
          {chosen && (
            <button
              type="button"
              className="m6-change-term"
              onClick={() => {
                playClick();
                setChosen("");
              }}
            >
              ← Change term: {chosen}
            </button>
          )}
          {rightCards.map((pair) => (
            <button
              type="button"
              key={pair.right}
              className={`m6-card ${record.answers[pair.left] ? "is-done" : ""}`}
              disabled={Boolean(record.answers[pair.left])}
              onClick={() => match(pair.right)}
            >
              {pair.right}
            </button>
          ))}
        </div>
      </div>
      <Feedback>{message}</Feedback>
      <Source slides={slides} />
    </>
  );
}

const ingredientSort = [
  { id: "family", prompt: "Which group primarily defines the generic coating family?", answer: "Binder", slides: [6, 7] },
  { id: "opacity", prompt: "Which group supplies colour and hiding power?", answer: "Pigment", slides: [8] },
  { id: "viscosity", prompt: "Which group may control application viscosity and evaporate?", answer: "Solvent", slides: [9] },
  { id: "settling", prompt: "Which group can target anti-settling behaviour?", answer: "Additive", slides: [10] },
  { id: "body", prompt: "Which group contributes body and reinforcement?", answer: "Extender", slides: [11] },
  { id: "film", prompt: "Which group helps hold a cohesive film together?", answer: "Binder", slides: [6] },
  { id: "hiding", prompt: "Which group is associated with hiding power?", answer: "Pigment", slides: [8] },
  { id: "vehicle", prompt: "Which group can be part of the application vehicle?", answer: "Solvent", slides: [9, 13] },
  { id: "targeted", prompt: "Which group is used for a targeted film property?", answer: "Additive", slides: [10] },
  { id: "fill", prompt: "Which group is associated with film body?", answer: "Extender", slides: [11] },
  { id: "epoxy", prompt: "Epoxy belongs to which ingredient category?", answer: "Binder", slides: [6, 7] },
  { id: "phosphate", prompt: "Zinc phosphate belongs to which ingredient category?", answer: "Pigment", slides: [8] },
];

function IngredientGame({
  record,
  update,
  userId,
}: {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const [mode, setMode] = useState<"learn" | "match" | "sort">("match");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [message, setMessage] = useState(
    "Choose the ingredient category that supports the stated function.",
  );
  const pair = ingredientPairs[cardIndex]!;
  const scenario = ingredientSort.find((item) => !record.answers[`sort:${item.id}`]);

  const sort = (answer: string) => {
    if (!scenario) return;
    if (answer !== scenario.answer) {
      playWrong();
      recordStreak(userId, false);
      setMessage(
        `Consider primary function. ${scenario.answer} is the category described on ${slideLabel(scenario.slides)}.`,
      );
      return;
    }
    playCorrect();
    awardXp(userId, 20, `Ingredient category: ${answer}`);
    recordStreak(userId, true);
    const answers = { ...record.answers, [`sort:${scenario.id}`]: answer };
    const allDone = ingredientSort.every((item) => answers[`sort:${item.id}`]);
    if (allDone) {
      triggerConfetti(0.5, 0.4, 75);
      playLevelUp();
      unlockAchievement(userId, "chemistry_scholar");
    }
    update({ answers, completed: allDone });
    setMessage(`✓ ${answer} is correct! (+20 XP).`);
  };

  return (
    <>
      <div className="m6-tabs" role="group" aria-label="Ingredient activity mode">
        {(["learn", "match", "sort"] as const).map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={mode === item}
            onClick={() => {
              playClick();
              setMode(item);
              setFlipped(false);
            }}
          >
            {item === "learn" ? "Flip & Learn" : item === "match" ? "Memory Pair" : "Function Sort"}
          </button>
        ))}
      </div>
      {mode === "match" && (
        <MatchGame
          pairs={ingredientPairs}
          slides={[5, 6, 8, 9, 10, 11, 13, 14]}
          record={record}
          update={update}
          userId={userId}
        />
      )}
      {mode === "learn" && (
        <>
          <button
            type="button"
            className={`m6-flashcard ${flipped ? "is-flipped" : ""}`}
            onClick={() => {
              playClick();
              setFlipped(!flipped);
            }}
          >
            <span>
              INGREDIENT {cardIndex + 1} / {ingredientPairs.length}
            </span>
            <strong>{flipped ? pair.right : pair.left}</strong>
            <small>
              {flipped ? "Function revealed · tap to turn back" : "Tap to reveal the function"}
            </small>
          </button>
          <div className="m6-vault-actions">
            <button
              type="button"
              className="m6-outline"
              onClick={() => {
                playClick();
                setCardIndex((cardIndex + ingredientPairs.length - 1) % ingredientPairs.length);
                setFlipped(false);
              }}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="m6-primary"
              onClick={() => {
                playClick();
                setCardIndex((cardIndex + 1) % ingredientPairs.length);
                setFlipped(false);
              }}
            >
              Next card →
            </button>
          </div>
          <Source slides={[5, 6, 8, 9, 10, 11, 13, 14]} />
        </>
      )}
      {mode === "sort" &&
        (scenario ? (
          <>
            <div className="m6-task">
              <span>
                FUNCTION SORT /{" "}
                {Object.keys(record.answers).filter((key) => key.startsWith("sort:")).length + 1} OF{" "}
                {ingredientSort.length}
              </span>
              <h3>{scenario.prompt}</h3>
              <div className="m6-choice-grid">
                {["Binder", "Pigment", "Solvent", "Additive", "Extender"].map((item) => (
                  <button type="button" key={item} onClick={() => sort(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <Feedback>{message}</Feedback>
            <Source slides={scenario.slides} />
          </>
        ) : (
          <div className="m6-complete">
            ✓ All 12 functions sorted! You mastered coating ingredient roles (+50 XP).
          </div>
        ))}
    </>
  );
}

// G13 3D Spray Tip Decoder
function TipGame({
  record,
  update,
  userId,
}: {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const cases = moduleSixSeed.numericCases.tipCodes;
  const [index, setIndex] = useState(0);
  const [angle, setAngle] = useState("");
  const [orifice, setOrifice] = useState("");
  const [message, setMessage] = useState(
    "Select the approximate fan angle and orifice diameter for the tip. Use the 3D spray simulator below to test atomization.",
  );
  const item = cases[index]!;
  const decoded = decodeTrainingTip(item.code)!;
  const options = index === 0 ? ["50°", "30°", "17°"] : ["30°", "50°", "11°"];
  const sizes =
    index === 0 ? ["0.017 in", "0.011 in", "0.050 in"] : ["0.011 in", "0.017 in", "0.030 in"];

  const check = () => {
    if (angle === `${decoded.angle}°` && orifice === `${decoded.orifice.toFixed(3)} in`) {
      playCorrect();
      awardXp(userId, 30, `Decoded tip: ${item.code}`);
      recordStreak(userId, true);
      const answers = { ...record.answers, [item.code]: "decoded" };
      const allDone = cases.every((entry) => answers[entry.code]);
      if (allDone) {
        triggerConfetti(0.5, 0.4, 85);
        playLevelUp();
        unlockAchievement(userId, "tip_master");
      }
      update({ answers, completed: allDone });
      setMessage(
        `✓ Tip ${item.code} correctly decoded! Angle: ~${decoded.angle}° · Orifice: ${decoded.orifice.toFixed(3)}". (+30 XP)`,
      );
    } else {
      playWrong();
      recordStreak(userId, false);
      setMessage(
        "Recheck the standard rule: first digit × 10 = fan angle at 30 cm; last two digits = thousandths of an inch orifice.",
      );
    }
  };

  return (
    <>
      <div className="m6-tip-code">
        <span>{item.code[0]}</span>
        <span>{item.code.slice(1)}</span>
        <div className="m6-tip-label-wrap">
          <strong>Tip Model: {item.code}</strong>
          <small>Reversible Carbide Spray Tip</small>
        </div>
      </div>

      {/* Embedded 3D Airless Spray Atomization Simulator */}
      <ThreeSpraySimulator
        tipCode={item.code}
        fanAngle={decoded.angle}
        orifice={decoded.orifice}
        onTestSpray={() => {
          awardXp(userId, 10, "Tested spray atomization");
        }}
      />

      <div className="m6-choice-grid" style={{ marginTop: "16px" }}>
        <fieldset>
          <legend>Approximate Fan Angle</legend>
          {options.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={angle === value}
              onClick={() => {
                playClick();
                setAngle(value);
              }}
            >
              {value}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Orifice Diameter</legend>
          {sizes.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={orifice === value}
              onClick={() => {
                playClick();
                setOrifice(value);
              }}
            >
              {value}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="m6-tip-action-row">
        <button type="button" className="m6-primary" onClick={check}>
          ✓ Decode Tip & Verify
        </button>
        <button
          type="button"
          className="m6-outline"
          onClick={() => {
            playClick();
            setIndex((index + 1) % cases.length);
            setAngle("");
            setOrifice("");
          }}
        >
          Next Tip Model →
        </button>
      </div>

      <Feedback>{message}</Feedback>
      <Source slides={[107, 110, 111, 112, 114]} />
    </>
  );
}

// G09 PDS Escape Room
const trainingPds = moduleSixSeed.fictionalTrainingPDS;
const clockLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function PdsGame({
  record,
  update,
  userId,
}: {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const pds = trainingPds;
  const litresA = Number(
    ((5 * pds.componentRatio.A) / (pds.componentRatio.A + pds.componentRatio.B)).toFixed(2),
  );
  const litresB = Number((5 - litresA).toFixed(2));
  const ratioAnswer = `${litresA} L A + ${litresB} L B`;
  const expiry = 9 * 60 + pds.potLifeHours * 60;
  const clockAnswer =
    13 * 60 + 20 > expiry
      ? "No, past the stated pot-life expiry"
      : "Yes, within the stated pot life";

  const pdsTasks = [
    {
      id: "ratio",
      title: "A 5 L batch is needed. How much A and B?",
      clause: "mix",
      choices: [ratioAnswer, "2.5 L A + 2.5 L B", "1 L A + 4 L B"],
      answer: ratioAnswer,
      explain: `At a ratio of ${pds.componentRatio.A}:${pds.componentRatio.B}, a 5 L batch requires ${litresA} L A and ${litresB} L B.`,
      slides: [80, 81],
    },
    {
      id: "clock",
      title: "Mixed at 09:00. Can the applicator still spray at 13:20?",
      clause: "pot",
      choices: [
        "No, past the stated pot-life expiry",
        "Yes, within the stated pot life",
        "Yes, if thinner is added",
      ],
      answer: clockAnswer,
      explain: `At 20°C, the stated pot life is ${pds.potLifeHours} hours. The mixed batch expires at ${clockLabel(expiry)}. 13:20 is past expiry.`,
      slides: [82, 83],
    },
    {
      id: "recoat",
      title: "Coat applied at 10:00. Earliest and latest recoat?",
      clause: "recoat",
      choices: [
        `Earliest ${clockLabel(10 * 60 + pds.minRecoatHours * 60)} · latest ${clockLabel(10 * 60 + pds.maxRecoatHours * 60)}`,
        "Earliest 12:00 · latest 14:00",
        "Recoat anytime within 30 days",
      ],
      answer: `Earliest ${clockLabel(10 * 60 + pds.minRecoatHours * 60)} · latest ${clockLabel(10 * 60 + pds.maxRecoatHours * 60)}`,
      explain: `The PDS states minimum recoat is ${pds.minRecoatHours} h (${clockLabel(10 * 60 + pds.minRecoatHours * 60)}) and maximum is ${pds.maxRecoatHours} h (${clockLabel(10 * 60 + pds.maxRecoatHours * 60)}).`,
      slides: [125, 126],
    },
  ];

  const [activeClause, setActiveClause] = useState("mix");
  const [taskIndex, setTaskIndex] = useState(0);
  const [message, setMessage] = useState(
    "Inspect the training PDS clause, then answer the mixing question.",
  );
  const task = pdsTasks[taskIndex]!;
  const solved = record.answers[task.id] === task.answer;

  const solve = (choice: string) => {
    if (choice === task.answer) {
      playCorrect();
      awardXp(userId, 25, `PDS Decision: ${task.id}`);
      recordStreak(userId, true);
      const answers = { ...record.answers, [task.id]: choice };
      const allDone = pdsTasks.every((t) => answers[t.id] === t.answer);
      if (allDone) {
        triggerConfetti(0.5, 0.4, 75);
        playLevelUp();
        unlockAchievement(userId, "pds_detective");
      }
      update({ answers, completed: allDone });
      setMessage(`✓ Correct decision! (+25 XP). ${task.explain}`);
    } else {
      playWrong();
      recordStreak(userId, false);
      setMessage(`Incorrect. Check the PDS ${task.clause.toUpperCase()} specification.`);
    }
  };

  return (
    <>
      <div className="m6-tabs" role="group" aria-label="PDS clauses">
        {[
          ["mix", "Mixing Ratio"],
          ["pot", "Pot Life"],
          ["recoat", "Recoat Window"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={activeClause === id}
            onClick={() => {
              playClick();
              setActiveClause(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="m6-document">
        <span className="m6-fiction">FICTIONAL TRAINING PDS</span>
        <h3>{pds.productName}</h3>
        {activeClause === "mix" && (
          <p>
            Ratio: {pds.componentRatio.A} parts A by volume to {pds.componentRatio.B} parts B by
            volume. Pre-mix Part A thoroughly before adding Part B.
          </p>
        )}
        {activeClause === "pot" && (
          <p>
            Pot Life: {pds.potLifeHours} hours at 20°C. Do not thin or use past stated pot life;
            exceeding pot life causes uncurable film defects.
          </p>
        )}
        {activeClause === "recoat" && (
          <p>
            Recoat Interval at 20°C: Minimum {pds.minRecoatHours} hours, Maximum{" "}
            {pds.maxRecoatHours} hours. If maximum window is exceeded, sweep blast before overcoating.
          </p>
        )}
      </div>

      <div className="m6-task">
        <span>TASK {taskIndex + 1} OF 3</span>
        <h3>{task.title}</h3>
        <div className="m6-choice-grid">
          {task.choices.map((choice) => (
            <button
              type="button"
              key={choice}
              aria-pressed={record.answers[task.id] === choice}
              onClick={() => solve(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>

      <div className="m6-vault-actions">
        <button
          type="button"
          className="m6-outline"
          disabled={taskIndex === 0}
          onClick={() => {
            playClick();
            setTaskIndex(taskIndex - 1);
          }}
        >
          ← Previous Task
        </button>
        <button
          type="button"
          className="m6-primary"
          disabled={taskIndex === pdsTasks.length - 1}
          onClick={() => {
            playClick();
            setTaskIndex(taskIndex + 1);
          }}
        >
          Next Task →
        </button>
      </div>

      <Feedback>{message}</Feedback>
      <Source slides={task.slides} />
    </>
  );
}

// G11 & G27 Sequence Lab
function SequenceGame({
  mode,
  record,
  update,
  userId,
}: {
  mode: "time" | "process";
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const [deck, setDeck] = useState(0);
  const timeClocks = moduleSixSeed.timelineClocks;
  const currentDeck = processDecks[deck]!;
  const [order, setOrder] = useState<string[]>(() =>
    mode === "time"
      ? [...timeClocks].map((c) => c.name).sort(() => Math.random() - 0.5)
      : [...currentDeck.steps].sort(() => Math.random() - 0.5),
  );
  const [message, setMessage] = useState("Use the arrow controls to put the steps in logical sequence.");

  const targetOrder = mode === "time" ? timeClocks.map((c) => c.name) : currentDeck.steps;
  const isCorrect = order.every((val, idx) => val === targetOrder[idx]);

  const move = (from: number, to: number) => {
    playClick();
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next);
  };

  const checkSequence = () => {
    if (isCorrect) {
      playCorrect();
      awardXp(userId, 35, `Sequence solved: ${mode}`);
      recordStreak(userId, true);
      triggerConfetti(0.5, 0.4, 70);
      update({ completed: true });
      setMessage("✓ Sequence perfectly ordered! (+35 XP)");
    } else {
      playWrong();
      recordStreak(userId, false);
      setMessage("Review order. Check the prerequisite conditions for each stage.");
    }
  };

  return (
    <>
      {mode === "process" && (
        <div className="m6-tabs" role="group" aria-label="Process decks">
          {processDecks.map((p, idx) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={deck === idx}
              onClick={() => {
                playClick();
                setDeck(idx);
                setOrder([...p.steps].sort(() => Math.random() - 0.5));
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      <div className="m6-sequence">
        {order.map((step, idx) => (
          <div key={step} className={`m6-seq-card ${isCorrect ? "is-correct" : ""}`}>
            <span>{idx + 1}</span>
            <strong>{step}</strong>
            <div>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(idx, idx - 1)}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === order.length - 1}
                onClick={() => move(idx, idx + 1)}
                aria-label="Move down"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="m6-primary" onClick={checkSequence}>
        Check Sequence
      </button>

      <Feedback>{message}</Feedback>
      <Source slides={mode === "time" ? [82, 83, 84, 125, 129] : currentDeck.slides} />
    </>
  );
}

// G24 Specialty Card Sort
const specialtyCategories: Record<string, string> = {
  "Shop primer": "Temporary protection",
  "Holding primer": "Temporary protection",
  "Mist coat": "Coverage support",
  "Sealer coat": "Seal porous surface",
  "Tie coat": "Adhesion bridge",
  "Stripe coat": "Edge and weld protection",
  "Glass-flake coating": "Reinforced system",
  "Soft coating": "Soft protection",
  "Tape wrapping": "External wrapping",
};

function SpecialtyGame({
  record,
  update,
  userId,
}: {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState(
    "Read the card, reveal its description if needed, then sort it by its usual role.",
  );
  const pair = specialtyPairs.find((item) => !record.answers[item.left]);
  const categories = [...new Set(Object.values(specialtyCategories))];

  const sort = (category: string) => {
    if (!pair) return;
    if (category !== specialtyCategories[pair.left]) {
      playWrong();
      recordStreak(userId, false);
      setMessage(`That role is not the best match. Card evidence: ${pair.right}.`);
      return;
    }
    playCorrect();
    awardXp(userId, 20, `Specialty coat: ${pair.left}`);
    recordStreak(userId, true);
    const answers = { ...record.answers, [pair.left]: category };
    const allDone = specialtyPairs.every((item) => answers[item.left]);
    if (allDone) {
      triggerConfetti(0.5, 0.4, 75);
      playLevelUp();
    }
    update({ answers, completed: allDone });
    setRevealed(false);
    setMessage(`✓ ${pair.left}: ${pair.right}. (+20 XP)`);
  };

  return pair ? (
    <>
      <div className="m6-meter">
        <span>
          {Object.keys(record.answers).length} / {specialtyPairs.length} sorted
        </span>
        <span
          style={{
            width: `${(Object.keys(record.answers).length / specialtyPairs.length) * 100}%`,
          }}
        />
      </div>
      <button
        type="button"
        className={`m6-flashcard ${revealed ? "is-flipped" : ""}`}
        onClick={() => {
          playClick();
          setRevealed(!revealed);
        }}
      >
        <span>SPECIALTY COAT / ROLE SORT</span>
        <strong>{revealed ? pair.right : pair.left}</strong>
        <small>{revealed ? "Tap to hide description" : "Tap to inspect the card"}</small>
      </button>
      <div className="m6-task">
        <h3>Place in a role</h3>
        <div className="m6-choice-grid">
          {categories.map((category) => (
            <button type="button" key={category} onClick={() => sort(category)}>
              {category}
            </button>
          ))}
        </div>
      </div>
      <Feedback>{message}</Feedback>
      <Source slides={[66, 67, 68, 69, 216, 217, 218, 219, 261, 263]} />
    </>
  ) : (
    <div className="m6-complete">✓ Specialty coat sort complete! Every role categorized (+40 XP).</div>
  );
}

// G25 Family Top Trumps
function FamiliesGame({
  record,
  update,
  userId,
}: {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [tokens, setTokens] = useState<string[]>([]);
  const [message, setMessage] = useState(
    "Select two candidate families for a UV-exposed exterior, then draft the checks you need before selecting a real product.",
  );
  const checks = [
    "Approved product PDS",
    "Exposure and weathering data",
    "Substrate preparation",
    "Compatibility with adjacent coats",
    "Project specification",
  ];

  const finish = () => {
    if (selected.length !== 2) {
      playClick();
      setMessage("Choose two families to compare first.");
      return;
    }
    const missing = checks.filter((check) => !tokens.includes(check));
    if (missing.length) {
      playWrong();
      setMessage(
        `The draft still needs ${missing.join(", ")}. A family comparison requires these checks.`,
      );
      return;
    }
    playCorrect();
    awardXp(userId, 35, "Coating family evidence draft");
    triggerConfetti(0.5, 0.4, 75);
    playLevelUp();
    const answers = {
      ...record.answers,
      scenario: `${selected.join(" / ")} · ${tokens.join(", ")}`,
    };
    update({ answers, completed: true });
    setMessage(
      "✓ Excellent evidence trail. Polyurethane and acrylic/epoxy requirements confirmed against PDS. (+35 XP)",
    );
  };

  return (
    <>
      <div className="m6-brief">
        <span>PROJECT BRIEF / EXPLORATORY</span>
        <h3>UV-exposed exterior steel</h3>
        <p>
          Draft two candidate coating families and identify the documents and conditions that must
          be confirmed.
        </p>
      </div>
      <div className="m6-family-grid">
        {familyCards.map((card) => (
          <button
            type="button"
            key={card.name}
            className={`m6-family ${selected.includes(card.name) ? "is-selected" : ""}`}
            aria-pressed={selected.includes(card.name)}
            onClick={() => {
              playClick();
              setSelected(
                selected.includes(card.name)
                  ? selected.filter((name) => name !== card.name)
                  : selected.length < 2
                    ? [...selected, card.name]
                    : [selected[1]!, card.name],
              );
            }}
          >
            <strong>{card.name}</strong>
            <span>{revealed ? card.cure : "Flip to inspect ↗"}</span>
            {revealed && (
              <small>
                Verify: {card.check}
                <br />
                {slideLabel(card.slides)}
              </small>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="m6-outline"
        onClick={() => {
          playClick();
          setRevealed(!revealed);
        }}
      >
        {revealed ? "Hide card backs" : "Flip all cards"}
      </button>

      {selected.length === 2 && (
        <div className="m6-comparison" aria-label="Selected family comparison">
          {selected.map((name) => {
            const card = familyCards.find((item) => item.name === name)!;
            return (
              <div key={name}>
                <span>CANDIDATE</span>
                <h4>{card.name}</h4>
                <p>{card.cure}</p>
                <small>Check: {card.check}</small>
              </div>
            );
          })}
        </div>
      )}

      <div className="m6-task">
        <h3>Draft evidence checks</h3>
        <div className="m6-choice-grid">
          {checks.map((token) => (
            <button
              type="button"
              key={token}
              aria-pressed={tokens.includes(token)}
              onClick={() => {
                playClick();
                setTokens(
                  tokens.includes(token)
                    ? tokens.filter((item) => item !== token)
                    : [...tokens, token],
                );
              }}
            >
              {token}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="m6-primary" onClick={finish}>
        Submit evidence draft
      </button>
      <Feedback>{message}</Feedback>
      <Source slides={[2, 3, 4, 19, 21, 265, 267, 270, 272, 274]} />
    </>
  );
}

// MAIN Chapter 6 Arcade Component
export function ModuleSixArcade({
  gameId,
  userId,
  onBack,
}: {
  gameId: ModuleSixGameId;
  userId: string;
  onBack: () => void;
}) {
  const game = moduleSixGames.find((entry) => entry.id === gameId)!;
  const { record, update, replay } = usePractice(userId, gameId);
  const [briefing, setBriefing] = useState(true);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClick();
  };

  return (
    <section className="m6-shell" aria-label={game.title}>
      <div className="m6-toolbar">
        <button
          type="button"
          className="kc-back"
          onClick={() => {
            playClick();
            onBack();
          }}
        >
          ← Chapter 6 Academy
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="arc-sound-btn"
            onClick={toggleSound}
            aria-label={soundOn ? "Mute audio" : "Unmute audio"}
          >
            {soundOn ? "🔊 Sound ON" : "🔇 Sound OFF"}
          </button>
          <button
            type="button"
            className="m6-outline"
            onClick={() => {
              replay();
              setBriefing(true);
            }}
          >
            Replay
          </button>
        </div>
      </div>

      <header className="m6-game-head">
        <span>CHAPTER 06 / ADVANCED PRACTICE LAB</span>
        <h2>{game.title}</h2>
        <p>{game.objective}</p>
      </header>
      <ReviewNotice />

      {briefing ? (
        <div className="m6-brief">
          <span>BRIEFING</span>
          <h3>Explore. Practice. Master in 3D.</h3>
          <p>
            This laboratory covers advanced coating materials, curing agents, airless spray tip
            diagnostics, thermal metallizing, and passive fire protection. Earn XP and level up
            your Inspector Rank!
          </p>
          <button
            type="button"
            className="m6-primary"
            onClick={() => {
              playClick();
              setBriefing(false);
            }}
          >
            Enter 3D Activity →
          </button>
        </div>
      ) : (
        <div className="m6-workspace">
          {gameId === "G02" && <IngredientGame record={record} update={update} userId={userId} />}
          {gameId === "G09" && <PdsGame record={record} update={update} userId={userId} />}
          {gameId === "G11" && (
            <SequenceGame mode="time" record={record} update={update} userId={userId} />
          )}
          {gameId === "G13" && <TipGame record={record} update={update} userId={userId} />}
          {gameId === "G24" && <SpecialtyGame record={record} update={update} userId={userId} />}
          {gameId === "G25" && <FamiliesGame record={record} update={update} userId={userId} />}
          {gameId === "G27" && (
            <SequenceGame mode="process" record={record} update={update} userId={userId} />
          )}
          {gameId === "G29" && <VaultSixDeck3D record={record} update={update} userId={userId} />}
          {gameId === "G30" && (
            <ThreePfpFlameLab
              onComplete={() => {
                awardXp(userId, 50, "PFP Heat Flux Simulation");
                unlockAchievement(userId, "fire_guardian");
              }}
            />
          )}

          {record.completed && (
            <div className="m6-complete" role="status">
              ✓ Practice activity complete · Saved locally · XP awarded
            </div>
          )}
        </div>
      )}
    </section>
  );
}

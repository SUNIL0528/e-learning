import { useState } from "react";
import type { GameRecord } from "./ModuleOneArcade";
import { ThreeKnowledgeScene, sceneHotspots } from "./ThreeKnowledgeScene";
import { playCorrect, playWrong, playClick, playScan, playSpark, playLevelUp } from "./audio";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";
import { triggerConfetti } from "./confetti";

type Props = { record: GameRecord; save: (next: GameRecord) => void; userId?: string };

const siteDocuments = [
  { id: "specification", name: "Approved specification", source: "Project criteria" },
  { id: "procedure", name: "Approved procedure", source: "Agreed work method" },
  { id: "itp", name: "Inspection and test plan", source: "Checkpoints and responsibilities" },
  { id: "pds", name: "Product data sheet", source: "Product application information" },
  { id: "sds", name: "Safety data sheet", source: "Hazards and safe handling" },
  { id: "draft", name: "Unapproved draft", source: "Not a controlled project copy" },
] as const;

const checkpointAnswer = "Surface preparation checkpoint in the approved ITP";
const coatingAnswer = "Check conditions against the approved procedure";
const assessmentAnswer = "Request the missing reading and verify it";

function updateMatch(record: GameRecord, save: Props["save"], key: string, value: string) {
  save({ ...record, matches: { ...record.matches, [key]: value } });
}

function SiteMission({ record, save, userId = "guest" }: Props) {
  const [selected, setSelected] = useState("documents");
  const [message, setMessage] = useState("");
  const matches = record.matches;
  const requiredKit = siteDocuments.filter((document) => document.id !== "draft");
  const kitCount = requiredKit.filter(
    (document) => matches[`doc:${document.id}`] === "included",
  ).length;
  const ready = kitCount === requiredKit.length;
  const progress = [
    ready,
    Boolean(matches["checkpoint"]),
    Boolean(matches["coating"]),
    Boolean(matches["assessment"]),
    Boolean(matches["reportSubmitted"]),
  ].filter(Boolean).length;
  const hotspot = sceneHotspots.site.find((entry) => entry.id === selected)!;
  const reportReady = ready && matches["checkpoint"] && matches["coating"] && matches["assessment"];
  const canSubmit = Boolean(
    reportReady &&
    matches["reportObject"]?.trim() &&
    matches["reportObservation"]?.trim() &&
    matches["reportResult"] &&
    matches["reportNotes"]?.trim(),
  );

  const includeDocument = (id: string) => {
    if (id === "draft") {
      updateMatch(record, save, "doc:draft", "rejected");
      playWrong();
      setMessage(
        "This is an unapproved draft. Check the controlled revision before using it in the field kit.",
      );
      return;
    }
    if (matches[`doc:${id}`]) return;
    updateMatch(record, save, `doc:${id}`, "included");
    playCorrect();
    awardXp(userId, 15, "Added controlled doc to kit");
    setMessage("Added to the controlled field kit (+15 XP).");
  };

  const selectAnswer = (key: string, answer: string, correct: string, explanation: string) => {
    if (matches[key]) return;
    updateMatch(record, save, key, answer);
    if (answer === correct) {
      playCorrect();
      awardXp(userId, 25, `Site decision: ${key}`);
      recordStreak(userId, true);
      setMessage(`Correct! (+25 XP) ${explanation}`);
    } else {
      playWrong();
      recordStreak(userId, false);
      setMessage(`Review this decision. ${explanation}`);
    }
  };

  const submitReport = () => {
    if (!canSubmit) return;
    const score =
      (kitCount === 5 ? 30 : 0) +
      (matches["checkpoint"] === checkpointAnswer ? 20 : 0) +
      (matches["coating"] === coatingAnswer ? 15 : 0) +
      (matches["assessment"] === assessmentAnswer ? 20 : 0) +
      (matches["reportResult"] === "Verification requested" ? 15 : 0);

    save({
      ...record,
      matches: { ...matches, reportSubmitted: "yes" },
      completed: true,
      best: Math.max(record.best, score),
    });

    awardXp(userId, 100, "Submitted 3D Site Inspection Report");
    triggerConfetti(0.5, 0.4, 90);
    playLevelUp();
    unlockAchievement(userId, "site_certified");
    setMessage("Report recorded! 100 XP awarded. You earned the Field Ready Badge! 🦺");
  };

  return (
    <div className="arc-simulation">
      <div className="arc-mission-brief">
        <div>
          <span>Mission 01 / Project site</span>
          <h3>Your first inspection round</h3>
          <p>
            You are starting as a project coating inspector. Confirm readiness, observe the work,
            assess the evidence, and document what you find in 3D.
          </p>
        </div>
        <strong>Authority: see project contract</strong>
      </div>
      <ThreeKnowledgeScene
        kind="site"
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id);
          playScan();
          setMessage("");
        }}
      />
      <div className="arc-mission-progress" aria-label={`${progress} of 5 mission steps recorded`}>
        <span style={{ width: `${progress * 20}%` }} />
        <small>{progress}/5 field steps recorded</small>
      </div>
      <div className="arc-mission-panel" key={selected}>
        <div className="arc-mission-panel-head">
          <span>Selected location</span>
          <h3>{hotspot.label}</h3>
          <p>{hotspot.description}</p>
        </div>
        {selected === "documents" && (
          <>
            <p className="arc-task">
              Select the five approved documents for the field kit. A draft cannot replace an
              approved controlled copy. Slides 3, 24–26, 38–44.
            </p>
            <div className="arc-document-grid">
              {siteDocuments.map((document) => {
                const included = matches[`doc:${document.id}`] === "included";
                const draft = document.id === "draft";
                return (
                  <button
                    type="button"
                    key={document.id}
                    className={included ? "is-chosen" : draft ? "is-draft" : ""}
                    onClick={() => includeDocument(document.id)}
                  >
                    <span>{document.name}</span>
                    <small>{document.source}</small>
                    <em>
                      {included ? "In kit" : draft && matches["doc:draft"] ? "Excluded" : "Select"}
                    </em>
                  </button>
                );
              })}
            </div>
            <p className="arc-task-progress">{kitCount} of 5 approved documents in your kit</p>
          </>
        )}
        {selected === "preparation" && (
          <>
            <p className="arc-task">
              The contractor is preparing a steel spool. Which controlled checkpoint should you
              consult before recording the observation? Slides 22, 24–28.
            </p>
            <div className="arc-decision-grid">
              {[checkpointAnswer, "Paint batch label only", "Daily attendance sheet"].map(
                (answer) => (
                  <button
                    type="button"
                    key={answer}
                    className={matches["checkpoint"] === answer ? "is-chosen" : ""}
                    disabled={Boolean(matches["checkpoint"])}
                    onClick={() =>
                      selectAnswer(
                        "checkpoint",
                        answer,
                        checkpointAnswer,
                        "The approved ITP identifies the relevant inspection checkpoint and responsible parties.",
                      )
                    }
                  >
                    {answer}
                  </button>
                ),
              )}
            </div>
          </>
        )}
        {selected === "coating" && (
          <>
            <p className="arc-task">
              The coating area is prepared. What should you do before treating the application
              conditions as suitable? Slides 22–23, 35–37.
            </p>
            <div className="arc-decision-grid">
              {[
                coatingAnswer,
                "Assume conditions are acceptable from appearance",
                "Skip straight to the report",
              ].map((answer) => (
                <button
                  type="button"
                  key={answer}
                  className={matches["coating"] === answer ? "is-chosen" : ""}
                  disabled={Boolean(matches["coating"])}
                  onClick={() =>
                    selectAnswer(
                      "coating",
                      answer,
                      coatingAnswer,
                      "Observe the site and compare relevant conditions with the approved project documents; no numerical limit is assumed here.",
                    )
                  }
                >
                  {answer}
                </button>
              ))}
            </div>
          </>
        )}
        {selected === "inspection" && (
          <>
            <p className="arc-task">
              Training evidence card: the surface profile reading is missing. What is your
              assessment? The scenario provides no acceptance value. Slides 5, 21, 35–36.
            </p>
            <div className="arc-decision-grid">
              {[
                assessmentAnswer,
                "Accept the work from appearance",
                "Reject immediately without verification",
              ].map((answer) => (
                <button
                  type="button"
                  key={answer}
                  className={matches["assessment"] === answer ? "is-chosen" : ""}
                  disabled={Boolean(matches["assessment"])}
                  onClick={() =>
                    selectAnswer(
                      "assessment",
                      answer,
                      assessmentAnswer,
                      "Request the missing evidence, compare it with approved criteria, and document the result. Do not assume contractual stop-work authority.",
                    )
                  }
                >
                  {answer}
                </button>
              ))}
            </div>
          </>
        )}
        {selected === "report" && (
          <>
            <p className="arc-task">
              Assemble a concise inspection record. All details are fictional training data. Slides
              35–37, 47–55.
            </p>
            <div className="arc-report-form">
              <label>
                Object ID
                <input
                  value={matches["reportObject"] || ""}
                  onChange={(event) =>
                    updateMatch(record, save, "reportObject", event.target.value)
                  }
                  placeholder="e.g. SP-07"
                />
              </label>
              <label>
                Observation
                <input
                  value={matches["reportObservation"] || ""}
                  onChange={(event) =>
                    updateMatch(record, save, "reportObservation", event.target.value)
                  }
                  placeholder="What did you observe?"
                />
              </label>
              <label>
                Result
                <select
                  value={matches["reportResult"] || ""}
                  onChange={(event) =>
                    updateMatch(record, save, "reportResult", event.target.value)
                  }
                >
                  <option value="">Select result</option>
                  <option>Verification requested</option>
                  <option>Accepted</option>
                  <option>Rejected</option>
                </select>
              </label>
              <label>
                Notes
                <textarea
                  value={matches["reportNotes"] || ""}
                  onChange={(event) => updateMatch(record, save, "reportNotes", event.target.value)}
                  placeholder="Evidence requested and next action"
                />
              </label>
            </div>
            <button
              type="button"
              className="arc-button"
              disabled={!canSubmit}
              onClick={submitReport}
            >
              Submit practice report →
            </button>
            {!reportReady && (
              <p className="arc-task-progress">
                Complete the document, preparation, coating, and assessment decisions first.
              </p>
            )}
          </>
        )}
        {message && (
          <p className="arc-scene-feedback" role="status">
            {message}
          </p>
        )}
      </div>
      {record.completed && (
        <div className="arc-simulation-debrief" role="status">
          <span>Mission debrief / OADR</span>
          <h3>Inspection round recorded</h3>
          <p>
            Observation → Assessment → Document → Report. Review any decisions below before
            replaying; this practice score does not change certification or course grades.
          </p>
          <ul>
            <li>Controlled kit: {kitCount}/5 approved documents</li>
            <li>
              Preparation checkpoint:{" "}
              {matches["checkpoint"] === checkpointAnswer ? "Appropriate" : "Review the ITP"}
            </li>
            <li>
              Coating conditions:{" "}
              {matches["coating"] === coatingAnswer ? "Compared with procedure" : "Needs review"}
            </li>
            <li>
              Missing evidence:{" "}
              {matches["assessment"] === assessmentAnswer
                ? "Verification requested"
                : "Needs review"}
            </li>
            <li>Report: {matches["reportResult"] || "Not recorded"}</li>
          </ul>
          <small>Source: Module 1 slides 2–8, 22–28, 35–37, 47–55.</small>
        </div>
      )}
    </div>
  );
}

const instrumentInfo: Record<
  string,
  { use: string; source: string; testName: string; testAction: string; readout: string }
> = {
  hygrometer: {
    use: "Helps determine environmental conditions alongside the approved method and other readings.",
    source: "Slides 60–65",
    testName: "Spin Psychrometer Test",
    testAction: "Whirl the sling psychrometer in air",
    readout:
      "Dry Bulb: 24.2°C · Wet Bulb: 19.4°C · RH: 64% · Dew Point: 16.9°C · ΔT to steel: +4.3°C (Pass)",
  },
  profile: {
    use: "Checks surface profile when the specified method calls for a compatible gauge or replica-tape setup.",
    source: "Slides 66–69",
    testName: "Probe Anchor Pattern",
    testAction: "Zero on smooth glass, then measure abrasive blast anchor peak-to-valley",
    readout: "Depth Gauge: 64.5 µm · Roughness Grade: Medium (G) · Angular profile compliant",
  },
  dft: {
    use: "Measures dry film thickness after curing, using a gauge suitable for the substrate and coating system.",
    source: "Slides 66–69",
    testName: "Test Calibration Shim",
    testAction: "Verify gauge on 250 µm certified calibration foil over blast profile",
    readout: "Reading: 252 µm (Within ±2% accuracy limit) · Instrument ready for QA/QC spot survey",
  },
  holiday: {
    use: "Finds coating discontinuities when the project procedure requires holiday testing.",
    source: "Slides 60–69",
    testName: "Test Spark Calibration",
    testAction: "Trigger high-voltage wand test across grounded pipe joint",
    readout: "Voltage: 1.8 kV DC · Continuity buzzer checked · 0 pinholes detected on test section",
  },
};

const toolScenarios = [
  {
    id: "profile",
    prompt:
      "The approved method asks for a surface profile reading. Which tool fits this simplified setup?",
    answer: "profile",
    explanation:
      "Use a profile method and instrument specified for the job; the model is a generic silhouette. Slides 66–69.",
  },
  {
    id: "dft",
    prompt: "The coating has cured. Which instrument checks dry film thickness?",
    answer: "dft",
    explanation:
      "Use a suitable DFT gauge, then verify it according to its manual and the project procedure. Slides 66–69.",
  },
  {
    id: "holiday",
    prompt: "The fictional project requires a discontinuity check. Which instrument is relevant?",
    answer: "holiday",
    explanation:
      "A holiday detector is used only where the coating system and approved procedure call for it. Slides 60–69.",
  },
  {
    id: "environment",
    prompt:
      "You need environmental condition evidence before application. Which tool belongs in the check?",
    answer: "hygrometer",
    explanation:
      "A hygrometer is one relevant instrument; complete the check as directed by the approved method. Slides 60–65.",
  },
] as const;

function ToolRoom({ record, save, userId = "guest" }: Props) {
  const [selected, setSelected] = useState("hygrometer");
  const [testedTools, setTestedTools] = useState<Record<string, boolean>>({});
  const matches = record.matches;
  const answered =
    toolScenarios.filter((scenario) => matches[`tool:${scenario.id}`]).length +
    Number(Boolean(matches["toolReadiness"]));
  const correct =
    toolScenarios.filter((scenario) => matches[`tool:${scenario.id}`] === scenario.answer).length +
    Number(matches["toolReadiness"] === "Hold the gauge and request a valid instrument");

  const select = (key: string, answer: string) => {
    if (matches[key]) return;
    const isCorrect =
      key === "toolReadiness"
        ? answer === "Hold the gauge and request a valid instrument"
        : toolScenarios.find((s) => `tool:${s.id}` === key)?.answer === answer;

    if (isCorrect) {
      playCorrect();
      awardXp(userId, 20, `Tool room: ${key}`);
      recordStreak(userId, true);
    } else {
      playWrong();
      recordStreak(userId, false);
    }

    const nextMatches = { ...matches, [key]: answer };
    const nextAnswered =
      toolScenarios.filter((scenario) => nextMatches[`tool:${scenario.id}`]).length +
      Number(Boolean(nextMatches["toolReadiness"]));
    const nextCorrect =
      toolScenarios.filter((scenario) => nextMatches[`tool:${scenario.id}`] === scenario.answer)
        .length +
      Number(nextMatches["toolReadiness"] === "Hold the gauge and request a valid instrument");

    const allDone = nextAnswered === 5;
    if (allDone) {
      triggerConfetti(0.5, 0.4, 75);
      playLevelUp();
      unlockAchievement(userId, "tool_master");
    }

    save({
      ...record,
      matches: nextMatches,
      completed: allDone,
      best: Math.max(record.best, nextCorrect * 20),
    });
  };

  const handleTestInstrument = (toolId: string) => {
    if (toolId === "holiday") {
      playSpark();
    } else {
      playScan();
    }
    setTestedTools((prev) => ({ ...prev, [toolId]: true }));
    awardXp(userId, 10, `Tested ${toolId}`);
  };

  const selectedTool = sceneHotspots.tools.find((hotspot) => hotspot.id === selected)!;
  const selectedInfo = instrumentInfo[selected]!;

  return (
    <div className="arc-simulation">
      <div className="arc-mission-brief">
        <div>
          <span>Mission 02 / Instrument room</span>
          <h3>Choose the right evidence tool</h3>
          <p>
            Rotate the workbench and inspect the generic instruments in 3D. Test gauge operation,
            select a tool for each site need, and check whether a gauge is ready to use.
          </p>
        </div>
        <strong>Training models · not operating instructions</strong>
      </div>

      <ThreeKnowledgeScene
        kind="tools"
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id);
          playScan();
        }}
      />

      {/* Interactive 3D Tool Live Readout Card */}
      <div className="arc-tool-info" key={selected}>
        <div className="arc-tool-info-header">
          <div>
            <span>On the workbench</span>
            <h3>{selectedTool.label}</h3>
          </div>
          <button
            type="button"
            className="arc-test-tool-btn"
            onClick={() => handleTestInstrument(selected)}
          >
            ⚡ {selectedInfo.testName}
          </button>
        </div>
        <p>{selectedInfo.use}</p>
        {testedTools[selected] && (
          <div className="arc-tool-live-reading" role="status">
            <span className="arc-reading-dot" />
            <div>
              <strong>Live Gauge Readout:</strong>
              <p>{selectedInfo.readout}</p>
            </div>
          </div>
        )}
        <small>
          {selectedInfo.source} · Always follow the relevant manufacturer manual and approved
          project method.
        </small>
      </div>

      <div className="arc-mission-progress" aria-label={`${answered} of 5 tool decisions recorded`}>
        <span style={{ width: `${answered * 20}%` }} />
        <small>{answered}/5 decisions recorded</small>
      </div>

      <div className="arc-tool-rounds">
        <h3>Select the tool for each field condition</h3>
        {toolScenarios.map((scenario, index) => {
          const chosen = matches[`tool:${scenario.id}`];
          return (
            <div className="arc-tool-round" key={scenario.id}>
              <span>Site need {index + 1}</span>
              <h4>{scenario.prompt}</h4>
              <div className="arc-decision-grid">
                {sceneHotspots.tools.map((tool) => (
                  <button
                    type="button"
                    key={tool.id}
                    disabled={Boolean(chosen)}
                    className={chosen === tool.id ? "is-chosen" : ""}
                    onClick={() => {
                      setSelected(tool.id);
                      select(`tool:${scenario.id}`, tool.id);
                    }}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              {chosen && (
                <p
                  className={`arc-round-feedback ${chosen === scenario.answer ? "is-correct" : ""}`}
                  role="status"
                >
                  {chosen === scenario.answer
                    ? "Good choice! (+20 XP) "
                    : `Review: ${sceneHotspots.tools.find((tool) => tool.id === scenario.answer)?.label}. `}
                  {scenario.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="arc-tool-round arc-gauge-check">
        <span>Gauge Calibration Check</span>
        <h4>
          Training unit DFT-04 has an expired calibration certificate. What should the inspector do?
        </h4>
        <p>
          This is fictional device-specific status. Verification requirements depend on the
          instrument and manufacturer instructions.
        </p>
        <div className="arc-decision-grid">
          {[
            "Hold the gauge and request a valid instrument",
            "Use it and note the expiry afterward",
          ].map((answer) => (
            <button
              type="button"
              key={answer}
              disabled={Boolean(matches["toolReadiness"])}
              className={matches["toolReadiness"] === answer ? "is-chosen" : ""}
              onClick={() => select("toolReadiness", answer)}
            >
              {answer}
            </button>
          ))}
        </div>
        {matches["toolReadiness"] && (
          <p
            className={`arc-round-feedback ${matches["toolReadiness"].startsWith("Hold") ? "is-correct" : ""}`}
            role="status"
          >
            {matches["toolReadiness"].startsWith("Hold")
              ? "Correct! (+20 XP) "
              : "Review this choice. "}
            Do not use an expired training gauge. Request a valid calibrated instrument and follow
            the approved verification process. Slides 66–69.
          </p>
        )}
      </div>

      {record.completed && (
        <div className="arc-simulation-debrief" role="status">
          <span>Workbench debrief</span>
          <h3>{correct} of 5 decisions aligned with the scenario</h3>
          <p>
            These are simplified tool selections. The actual instrument, method, acceptance
            criteria, and verification steps come from the project specification and manufacturer
            instructions.
          </p>
          <small>Source: Module 1 slides 60–69. Practice only; no grade is recorded.</small>
        </div>
      )}
    </div>
  );
}

export function ThreeKnowledgeGame({
  gameId,
  record,
  save,
  userId = "guest",
}: Props & { gameId: "first-day" | "tool-room" }) {
  return gameId === "first-day" ? (
    <SiteMission record={record} save={save} userId={userId} />
  ) : (
    <ToolRoom record={record} save={save} userId={userId} />
  );
}

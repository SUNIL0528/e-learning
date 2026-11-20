import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { courses, ENABLED_COURSE_ID, type Course } from "@/data/platform";
import coatingWorkArchive from "@/assets/coating-work-archive.jpg";
import { getCurrentAuthUser, onAuthStateChanged } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  getCourseProgress,
  getUserEnrollments,
  type SavedCourseProgress,
  type UserEnrollment,
} from "@/lib/progress";
import { ModuleOneArcade, readGameRecord } from "@/features/knowledge-check/ModuleOneArcade";
import { moduleOneGames, type GameId } from "@/features/knowledge-check/module-one-data";
import { ModuleSixArcade } from "@/features/knowledge-check/ModuleSixArcade";
import { readModuleSixRecord } from "@/features/knowledge-check/module-six-progress";
import {
  moduleSixGames,
  type ModuleSixGameId,
  type ModuleSixFilter,
} from "@/features/knowledge-check/module-six-data";
import { Hero3DInspectionHologram } from "@/features/knowledge-check/Hero3DInspectionHologram";
import {
  loadProfile,
  calculateLevel,
  ACHIEVEMENTS,
  type InspectorProfile,
} from "@/features/knowledge-check/gamification";
import { isSoundEnabled, setSoundEnabled, playClick } from "@/features/knowledge-check/audio";
import "@/knowledge-check.css";

type LeaderboardRow = {
  id: number;
  rank: number;
  name: string;
  score: number;
  completedLessons: number;
  streak: number;
  thisWeek: number;
  current: boolean;
};
type Leaderboard = { courseId: string; basis: string; rows: LeaderboardRow[] };
type Screen = "courses" | "chapters" | "arcade" | "game";

export const Route = createFileRoute("/knowledge-check")({
  head: () => ({
    meta: [
      { title: "Knowledge check — HTS" },
      { name: "description", content: "Interactive 3D practice and inspector missions." },
    ],
  }),
  component: KnowledgeCheck,
});

function KnowledgeCheck() {
  const [user, setUser] = useState(getCurrentAuthUser());
  const [enrollments, setEnrollments] = useState<UserEnrollment[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseProgress, setCourseProgress] = useState<SavedCourseProgress | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [screen, setScreen] = useState<Screen>("courses");
  const [gameId, setGameId] = useState<GameId>("first-day");
  const [moduleSixGameId, setModuleSixGameId] = useState<ModuleSixGameId>("G02");
  const [moduleSixFilter, setModuleSixFilter] = useState<ModuleSixFilter>("All");
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [courseLoading, setCourseLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBadges, setShowBadges] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const [profile, setProfile] = useState<InspectorProfile>(() => loadProfile(user?.uid ?? "guest"));

  useEffect(() => onAuthStateChanged(setUser), []);

  // Sync profile when user changes or custom event fires
  useEffect(() => {
    setProfile(loadProfile(user?.uid ?? "guest"));
    const handleProfileUpdate = () => {
      setProfile(loadProfile(user?.uid ?? "guest"));
    };
    window.addEventListener("hts-profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("hts-profile-updated", handleProfileUpdate);
  }, [user]);

  useEffect(() => {
    if (!user || user.isInstructor) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getUserEnrollments(user.uid)
      .then((data) => {
        if (!cancelled) {
          setEnrollments(Object.values(data).filter((entry) => entry.status !== "expired"));
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setError("We couldn't load your enrolled courses. Refresh this page to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeCourseId = selectedCourseId ?? enrollments[0]?.courseId ?? null;
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId),
    [selectedCourseId],
  );

  useEffect(() => {
    if (!activeCourseId || !user) {
      setLeaderboard(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/me/courses/${encodeURIComponent(activeCourseId)}/leaderboard/`)
      .then((response) => response.json() as Promise<Leaderboard>)
      .then((data) => {
        if (!cancelled) setLeaderboard(data);
      })
      .catch(() => {
        if (!cancelled) setLeaderboard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCourseId, user, courseProgress]);

  const openCourse = (courseId: string) => {
    playClick();
    const course = courses.find((entry) => entry.id === courseId);
    setSelectedCourseId(courseId);
    setCourseProgress(null);
    setScreen("chapters");
    if (!course || !user) return;
    setCourseLoading(true);
    getCourseProgress(user.uid, courseId, course.modules)
      .then((next) => {
        setCourseProgress(next);
        setError("");
      })
      .catch(() => setError("We couldn't load your lesson progress. Please retry."))
      .finally(() => setCourseLoading(false));
  };

  const openArcade = (module: Course["modules"][number], index: number) => {
    playClick();
    const finishedLearning =
      module.chapters.length > 0 &&
      module.chapters.every((chapter) => courseProgress?.chapters[chapter.id]?.completed);
    if (selectedCourseId !== ENABLED_COURSE_ID || ![0, 5].includes(index) || !finishedLearning)
      return;
    setActiveModuleIndex(index);
    setScreen("arcade");
  };

  const canPlayActiveModule = Boolean(
    selectedCourseId === ENABLED_COURSE_ID &&
    selectedCourse?.modules[activeModuleIndex]?.chapters.length &&
    selectedCourse.modules[activeModuleIndex].chapters.every(
      (chapter) => courseProgress?.chapters[chapter.id]?.completed,
    ),
  );

  const levelInfo = calculateLevel(profile.xp);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClick();
  };

  return (
    <main className="kc-page">
      <div className="kc-wrap">
        {/* Header with Title & Inspector Gamification HUD */}
        <header className="kc-heading">
          <div>
            <nav className="kc-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Dashboard</Link>
              <span>/</span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setScreen("courses");
                }}
              >
                Knowledge check
              </button>
              {screen !== "courses" && (
                <>
                  <span>/</span>
                  <span>{selectedCourse?.title ?? "Course"}</span>
                </>
              )}
            </nav>
            <h1>
              {screen === "courses"
                ? "Knowledge check"
                : screen === "chapters"
                  ? (selectedCourse?.title ?? "Course chapters")
                  : screen === "arcade"
                    ? activeModuleIndex === 5
                      ? "Coating Technology Academy"
                      : "Inspector Arcade & 3D Labs"
                    : activeModuleIndex === 5
                      ? moduleSixGames.find((game) => game.id === moduleSixGameId)?.title
                      : moduleOneGames.find((game) => game.id === gameId)?.title}
            </h1>
            <p className="kc-subtitle">
              {screen === "courses"
                ? "Choose an enrolled course. Complete lessons to unlock 3D simulations, interactive flashcards, and arcade missions."
                : screen === "chapters"
                  ? "Your chapter path follows completed lessons. Interactive practice unlocks after each chapter."
                  : activeModuleIndex === 5
                    ? "Practice coating materials through evidence puzzles, animated cards and process challenges."
                    : "Explore 3D site missions, inspect workbench tools, test micro-defects, and boost recall."}
            </p>
          </div>

          {/* Gamification Level Badge Bar */}
          <div className="kc-hud-bar">
            <div className="kc-hud-level">
              <span className="kc-hud-badge-icon">{levelInfo.badge}</span>
              <div>
                <span className="kc-hud-level-tag">LEVEL {levelInfo.level}</span>
                <strong>{levelInfo.title}</strong>
              </div>
            </div>

            <div className="kc-hud-xp-box">
              <div className="kc-hud-xp-labels">
                <span>{profile.xp} XP</span>
                <small>{levelInfo.maxXp} XP</small>
              </div>
              <div className="kc-hud-xp-track">
                <span style={{ width: `${levelInfo.progressPercent}%` }} />
              </div>
            </div>

            <div className="kc-hud-controls">
              {profile.streak > 0 && (
                <div className="kc-hud-streak" title={`${profile.streak} correct answer streak`}>
                  🔥 {profile.streak}
                </div>
              )}
              <button
                type="button"
                className="kc-hud-btn"
                onClick={() => {
                  playClick();
                  setShowBadges(true);
                }}
                title="View Unlocked Achievements"
              >
                🏆 Badges ({profile.achievements.length})
              </button>
              <button
                type="button"
                className="kc-hud-btn"
                onClick={toggleSound}
                title={soundOn ? "Mute audio" : "Unmute audio"}
              >
                {soundOn ? "🔊" : "🔇"}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="kc-error" role="alert">
            {error}
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        <div className={`kc-layout ${screen === "game" ? "is-game" : ""}`}>
          <section className="kc-main" aria-label="Knowledge check content">
            {loading ? (
              <div className="kc-loading" role="status">
                Loading your courses…
              </div>
            ) : screen === "courses" ? (
              <>
                {/* 3D Interactive Specimen Hero Card */}
                <Hero3DInspectionHologram />

                <div className="kc-section-head">
                  <div>
                    <h2>Your courses</h2>
                    <p>
                      {enrollments.length
                        ? `${enrollments.length} enrolled ${enrollments.length === 1 ? "course" : "courses"}`
                        : "Your course list will appear after enrollment."}
                    </p>
                  </div>
                  <span>Learning first. Practice next.</span>
                </div>

                {enrollments.length ? (
                  <>
                    <div className="kc-course-list">
                      {enrollments.map((enrollment) => (
                        <button
                          type="button"
                          className="kc-course-card"
                          key={enrollment.courseId}
                          onClick={() => openCourse(enrollment.courseId)}
                        >
                          <div className="kc-course-image">
                            {enrollment.courseId === ENABLED_COURSE_ID && (
                              <img src={coatingWorkArchive} alt="Coating inspection work" />
                            )}
                          </div>
                          <div className="kc-course-copy">
                            <span>Enrolled course</span>
                            <h3>
                              {enrollment.courseTitle ||
                                courses.find((course) => course.id === enrollment.courseId)
                                  ?.title ||
                                enrollment.courseId}
                            </h3>
                            <p>{enrollment.progressPercent}% learning complete</p>
                            <div className="kc-course-track">
                              <span style={{ width: `${enrollment.progressPercent}%` }} />
                            </div>
                          </div>
                          <span className="kc-course-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="kc-path-note">
                      <span>How it opens</span>
                      <h3>Learn the chapter. Then test your recall with interactive practice.</h3>
                      <p>
                        Each chapter has its own knowledge check. Complete its lesson first, then
                        return here for cards, evidence puzzles and 3D missions where available.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="kc-empty">
                    <h3>No enrolled courses yet</h3>
                    <p>Browse the course catalog and open a course to begin learning.</p>
                    <Link to="/courses" className="kc-button">
                      Browse courses →
                    </Link>
                  </div>
                )}
              </>
            ) : screen === "chapters" ? (
              <>
                <button
                  type="button"
                  className="kc-back"
                  onClick={() => {
                    playClick();
                    setScreen("courses");
                  }}
                >
                  ← Your courses
                </button>
                {courseLoading ? (
                  <div className="kc-loading" role="status">
                    Checking lesson completion…
                  </div>
                ) : selectedCourse ? (
                  <>
                    <div className="kc-section-head">
                      <div>
                        <h2>Course chapters</h2>
                        <p>Finish a chapter's learning material to open its practice.</p>
                      </div>
                      <span>{selectedCourse.modules.length} chapters</span>
                    </div>
                    <div className="kc-chapter-list">
                      {selectedCourse.modules.map((module, index) => {
                        const learned =
                          module.chapters.length > 0 &&
                          module.chapters.every(
                            (chapter) => courseProgress?.chapters[chapter.id]?.completed,
                          );
                        const available =
                          [0, 5].includes(index) && selectedCourseId === ENABLED_COURSE_ID;
                        return (
                          <article
                            className={`kc-chapter-row ${learned ? "is-learned" : ""}`}
                            key={module.id}
                          >
                            <div className="kc-chapter-number">{index + 1}</div>
                            <div className="kc-chapter-copy">
                              <span
                                className={`kc-chapter-status ${learned && available ? "is-ready" : ""}`}
                              >
                                {learned ? (available ? "Ready" : "Content pending") : "Locked"}
                              </span>
                              <h3>{module.title.replace(/^Module \d+ — /, "")}</h3>
                              <p>
                                {learned
                                  ? available
                                    ? "Learning complete · Knowledge check ready"
                                    : "Learning complete · Knowledge check content coming later"
                                  : "Complete the lesson to open the knowledge check"}
                              </p>
                            </div>
                            <div className="kc-chapter-action">
                              {learned && available ? (
                                <button
                                  type="button"
                                  className="kc-button"
                                  onClick={() => openArcade(module, index)}
                                >
                                  Open practice →
                                </button>
                              ) : (
                                <Link
                                  to="/courses/$courseId"
                                  params={{ courseId: selectedCourse.id }}
                                  className="kc-chapter-learn"
                                >
                                  {learned ? "Review lesson" : "Continue learning"} ↗
                                </Link>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="kc-empty">
                    <h3>Course outline unavailable</h3>
                    <p>
                      This enrollment does not have a course outline in this version of the LMS.
                    </p>
                  </div>
                )}
              </>
            ) : !canPlayActiveModule ? (
              <div className="kc-empty">
                <h3>Finish the lesson first</h3>
                <p>Chapter practice unlocks when its learning chapter is marked complete.</p>
                <button
                  type="button"
                  className="kc-button"
                  onClick={() => {
                    playClick();
                    setScreen("chapters");
                  }}
                >
                  Back to chapters
                </button>
              </div>
            ) : screen === "arcade" ? (
              <>
                <button
                  type="button"
                  className="kc-back"
                  onClick={() => {
                    playClick();
                    setScreen("chapters");
                  }}
                >
                  ← Course chapters
                </button>
                {activeModuleIndex === 5 ? (
                  <>
                    <div className="m6-hub-hero">
                      <span>CHAPTER 06 / COATING TECHNOLOGY ACADEMY</span>
                      <h2>Explore the material. Trace the evidence.</h2>
                      <p>
                        Eight interactive practice labs are open. Work through ingredient functions,
                        fictional product data, time windows, process decisions and the 56-card
                        knowledge vault.
                      </p>
                      <div>
                        <strong>08</strong>
                        <span>playable labs</span>
                        <strong>56</strong>
                        <span>source cards</span>
                      </div>
                    </div>
                    <div className="m6-hub-note">
                      <strong>Review status: pending</strong>
                      <span>
                        These are ungraded learning activities. Instructor approval is required
                        before technical answers become scored course mastery.
                      </span>
                    </div>
                    <div
                      className="m6-hub-filters"
                      role="group"
                      aria-label="Filter Chapter 6 games"
                    >
                      {(["All", "Cards", "Evidence", "Sequence", "Flashcards"] as const).map(
                        (filter) => (
                          <button
                            type="button"
                            key={filter}
                            aria-pressed={moduleSixFilter === filter}
                            onClick={() => setModuleSixFilter(filter)}
                          >
                            {filter}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="m6-game-grid">
                      {moduleSixGames
                        .filter(
                          (game) => moduleSixFilter === "All" || game.filter === moduleSixFilter,
                        )
                        .map((game, index) => {
                          const record = readModuleSixRecord(user?.uid ?? "guest", game.id);
                          return (
                            <button
                              type="button"
                              key={game.id}
                              className="m6-hub-card"
                              style={{ animationDelay: `${index * 55}ms` }}
                              onClick={() => {
                                playClick();
                                setModuleSixGameId(game.id);
                                setScreen("game");
                              }}
                            >
                              <span className="m6-hub-card-top">
                                <b>{game.id}</b>
                                <small>{game.kind}</small>
                              </span>
                              <h3>{game.title}</h3>
                              <p>{game.objective}</p>
                              <span className="m6-hub-card-foot">
                                {game.slides} ·{" "}
                                {record.completed
                                  ? "Practice complete"
                                  : record.updatedAt
                                    ? "In progress"
                                    : "Start"}{" "}
                                <b>↗</b>
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="kc-section-head">
                      <div>
                        <h2>Module 1 Practice Arcade & 3D Labs</h2>
                        <p>
                          Seven activities ready: Three interactive 3D simulations, animated 3D
                          flashcards, and technical decision missions.
                        </p>
                      </div>
                      <span>3D Sites · Instruments · Defect Lab · Flashcards</span>
                    </div>

                    <div className="arc-game-list">
                      {moduleOneGames.map((game, index) => {
                        const record = readGameRecord(user?.uid ?? "guest", game.id);
                        const hasProgress =
                          record.answers.length > 0 ||
                          Object.keys(record.matches).length > 0 ||
                          Object.keys(record.ratings).length > 0 ||
                          record.cardIndex > 0 ||
                          record.order.join("|") !== "Report|Observation|Document|Assessment";

                        const is3D = game.kind.includes("3D");

                        return (
                          <button
                            type="button"
                            key={game.id}
                            className={`arc-game-card ${is3D ? "is-3d" : ""}`}
                            style={{ animationDelay: `${index * 55}ms` }}
                            onClick={() => {
                              playClick();
                              setGameId(game.id);
                              setScreen("game");
                            }}
                          >
                            <span className="arc-game-index">{index + 1}</span>
                            <div>
                              <div className="arc-game-card-tags">
                                <span className="arc-kind-pill">{game.kind}</span>
                                <span className="arc-time-pill">{game.minutes}</span>
                              </div>
                              <h3>{game.title}</h3>
                              <p>{game.objective}</p>
                              <small>
                                {game.slides} ·{" "}
                                {record.completed
                                  ? "✓ Completed"
                                  : hasProgress
                                    ? "In progress"
                                    : "Not started"}
                              </small>
                            </div>
                            <span className="arc-game-arrow" aria-hidden="true">
                              ↗
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : activeModuleIndex === 5 ? (
              <ModuleSixArcade
                key={moduleSixGameId}
                gameId={moduleSixGameId}
                userId={user?.uid ?? "guest"}
                onBack={() => {
                  playClick();
                  setScreen("arcade");
                }}
              />
            ) : (
              <ModuleOneArcade
                key={gameId}
                gameId={gameId}
                userId={user?.uid ?? "guest"}
                onBack={() => {
                  playClick();
                  setScreen("arcade");
                }}
              />
            )}
          </section>

          <LeaderboardTable
            data={leaderboard}
            courseTitle={
              courses.find((course) => course.id === activeCourseId)?.title ?? "Your course"
            }
          />
        </div>
      </div>

      {/* Badges & Achievements Modal */}
      {showBadges && (
        <div className="kc-modal-overlay" onClick={() => setShowBadges(false)}>
          <div className="kc-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="kc-modal-head">
              <div>
                <h2>Inspector Achievements</h2>
                <p>Collect badges by testing instruments, finding defects, and building streaks!</p>
              </div>
              <button
                type="button"
                className="kc-modal-close"
                onClick={() => setShowBadges(false)}
                aria-label="Close achievements dialog"
              >
                ✕
              </button>
            </div>

            <div className="kc-badges-grid">
              {ACHIEVEMENTS.map((ach) => {
                const unlocked = profile.achievements.includes(ach.id);
                return (
                  <div
                    key={ach.id}
                    className={`kc-badge-card ${unlocked ? "is-unlocked" : "is-locked"}`}
                  >
                    <span className="kc-badge-icon">{ach.icon}</span>
                    <div className="kc-badge-body">
                      <h4>{ach.title}</h4>
                      <p>{ach.description}</p>
                      <small>{unlocked ? "✓ Unlocked (+50 XP)" : "Locked"}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LeaderboardTable({
  data,
  courseTitle,
}: {
  data: Leaderboard | null;
  courseTitle: string;
}) {
  const [sort, setSort] = useState<"rank" | "score" | "streak" | "thisWeek">("rank");
  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])].sort((a, b) =>
        sort === "rank" ? a.rank - b.rank : b[sort] - a[sort] || a.rank - b.rank,
      ),
    [data, sort],
  );
  return (
    <aside className="kc-leaderboard" aria-label="Course leaderboard">
      <div className="kc-leaderboard-head">
        <div>
          <h2>Leaderboard</h2>
          <p>{courseTitle}</p>
        </div>
      </div>
      <p className="kc-leaderboard-basis">
        {data?.basis ?? "Completed lessons and passed module quizzes"}
      </p>
      <div className="kc-table-wrap">
        <table>
          <caption className="sr-only">Course leaderboard ordered by {sort}</caption>
          <thead>
            <tr>
              <th scope="col">
                <button onClick={() => setSort("rank")}>#</button>
              </th>
              <th scope="col">Learner</th>
              <th scope="col">
                <button onClick={() => setSort("score")}>Score</button>
              </th>
              <th scope="col">
                <button onClick={() => setSort("streak")}>Streak</button>
              </th>
              <th scope="col">
                <button onClick={() => setSort("thisWeek")}>This week</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.current ? "is-current" : ""}>
                <td>
                  <span className={`kc-medal kc-medal-${row.rank <= 3 ? row.rank : "other"}`}>
                    {row.rank}
                  </span>
                </td>
                <td>
                  <span className="kc-learner">
                    <span className="kc-avatar" aria-hidden="true">
                      {row.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {row.current ? "You" : `${row.completedLessons} lessons complete`}
                      </small>
                    </span>
                  </span>
                </td>
                <td className="kc-numeric">{row.score.toLocaleString()}</td>
                <td className="kc-numeric">{row.streak ? `${row.streak}d` : "—"}</td>
                <td className="kc-numeric">{row.thisWeek ? `+${row.thisWeek}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data?.rows.length && (
        <div className="kc-leaderboard-empty">
          {data
            ? "No course scores yet. Finish a lesson to take the first place."
            : "Leaderboard loads when you enroll in a course."}
        </div>
      )}
      <p className="kc-leaderboard-foot">
        Only enrolled learners appear. Scores reflect completed lessons and passed course quizzes;
        arcade practice stays on this device.
      </p>
    </aside>
  );
}

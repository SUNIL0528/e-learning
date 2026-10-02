import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import heroLecture from "@/assets/hero-lecture.jpg";
import {
  courses,
  ENABLED_COURSE_ID,
  getLearnerRank,
  recommended,
  student,
  type Status,
} from "@/data/platform";
import { getUserEnrollments, getUserProfile } from "@/lib/progress";
import { getCurrentAuthUser, onAuthStateChanged } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { getTotalLearningSeconds } from "@/lib/learning-time";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Student dashboard — HTS" },
      {
        name: "description",
        content: "Your enrolled courses, progress and the lesson you left off on.",
      },
    ],
  }),
  component: Dashboard,
});

const filters = [
  { key: "all", label: "All" },
  { key: "in-progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "not-started", label: "Not started" },
] as const;

const statusLabel: Record<Status, string> = {
  "in-progress": "In progress",
  completed: "Completed",
  "not-started": "Not started",
};

function Dashboard() {
  const [currentUser, setCurrentUser] = useState(getCurrentAuthUser());
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");
  const [enrollments, setEnrollments] = useState<
    Record<string, { progressPercent: number; status: string }>
  >({});
  const [profileName, setProfileName] = useState(getCurrentAuthUser()?.displayName ?? "");
  const [learningSeconds, setLearningSeconds] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => onAuthStateChanged(setCurrentUser), []);

  useEffect(() => {
    const user = currentUser ?? getCurrentAuthUser();
    if (!user || user.isInstructor) {
      setDataLoading(false);
      return;
    }

    setLearningSeconds(getTotalLearningSeconds(user.uid));

    let cancelled = false;
    void Promise.all([getUserEnrollments(user.uid), getUserProfile(user.uid)])
      .then(([nextEnrollments, profile]) => {
        if (cancelled) return;
        setEnrollments(nextEnrollments);
        setProfileName(profile?.name || user.displayName || "");
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("Unable to load course enrollments", error);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    const refreshLearningTime = () => {
      const user = getCurrentAuthUser();
      if (user && !user.isInstructor) setLearningSeconds(getTotalLearningSeconds(user.uid));
    };
    window.addEventListener("focus", refreshLearningTime);
    return () => window.removeEventListener("focus", refreshLearningTime);
  }, []);

  const enrolledCourses = useMemo(
    () =>
      courses
        .filter((course) => course.id === ENABLED_COURSE_ID && enrollments[course.id])
        .map((course) => {
          const enrollment = enrollments[course.id]!;
          const progress = Math.max(0, Math.min(100, enrollment.progressPercent));
          const status: Status =
            enrollment.status === "completed" || progress >= 100
              ? "completed"
              : progress > 0
                ? "in-progress"
                : "not-started";
          return { ...course, enrolled: true, progress, status };
        }),
    [enrollments],
  );
  const shown = enrolledCourses.filter((course) => filter === "all" || course.status === filter);
  const completed = enrolledCourses.filter((course) => course.status === "completed").length;
  const learningHours = (learningSeconds / 3600).toFixed(1);
  const resume = enrolledCourses[0];
  const firstName = (profileName || "there").split(" ")[0];

  if (currentUser?.isInstructor) return <InstructorDashboard />;

  return (
    <>
      <main>
      <div className="mx-auto flex max-w-[1440px] items-end justify-between gap-6 border-b border-ink/15 px-6 py-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-fog">
            Student dashboard
          </div>
          <h1 className="mt-1 text-4xl font-black leading-[0.85] tracking-tight md:text-5xl">
            Good morning,
            <br />
            {firstName}.
          </h1>
        </div>
        <div className="hidden gap-6 font-mono text-[11px] text-ink/70 sm:flex">
          <div>
            <span className="block text-2xl font-bold text-ink">
              {String(enrolledCourses.length).padStart(2, "0")}
            </span>{" "}
            enrolled
          </div>
          <div>
            <span className="block text-2xl font-bold text-ink">
              {String(completed).padStart(2, "0")}
            </span>{" "}
            completed
          </div>
          <div>
            <span className="block text-2xl font-bold text-ink">{learningHours}</span> hrs
          </div>
          <div>
            <span className="block text-2xl font-bold text-moss">
              {getLearnerRank(enrolledCourses.length)}
            </span>{" "}
            rank
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-[1440px] px-6 py-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="rule-label">Resume</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>

        {resume ? (
          <div className="grid grid-cols-12 gap-3">
            <div className="relative col-span-12 overflow-hidden border-2 border-ink bg-ink text-paper md:col-span-8">
              <img
                src={heroLecture}
                alt="Instructor at a whiteboard"
                width={1280}
                height={720}
                className="absolute inset-0 size-full object-cover opacity-45"
              />
              <div className="relative flex min-h-[220px] flex-col justify-end p-5">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
                  Continue learning · {resume.remaining}
                </span>
                <h2 className="mt-1 text-2xl font-black leading-tight">{resume.title}</h2>
                <p className="mt-1 text-xs text-paper/70">{resume.instructor}</p>
                <Link
                  to="/courses/$courseId"
                  params={{ courseId: resume.id }}
                  className="mt-4 self-start bg-clay px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-paper"
                >
                  Continue learning →
                </Link>
              </div>
            </div>
            <div className="col-span-12 flex flex-col justify-between border-2 border-ink bg-sand p-4 md:col-span-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog">
                Continue next
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {enrolledCourses.slice(1, 3).map((course) => (
                  <Link
                    key={course.id}
                    to="/courses/$courseId"
                    params={{ courseId: course.id }}
                    className="border border-ink/20 bg-paper p-2"
                  >
                    <img
                      src={course.thumb}
                      alt=""
                      loading="lazy"
                      className="mb-1 aspect-[16/9] w-full object-cover"
                    />
                    <div className="text-[11px] font-bold leading-tight">{course.title}</div>
                  </Link>
                ))}
              </div>
              <div className="mt-2 font-mono text-[10px] text-ink/60">
                {enrolledCourses.length > 1
                  ? `${enrolledCourses.length - 1} more enrolled course(s)`
                  : "Enroll in another course to see it here."}
              </div>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-ink/30 bg-paper p-8">
            <div className="rule-label text-clay">Nothing enrolled yet</div>
            <h2 className="mt-2 text-3xl font-black leading-tight">Start your first course.</h2>
            <p className="mt-2 max-w-xl text-sm text-fog">
              Browse the catalogue and enroll in a course to begin tracking your learning.
            </p>
            <Link
              to="/courses"
              className="mt-5 inline-flex bg-ink px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-paper"
            >
              Browse courses →
            </Link>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[1440px] px-6 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="rule-label">Enrolled</span>
          <span className="h-px flex-1 bg-ink/15" />
          <span className="flex gap-2 font-mono text-[10px] uppercase tracking-wider">
            {filters.map((filterOption) => (
              <button
                key={filterOption.key}
                onClick={() => setFilter(filterOption.key)}
                className={
                  filter === filterOption.key
                    ? "bg-ink px-2 py-1 text-paper"
                    : "border border-ink/30 px-2 py-1"
                }
              >
                {filterOption.label}
              </button>
            ))}
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="border border-dashed border-ink/25 bg-paper/60 p-8 text-center font-mono text-[11px] text-fog">
            No enrolled courses match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            {shown.map((course, index) => (
              <Link
                key={course.id}
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="lp col-span-6 overflow-hidden border-2 border-ink bg-paper md:col-span-3"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <img
                  src={course.thumb}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/9] w-full object-cover"
                />
                <div className="p-3">
                  <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-fog">
                    <span>{course.track}</span>
                    <span className="font-bold text-moss">{statusLabel[course.status]}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-black leading-tight">{course.title}</h3>
                  <div className="text-[10px] text-ink/60">
                    {course.instructor} · {course.moduleCount} modules
                  </div>
                  <div className="mt-2 h-1.5 border border-ink/10 bg-sand">
                    <div
                      className={course.progress ? "h-full bg-moss" : "h-full bg-ink/10"}
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-ink/70">
                    <span>{course.progress}%</span>
                    <span>{course.remaining}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {enrolledCourses.length === 0 && (
        <section className="mx-auto max-w-[1440px] px-6 pb-6">
          <div className="border-2 border-dashed border-ink/30 bg-paper/60 p-5">
            <div className="rule-label text-clay">Recommended</div>
            <h2 className="mt-1 text-xl font-black">{recommended.title}</h2>
            <p className="text-sm text-fog">{recommended.reason}</p>
            <Link
              to="/courses"
              className="mt-3 inline-flex border-2 border-ink px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em]"
            >
              Browse catalogue
            </Link>
          </div>
        </section>
      )}
      </main>
      {dataLoading && (
        <LoadingScreen label="Loading your dashboard" detail="Fetching enrollments and progress…" />
      )}
    </>
  );
}

type InstructorDoubtSummary = {
  id: number;
  courseTitle: string;
  title: string;
  status: "pending" | "answered";
  askedAt: string;
  isOverdue: boolean;
  learner: {
    candidateNumber: string;
    name: string;
  };
};

type InstructorDashboardData = {
  stats: {
    totalLearners: number;
    totalEnrollments: number;
    averageProgress: number;
    completedModules: number;
    pendingDoubts: number;
    answeredDoubts: number;
  };
  courses: Array<{
    courseId: string;
    courseTitle: string;
    enrolled: number;
    averageProgress: number;
    completed: number;
    pendingDoubts: number;
  }>;
  recentDoubts: InstructorDoubtSummary[];
};

function InstructorDashboard() {
  const [data, setData] = useState<InstructorDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/instructor/dashboard/")
      .then(async (response) => (await response.json()) as InstructorDashboardData)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="border-2 border-clay bg-paper p-6 text-clay">{error}</div>
      </main>
    );
  }

  if (!data) return <LoadingScreen label="Loading instructor dashboard" detail="Calculating learner progress..." />;

  const metricCards = [
    ["Learners", data.stats.totalLearners],
    ["Enrollments", data.stats.totalEnrollments],
    ["Average progress", `${data.stats.averageProgress}%`],
    ["Completed modules", data.stats.completedModules],
    ["Pending doubts", data.stats.pendingDoubts],
    ["Answered doubts", data.stats.answeredDoubts],
  ] as const;

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="mb-5 border-b border-ink/15 pb-5">
        <div className="rule-label">Instructor dashboard</div>
        <h1 className="mt-2 text-4xl font-black leading-none tracking-tight">Learning at a glance.</h1>
        <p className="mt-2 max-w-2xl text-sm text-fog">
          Monitor enrollment, course progress, and student support from one place.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {metricCards.map(([label, value]) => (
          <div key={label} className="border-2 border-ink bg-paper p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fog">{label}</div>
            <div className="mt-2 text-3xl font-black">{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-12 gap-3">
        <div className="col-span-12 border-2 border-ink bg-paper p-4 lg:col-span-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="rule-label">Course performance</span>
            <span className="h-px flex-1 bg-ink/15" />
          </div>
          {data.courses.length === 0 ? (
            <p className="text-sm text-fog">No enrollments have been created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-ink/15 font-mono text-[10px] uppercase tracking-wider text-fog">
                  <tr>
                    <th className="py-2">Course</th>
                    <th className="py-2 text-right">Learners</th>
                    <th className="py-2 text-right">Progress</th>
                    <th className="py-2 text-right">Completed</th>
                    <th className="py-2 text-right">Doubts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.courses.map((course) => (
                    <tr key={course.courseId} className="border-b border-ink/10 last:border-0">
                      <td className="py-3 font-bold">{course.courseTitle}</td>
                      <td className="py-3 text-right font-mono text-[11px]">{course.enrolled}</td>
                      <td className="py-3 text-right font-mono text-[11px]">{course.averageProgress}%</td>
                      <td className="py-3 text-right font-mono text-[11px]">{course.completed}</td>
                      <td className="py-3 text-right font-mono text-[11px] text-clay">{course.pendingDoubts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="col-span-12 border-2 border-ink bg-moss p-4 text-paper lg:col-span-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/60">Student support</div>
          <div className="mt-2 text-4xl font-black">{data.stats.pendingDoubts}</div>
          <p className="mt-1 text-sm text-paper/75">doubts waiting for an instructor reply.</p>
          <Link
            to="/doubts"
            className="mt-5 inline-flex border border-paper px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Open doubt inbox →
          </Link>
        </div>
      </section>

      <section className="mt-6 border-2 border-ink bg-paper p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="rule-label">Recent student doubts</span>
          <span className="h-px flex-1 bg-ink/15" />
          <Link to="/doubts" className="font-mono text-[10px] uppercase tracking-wider underline">
            View all
          </Link>
        </div>
        {data.recentDoubts.length === 0 ? (
          <p className="text-sm text-fog">No doubts have been raised yet.</p>
        ) : (
          <div className="divide-y divide-ink/10">
            {data.recentDoubts.map((doubt) => (
              <div key={doubt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-bold">{doubt.title}</div>
                  <div className="font-mono text-[10px] text-fog">
                    {doubt.courseTitle} · {doubt.learner.name || doubt.learner.candidateNumber}
                  </div>
                </div>
                <span className={`font-mono text-[10px] uppercase ${doubt.isOverdue ? "text-clay" : "text-fog"}`}>
                  {doubt.isOverdue ? "Overdue" : doubt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <WrittenAnswerReviewPanel />
    </main>
  );
}

type InstructorWrittenAnswer = {
  id: number;
  questionId: string;
  question: string;
  answer: string;
  status: "pending" | "reviewed";
  score: number | null;
  maxScore: number;
  feedback: string;
};

type InstructorWrittenSubmission = {
  submissionId: string;
  courseTitle: string;
  moduleTitle: string;
  submittedAt: string;
  status: "pending" | "reviewed";
  learner: {
    candidateNumber: string;
    name: string;
    email: string;
  };
  answers: InstructorWrittenAnswer[];
};

type WrittenAnswerDraft = {
  score: string;
  feedback: string;
};

function WrittenAnswerReviewPanel() {
  const [submissions, setSubmissions] = useState<InstructorWrittenSubmission[]>([]);
  const [drafts, setDrafts] = useState<Record<number, WrittenAnswerDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSubmissions = () => {
    setLoading(true);
    setError(null);
    void apiFetch("/api/instructor/written-answers/?status=pending")
      .then(async (response) => (await response.json()) as { submissions: InstructorWrittenSubmission[] })
      .then((data) => {
        setSubmissions(data.submissions);
        setDrafts((previous) => {
          const next = { ...previous };
          for (const submission of data.submissions) {
            for (const answer of submission.answers) {
              next[answer.id] ??= {
                score: answer.score === null ? "" : String(answer.score),
                feedback: answer.feedback,
              };
            }
          }
          return next;
        });
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load written answers.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const updateDraft = (answerId: number, patch: Partial<WrittenAnswerDraft>) => {
    setDrafts((previous) => ({
      ...previous,
      [answerId]: {
        score: previous[answerId]?.score ?? "",
        feedback: previous[answerId]?.feedback ?? "",
        ...patch,
      },
    }));
  };

  const reviewSubmission = async (submission: InstructorWrittenSubmission) => {
    setError(null);
    setNotice(null);
    const reviews = submission.answers.map((answer) => ({
      id: answer.id,
      score: Number(drafts[answer.id]?.score),
      feedback: drafts[answer.id]?.feedback ?? "",
    }));
    if (reviews.some((review) => !Number.isInteger(review.score) || review.score < 0 || review.score > 10)) {
      setError("Enter a score from 0 to 10 for every written answer.");
      return;
    }

    setSavingId(submission.submissionId);
    try {
      await apiFetch(`/api/instructor/written-answers/${submission.submissionId}/`, {
        method: "PATCH",
        body: JSON.stringify({ answers: reviews }),
      });
      setSubmissions((previous) => previous.filter((item) => item.submissionId !== submission.submissionId));
      setNotice("Written answers reviewed successfully.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save the review.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="mt-6 border-2 border-ink bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rule-label">Written answer review</span>
        <span className="h-px flex-1 bg-ink/15" />
        <span className="font-mono text-[10px] text-clay">{submissions.length} pending</span>
      </div>
      {error && <div className="mb-3 border border-clay bg-sand p-2 text-sm text-clay">{error}</div>}
      {notice && <div className="mb-3 border border-moss bg-sand p-2 text-sm text-moss">{notice}</div>}
      {loading ? (
        <p className="font-mono text-[11px] text-fog">Loading written submissions...</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-fog">No written answers are waiting for review.</p>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <article key={submission.submissionId} className="border border-ink/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink/10 pb-2">
                <div>
                  <h2 className="font-bold">{submission.moduleTitle || "Module written answers"}</h2>
                  <p className="font-mono text-[10px] text-fog">
                    {submission.courseTitle} · {submission.learner.name || submission.learner.candidateNumber} · {submission.learner.candidateNumber}
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase text-clay">
                  Submitted {new Date(submission.submittedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {submission.answers.map((answer, index) => (
                  <div key={answer.id} className="border border-ink/10 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-fog">
                      Written answer {index + 1} of {submission.answers.length}
                    </div>
                    <p className="mt-1 text-sm font-bold">{answer.question}</p>
                    <p className="mt-2 whitespace-pre-wrap bg-sand/60 p-2 text-sm">{answer.answer}</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-[7rem_1fr]">
                      <label className="font-mono text-[10px] uppercase tracking-wider text-fog">
                        Score / 10
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          value={drafts[answer.id]?.score ?? ""}
                          onChange={(event) => updateDraft(answer.id, { score: event.target.value })}
                          className="mt-1 w-full border border-ink/25 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-ink"
                        />
                      </label>
                      <label className="font-mono text-[10px] uppercase tracking-wider text-fog">
                        Feedback
                        <textarea
                          rows={2}
                          value={drafts[answer.id]?.feedback ?? ""}
                          onChange={(event) => updateDraft(answer.id, { feedback: event.target.value })}
                          placeholder="Explain the score or suggest improvements..."
                          className="mt-1 w-full border border-ink/25 bg-paper px-2 py-2 text-sm font-display normal-case tracking-normal text-ink outline-none focus:border-ink"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void reviewSubmission(submission)}
                disabled={savingId === submission.submissionId}
                className="mt-3 bg-moss px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
              >
                {savingId === submission.submissionId ? "Saving review..." : "Submit review"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

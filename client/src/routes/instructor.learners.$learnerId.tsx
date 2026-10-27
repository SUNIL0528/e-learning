import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { apiFetch } from "@/lib/api";
import type { InstructorCourse, InstructorLearnerDetail, InstructorModule } from "@/lib/instructor";

export const Route = createFileRoute("/instructor/learners/$learnerId")({
  head: () => ({
    meta: [{ title: "Learner details — HTS" }],
  }),
  component: InstructorLearnerDetailPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 border border-ink/15 bg-sand">
        <div
          className="h-full bg-moss"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="font-mono text-[11px]">{value}%</span>
    </div>
  );
}

function ModulePanel({ module }: { module: InstructorModule }) {
  return (
    <article className="border border-ink/15 bg-paper">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 p-4">
        <div>
          <div className="rule-label text-fog">Module</div>
          <h3 className="mt-1 text-lg font-black">{module.title}</h3>
          <div className="mt-1 font-mono text-[10px] text-fog">{module.moduleId}</div>
        </div>
        <div className="text-right">
          <ProgressBar value={module.progressPercent} />
          <div
            className={`mt-2 font-mono text-[10px] uppercase ${module.passed ? "text-moss" : "text-fog"}`}
          >
            {module.score === null
              ? "Quiz not attempted"
              : `Quiz ${module.score}%${module.passed ? " · passed" : ""}`}
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-ink/10 bg-sand/35 p-4 text-xs sm:grid-cols-3">
        <div>
          <span className="block font-mono text-[10px] uppercase text-fog">Module status</span>
          <span className="font-bold">{module.status}</span>
        </div>
        <div>
          <span className="block font-mono text-[10px] uppercase text-fog">Quiz attempts</span>
          <span className="font-bold">{module.attempts}</span>
        </div>
        <div>
          <span className="block font-mono text-[10px] uppercase text-fog">
            Descriptive submissions
          </span>
          <span className="font-bold">{module.descriptiveSubmissions.length}</span>
        </div>
      </div>

      {module.quizAttempts.length > 0 && (
        <div className="border-b border-ink/10 p-4">
          <div className="rule-label text-fog">Quiz history</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {module.quizAttempts.map((attempt, index) => (
              <span
                key={`${attempt.createdAt}-${index}`}
                className={`border px-2 py-1 font-mono text-[10px] ${attempt.passed ? "border-moss text-moss" : "border-clay text-clay"}`}
              >
                Attempt {index + 1}: {attempt.score}% · {attempt.passed ? "passed" : "not passed"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="rule-label text-fog">Descriptive answers</div>
        {module.descriptiveSubmissions.length === 0 ? (
          <p className="mt-3 text-sm text-fog">No descriptive answers submitted for this module.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {module.descriptiveSubmissions.map((submission) => (
              <div key={submission.submissionId} className="border-l-2 border-clay pl-3">
                <div className="flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase text-fog">
                  <span>{submission.status}</span>
                  <span>Submitted {formatDate(submission.submittedAt)}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {submission.answers.map((answer, index) => (
                    <div key={answer.id} className="bg-sand/60 p-3">
                      <div className="font-mono text-[10px] uppercase text-fog">
                        Question {index + 1}
                      </div>
                      <p className="mt-1 text-sm font-bold">{answer.question}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {answer.answer}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink/10 pt-2 font-mono text-[10px] text-fog">
                        <span>
                          {answer.score === null
                            ? "Not scored"
                            : `Score ${answer.score}/${answer.maxScore}`}
                        </span>
                        {answer.feedback && <span>Feedback: {answer.feedback}</span>}
                        {answer.reviewerName && <span>Reviewed by {answer.reviewerName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CoursePanel({ course }: { course: InstructorCourse }) {
  return (
    <section className="border-2 border-ink bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink bg-ink p-4 text-paper">
        <div>
          <div className="rule-label text-paper/60">Course</div>
          <h2 className="mt-1 text-2xl font-black">{course.courseTitle}</h2>
          <div className="mt-1 font-mono text-[10px] text-paper/60">
            {course.courseId} · {course.status}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-paper/60">
            Course progress
          </div>
          <div className="mt-2">
            <ProgressBar value={course.progressPercent} />
          </div>
        </div>
      </div>
      <div className="space-y-3 p-3 md:p-4">
        {course.modules.length === 0 ? (
          <p className="text-sm text-fog">No module activity yet.</p>
        ) : (
          course.modules.map((module) => <ModulePanel key={module.moduleId} module={module} />)
        )}
      </div>
    </section>
  );
}

function InstructorLearnerDetailPage() {
  const { learnerId } = Route.useParams();
  const [data, setData] = useState<InstructorLearnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch(`/api/instructor/learners/${encodeURIComponent(learnerId)}/`)
      .then(async (response) => (await response.json()) as InstructorLearnerDetail)
      .then(setData)
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load learner details.",
        );
      });
  }, [learnerId]);

  if (error) {
    return (
      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="border-2 border-clay bg-paper p-6 text-clay">{error}</div>
      </main>
    );
  }
  if (!data)
    return (
      <LoadingScreen
        label="Loading learner details"
        detail="Collecting module progress and descriptive answers…"
      />
    );

  const learner = data.learner;
  const moduleCount = data.courses.reduce((total, course) => total + course.modules.length, 0);
  const answerCount = data.descriptiveSubmissions.reduce(
    (total, submission) => total + submission.answers.length,
    0,
  );

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-7">
      <Link
        to="/instructor/learners"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog hover:text-ink"
      >
        ← Back to learners
      </Link>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-5 border-b border-ink/15 pb-6">
        <div>
          <div className="rule-label text-clay">Learner profile</div>
          <h1 className="mt-2 text-4xl font-black leading-none tracking-tight md:text-5xl">
            {learner.name || "Unnamed learner"}
          </h1>
          <p className="mt-3 font-mono text-[11px] text-fog">
            {learner.candidateNumber || learner.uid} · {learner.email || "No email"}
          </p>
        </div>
        <div className="max-w-sm text-right text-sm text-fog">
          {[learner.position, learner.company, learner.location].filter(Boolean).join(" · ") ||
            "Profile details not provided"}
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Courses", data.courses.length],
          ["Modules", moduleCount],
          ["Average progress", `${learner.averageProgress}%`],
          ["Written answers", answerCount],
        ].map(([label, value]) => (
          <div key={label} className="border-2 border-ink bg-paper p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fog">{label}</div>
            <div className="mt-2 text-3xl font-black">{value}</div>
          </div>
        ))}
      </section>

      <div className="mt-6 space-y-5">
        {data.courses.length === 0 ? (
          <section className="border-2 border-ink bg-paper p-6 text-sm text-fog">
            No course or module activity is available for this learner.
          </section>
        ) : (
          data.courses.map((course) => (
            <CoursePanel key={`${course.courseId}-${course.status}`} course={course} />
          ))
        )}
      </div>
    </main>
  );
}

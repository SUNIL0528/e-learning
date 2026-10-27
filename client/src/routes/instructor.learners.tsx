import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { apiFetch } from "@/lib/api";
import type { InstructorLearner } from "@/lib/instructor";

export const Route = createFileRoute("/instructor/learners")({
  head: () => ({
    meta: [{ title: "Learners — HTS" }],
  }),
  component: InstructorLearners,
});

function InstructorLearners() {
  const [learners, setLearners] = useState<InstructorLearner[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch("/api/instructor/learners/")
      .then(async (response) => (await response.json()) as InstructorLearner[])
      .then(setLearners)
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load learners.");
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleLearners = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return learners;
    return learners.filter((learner) =>
      [learner.name, learner.email, learner.candidateNumber, learner.company, learner.location]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [learners, search]);

  if (loading) {
    return (
      <LoadingScreen label="Loading learners" detail="Preparing learner records and progress…" />
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-6">
        <div>
          <div className="rule-label text-clay">Instructor workspace</div>
          <h1 className="mt-2 text-4xl font-black leading-none tracking-tight md:text-5xl">
            Learners.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-fog">
            Select a learner to review their course progress, module scores, and descriptive
            answers.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-5 text-right font-mono text-[10px] uppercase tracking-wider text-fog">
          <div>
            <span className="block text-3xl font-black text-ink">{learners.length}</span>
            learner{learners.length === 1 ? "" : "s"}
          </div>
          <div>
            <span className="block text-3xl font-black text-clay">
              {learners.reduce((total, learner) => total + learner.pendingDescriptiveAnswers, 0)}
            </span>
            pending answers
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 border-2 border-clay bg-paper p-4 text-sm text-clay">{error}</div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fog">
          Showing {visibleLearners.length} of {learners.length}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, candidate number…"
          className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm outline-none placeholder:text-fog/70 focus:border-clay sm:w-96"
          aria-label="Search learners"
        />
      </div>

      <div className="overflow-x-auto border-2 border-ink bg-paper">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b-2 border-ink bg-sand font-mono text-[10px] uppercase tracking-wider text-fog">
            <tr>
              <th className="px-4 py-3">Learner</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Courses</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Descriptive answers</th>
              <th className="px-4 py-3 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {visibleLearners.map((learner) => (
              <tr
                key={learner.id}
                className="border-b border-ink/10 last:border-0 hover:bg-sand/40"
              >
                <td className="px-4 py-4">
                  <Link
                    to="/instructor/learners/$learnerId"
                    params={{ learnerId: String(learner.id) }}
                    className="font-bold underline decoration-ink/20 underline-offset-4 hover:text-moss"
                  >
                    {learner.name || "Unnamed learner"}
                  </Link>
                  <div className="mt-1 font-mono text-[10px] text-fog">
                    {learner.candidateNumber || learner.uid}
                  </div>
                </td>
                <td className="px-4 py-4 text-xs text-fog">
                  <div>{learner.email || "No email"}</div>
                  <div className="mt-1">{learner.phone || "Phone not provided"}</div>
                </td>
                <td className="px-4 py-4 font-mono text-xs">{learner.courseCount}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 border border-ink/15 bg-sand">
                      <div
                        className="h-full bg-moss"
                        style={{ width: `${learner.averageProgress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">{learner.averageProgress}%</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-mono text-xs">
                    {learner.descriptiveSubmissionCount} submission
                    {learner.descriptiveSubmissionCount === 1 ? "" : "s"}
                  </div>
                  {learner.pendingDescriptiveAnswers > 0 && (
                    <div className="mt-1 font-mono text-[10px] uppercase text-clay">
                      {learner.pendingDescriptiveAnswers} pending review
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to="/instructor/learners/$learnerId"
                    params={{ learnerId: String(learner.id) }}
                    className="inline-flex bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-paper hover:bg-moss"
                  >
                    View details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleLearners.length === 0 && (
          <div className="p-10 text-center text-sm text-fog">
            {learners.length === 0 ? "No enrolled learners yet." : "No learners match this search."}
          </div>
        )}
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { candidates, forumPosts, type ForumPost } from "@/data/platform";

export const Route = createFileRoute("/forum")({
  head: () => ({
    meta: [
      { title: "Global forum — HTS" },
      {
        name: "description",
        content:
          "Discussion across regions, course study groups, job postings and recruiter talent discovery.",
      },
      { property: "og:title", content: "Global forum — HTS" },
      {
        property: "og:description",
        content: "Discussion, job postings and recruiter talent discovery.",
      },
    ],
  }),
  component: Forum,
});

const tags = ["All", "General", "Course", "Job"] as const;

function LegacyForum() {
  const [tag, setTag] = useState<(typeof tags)[number]>("All");
  const [recruiter, setRecruiter] = useState(false);
  const [posts, setPosts] = useState<ForumPost[]>(forumPosts);
  const [reported, setReported] = useState<string[]>([]);
  const [minLevel, setMinLevel] = useState("All");

  const shown = posts.filter((p) => tag === "All" || p.tag === tag);
  const talent = candidates.filter((c) => minLevel === "All" || c.level === minLevel);

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rule-label">{recruiter ? "Recruiter view" : "Global forum"}</span>
        <span className="h-px flex-1 bg-ink/15" />
        <button
          onClick={() => setRecruiter((r) => !r)}
          className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${
            recruiter ? "bg-moss text-paper" : "border-2 border-ink"
          }`}
        >
          {recruiter ? "Back to discussion" : "Switch to recruiter view"}
        </button>
      </div>

      {recruiter ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2 border-2 border-ink bg-sand p-3">
            <span className="mono-xs text-fog">Filter by skill level</span>
            {["All", "A1", "A2", "B1"].map((l) => (
              <button
                key={l}
                onClick={() => setMinLevel(l)}
                className={`px-2 py-1 font-mono text-[10px] ${
                  minLevel === l ? "bg-ink text-paper" : "border border-ink/30"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-3">
            {talent.map((c) => (
              <article
                key={c.name}
                className="col-span-12 border-2 border-ink bg-paper p-4 md:col-span-6 lg:col-span-4"
              >
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-black leading-tight">{c.name}</h2>
                  <span className="bg-moss px-2 py-0.5 font-mono text-[10px] text-paper">
                    {c.level}
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-fog">
                  {c.region} · {c.certificates} certificates
                </p>
                <p className="mt-2 text-[13px]">
                  Completed: {c.completions.join(", ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <span key={s} className="border border-ink/20 px-2 py-0.5 font-mono text-[10px]">
                      {s}
                    </span>
                  ))}
                </div>
                <button className="mt-3 w-full bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper">
                  Contact candidate
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8">
            <div className="mb-3 flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                    tag === t ? "bg-ink text-paper" : "border border-ink/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {shown.map((p) => (
                <article key={p.id} className="flex gap-3 border-2 border-ink bg-paper p-4">
                  <button
                    onClick={() =>
                      setPosts((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, votes: x.votes + 1 } : x)),
                      )
                    }
                    className="flex w-10 shrink-0 flex-col items-center border border-ink/15 py-1"
                  >
                    <span className="font-mono text-xs font-bold">{p.votes}</span>
                    <span className="text-[10px] text-clay">▲</span>
                  </button>
                  <div className="flex-1">
                    <span
                      className={`font-mono text-[9px] uppercase tracking-widest ${
                        p.tag === "Job" ? "text-clay" : "text-fog"
                      }`}
                    >
                      {p.tag}
                    </span>
                    <h2 className="text-lg font-black leading-tight">{p.title}</h2>
                    <p className="font-mono text-[10px] text-fog">
                      {p.author} · {p.region} · {p.replies} replies
                    </p>
                    <p className="mt-2 text-[13px]">{p.body}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="border border-ink/25 px-2 py-1 font-mono text-[10px] uppercase">
                        Reply
                      </button>
                      <button
                        onClick={() => setReported((r) => [...r, p.id])}
                        className="border border-ink/25 px-2 py-1 font-mono text-[10px] uppercase text-ink/60"
                      >
                        {reported.includes(p.id) ? "Reported" : "Report"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="col-span-12 space-y-3 lg:col-span-4">
            <div className="border-2 border-ink bg-paper p-4">
              <div className="rule-label mb-2">Post a job requirement</div>
              <input
                placeholder="Role title"
                className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              />
              <input
                placeholder="Company · location"
                className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              />
              <textarea
                rows={3}
                placeholder="Requirements — courses, certifications, skill level"
                className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              />
              <button className="w-full bg-clay px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper">
                Publish to forum
              </button>
            </div>
            <div className="flex flex-col justify-between border-2 border-ink bg-moss p-4 text-paper">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/60">
                  Recruiter view
                </div>
                <div className="mt-1 text-xl font-black leading-tight">
                  Talent
                  <br />
                  discovery
                </div>
              </div>
              <div className="mt-3 space-y-1 text-[11px]">
                {candidates.slice(0, 3).map((c) => (
                  <div
                    key={c.name}
                    className="flex justify-between border-b border-paper/20 pb-1 last:border-b-0"
                  >
                    <span>{c.name}</span>
                    <span className="font-mono">{c.level}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setRecruiter(true)}
                className="mt-3 border border-paper py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
              >
                Browse candidates
              </button>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function Forum() {
  return (
    <main className="mx-auto max-w-[900px] px-6 py-10">
      <section className="border-2 border-ink bg-paper p-8">
        <div className="rule-label">Forum unavailable</div>
        <h1 className="mt-2 text-3xl font-black">The forum is temporarily disabled.</h1>
        <p className="mt-3 text-sm text-ink/70">
          Please use Doubts to send course-related questions directly to an instructor.
        </p>
      </section>
    </main>
  );
}

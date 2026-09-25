import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { courses, ENABLED_COURSE_ID, type Status } from "@/data/platform";
import { getUserEnrollments } from "@/lib/progress";
import { getCurrentAuthUser } from "@/lib/auth";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Course catalogue — HTS" },
      {
        name: "description",
        content:
          "Browse every course on HTS — enrolled and available — with instructor, level and lesson count.",
      },
      { property: "og:title", content: "Course catalogue — HTS" },
      {
        property: "og:description",
        content: "Every course available on HTS, not just the ones you are enrolled in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

const tabs = [
  { key: "all", label: "All courses" },
  { key: "enrolled", label: "My courses" },
  { key: "available", label: "Available" },
] as const;

const statusLabel: Record<Status, string> = {
  "in-progress": "In progress",
  completed: "Completed",
  "not-started": "Not started",
};

function CatalogPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [enrollments, setEnrollments] = useState<
    Record<string, { progressPercent: number; status: string }>
  >({});
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const user = getCurrentAuthUser();
    if (!user) {
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    void getUserEnrollments(user.uid)
      .then((nextEnrollments) => {
        if (!cancelled) setEnrollments(nextEnrollments);
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
  }, []);

  const userCourses = useMemo(
    () =>
      courses.map((course) => {
        const enrollment = enrollments[course.id];
        if (!enrollment || course.id !== ENABLED_COURSE_ID) {
          return { ...course, enrolled: false, progress: 0, status: "not-started" as const };
        }

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

  const shown = userCourses.filter((c) => {
    const matchTab = tab === "all" || (tab === "enrolled" ? c.enrolled : !c.enrolled);
    const q = query.trim().toLowerCase();
    const matchQuery =
      !q || c.title.toLowerCase().includes(q) || c.instructor.toLowerCase().includes(q);
    return matchTab && matchQuery;
  });

  return (
    <>
      <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-fog">
            Catalogue
          </div>
          <h1 className="mt-1 text-4xl font-black leading-[0.85] tracking-tight md:text-5xl">
            All courses.
          </h1>
        </div>
        <div className="font-mono text-[11px] text-ink/70">
          <span className="text-2xl font-bold text-ink">1</span> available course ·{" "}
          {userCourses.filter((c) => c.enrolled).length} enrolled
        </div>
      </div>

      <div className="mt-4 mb-3 flex flex-wrap items-center gap-3">
        <span className="flex gap-2 font-mono text-[10px] uppercase tracking-wider">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key ? "bg-ink px-3 py-1.5 text-paper" : "border border-ink/30 px-3 py-1.5"
              }
            >
              {t.label}
            </button>
          ))}
        </span>
        <span className="h-px flex-1 bg-ink/15" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or instructor…"
          className="w-56 border border-ink/30 bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
      </div>

      <div className="grid grid-cols-12 gap-3">
        {shown.map((c, i) => (
          <article
            key={c.id}
            className="lp col-span-12 flex flex-col overflow-hidden border-2 border-ink bg-paper sm:col-span-6 lg:col-span-3"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <img
              src={c.thumb}
              alt=""
              loading="lazy"
              className="aspect-[16/9] w-full object-cover"
            />
            <div className="flex flex-1 flex-col p-3">
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-fog">
                <span>{c.track}</span>
                <span
                  className={
                    c.id !== ENABLED_COURSE_ID
                      ? "font-bold text-fog"
                      : c.enrolled
                        ? "font-bold text-moss"
                        : "font-bold text-clay"
                  }
                >
                  {c.id !== ENABLED_COURSE_ID
                    ? "Unavailable"
                    : c.enrolled
                      ? statusLabel[c.status]
                      : "Open"}
                </span>
              </div>
              <h2 className="mt-1 text-sm font-black leading-tight">{c.title}</h2>
              <div className="text-[10px] text-ink/60">
                {c.instructor} · {c.moduleCount} modules
                {c.lessons ? ` · ${c.lessons} lessons` : ""}
              </div>

              {c.id !== ENABLED_COURSE_ID ? (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-fog">
                  Available soon
                </div>
              ) : c.enrolled ? (
                <div className="mt-2 h-1.5 border border-ink/10 bg-sand">
                  <div
                    className={c.progress ? "h-full bg-moss" : "h-full bg-ink/10"}
                    style={{ width: `${c.progress}%` }}
                  />
                </div>
              ) : (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-fog">
                  {c.level ?? "All levels"} · {c.remaining}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-ink/70">
                  {c.id !== ENABLED_COURSE_ID
                    ? "Locked"
                    : c.enrolled
                      ? `${c.progress}%`
                      : "Free preview"}
                </span>
                {c.id === ENABLED_COURSE_ID ? (
                  <Link
                    to="/courses/$courseId"
                    params={{ courseId: c.id }}
                    className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${
                      c.enrolled ? "bg-ink text-paper" : "border-2 border-ink"
                    }`}
                  >
                    {c.enrolled ? "Continue" : "Enroll"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed border-2 border-ink/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-fog"
                  >
                    Locked
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}

        {shown.length === 0 && (
          <p className="col-span-12 py-10 text-center font-mono text-[11px] text-fog">
            No courses match that search.
          </p>
        )}
      </div>
      </main>
      {dataLoading && (
        <LoadingScreen label="Loading the catalogue" detail="Checking your course progress…" />
      )}
    </>
  );
}

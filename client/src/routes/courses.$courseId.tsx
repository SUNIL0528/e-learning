import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  courses,
  ENABLED_COURSE_ID,
  type Chapter,
  type Module,
  type Question,
} from "@/data/platform";
import { getCurrentAuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { addLearningSeconds } from "@/lib/learning-time";
import {
  chapterMediaPath,
  directS3MediaConfigured,
  getTemporaryMediaUrl,
} from "@/lib/media";
import {
  ensureUserCourseStructure,
  saveChapterProgress,
  saveModuleQuizResult,
  saveSlideProgress,
} from "@/lib/progress";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CaptureProtection } from "@/components/CaptureProtection";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const CAPTIONS_ENABLED = false;

type BackendLanguage = { code: string; name: string };

type BackendSlide = {
  id: string;
  start: number;
  end: number;
  video: string | null;
  audio: Record<string, string | null>;
  captions: Record<string, string>;
};

type BackendChapter = {
  id: string;
  title: string;
  languages: BackendLanguage[];
  video: { filename: string; url: string | null };
  slides: BackendSlide[];
};

type BackendChapterResponse = Omit<BackendChapter, "slides"> & {
  slides: Array<{
    id: string;
    start: number;
    end: number;
    captions?: unknown;
    [languageCode: string]: unknown;
  }>;
};

type PlayerSlide = {
  id: string;
  title: string;
  bullets: string[];
  start?: number;
  end?: number;
  videoUrl: string | null;
  audio: Record<string, string | null>;
  captions: Record<string, string>;
};

type ModuleQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  answer: number;
};

type ModuleDescriptiveQuestion = {
  id: string;
  question: string;
};

type ModuleQuestionSet = {
  module: number;
  mcqs: ModuleQuizQuestion[];
  descriptive: ModuleDescriptiveQuestion[];
};

function normalizeCaptions(value: unknown): Record<string, string> {
  if (typeof value === "string" && value.trim()) return { en: value.trim() };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, text]) => typeof text === "string" && text.trim())
      .map(([language, text]) => [language, (text as string).trim()]),
  );
}

function firstCaption(value: unknown): string {
  return Object.values(normalizeCaptions(value))[0] ?? "";
}

function chapterNumberFromBackendId(backendChapterId: string): number | null {
  const match = /^coating-m(\d+)$/.exec(backendChapterId);
  return match ? Number(match[1]) : null;
}

function audioExtension(languageCode: string): string {
  return languageCode === "en" ? "wav" : "mp3";
}

export const Route = createFileRoute("/courses/$courseId")({
  loader: ({ params }) => {
    if (params.courseId !== ENABLED_COURSE_ID) throw notFound();
    const course = courses.find((c) => c.id === params.courseId);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Course not found — HTS" }, { name: "robots", content: "noindex" }],
      };
    }
    const { course } = loaderData;
    const description = `${course.title} with ${course.instructor} — lessons, chapter Q&A and downloadable slides.`;
    return {
      meta: [
        { title: `${course.title} — HTS` },
        { name: "description", content: description },
        { property: "og:title", content: `${course.title} — HTS` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: CoursePage,
});

function CoursePage() {
  const { course } = Route.useLoaderData();
  const allChapters = useMemo(() => course.modules.flatMap((m) => m.chapters), [course]);
  const [activeId, setActiveId] = useState(
    course.modules[0]?.chapters[0]?.id ?? allChapters[0]!.id,
  );
  const [activeQaModuleId, setActiveQaModuleId] = useState<string | null>(null);
  const [openModules, setOpenModules] = useState<string[]>(course.modules.map((m) => m.id));
  const [moduleSidebarOpen, setModuleSidebarOpen] = useState(true);
  const [tab, setTab] = useState<"qa" | "resources">("qa");
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(
    () => new Set(allChapters.filter((chapter) => chapter.done).map((chapter) => chapter.id)),
  );
  const [passedModules, setPassedModules] = useState<Set<string>>(() => new Set());
  const [savedSlideIndexes, setSavedSlideIndexes] = useState<Record<string, number>>({});
  const [savedHighestSlideIndexes, setSavedHighestSlideIndexes] = useState<Record<string, number>>({});
  const [progressLoading, setProgressLoading] = useState(true);
  const slideSaveQueueRef = useRef(Promise.resolve());

  const active =
    course.modules.flatMap((m) => m.chapters).find((c) => c.id === activeId) ?? allChapters[0]!;
  const activeModule =
    course.modules.find((module) => module.id === activeQaModuleId) ??
    course.modules.find((module) => module.chapters.some((chapter) => chapter.id === active.id)) ??
    course.modules[0];
  const showModuleQuiz = activeQaModuleId !== null && Boolean(activeModule);
  const isModuleUnlocked = (moduleIndex: number) =>
    moduleIndex === 0 || passedModules.has(course.modules[moduleIndex - 1]?.id ?? "");
  const isModuleComplete = (module: (typeof course.modules)[number]) =>
    module.chapters.every((chapter) => completedChapters.has(chapter.id));
  const courseProgress = Math.round(
    (completedChapters.size / Math.max(1, allChapters.length)) * 100,
  );
  const completeChapter = (chapterId: string) => {
    const nextCompleted = new Set(completedChapters).add(chapterId);
    setCompletedChapters(nextCompleted);

    const user = getCurrentAuthUser();
    if (!user || !activeModule) return;

    const completedModuleChapters = activeModule.chapters.filter((chapter) =>
      nextCompleted.has(chapter.id),
    ).length;
    const completedCourseChapters = allChapters.filter((chapter) =>
      nextCompleted.has(chapter.id),
    ).length;

    void saveChapterProgress({
      userId: user.uid,
      courseId: course.id,
      moduleId: activeModule.id,
      chapterId,
      moduleProgressPercent: Math.round(
        (completedModuleChapters / Math.max(1, activeModule.chapters.length)) * 100,
      ),
      courseProgressPercent: Math.round(
        (completedCourseChapters / Math.max(1, allChapters.length)) * 100,
      ),
    }).catch((error: unknown) => {
      console.error("Unable to save chapter progress", error);
    });
  };
  const passModule = (moduleId: string) => {
    setPassedModules((previous) => new Set(previous).add(moduleId));
  };

  useEffect(() => {
    const user = getCurrentAuthUser();
    if (!user) {
      setProgressLoading(false);
      return;
    }

    let cancelled = false;
    void ensureUserCourseStructure(user, course)
      .then((savedProgress) => {
        if (cancelled) return;
        setCompletedChapters((previous) => {
          const next = new Set(previous);
          Object.entries(savedProgress.chapters).forEach(([chapterId, progress]) => {
            if (progress.completed) next.add(chapterId);
          });
          return next;
        });
        setPassedModules(
          new Set(
            Object.entries(savedProgress.modules)
              .filter(([, progress]) => progress.qaPassed)
              .map(([moduleId]) => moduleId),
          ),
        );
        setSavedSlideIndexes(
          Object.fromEntries(
            Object.entries(savedProgress.chapters).map(([chapterId, progress]) => [
              chapterId,
              progress.currentSlideIndex,
            ]),
          ),
        );
        setSavedHighestSlideIndexes(
          Object.fromEntries(
            Object.entries(savedProgress.chapters).map(([chapterId, progress]) => [
              chapterId,
              progress.highestCompletedSlideIndex ?? progress.currentSlideIndex,
            ]),
          ),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("Unable to load course progress", error);
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [course]);

  useEffect(() => {
    const user = getCurrentAuthUser();
    if (!user) return;

    let visible = document.visibilityState === "visible";
    let lastTick = performance.now();
    let pendingSeconds = 0;

    const flushTime = (force = false) => {
      const now = performance.now();
      if (visible) pendingSeconds += Math.max(0, Math.floor((now - lastTick) / 1000));
      lastTick = now;
      if (pendingSeconds < 30 && !force) return;
      addLearningSeconds(user.uid, course.id, pendingSeconds);
      pendingSeconds = 0;
    };

    const handleVisibilityChange = () => {
      flushTime(true);
      visible = document.visibilityState === "visible";
      lastTick = performance.now();
    };
    const interval = window.setInterval(() => flushTime(), 30_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      flushTime(true);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [course.id]);

  const saveCurrentSlide = (
    chapter: Chapter,
    slideIndex: number,
    slideId: string,
    completed = false,
    completedSlideIndex?: number,
  ) => {
    const user = getCurrentAuthUser();
    const module = course.modules.find((candidate) =>
      candidate.chapters.some((candidateChapter) => candidateChapter.id === chapter.id),
    );
    if (!user || !module) return;

    slideSaveQueueRef.current = slideSaveQueueRef.current
      .catch(() => undefined)
      .then(() =>
        saveSlideProgress({
          userId: user.uid,
          courseId: course.id,
          moduleId: module.id,
          chapterId: chapter.id,
          currentSlideIndex: slideIndex,
          currentSlideId: slideId,
          completed,
          completedSlideIndex,
        }),
      )
      .catch((error: unknown) => {
        console.error("Unable to save slide progress", error);
      });
  };

  const handleModuleQuizResult = (moduleId: string, score: number, passed: boolean) => {
    if (passed) passModule(moduleId);

    const user = getCurrentAuthUser();
    if (!user) return;
    void saveModuleQuizResult({
      userId: user.uid,
      courseId: course.id,
      moduleId,
      score,
      passed,
    }).catch((error: unknown) => {
      console.error("Unable to save module quiz result", error);
    });
  };

  return (
    <>
      <main className="mx-auto max-w-[1440px] px-3 py-4 sm:px-6 sm:py-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-ink/15 pb-3 sm:gap-3">
        <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog">
          ← Dashboard
        </Link>
        <span className="h-px flex-1 bg-ink/15" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog">
          {course.instructor} · {courseProgress}% complete
        </span>
      </div>

      <h1 className="text-3xl font-black leading-[0.9] tracking-tight sm:text-4xl">
        {course.title}
      </h1>

      <button
        type="button"
        onClick={() => setModuleSidebarOpen((open) => !open)}
        aria-expanded={moduleSidebarOpen}
        className="mt-4 flex w-full items-center justify-between border-2 border-ink bg-paper px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
      >
        <span>Course modules</span>
        <span aria-hidden="true">{moduleSidebarOpen ? "−" : "+"}</span>
      </button>

      <div className="mt-3 grid min-w-0 grid-cols-12 gap-3 sm:mt-4">
        <section className={`col-span-12 min-w-0 ${moduleSidebarOpen ? "lg:col-span-8" : "lg:col-span-12"}`}>
          {showModuleQuiz && activeModule ? (
            <ModuleQuiz
              module={activeModule}
              moduleNumber={course.modules.indexOf(activeModule) + 1}
              moduleComplete={isModuleComplete(activeModule)}
              passed={passedModules.has(activeModule.id)}
              onResult={(score, passed) => handleModuleQuizResult(activeModule.id, score, passed)}
            />
          ) : (
            <>
              <VideoPlayer
                chapter={active}
                chapterCompleted={completedChapters.has(active.id)}
                onComplete={() => completeChapter(active.id)}
                initialSlideIndex={savedSlideIndexes[active.id]}
                highestCompletedSlideIndex={savedHighestSlideIndexes[active.id]}
                onSlideProgress={(slideIndex, slideId, completed, completedSlideIndex) =>
                  saveCurrentSlide(
                    active,
                    slideIndex,
                    slideId,
                    completed,
                    completedSlideIndex,
                  )
                }
                backendChapterId={
                  course.id === "coating-inspection" && activeModule
                    ? `coating-m${course.modules.indexOf(activeModule) + 1}`
                    : undefined
                }
              />

              <div className="mt-3 flex gap-2 border-b-2 border-ink">
                {(
                  [
                    ["qa", `Q&A · ${active.questions.length}`],
                    ["resources", "Resources · PPT"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] ${
                      tab === key ? "bg-ink text-paper" : "text-ink/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "qa" ? (
                <CourseDoubtSection
                  courseId={course.id}
                  courseTitle={course.title}
                  moduleId={activeModule?.id ?? ""}
                  moduleTitle={activeModule?.title ?? "Module doubt"}
                />
              ) : (
                <Resources
                  courseId={course.id}
                  moduleNumber={activeModule ? course.modules.indexOf(activeModule) + 1 : 1}
                />
              )}
            </>
          )}
        </section>

        {moduleSidebarOpen && (
        <aside className="course-modules-sidebar col-span-12 min-w-0 border-2 border-ink bg-paper p-3 sm:p-4 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="rule-label">Modules</div>
            <button
              type="button"
              onClick={() => setModuleSidebarOpen(false)}
              className="border border-ink/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink/70 hover:bg-sand hover:text-ink"
              aria-label="Collapse course modules"
            >
              Hide
            </button>
          </div>
          <div className="space-y-3">
            {course.modules.map((m, moduleIndex) => {
              const open = openModules.includes(m.id);
              const unlocked = isModuleUnlocked(moduleIndex);
              const complete = isModuleComplete(m);
              const passed = passedModules.has(m.id);
              return (
                <div key={m.id} className={`border border-ink/15 ${unlocked ? "" : "opacity-60"}`}>
                  <button
                    disabled={!unlocked}
                    onClick={() =>
                      setOpenModules((prev) =>
                        prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                      )
                    }
                    className="flex w-full items-center justify-between bg-sand px-3 py-2 text-left text-[11px] font-bold"
                  >
                    <span className="flex items-center gap-2">
                      {!unlocked && <span aria-label="Locked">🔒</span>}
                      {m.title}
                    </span>
                    <span className="font-mono text-[10px] text-fog">{open ? "–" : "+"}</span>
                  </button>
                  {open && unlocked && (
                    <div className="divide-y divide-ink/10">
                      {m.chapters.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setActiveId(c.id);
                            setActiveQaModuleId(null);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${
                            c.id === active.id ? "bg-ink text-paper" : ""
                          }`}
                        >
                          <span
                            className={
                              completedChapters.has(c.id)
                                ? "font-mono text-[10px] text-moss"
                                : "font-mono text-[10px] text-fog"
                            }
                          >
                            {c.done ? "✓" : "○"}
                          </span>
                          <span className="flex-1 font-medium leading-tight">{c.title}</span>
                          <span className="font-mono text-[10px] opacity-60">{c.duration}</span>
                        </button>
                      ))}
                      <button
                        disabled={!complete}
                        onClick={() => {
                          setActiveQaModuleId(m.id);
                          setTab("qa");
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${
                          activeQaModuleId === m.id ? "bg-ink text-paper" : ""
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="font-mono text-[10px] text-clay">
                          {passed ? "Passed" : complete ? "○" : "🔒"}
                        </span>
                        <span className="flex-1 font-medium">Q&amp;A</span>
                        <span className="font-mono text-[10px] opacity-60">
                          {passed ? "Passed" : complete ? "15 MCQs + 5 written" : "Finish videos"}
                        </span>
                      </button>
                    </div>
                  )}
                  {!unlocked && (
                    <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fog">
                      Pass the previous module Q&amp;A with 75%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        )}
      </div>
      </main>
      {progressLoading && (
        <LoadingScreen label="Loading your course" detail="Restoring your progress…" />
      )}
      <CaptureProtection />
    </>
  );
}

function VideoPlayer({
  chapter,
  chapterCompleted,
  onComplete,
  initialSlideIndex,
  highestCompletedSlideIndex,
  onSlideProgress,
  backendChapterId,
}: {
  chapter: Chapter;
  chapterCompleted?: boolean;
  onComplete?: () => void;
  initialSlideIndex?: number;
  highestCompletedSlideIndex?: number;
  onSlideProgress?: (
    slideIndex: number,
    slideId: string,
    completed?: boolean,
    completedSlideIndex?: number,
  ) => void;
  backendChapterId?: string;
}) {
  return (
    <SlideVideoPlayer
      chapter={chapter}
      chapterCompleted={chapterCompleted}
      onComplete={onComplete}
      initialSlideIndex={initialSlideIndex}
      highestCompletedSlideIndex={highestCompletedSlideIndex}
      onSlideProgress={onSlideProgress}
      backendChapterId={backendChapterId}
    />
  );
}

function LegacyVideoPlayer({ chapter }: { chapter: Chapter }) {
  const audioLanguages = [
    { code: "en", label: "English" },
    { code: "zh", label: "Chinese" },
  ] as const;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1×");
  const [captions, setCaptions] = useState(true);
  const [audioLanguage, setAudioLanguage] = useState<(typeof audioLanguages)[number]["code"]>("en");
  // step 0..slides.length-1 shows slides; the final step shows the video
  const [step, setStep] = useState(0);

  // reset the deck when the chapter changes
  const [seen, setSeen] = useState(chapter.id);
  if (seen !== chapter.id) {
    setSeen(chapter.id);
    setStep(0);
    setPlaying(false);
    setAudioLanguage("en");
  }

  const total = chapter.slides.length;
  const onVideo = step >= total;
  const slide = chapter.slides[Math.min(step, total - 1)];
  const selectedAudio = audioLanguages.find(({ code }) => code === audioLanguage)!;

  return (
    <div className="border-2 border-ink bg-ink text-paper">
      <div className="relative grid aspect-video place-items-center overflow-hidden">
        {onVideo ? (
          <div className="text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
              Now playing
            </div>
            <div className="mt-1 max-w-[30ch] text-xl font-black leading-tight">
              {chapter.title}
            </div>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-paper/60">
              Audio track - {selectedAudio.label}
            </div>
            {captions && (
              <div className="mx-auto mt-4 max-w-[36ch] bg-ink/70 px-2 py-1 text-[12px] text-paper/80">
                “…and that is why the posterior, not the p-value, is what we report.”
              </div>
            )}
          </div>
        ) : (
          slide && (
            <div key={step} className="lp size-full bg-paper p-8 text-left text-ink">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
                Slide {step + 1} of {total}
              </div>
              <h3 className="mt-2 max-w-[24ch] text-2xl font-black leading-tight md:text-3xl">
                {slide.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {slide.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm md:text-base">
                    <span className="font-mono text-[11px] text-moss">▸</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {/* deck navigation */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            aria-label="Previous slide"
            className={`grid size-9 place-items-center border-2 border-ink bg-paper text-ink ${
              step === 0 ? "opacity-30" : ""
            }`}
          >
            ←
          </button>
          <div className="flex gap-1">
            {chapter.slides.map((s, i) => (
              <span
                key={s.title + i}
                className={`h-1.5 w-6 ${i <= step ? "bg-clay" : "bg-ink/20"} ${
                  onVideo ? "opacity-60" : ""
                }`}
              />
            ))}
            <span className={`h-1.5 w-6 ${onVideo ? "bg-moss" : "bg-ink/20"}`} />
          </div>
          <button
            onClick={() => {
              if (onVideo) return;
              const next = step + 1;
              setStep(next);
              if (next >= total) setPlaying(true);
            }}
            disabled={onVideo}
            aria-label={step === total - 1 ? "Play video" : "Next slide"}
            className={`flex items-center gap-2 border-2 border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${
              onVideo ? "bg-paper/40 text-ink/50" : "bg-clay text-paper"
            }`}
          >
            {onVideo ? "Video playing" : step === total - 1 ? "Play video →" : "Next →"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-paper/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <button
          onClick={() => {
            if (!onVideo) setStep(total);
            setPlaying((p) => (onVideo ? !p : true));
          }}
          className="bg-clay px-3 py-1 text-paper"
        >
          {onVideo && playing ? "Pause" : "Play"}
        </button>
        <div className="h-1 flex-1 bg-paper/20">
          <div
            className="h-full bg-paper/80"
            style={{ width: onVideo ? (playing ? "42%" : "18%") : `${(step / total) * 100}%` }}
          />
        </div>
        <span>{onVideo ? chapter.duration : `Slide ${step + 1}/${total}`}</span>
        <button
          onClick={() => setSpeed(speed === "1×" ? "1.5×" : speed === "1.5×" ? "2×" : "1×")}
          className="border border-paper/40 px-2 py-0.5"
        >
          {speed}
        </button>
        <button
          onClick={() => setCaptions((c) => !c)}
          className={`border border-paper/40 px-2 py-0.5 ${captions ? "bg-paper text-ink" : ""}`}
        >
          CC
        </button>
        <label className="flex items-center gap-2 border border-paper/40 px-2 py-0.5 text-paper">
          <span className="text-paper/60">Audio</span>
          <select
            value={audioLanguage}
            onChange={(event) => setAudioLanguage(event.target.value as typeof audioLanguage)}
            aria-label="Audio language"
            className="max-w-[92px] cursor-pointer bg-transparent text-paper outline-none"
          >
            {audioLanguages.map((language) => (
              <option key={language.code} value={language.code} className="bg-ink text-paper">
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <button className="border border-paper/40 px-2 py-0.5">⛶</button>
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function CandidateWatermark({ light = false }: { light?: boolean } = {}) {
  const candidateNumber = getCurrentAuthUser()?.username;
  if (!candidateNumber) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden" aria-hidden="true">
      <div
        className={
          light
            ? "text-left font-display text-[clamp(1.1rem,2.8vw,2.5rem)] font-black uppercase leading-[0.85] tracking-[0.03em] text-ink/20 [text-shadow:0_1px_2px_rgba(255,255,255,0.25)]"
            : "text-left font-display text-[clamp(1.1rem,2.8vw,2.5rem)] font-black uppercase leading-[0.85] tracking-[0.03em] text-paper/20 [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]"
        }
      >
        <span className="mt-1 block">{candidateNumber}</span>
      </div>
    </div>
  );
}

function BackendVideoPlayer({
  chapter,
  backendChapterId,
}: {
  chapter: Chapter;
  backendChapterId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentSlideRef = useRef<BackendSlide | null>(null);
  const loadedAudioKeyRef = useRef<string | null>(null);
  const audioLanguageRef = useRef("en");
  const isSeekingRef = useRef(false);
  const [backendChapter, setBackendChapter] = useState<BackendChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSlide, setCurrentSlide] = useState<BackendSlide | null>(null);
  const [captionsVisible, setCaptionsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    const audio = audioRef.current;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}/api/chapter/${backendChapterId}/?media=client`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter request failed (${response.status})`);
        return (await response.json()) as BackendChapterResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const initialLanguage = data.languages[0]?.code ?? "en";
        audioLanguageRef.current = initialLanguage;
        currentSlideRef.current = null;
        setCurrentSlide(null);
        loadedAudioKeyRef.current = null;

        setBackendChapter({
          ...data,
          slides: data.slides.map((slide) => ({
            id: slide.id,
            start: slide.start,
            end: slide.end,
            video: typeof slide.video === "string" ? slide.video : null,
            audio: Object.fromEntries(
              data.languages.map((language) => [
                language.code,
                typeof slide[language.code] === "string" ? slide[language.code] : null,
              ]),
            ),
            captions: normalizeCaptions(slide.captions),
          })),
        });
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load media");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      video?.pause();
      audio?.pause();
    };
  }, [backendChapterId]);

  const findSlide = useCallback(
    (time: number) =>
      backendChapter?.slides.find((slide) => time >= slide.start && time < slide.end) ?? null,
    [backendChapter],
  );

  const loadSlideAudio = useCallback(
    async (slide: BackendSlide, language: string, videoTime: number, shouldPlay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;

      const source = slide.audio[language];
      if (!source) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        loadedAudioKeyRef.current = null;
        return;
      }

      const audioKey = `${slide.id}_${language}`;
      const audioOffset = Math.max(0, videoTime - slide.start);
      const alreadyLoaded = loadedAudioKeyRef.current === audioKey;

      if (!alreadyLoaded) {
        audio.pause();
        loadedAudioKeyRef.current = audioKey;
        audio.src = source;
        audio.preload = "auto";
        audio.playbackRate = speed;
        audio.load();

        await new Promise<void>((resolve) => {
          if (audio.readyState >= 1) {
            resolve();
            return;
          }

          const handleMetadata = () => {
            audio.removeEventListener("loadedmetadata", handleMetadata);
            resolve();
          };

          audio.addEventListener("loadedmetadata", handleMetadata, { once: true });
        });
      }

      if (loadedAudioKeyRef.current !== audioKey) return;

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const safeOffset = Math.min(Math.max(0, audioOffset), Math.max(0, audio.duration - 0.05));
        try {
          audio.currentTime = safeOffset;
        } catch {
          // The browser can reject a seek while a new source is loading.
        }
      }

      if (shouldPlay) {
        try {
          await audio.play();
        } catch {
          // Playback can be blocked until the user interacts with the page.
        }
      }
    },
    [speed],
  );

  const synchronizeAudio = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const slide = currentSlideRef.current;
    if (!video || !audio || !slide || !Number.isFinite(audio.duration)) return;

    const expectedTime = Math.max(0, video.currentTime - slide.start);
    const safeTime = Math.min(expectedTime, Math.max(0, audio.duration - 0.05));
    if (Math.abs(audio.currentTime - safeTime) > 0.35) {
      try {
        audio.currentTime = safeTime;
      } catch {
        // Ignore seek errors while media is buffering.
      }
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !backendChapter) return;

    const handleSeeking = () => {
      isSeekingRef.current = true;
      audioRef.current?.pause();
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      if (isSeekingRef.current) return;

      const slide = findSlide(time);
      if (slide && currentSlideRef.current?.id !== slide.id) {
        currentSlideRef.current = slide;
        setCurrentSlide(slide);
        void loadSlideAudio(slide, audioLanguageRef.current, time, !video.paused);
      }

      synchronizeAudio();
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      const slide = findSlide(video.currentTime);
      if (slide) {
        currentSlideRef.current = slide;
        setCurrentSlide(slide);
        void loadSlideAudio(slide, audioLanguageRef.current, video.currentTime, false);
      }
    };

    const handlePlay = () => {
      setPlaying(true);
      const slide = currentSlideRef.current ?? findSlide(video.currentTime);
      if (slide) {
        currentSlideRef.current = slide;
        setCurrentSlide(slide);
        void loadSlideAudio(slide, audioLanguageRef.current, video.currentTime, true);
      }
    };

    const handlePause = () => {
      setPlaying(false);
      audioRef.current?.pause();
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
      const slide = findSlide(video.currentTime);
      if (!slide) return;

      currentSlideRef.current = slide;
      setCurrentSlide(slide);
      void loadSlideAudio(slide, audioLanguageRef.current, video.currentTime, !video.paused);
    };

    const handleEnded = () => {
      setPlaying(false);
      audioRef.current?.pause();
    };

    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("ended", handleEnded);
    };
  }, [backendChapter, findSlide, loadSlideAudio, synchronizeAudio]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) audioRef.current.muted = nextMuted;
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const percentage = (event.clientX - bounds.left) / bounds.width;
    video.currentTime = Math.max(0, Math.min(duration, percentage * duration));
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || duration, video.currentTime + seconds),
    );
  };

  const changeSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  return (
    <div className="border-2 border-ink bg-ink text-paper">
      <div className="relative grid aspect-video place-items-center overflow-hidden bg-black">
        {loading ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/70">
            Loading module 1 video...
          </div>
        ) : backendChapter?.video.url ? (
          <video
            ref={videoRef}
            src={backendChapter.video.url}
            className="size-full object-contain"
            preload="auto"
            playsInline
            muted
            onClick={togglePlayback}
          />
        ) : (
          <div className="px-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-clay">
            {error ?? "Video URL is not available"}
          </div>
        )}
        <CandidateWatermark />
        {captionsVisible && firstCaption(currentSlide?.captions) && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[85%] -translate-x-1/2 bg-black/80 px-3 py-2 text-center text-sm text-white shadow-lg">
            {firstCaption(currentSlide?.captions)}
          </div>
        )}
      </div>

      <audio ref={audioRef} preload="auto" className="hidden" />

      <div className="flex flex-wrap items-center gap-3 border-t border-paper/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <button onClick={togglePlayback} className="bg-clay px-3 py-1 text-paper">
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => seekBy(-10)}
          className="border border-paper/40 px-2 py-0.5"
          aria-label="Back 10 seconds"
        >
          −10s
        </button>
        <button
          onClick={() => seekBy(10)}
          className="border border-paper/40 px-2 py-0.5"
          aria-label="Forward 10 seconds"
        >
          +10s
        </button>
        <div
          className="h-1 min-w-[80px] flex-1 cursor-pointer bg-paper/20"
          onClick={handleSeek}
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
        >
          <div
            className="h-full bg-paper/80"
            style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
          />
        </div>
        <span>
          {formatTime(currentTime)} / {duration ? formatTime(duration) : chapter.duration}
        </span>
        <button onClick={changeSpeed} className="border border-paper/40 px-2 py-0.5">
          {speed}x
        </button>
        <button onClick={toggleMute} className="border border-paper/40 px-2 py-0.5">
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={() => setCaptionsVisible((visible) => !visible)}
          disabled={!CAPTIONS_ENABLED || !firstCaption(currentSlide?.captions)}
          className={`border border-paper/40 px-2 py-0.5 disabled:opacity-30 ${captionsVisible ? "bg-paper text-ink" : ""}`}
          aria-label="Toggle captions"
        >
          CC
        </button>
        <button className="border border-paper/40 px-2 py-0.5" aria-label="Fullscreen">
          FS
        </button>
      </div>
      {error && (
        <div className="border-t border-paper/20 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-clay">
          Module 1 media unavailable
        </div>
      )}
    </div>
  );
}

function SlideVideoPlayer({
  chapter,
  chapterCompleted = false,
  onComplete,
  initialSlideIndex,
  highestCompletedSlideIndex: initialHighestCompletedSlideIndex,
  onSlideProgress,
  backendChapterId,
}: {
  chapter: Chapter;
  chapterCompleted?: boolean;
  onComplete?: () => void;
  initialSlideIndex?: number;
  highestCompletedSlideIndex?: number;
  onSlideProgress?: (
    slideIndex: number,
    slideId: string,
    completed?: boolean,
    completedSlideIndex?: number,
  ) => void;
  backendChapterId?: string;
}) {
  const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioLanguageRef = useRef("en");
  const loadedAudioKeyRef = useRef<string | null>(null);
  const audioRequestIdRef = useRef(0);
  const playbackRequestIdRef = useRef(0);
  const mediaUrlRequestIdRef = useRef(0);
  const seekingRef = useRef(false);
  const advancingRef = useRef(false);
  const autoplayNextRef = useRef(false);
  const videoRetryRef = useRef<string | null>(null);
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const [backendChapter, setBackendChapter] = useState<BackendChapter | null>(null);
  const [loading, setLoading] = useState(Boolean(backendChapterId));
  const [mediaLoading, setMediaLoading] = useState(Boolean(backendChapterId));
  const [error, setError] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [highestCompletedSlideIndex, setHighestCompletedSlideIndex] = useState(-1);
  const [slideComplete, setSlideComplete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const [contentZoom, setContentZoom] = useState<(typeof ZOOM_STEPS)[number]>(1);
  const [captionsVisible, setCaptionsVisible] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<{
    slideId: string | null;
    source: string | null;
  }>({ slideId: null, source: null });

  const cancelPendingAudio = useCallback(() => {
    audioRequestIdRef.current += 1;
    playbackRequestIdRef.current += 1;
    loadedAudioKeyRef.current = null;
    setAudioLoading(false);

    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const video = videoRef.current;
    setBackendChapter(null);
    setError(null);
    setLoading(Boolean(backendChapterId));

    if (!backendChapterId) return;

    fetch(`${API_BASE_URL}/api/chapter/${backendChapterId}/?media=cloudfront`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter request failed (${response.status})`);
        return (await response.json()) as BackendChapterResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const initialLanguage = data.languages[0]?.code ?? "en";
        audioLanguageRef.current = initialLanguage;

        const initialSlides = data.slides.map((slide) => ({
          id: slide.id,
          start: slide.start,
          end: slide.end,
          video: typeof slide.video === "string" ? slide.video : null,
          audio: Object.fromEntries(
            data.languages.map((language) => [
              language.code,
              typeof slide[language.code] === "string" ? slide[language.code] : null,
            ]),
          ) as Record<string, string | null>,
          captions: normalizeCaptions(slide.captions),
        }));

        setBackendChapter({
          ...data,
          video: {
            ...data.video,
            url: typeof data.video?.url === "string" ? data.video.url : null,
          },
          slides: initialSlides,
        });
      })
      .catch((requestError: unknown) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load media");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      cancelPendingAudio();
      video?.pause();
    };
  }, [backendChapterId, cancelPendingAudio]);

  const slides = useMemo<PlayerSlide[]>(
    () =>
      backendChapter
        ? backendChapter.slides.map((slide) => ({
            id: slide.id,
            title: `Slide ${slide.id.replace("slide_", "")}`,
            bullets: [],
            start: slide.start,
            end: slide.end,
            videoUrl: slide.video,
            audio: slide.audio,
            captions: slide.captions,
          }))
        : chapter.slides.map((slide, index) => ({
            id: `${chapter.id}-${index}`,
            title: slide.title,
            bullets: slide.bullets,
            videoUrl: null,
            audio: {},
            captions: {},
          })),
    [backendChapter, chapter],
  );

  const activeSlide = slides[slideIndex] ?? slides[0];
  const chapterVideoUrl = backendChapter?.video.url ?? null;
  const activeVideoSource = activeSlide?.videoUrl ?? chapterVideoUrl;
  const videoSource = mediaTarget.slideId === activeSlide?.id ? mediaTarget.source : null;
  const usesChapterSegment = Boolean(activeSlide?.videoUrl === null && chapterVideoUrl);
  const segmentStart = usesChapterSegment ? (activeSlide?.start ?? 0) : 0;
  const segmentEnd = usesChapterSegment ? (activeSlide?.end ?? 0) : duration;

  useEffect(() => {
    if (!activeSlide) {
      setMediaTarget({ slideId: null, source: null });
      setMediaLoading(false);
      return;
    }

    setMediaLoading(Boolean(activeVideoSource));

    // A fast sequence of Prev/Next clicks should mount only the final video
    // source. This prevents the browser from starting a request for every
    // intermediate slide before the user settles on one.
    const timer = window.setTimeout(() => {
      setMediaTarget({ slideId: activeSlide.id, source: activeVideoSource });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeSlide, activeVideoSource]);

  useEffect(() => {
    videoRetryRef.current = null;
  }, [activeSlide?.id]);

  const refreshActiveVideoUrl = useCallback(async () => {
    const chapterNumber = chapterNumberFromBackendId(backendChapterId ?? "");
    if (!directS3MediaConfigured || chapterNumber === null || !activeSlide) return false;

    const freshUrl = await getTemporaryMediaUrl(
      chapterMediaPath(chapterNumber, "en", "videos", `${activeSlide.id}.mp4`),
      false,
      true,
    );
    if (!freshUrl) return false;

    setBackendChapter((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        slides: previous.slides.map((slide) =>
          slide.id === activeSlide.id ? { ...slide, video: freshUrl } : slide,
        ),
      };
    });
    return true;
  }, [activeSlide?.id, backendChapterId]);

  useEffect(() => {
    if (!directS3MediaConfigured || !backendChapter || !activeSlide) return;

    const chapterNumber = chapterNumberFromBackendId(backendChapterId);
    if (chapterNumber === null) return;

    const requestId = ++mediaUrlRequestIdRef.current;
    const slideId = activeSlide.id;
    const resolveActiveMedia = async () => {
      let chapterUrl = backendChapter.video.url;
      let slideVideoUrl = activeSlide.videoUrl;
      let audioUrl = activeSlide.audio.en ?? null;

      if (!chapterUrl && backendChapter.video.filename) {
        chapterUrl = await getTemporaryMediaUrl(
          chapterMediaPath(chapterNumber, "en", "videos", backendChapter.video.filename),
        );
      }

      if (!slideVideoUrl && !chapterUrl) {
        slideVideoUrl = await getTemporaryMediaUrl(
          chapterMediaPath(chapterNumber, "en", "videos", `${slideId}.mp4`),
        );
      }

      if (!audioUrl) {
        audioUrl = await getTemporaryMediaUrl(
          chapterMediaPath(chapterNumber, "en", "audios", `${slideId}.${audioExtension("en")}`),
        );
      }

      if (requestId !== mediaUrlRequestIdRef.current) return;

      setBackendChapter((previous) => {
        if (!previous) return previous;

        const nextVideo =
          previous.video.url === chapterUrl
            ? previous.video
            : { ...previous.video, url: chapterUrl };
        let changed = nextVideo !== previous.video;
        const nextSlides = previous.slides.map((slide) => {
          if (slide.id !== slideId) return slide;

          const nextSlide = {
            ...slide,
            video: slide.video ?? slideVideoUrl,
            audio: { ...slide.audio, en: slide.audio.en ?? audioUrl },
          };
          if (nextSlide.video !== slide.video || nextSlide.audio.en !== slide.audio.en) {
            changed = true;
          }
          return changed ? nextSlide : slide;
        });

        if (!changed) return previous;
        return {
          ...previous,
          video: nextVideo,
          slides: nextSlides,
        };
      });
    };

    void resolveActiveMedia();
    return () => {
      mediaUrlRequestIdRef.current += 1;
    };
  }, [activeSlide, backendChapter, backendChapterId]);

  const findAudioSource = (slide: PlayerSlide, language: string) => slide.audio[language] ?? null;

  const persistSlideProgress = useCallback(
    (index: number, completed = false, completedSlideIndex?: number) => {
      const slide = slides[index];
      if (slide) onSlideProgress?.(index, slide.id, completed, completedSlideIndex);
    },
    [onSlideProgress, slides],
  );

  const loadSlideAudio = useCallback(
    async (
      slide: PlayerSlide,
      language: string,
      videoTime: number,
      shouldPlay: boolean,
      forceSeek = true,
    ) => {
      const audio = audioRef.current;
      if (!audio) return;

      const requestId = ++audioRequestIdRef.current;
      const isCurrentRequest = () => audioRequestIdRef.current === requestId;

      const source = findAudioSource(slide, language);
      const audioKey = `${slide.id}_${language}`;
      if (!source) {
        const missingAudioKey = `${audioKey}_missing`;
        if (loadedAudioKeyRef.current !== missingAudioKey) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
          loadedAudioKeyRef.current = missingAudioKey;
        }
        return;
      }

      const offset = Math.max(0, usesChapterSegment ? videoTime - (slide.start ?? 0) : videoTime);
      const needsSource = loadedAudioKeyRef.current !== audioKey;
      if (needsSource) {
        audio.pause();
        loadedAudioKeyRef.current = audioKey;
        audio.src = source;
        // Do not download audio while the user is only browsing paused slides.
        audio.preload = shouldPlay ? "auto" : "none";
        audio.playbackRate = speed;
        if (!shouldPlay) return;
      }

      if (shouldPlay && audio.readyState < 3) {
        audio.preload = "auto";
        audio.load();

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            audio.removeEventListener("canplay", finish);
            audio.removeEventListener("error", finish);
            audio.removeEventListener("abort", finish);
            audio.removeEventListener("emptied", finish);
            resolve();
          };

          const timeoutId = window.setTimeout(finish, 15_000);
          audio.addEventListener("canplay", finish);
          audio.addEventListener("error", finish);
          audio.addEventListener("abort", finish);
          audio.addEventListener("emptied", finish);
          if (audio.readyState >= 3) finish();
        });
      }

      if (!isCurrentRequest() || loadedAudioKeyRef.current !== audioKey) return;
      if ((needsSource || forceSeek) && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(offset, Math.max(0, audio.duration - 0.05));
      }
      if (shouldPlay && audio.paused) {
        try {
          await audio.play();
        } catch {
          // Browser autoplay policy may delay playback until user interaction.
        }
      }
    },
    [speed, usesChapterSegment],
  );

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // A slide change mounts a new video element, so explicitly carry the
    // selected playback speed over to both synchronized media elements.
    video.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;

    const requestId = ++playbackRequestIdRef.current;
    const slide = activeSlide;
    const source = slide ? findAudioSource(slide, audioLanguageRef.current) : null;

    if (source) setAudioLoading(true);
    try {
      if (slide && source) {
        await loadSlideAudio(slide, audioLanguageRef.current, video.currentTime, true);
      }

      if (playbackRequestIdRef.current !== requestId || videoRef.current !== video) return;
      await video.play();
    } catch {
      // Browser autoplay policy or a media error can reject playback.
    } finally {
      if (playbackRequestIdRef.current === requestId) setAudioLoading(false);
    }
  }, [activeSlide, loadSlideAudio, speed]);

  const syncAudio = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const slide = activeSlide;
    if (!video || !audio || !slide || audio.readyState < 2 || !Number.isFinite(audio.duration)) return;

    const expectedTime = Math.max(
      0,
      usesChapterSegment ? video.currentTime - (slide.start ?? 0) : video.currentTime,
    );
    const safeTime = Math.min(expectedTime, Math.max(0, audio.duration - 0.05));
    if (Math.abs(audio.currentTime - safeTime) > 0.35) audio.currentTime = safeTime;
  }, [activeSlide, usesChapterSegment]);

  const advanceSlide = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    const resumeIndex = Math.min(slides.length - 1, slideIndex + 1);
    persistSlideProgress(resumeIndex, true, slideIndex);
    setHighestCompletedSlideIndex((highest) => Math.max(highest, slideIndex));
    setPlaying(false);
    setSlideComplete(true);
    cancelPendingAudio();
    if (slideIndex === slides.length - 1) onComplete?.();
  }, [cancelPendingAudio, onComplete, persistSlideProgress, slideIndex, slides.length]);

  useEffect(() => {
    if (!slides.length || initialSlideIndex === undefined) return;
    setSlideIndex(Math.min(slides.length - 1, Math.max(0, initialSlideIndex)));
  }, [initialSlideIndex, slides.length]);

  useEffect(() => {
    setSlideIndex(initialSlideIndex ?? 0);
    setHighestCompletedSlideIndex(
      initialHighestCompletedSlideIndex ?? initialSlideIndex ?? -1,
    );
    setSlideComplete(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    cancelPendingAudio();
  }, [
    backendChapterId,
    chapter.id,
    cancelPendingAudio,
    initialHighestCompletedSlideIndex,
    initialSlideIndex,
  ]);

  useEffect(() => {
    advancingRef.current = false;
    setSlideComplete(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeed(1);
    if (videoRef.current) videoRef.current.playbackRate = 1;
    if (audioRef.current) audioRef.current.playbackRate = 1;
    cancelPendingAudio();
  }, [activeSlide?.id, cancelPendingAudio, videoSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSlide || !backendChapter) return;
    const start = usesChapterSegment ? (activeSlide.start ?? 0) : 0;
    if (Number.isFinite(start)) video.currentTime = start;
  }, [activeSlide, backendChapter, usesChapterSegment]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isFullscreen);
      setFullscreenControlsVisible(!isFullscreen);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fullscreen && fullscreenControlsTimerRef.current !== null) {
      window.clearTimeout(fullscreenControlsTimerRef.current);
      fullscreenControlsTimerRef.current = null;
    }

    return () => {
      if (fullscreenControlsTimerRef.current !== null) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
        fullscreenControlsTimerRef.current = null;
      }
    };
  }, [fullscreen]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const handleLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    video.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
    const slideDuration = usesChapterSegment
      ? Math.max(0, (activeSlide?.end ?? video.duration) - (activeSlide?.start ?? 0))
      : video.duration;
    setDuration(slideDuration);
    if (usesChapterSegment && activeSlide?.start !== undefined)
      video.currentTime = activeSlide.start;
    if (autoplayNextRef.current) {
      autoplayNextRef.current = false;
      void startPlayback();
    }
  };

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const relativeTime = usesChapterSegment
      ? Math.max(0, video.currentTime - (activeSlide?.start ?? 0))
      : video.currentTime;
    setCurrentTime(relativeTime);

    if (
      usesChapterSegment &&
      activeSlide?.end !== undefined &&
      video.currentTime >= activeSlide.end - 0.05
    ) {
      video.pause();
      advanceSlide();
      return;
    }

    if (!seekingRef.current && activeSlide) {
      const audioKey = `${activeSlide.id}_${audioLanguageRef.current}`;
      if (findAudioSource(activeSlide, audioLanguageRef.current) && loadedAudioKeyRef.current !== audioKey) {
        void loadSlideAudio(activeSlide, audioLanguageRef.current, video.currentTime, !video.paused);
      }
      syncAudio();
    }
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    video.currentTime = usesChapterSegment
      ? (activeSlide?.start ?? 0) + ratio * duration
      : ratio * duration;
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const minimum = usesChapterSegment ? (activeSlide?.start ?? 0) : 0;
    const maximum = usesChapterSegment ? (activeSlide?.end ?? video.duration) : video.duration;
    video.currentTime = Math.max(minimum, Math.min(maximum, video.currentTime + seconds));
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void startPlayback();
    } else {
      playbackRequestIdRef.current += 1;
      video.pause();
      audioRef.current?.pause();
    }
  };

  const changeSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  };

  const revealFullscreenControls = useCallback(() => {
    if (!fullscreen) return;

    setFullscreenControlsVisible(true);
    if (fullscreenControlsTimerRef.current !== null) {
      window.clearTimeout(fullscreenControlsTimerRef.current);
    }
    fullscreenControlsTimerRef.current = window.setTimeout(() => {
      setFullscreenControlsVisible(false);
      fullscreenControlsTimerRef.current = null;
    }, 2500);
  }, [fullscreen]);

  const changeZoom = (direction: -1 | 1) => {
    setContentZoom((current) => {
      const currentIndex = ZOOM_STEPS.indexOf(current);
      const nextIndex = Math.min(
        ZOOM_STEPS.length - 1,
        Math.max(0, currentIndex + direction),
      );
      return ZOOM_STEPS[nextIndex] ?? 1;
    });
  };

  const previousSlide = () => {
    if (slideIndex === 0) return;
    cancelPendingAudio();
    autoplayNextRef.current = true;
    setSlideComplete(false);
    setSlideIndex((index) => Math.max(0, index - 1));
  };

  const nextSlide = () => {
    cancelPendingAudio();
    if (!activeSlide?.videoUrl && !chapterVideoUrl) {
      const resumeIndex = Math.min(slides.length - 1, slideIndex + 1);
      persistSlideProgress(resumeIndex, true, slideIndex);
      setHighestCompletedSlideIndex((highest) => Math.max(highest, slideIndex));
      setSlideComplete(true);
      if (slideIndex === slides.length - 1) onComplete?.();
      setSlideIndex(resumeIndex);
    } else if (
      slideComplete ||
      chapterCompleted ||
      highestCompletedSlideIndex >= slideIndex
    ) {
      const nextIndex = Math.min(slides.length - 1, slideIndex + 1);
      autoplayNextRef.current = nextIndex !== slideIndex;
      setSlideIndex(nextIndex);
      setSlideComplete(false);
      persistSlideProgress(nextIndex);
    }
  };

  const jumpToSlide = (index: number) => {
    const lastAccessibleSlide = Math.max(0, highestCompletedSlideIndex + 1);
    if (index < 0 || index >= slides.length || (!chapterCompleted && index > lastAccessibleSlide)) return;

    if (index === slideIndex) {
      autoplayNextRef.current = false;
      void startPlayback();
      return;
    }

    cancelPendingAudio();
    autoplayNextRef.current = true;
    setSlideComplete(false);
    setSlideIndex(index);
    persistSlideProgress(index);
  };

  const handleVideoError = () => {
    setMediaLoading(false);
    if (!activeSlide || !videoSource) return;

    // A failed signed URL gets one refresh only. Without this guard, a
    // browser/S3 error can cause the media element to retry indefinitely.
    if (videoRetryRef.current === activeSlide.id) {
      setError("Unable to load this video. Please reload the slide.");
      return;
    }

    videoRetryRef.current = activeSlide.id;
    setMediaLoading(true);
    void refreshActiveVideoUrl().then((refreshed) => {
      if (!refreshed) {
        setMediaLoading(false);
        setError("Unable to load this video. Please reload the slide.");
      } else {
        setError(null);
      }
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={revealFullscreenControls}
      onTouchStart={revealFullscreenControls}
      className={`course-video-player border-2 border-ink bg-ink text-paper ${
        fullscreen && !fullscreenControlsVisible ? "fullscreen-controls-hidden" : ""
      }`}
    >
      <div className="course-video-player__media relative grid aspect-video place-items-center overflow-hidden bg-black">
        {loading ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/70">
            Loading slide videos...
          </div>
        ) : videoSource ? (
          <video
            key={`${activeSlide?.id}-${videoSource}`}
            ref={videoRef}
            src={videoSource}
            className="size-full object-contain"
            style={{ transform: `scale(${contentZoom})` }}
            preload="metadata"
            playsInline
            muted
            onClick={togglePlayback}
            onLoadStart={() => setMediaLoading(true)}
            onCanPlay={() => setMediaLoading(false)}
            onWaiting={() => setMediaLoading(true)}
            onPlaying={() => setMediaLoading(false)}
            onError={handleVideoError}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => {
              setPlaying(true);
            }}
            onPause={() => {
              playbackRequestIdRef.current += 1;
              setPlaying(false);
              audioRef.current?.pause();
            }}
            onSeeking={() => {
              seekingRef.current = true;
              audioRef.current?.pause();
            }}
            onSeeked={() => {
              seekingRef.current = false;
              if (activeSlide && videoRef.current) {
                void loadSlideAudio(
                  activeSlide,
                  audioLanguageRef.current,
                  videoRef.current.currentTime,
                  !videoRef.current.paused,
                );
              }
            }}
            onEnded={advanceSlide}
          />
        ) : activeSlide ? (
          <div
            className="size-full bg-paper p-8 text-left text-ink"
            style={{ transform: `scale(${contentZoom})` }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
              Slide {slideIndex + 1} of {slides.length} - video pending
            </div>
            <h3 className="mt-2 max-w-[24ch] text-2xl font-black leading-tight md:text-3xl">
              {activeSlide.title}
            </h3>
            <ul className="mt-4 space-y-2">
              {activeSlide.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-sm md:text-base">
                  <span className="font-mono text-[11px] text-moss">&gt;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
            No slides available
          </div>
        )}
        {(mediaLoading || audioLoading) && activeVideoSource && !loading && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/60">
            <div className="flex flex-col items-center gap-3 text-center text-paper">
              <div className="relative size-10" aria-hidden="true">
                <div className="loading-orbit absolute inset-0 border-2 border-paper/70 border-t-transparent" />
                <div className="loading-core absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 bg-clay" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                Loading video…
              </span>
            </div>
          </div>
        )}
        {videoSource && <CandidateWatermark />}
        {captionsVisible && firstCaption(activeSlide?.captions) && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[85%] -translate-x-1/2 bg-black/80 px-3 py-2 text-center text-sm text-white shadow-lg">
            {firstCaption(activeSlide?.captions)}
          </div>
        )}
        {activeSlide && videoSource && (
          <div className="pointer-events-none absolute left-3 top-3 bg-ink/75 px-2 py-1 font-mono text-[10px] uppercase tracking-wider">
            Slide {slideIndex + 1} / {slides.length}
          </div>
        )}
      </div>

      <div className="slide-navigator border-t border-paper/20 px-3 py-2" aria-label="Slide navigator">
        <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/60">
          <span>Slides</span>
          <span>Tap a completed slide to review</span>
        </div>
        <div className="slide-navigator__scroller flex gap-2 overflow-x-auto pb-1">
          {slides.map((slide, index) => {
            const accessible = chapterCompleted || index <= Math.max(0, highestCompletedSlideIndex + 1);
            const selected = index === slideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                disabled={!accessible}
                onClick={() => jumpToSlide(index)}
                className={`slide-navigator__item min-w-24 shrink-0 border px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-wider transition-colors ${
                  selected
                    ? "border-paper bg-paper text-ink"
                    : accessible
                      ? "border-paper/30 text-paper hover:border-paper hover:bg-paper/10"
                      : "cursor-not-allowed border-paper/10 text-paper/30"
                }`}
                aria-label={`${accessible ? "Open" : "Locked"} slide ${index + 1}`}
              >
                <span className="block font-bold">{String(index + 1).padStart(2, "0")}</span>
                <span className="mt-0.5 block truncate normal-case tracking-normal">
                  {slide.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <audio ref={audioRef} preload="none" className="hidden" />

      <div className="course-video-player__controls space-y-2 border-t border-paper/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={togglePlayback}
            disabled={!videoSource}
            className="order-1 bg-clay px-3 py-1 text-paper disabled:opacity-40"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => seekBy(-10)}
            disabled={!videoSource}
            className="order-3 border border-paper/40 px-2 py-0.5 disabled:opacity-30"
            aria-label="Back 10 seconds"
          >
            -10s
          </button>
          <button
            onClick={() => seekBy(10)}
            disabled={!videoSource}
            className="order-2 border border-paper/40 px-2 py-0.5 disabled:opacity-30"
            aria-label="Forward 10 seconds"
          >
            +10s
          </button>
          <div
            className="order-4 h-1 min-w-[80px] flex-1 cursor-pointer bg-paper/20"
            onClick={handleSeek}
            role="slider"
            aria-label="Slide video progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
          >
            <div
              className="h-full bg-paper/80"
              style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
            />
          </div>
          <span className="order-5">
            {formatTime(currentTime)} / {duration ? formatTime(duration) : "0:00"}
          </span>
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-3 sm:min-h-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMuted((value) => !value)}
              className="border border-paper/40 px-2 py-1"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={changeSpeed} className="border border-paper/40 px-2 py-1">
              {speed}x
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            <button
              onClick={previousSlide}
              disabled={slideIndex === 0}
              className="min-w-20 border-2 border-paper/60 px-5 py-2 text-xs font-bold disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={nextSlide}
              disabled={
                slideIndex === slides.length - 1 ||
                Boolean(
                  videoSource &&
                    !slideComplete &&
                    !chapterCompleted &&
                    highestCompletedSlideIndex < slideIndex,
                )
              }
              className="min-w-20 border-2 border-paper/60 px-5 py-2 text-xs font-bold disabled:opacity-30"
            >
              Next
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 border border-paper/40 px-1 py-1">
              <span className="px-1 text-paper/60">Zoom</span>
              <button
                onClick={() => changeZoom(-1)}
                disabled={contentZoom === ZOOM_STEPS[0]}
                className="px-1 disabled:opacity-30"
                aria-label="Zoom out"
                title="Zoom out"
              >
                -
              </button>
              <button
                onClick={() => setContentZoom(1)}
                className="min-w-[3.5rem] border-x border-paper/30 px-1"
                aria-label={`Reset zoom to 100 percent; current zoom is ${Math.round(contentZoom * 100)} percent`}
                title="Reset zoom"
              >
                {Math.round(contentZoom * 100)}%
              </button>
              <button
                onClick={() => changeZoom(1)}
                disabled={contentZoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                className="px-1 disabled:opacity-30"
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
            <button
              onClick={() => setCaptionsVisible((visible) => !visible)}
              disabled={!CAPTIONS_ENABLED || !firstCaption(activeSlide?.captions)}
              className={`border border-paper/40 px-2 py-1 disabled:opacity-30 ${captionsVisible ? "bg-paper text-ink" : ""}`}
              aria-label="Toggle captions"
            >
              CC
            </button>
            <button
              onClick={toggleFullscreen}
              className="border border-paper/40 px-2 py-1"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              [ ]
            </button>
        </div>
      </div>
      </div>
      <div className="border-t border-paper/20 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-paper/60">
        {slideComplete && slideIndex === slides.length - 1
          ? "Module complete"
          : `Slide ${slideIndex + 1} of ${slides.length} - click Next to continue`}
      </div>
      {error && (
        <div className="border-t border-paper/20 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-clay">
          Backend media unavailable - showing slide preview
        </div>
      )}
    </div>
  );
}

function getModuleQuiz(module: Module): ModuleQuizQuestion[] {
  if (module.title.includes("Foundations")) {
    return [
      {
        id: `${module.id}-mcq-1`,
        question: "What does Bayesian inference update as new data arrives?",
        options: ["A prior belief", "A file format", "A video duration", "A UI color"],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-2`,
        question: "What is the posterior distribution?",
        options: [
          "The prior before seeing data",
          "The updated belief after combining prior and likelihood",
          "The sample size only",
          "The experiment title",
        ],
        answer: 1,
      },
      {
        id: `${module.id}-mcq-3`,
        question: "What does the likelihood describe?",
        options: [
          "How plausible the observed data is under a parameter value",
          "The learner's progress percentage",
          "The number of course slides",
          "A guaranteed future result",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-4`,
        question: "Which statement best describes a prior?",
        options: [
          "A belief or information specified before observing the current data",
          "The final business decision",
          "A video playback speed",
          "A randomly chosen answer",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-5`,
        question: "What does a credible interval describe?",
        options: [
          "A range containing a parameter with a stated posterior probability",
          "A guaranteed range for every future observation",
          "The number of experiment variants",
          "The length of an audio track",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-6`,
        question: "In an A/B test, what is usually compared?",
        options: [
          "Two or more variants using an outcome metric",
          "Two video players only",
          "Two unrelated courses",
          "Two audio languages",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-7`,
        question: "Why should the prior be made explicit?",
        options: [
          "It makes assumptions visible and reviewable",
          "It removes the need for data",
          "It guarantees a winning variant",
          "It skips the analysis",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-8`,
        question: "What is the main danger of confusing a p-value with a posterior probability?",
        options: [
          "They answer different probability questions",
          "They always have identical meanings",
          "The p-value is a video timestamp",
          "The posterior probability ignores data",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-9`,
        question: "What should be checked before trusting a model result?",
        options: [
          "The assumptions, data quality, and interpretation",
          "Only the font size",
          "Only the length of the video",
          "Whether every answer is option A",
        ],
        answer: 0,
      },
      {
        id: `${module.id}-mcq-10`,
        question: "What is the best way to report an experiment result?",
        options: [
          "State the estimate, uncertainty, assumptions, and decision context",
          "Report only the largest number",
          "Hide the uncertainty",
          "Report a result without describing the metric",
        ],
        answer: 0,
      },
    ];
  }

  return [
    "What is the main objective of this module?",
    "Which action should come first when applying the module's ideas?",
    "What is the strongest sign that a learner understands the material?",
    "Why are assumptions important in this module?",
    "What should be checked before trusting a result?",
    "Which approach best supports a clear, repeatable workflow?",
    "What is a common mistake to avoid?",
    "How should an unexpected result be handled?",
    "What should be included when explaining a decision?",
    "How can the module's ideas be applied in practice?",
  ].map((question, index) => ({
    id: `${module.id}-mcq-${index + 1}`,
    question,
    options: [
      "Skip the context and act immediately",
      "Review the relevant concepts and assumptions",
      "Use an unrelated result",
      "Avoid checking the outcome",
    ],
    answer: 1,
  }));
}

function LegacyModuleQuiz({
  module,
  moduleComplete,
  passed,
  onResult,
}: {
  module: Module;
  moduleComplete: boolean;
  passed: boolean;
  onResult: (score: number, passed: boolean) => void;
}) {
  const questions = useMemo(() => getModuleQuiz(module), [module]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    setAnswers({});
    setScore(null);
  }, [module.id]);

  const submitQuiz = () => {
    if (Object.keys(answers).length !== questions.length || passed) return;
    const correctAnswers = questions.filter((question) => answers[question.id] === question.answer);
    const percentage = Math.round((correctAnswers.length / questions.length) * 100);
    setScore(percentage);
    onResult(percentage, percentage >= 75);
  };

  if (!moduleComplete) {
    return (
      <div className="border-2 border-ink bg-paper p-6">
        <div className="rule-label">Q&amp;A locked</div>
        <h2 className="mt-2 text-2xl font-black">Finish every video in {module.title}</h2>
        <p className="mt-2 text-sm text-ink/70">
          Complete all chapter videos before taking the 10-question module assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-ink bg-paper p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-3">
        <div>
          <div className="rule-label">Module Q&amp;A · 10 MCQs</div>
          <h2 className="mt-2 text-2xl font-black">{module.title}</h2>
        </div>
        {passed && (
          <span className="bg-moss px-2 py-1 font-mono text-[10px] text-paper">PASSED</span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((question, questionIndex) => (
          <fieldset key={question.id} className="border border-ink/15 p-3">
            <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-fog">
              Question {questionIndex + 1} of {questions.length}
            </legend>
            <p className="mt-1 text-sm font-bold">{question.question}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-start gap-2 border border-ink/10 p-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === optionIndex}
                    disabled={passed}
                    onChange={() => {
                      setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }));
                      setScore(null);
                    }}
                    className="mt-0.5"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={submitQuiz}
          disabled={passed || Object.keys(answers).length !== questions.length}
          className="bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
        >
          Submit answers
        </button>
        {score !== null && (
          <span className={`font-mono text-[11px] ${score >= 75 ? "text-moss" : "text-clay"}`}>
            Score: {score}% {score >= 75 ? "— next module unlocked" : "— 75% required, try again"}
          </span>
        )}
      </div>
    </div>
  );
}

function ModuleQuiz({
  module,
  moduleNumber,
  moduleComplete,
  passed,
  onResult,
}: {
  module: Module;
  moduleNumber: number;
  moduleComplete: boolean;
  passed: boolean;
  onResult: (score: number, passed: boolean) => void;
}) {
  const [questionSet, setQuestionSet] = useState<ModuleQuestionSet | null>(null);
  const [loading, setLoading] = useState(moduleComplete);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQuestionSet(null);
    setAnswers({});
    setWrittenAnswers({});
    setScore(null);
    setLoadError(null);

    if (!moduleComplete) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void fetch(
      `${API_BASE_URL}/api/course/coating-inspection/module/${moduleNumber}/questions/`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Question request failed (${response.status})`);
        return (await response.json()) as ModuleQuestionSet;
      })
      .then((data) => {
        if (!cancelled) setQuestionSet(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load questions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [moduleComplete, moduleNumber]);

  const submitQuiz = () => {
    if (!questionSet || passed || !questionSet.mcqs.length) return;
    if (
      Object.keys(answers).length !== questionSet.mcqs.length ||
      questionSet.descriptive.some((question) => !writtenAnswers[question.id]?.trim())
    )
      return;

    const correctAnswers = questionSet.mcqs.filter(
      (question) => answers[question.id] === question.answer,
    );
    const percentage = Math.round((correctAnswers.length / questionSet.mcqs.length) * 100);
    setScore(percentage);
    onResult(percentage, percentage >= 75);
  };

  if (!moduleComplete) {
    return (
      <div className="border-2 border-ink bg-paper p-6">
        <div className="rule-label">Q&amp;A locked</div>
        <h2 className="mt-2 text-2xl font-black">Finish every video in {module.title}</h2>
        <p className="mt-2 text-sm text-ink/70">
          Complete all chapter videos before taking the 15-question module assessment.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border-2 border-ink bg-paper p-6">
        <div className="rule-label">Module Q&amp;A</div>
        <h2 className="mt-2 text-2xl font-black">Generating questions from the module</h2>
        <p className="mt-2 text-sm text-ink/70">Loading 15 MCQs and 5 written questions...</p>
      </div>
    );
  }

  if (loadError || !questionSet) {
    return (
      <div className="border-2 border-ink bg-paper p-6">
        <div className="rule-label">Module Q&amp;A unavailable</div>
        <p className="mt-2 text-sm text-clay">{loadError ?? "No questions were generated."}</p>
      </div>
    );
  }

  const questions = questionSet.mcqs;
  const descriptiveQuestions = questionSet.descriptive;
  const allWrittenAnswered = descriptiveQuestions.every(
    (question) => Boolean(writtenAnswers[question.id]?.trim()),
  );
  const allAnswersSelected = Object.keys(answers).length === questions.length;
  const showCorrectAnswers = passed || (score !== null && score >= 75);

  return (
    <div className="border-2 border-ink bg-paper p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-3">
        <div>
          <div className="rule-label">Module Q&amp;A · 15 MCQs + 5 written</div>
          <h2 className="mt-2 text-2xl font-black">{module.title}</h2>
        </div>
        {passed && (
          <span className="bg-moss px-2 py-1 font-mono text-[10px] text-paper">PASSED</span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((question, questionIndex) => (
          <fieldset key={question.id} className="border border-ink/15 p-3">
            <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-fog">
              Question {questionIndex + 1} of {questions.length}
            </legend>
            <p className="mt-1 text-sm font-bold">{question.question}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-2 border p-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-sand ${
                    showCorrectAnswers && optionIndex === question.answer
                      ? "border-moss bg-moss/10"
                      : "border-ink/10"
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === optionIndex}
                    disabled={passed}
                    onChange={() => {
                      setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }));
                      setScore(null);
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex-1">{option}</span>
                  {showCorrectAnswers && optionIndex === question.answer && (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-moss">
                      Correct
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-6 border-t-2 border-ink pt-4">
        <div className="rule-label">Written responses · 5 questions</div>
        <p className="mt-1 text-sm text-ink/70">
          Explain your reasoning in your own words. These responses are not auto-graded.
        </p>
        <div className="mt-3 space-y-3">
          {descriptiveQuestions.map((question, questionIndex) => (
            <label key={question.id} className="block border border-ink/15 p-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fog">
                Written question {questionIndex + 1} of {descriptiveQuestions.length}
              </span>
              <span className="mt-1 block text-sm font-bold">{question.question}</span>
              <textarea
                value={writtenAnswers[question.id] ?? ""}
                disabled={passed}
                onChange={(event) =>
                  setWrittenAnswers((previous) => ({
                    ...previous,
                    [question.id]: event.target.value,
                  }))
                }
                rows={4}
                className="mt-2 w-full resize-y border border-ink/20 bg-paper p-2 text-sm outline-none focus:border-ink disabled:opacity-60"
                placeholder="Write your answer here..."
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={submitQuiz}
          disabled={passed || !allAnswersSelected || !allWrittenAnswered}
          className="bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
        >
          Submit assessment
        </button>
        {score !== null && (
          <span className={`font-mono text-[11px] ${score >= 75 ? "text-moss" : "text-clay"}`}>
            MCQ score: {score}% {score >= 75 ? "— next module unlocked" : "— 75% required, try again"}
          </span>
        )}
      </div>
    </div>
  );
}

function getModuleQuestions(module: Module): Question[] {
  const existingQuestions = module.chapters.flatMap((chapter) => chapter.questions);
  const chapterNames = module.chapters.map((chapter) => chapter.title);
  const generatedQuestions = [
    `What is the main objective of ${module.title}?`,
    `Which idea from ${chapterNames[0] ?? "the first chapter"} should be understood first?`,
    `How would you explain ${chapterNames[1] ?? "the next chapter"} in your own words?`,
    "What assumptions should be checked before applying the ideas in this module?",
    "Which example from the lessons best demonstrates the main concept?",
    "What is the most common mistake learners make in this module?",
    "How could these ideas be applied to a real project or workplace problem?",
    "What would change if one of the key inputs or assumptions were different?",
    "Which result or decision from this module needs the most careful interpretation?",
    "What is one follow-up question you would ask the instructor about this module?",
  ].map((body, index) => ({
    id: `${module.id}-starter-${index + 1}`,
    author: "Course team",
    body,
    votes: 0,
    answers: [],
  }));

  return [...existingQuestions, ...generatedQuestions].slice(0, 10);
}

function ModuleQaSection({ module }: { module: Module }) {
  const starterQuestions = useMemo(() => getModuleQuestions(module), [module]);
  const [questions, setQuestions] = useState<Question[]>(starterQuestions);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setQuestions(starterQuestions);
    setDraft("");
  }, [starterQuestions]);

  return (
    <section className="mt-3 border-2 border-ink bg-paper p-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ink/15 pb-3">
        <div>
          <div className="rule-label">Module Q&amp;A</div>
          <h2 className="mt-1 text-xl font-black">{module.title}</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-fog">
          {questions.length} questions
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          setQuestions((previous) => [
            {
              id: `${module.id}-user-${Date.now()}`,
              author: "You",
              body: draft.trim(),
              votes: 0,
              answers: [],
            },
            ...previous,
          ]);
          setDraft("");
        }}
        className="mt-3 flex gap-2 border-2 border-ink p-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this module..."
          className="min-w-0 flex-1 bg-paper px-2 py-1.5 text-sm outline-none"
        />
        <button className="bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-paper">
          Post
        </button>
      </form>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {questions.map((question) => (
          <article key={question.id} className="border border-ink/15 p-3">
            <div className="flex gap-3">
              <button
                onClick={() =>
                  setQuestions((previous) =>
                    previous.map((item) =>
                      item.id === question.id ? { ...item, votes: item.votes + 1 } : item,
                    ),
                  )
                }
                className="flex w-9 shrink-0 flex-col items-center border border-ink/15 py-1"
                aria-label={`Upvote question: ${question.body}`}
              >
                <span className="font-mono text-[11px] font-bold">{question.votes}</span>
                <span className="text-[10px] text-clay">▲</span>
              </button>
              <div className="flex-1">
                <p className="text-sm font-medium">{question.body}</p>
                <p className="mt-1 font-mono text-[10px] text-fog">{question.author}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type CourseDoubt = {
  id: number;
  courseId: string;
  title: string;
  body: string;
  status: "pending" | "answered";
  askedAt: string;
};

function CourseDoubtSection({
  courseId,
  courseTitle,
  moduleId,
  moduleTitle,
}: {
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
}) {
  const doubtHeading = moduleTitle.slice(0, 255);
  const [doubts, setDoubts] = useState<CourseDoubt[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft("");
    setNotice(null);
  }, [moduleId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void apiFetch("/api/me/doubts/")
      .then(async (response) => (await response.json()) as CourseDoubt[])
      .then((tickets) => {
        if (cancelled) return;
        setDoubts(
          tickets
            .filter((ticket) => ticket.courseId === courseId && ticket.title === doubtHeading)
            .sort(
              (left, right) =>
                new Date(right.askedAt).getTime() - new Date(left.askedAt).getTime(),
            ),
        );
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load doubts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, doubtHeading]);

  const submitDoubt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/me/doubts/", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          courseTitle,
          title: doubtHeading,
          body,
        }),
      });
      const saved = (await response.json()) as CourseDoubt;
      setDoubts((previous) => [saved, ...previous]);
      setDraft("");
      setNotice("Your doubt was saved. Open Doubts to read the instructor reply.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save doubt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <form onSubmit={submitDoubt} className="flex gap-2 border-2 border-ink p-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Ask about “${moduleTitle}”…`}
          className="min-w-0 flex-1 bg-paper px-2 py-1.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={saving || !draft.trim()}
          className="bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
        >
          {saving ? "Saving..." : "Post"}
        </button>
      </form>

      {error && <p className="border border-clay bg-sand p-2 text-xs text-clay">{error}</p>}
      {notice && <p className="border border-moss bg-sand p-2 text-xs text-moss">{notice}</p>}

      <section className="border border-ink/15 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="rule-label">{moduleTitle}</div>
          <span className="font-mono text-[10px] text-fog">Newest first</span>
        </div>
        {loading ? (
          <p className="mt-3 font-mono text-[11px] text-fog">Loading your doubts...</p>
        ) : doubts.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] text-fog">No doubts posted for this module yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {doubts.map((doubt) => (
              <article key={doubt.id} className="border border-ink/10 p-2">
                <p className="whitespace-pre-wrap text-sm">{doubt.body}</p>
                <p className="mt-1 font-mono text-[10px] text-fog">
                  {doubt.status === "answered"
                    ? "Answered · Open Doubts to read the reply"
                    : "Pending instructor reply"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type ModuleResource = {
  filename: string;
  slides: Array<{ index: number; url: string }>;
};

type ModuleResourcesResponse = {
  ppt: ModuleResource | null;
};

function Resources({ courseId, moduleNumber }: { courseId: string; moduleNumber: number }) {
  const [ppt, setPpt] = useState<ModuleResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [pptOpen, setPptOpen] = useState(false);
  const [pptSlideIndex, setPptSlideIndex] = useState(0);
  const [resourceError, setResourceError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResourceError(null);

    const loadPpt = async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/course/${encodeURIComponent(courseId)}/module/${moduleNumber}/resources/`,
        { signal: controller.signal },
      );
      const data = (await response.json()) as ModuleResourcesResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Resource request failed: ${response.status}`);
      if (!controller.signal.aborted) setPpt(data.ppt);
    };

    void loadPpt()
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Unable to load module resources", error);
        if (!controller.signal.aborted) {
          setResourceError(error instanceof Error ? error.message : "Unable to load presentation");
        }
        setPpt(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [courseId, moduleNumber]);

  useEffect(() => {
    if (!pptOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPptOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [pptOpen]);

  const previousPptSlide = () => {
    setPptSlideIndex((current) => Math.max(0, current - 1));
  };

  const nextPptSlide = () => {
    setPptSlideIndex((current) => Math.min((ppt?.slides.length ?? 1) - 1, current + 1));
  };

  return (
    <div className="mt-3 border border-ink/15">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="bg-sand px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-ink/70">
          PPT
        </span>
        <span className="flex-1 text-sm font-medium">
          {loading ? "Loading presentation…" : (ppt?.filename ?? "Presentation not uploaded yet")}
        </span>
        {ppt?.slides.length ? (
          <button
            type="button"
            onClick={() => {
              setPptSlideIndex(0);
              setPptOpen(true);
            }}
            className="bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-paper"
          >
            View PPT
          </button>
        ) : resourceError ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-clay">Preview unavailable</span>
        ) : null}
      </div>
      {pptOpen && ppt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${ppt.filename} presentation`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPptOpen(false);
          }}
        >
          <div className="flex h-[min(90vh,900px)] w-[min(1100px,96vw)] flex-col border-2 border-ink bg-paper">
            <div className="flex items-center gap-3 border-b-2 border-ink px-3 py-2">
              <span className="flex-1 truncate text-sm font-semibold">{ppt.filename}</span>
              <button
                type="button"
                onClick={() => setPptOpen(false)}
                className="border border-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em]"
              >
                Close
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-auto bg-black p-2">
              {ppt.slides[pptSlideIndex] ? (
                <img
                  src={ppt.slides[pptSlideIndex].url}
                  alt={`${ppt.filename}, slide ${pptSlideIndex + 1}`}
                  className="mx-auto max-h-full max-w-full select-none object-contain"
                  draggable={false}
                  onContextMenu={(event) => event.preventDefault()}
                />
              ) : (
                <div className="grid h-full place-items-center font-mono text-[10px] uppercase tracking-[0.15em] text-clay">
                  Slide unavailable
                </div>
              )}
              <CandidateWatermark light />
            </div>
            <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-paper px-3 py-2">
              <button
                type="button"
                onClick={previousPptSlide}
                disabled={pptSlideIndex <= 0}
                className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] disabled:opacity-30"
              >
                Previous
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/70">
                {`Slide ${pptSlideIndex + 1} of ${ppt.slides.length}`}
              </span>
              <button
                type="button"
                onClick={nextPptSlide}
                disabled={pptSlideIndex >= ppt.slides.length - 1}
                className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

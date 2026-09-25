import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { courses, student } from "@/data/platform";
import {
  getUserEnrollments,
  getUserProfile,
  type UserEnrollment,
  type UserProfile,
} from "@/lib/progress";
import { getCurrentAuthUser } from "@/lib/auth";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — HTS" },
      {
        name: "description",
        content: "Learning stats, badges, completed courses and account settings.",
      },
      { property: "og:title", content: "Your profile — HTS" },
      {
        property: "og:description",
        content: "Learning stats, badges, completed courses and account settings.",
      },
    ],
  }),
  component: Profile,
});

const activity = Array.from({ length: 70 }, (_, i) => (i * 7) % 11);

function Profile() {
  const [notifications, setNotifications] = useState({
    doubtAnswered: true,
    forumReplies: true,
    weeklyDigest: false,
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, UserEnrollment>>({});
  const [bio, setBio] = useState(student.bio);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const user = getCurrentAuthUser();
    if (!user) {
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    void Promise.all([getUserProfile(user.uid), getUserEnrollments(user.uid)])
      .then(([nextProfile, nextEnrollments]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setEnrollments(nextEnrollments);
        setBio(nextProfile?.bio ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("Unable to load profile", error);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.name || getCurrentAuthUser()?.displayName || student.name;
  const displayEmail = profile?.email || getCurrentAuthUser()?.email || student.email;
  const displayPosition = profile?.position || "Learner";
  const displayCompany = profile?.company || "";
  const displayLocation = profile?.location || "Location not provided";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const enrolledCourses = useMemo(
    () =>
      courses
        .filter((course) => enrollments[course.id])
        .map((course) => ({ ...course, enrollment: enrollments[course.id]! })),
    [enrollments],
  );
  const completedCourses = enrolledCourses.filter(
    ({ enrollment }) => enrollment.status === "completed" || enrollment.progressPercent >= 100,
  ).length;

  return (
    <>
      <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="rule-label">Profile</span>
        <span className="h-px flex-1 bg-ink/15" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <section className="col-span-12 border-2 border-ink bg-paper p-5 lg:col-span-5">
          <div className="flex items-start gap-4">
            <div className="grid size-20 shrink-0 place-items-center bg-moss text-2xl font-black text-paper">
              {initials || "U"}
            </div>
            <div>
              <h1 className="text-3xl font-black leading-[0.9] tracking-tight">{displayName}</h1>
              <p className="mt-1 font-mono text-[11px] text-fog">{displayEmail}</p>
              <p className="font-mono text-[11px] text-fog">{displayPosition}</p>
              {displayCompany && <p className="font-mono text-[11px] text-fog">{displayCompany}</p>}
              <p className="font-mono text-[11px] text-fog">{displayLocation}</p>
            </div>
          </div>
          <label className="mt-4 block">
            <span className="mono-xs text-fog">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="mt-1 w-full border border-ink/25 bg-paper p-2 text-sm outline-none focus:border-ink"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {student.badges.map((b) => (
              <span
                key={b}
                className="border border-ink/25 px-2 py-1 font-mono text-[10px] uppercase tracking-widest"
              >
                {b}
              </span>
            ))}
          </div>
        </section>

        <section className="col-span-12 grid grid-cols-2 gap-3 lg:col-span-7">
          {[
            ["Enrolled", String(enrolledCourses.length).padStart(2, "0")],
            ["Completed", String(completedCourses).padStart(2, "0")],
            ["Learning hours", "00"],
            ["Certificates", "00"],
          ].map(([label, value]) => (
            <div key={label} className="border-2 border-ink bg-paper p-4">
              <div className="mono-xs text-fog">{label}</div>
              <div className="mt-1 text-4xl font-black">{value}</div>
            </div>
          ))}
          <div className="col-span-2 border-2 border-ink bg-paper p-4">
            <div className="flex items-center justify-between">
              <span className="mono-xs text-fog">Activity — last 10 weeks</span>
              <span className="font-mono text-[11px] text-moss">
                {student.streak}-day streak · level {student.level}
              </span>
            </div>
            <div className="mt-3 grid grid-flow-col grid-rows-7 gap-1">
              {activity.map((v, i) => (
                <span
                  key={i}
                  className="size-3"
                  style={{
                    backgroundColor:
                      v > 7
                        ? "var(--moss)"
                        : v > 4
                          ? "color-mix(in oklab, var(--moss) 55%, var(--sand))"
                          : "var(--sand)",
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="col-span-12 border-2 border-ink bg-paper p-4 lg:col-span-7">
          <div className="rule-label mb-3">Course progress</div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-widest text-fog">
                <th className="pb-2 font-normal">Course</th>
                <th className="pb-2 font-normal">Progress</th>
                <th className="pb-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {enrolledCourses.length ? (
                enrolledCourses.map(({ id, title, enrollment }) => {
                  const progress = Math.max(0, Math.min(100, enrollment.progressPercent));
                  const status =
                    enrollment.status === "completed" || progress >= 100
                      ? "Completed"
                      : progress > 0
                        ? "In progress"
                        : "Not started";
                  return (
                    <tr key={id} className="border-t border-ink/10">
                      <td className="py-2 font-bold">{title}</td>
                      <td className="py-2 font-mono text-[11px] text-fog">{progress}%</td>
                      <td className="py-2 text-right font-mono text-[11px] text-moss">{status}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="py-3 text-sm text-fog">
                    No courses enrolled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="col-span-12 border-2 border-ink bg-paper p-4 lg:col-span-5">
          <div className="rule-label mb-3">Settings</div>
          <div className="space-y-2">
            {(
              [
                ["doubtAnswered", "Notify me when an instructor answers a doubt"],
                ["forumReplies", "Notify me about forum replies"],
                ["weeklyDigest", "Weekly learning digest"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))}
                className="flex w-full items-center justify-between border border-ink/15 px-3 py-2 text-left text-[13px]"
              >
                {label}
                <span
                  className={`px-2 py-0.5 font-mono text-[10px] uppercase ${
                    notifications[key] ? "bg-moss text-paper" : "bg-sand text-ink/60"
                  }`}
                >
                  {notifications[key] ? "On" : "Off"}
                </span>
              </button>
            ))}
            <button className="w-full border-2 border-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]">
              Change password
            </button>
          </div>
        </section>
      </div>
      </main>
      {dataLoading && (
        <LoadingScreen label="Loading your profile" detail="Fetching your learner record…" />
      )}
    </>
  );
}

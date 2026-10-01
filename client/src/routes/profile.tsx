import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { courses, getLearnerRank, student } from "@/data/platform";
import {
  getUserEnrollments,
  getUserProfile,
  type UserEnrollment,
  type UserProfile,
} from "@/lib/progress";
import { changePasswordWithCognito, getCurrentAuthUser } from "@/lib/auth";
import { getLearningActivity, getTotalLearningSeconds } from "@/lib/learning-time";
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

function Profile() {
  const [notifications, setNotifications] = useState({
    doubtAnswered: true,
    weeklyDigest: false,
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, UserEnrollment>>({});
  const [bio, setBio] = useState(student.bio);
  const [activity, setActivity] = useState<number[]>(() => {
    const user = getCurrentAuthUser();
    return user ? getLearningActivity(user.uid) : Array.from({ length: 70 }, () => 0);
  });
  const [learningSeconds, setLearningSeconds] = useState(() => {
    const user = getCurrentAuthUser();
    return user ? getTotalLearningSeconds(user.uid) : 0;
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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
        setActivity(getLearningActivity(user.uid));
        setLearningSeconds(getTotalLearningSeconds(user.uid));
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
  const learningHours = (learningSeconds / 3600).toFixed(1);
  const activityMaximum = Math.max(1, ...activity);

  const closePasswordDialog = () => {
    if (passwordSaving) return;
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("Your new password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await changePasswordWithCognito(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to change your password.");
    } finally {
      setPasswordSaving(false);
    }
  };

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
            ["Learning hours", learningHours],
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
                rank {getLearnerRank(enrolledCourses.length)}
              </span>
            </div>
            <div className="mt-3 grid grid-flow-col grid-rows-7 gap-1">
              {activity.map((seconds, i) => (
                <span
                  key={i}
                  className="size-3"
                  style={{
                    backgroundColor:
                      seconds / activityMaximum > 0.66
                        ? "var(--moss)"
                        : seconds / activityMaximum > 0.33
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
            <button
              type="button"
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(false);
                setPasswordOpen(true);
              }}
              className="w-full border-2 border-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              Change password
            </button>
          </div>
        </section>
      </div>
      </main>
      {dataLoading && (
        <LoadingScreen label="Loading your profile" detail="Fetching your learner record…" />
      )}
      {passwordOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/60 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordDialog();
          }}
        >
          <form
            onSubmit={submitPasswordChange}
            className="w-full max-w-md border-2 border-ink bg-paper p-5 shadow-[10px_10px_0_var(--color-ink)]"
            aria-labelledby="change-password-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink/15 pb-3">
              <div>
                <div className="rule-label">Account security</div>
                <h2 id="change-password-title" className="mt-1 text-xl font-black">
                  Change password
                </h2>
              </div>
              <button
                type="button"
                onClick={closePasswordDialog}
                className="font-mono text-xs text-fog hover:text-ink"
                aria-label="Close change password dialog"
              >
                Close
              </button>
            </div>

            {passwordSuccess ? (
              <div className="mt-5 space-y-4">
                <p className="border border-moss bg-sand p-3 text-sm text-moss">
                  Your password was changed successfully.
                </p>
                <button
                  type="button"
                  onClick={closePasswordDialog}
                  className="border-2 border-ink bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mono-xs text-fog">Current password</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                      className="mt-1 w-full border border-ink/25 bg-paper px-2 py-2 text-sm outline-none focus:border-ink"
                    />
                  </label>
                  <label className="block">
                    <span className="mono-xs text-fog">New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      className="mt-1 w-full border border-ink/25 bg-paper px-2 py-2 text-sm outline-none focus:border-ink"
                    />
                  </label>
                  <label className="block">
                    <span className="mono-xs text-fog">Confirm new password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      className="mt-1 w-full border border-ink/25 bg-paper px-2 py-2 text-sm outline-none focus:border-ink"
                    />
                  </label>
                </div>
                {passwordError && <p className="mt-3 text-xs text-clay">{passwordError}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closePasswordDialog}
                    disabled={passwordSaving}
                    className="border border-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="border-2 border-ink bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
                  >
                    {passwordSaving ? "Changing..." : "Change password"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}

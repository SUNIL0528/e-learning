import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  cognitoConfigured,
  getCurrentAuthUser,
  onAuthStateChanged,
  signOutFromCognito,
  type AuthUser,
} from "@/lib/auth";
import { apiFetch } from "@/lib/api";

type DoubtNotification = {
  id: number;
  title: string;
  courseTitle: string;
  reply: string | null;
  repliedAt: string | null;
};

const nav = [
  { to: "/doubts", label: "Doubts" },
  { to: "/profile", label: "Profile" },
] as const;

type SiteHeaderProps = {
  siteZoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  canZoomOut: boolean;
  canZoomIn: boolean;
};

export function SiteHeader({
  siteZoom,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  canZoomOut,
  canZoomIn,
}: SiteHeaderProps) {
  const [signedIn, setSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getCurrentAuthUser());
  const [notifications, setNotifications] = useState<DoubtNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOutFromCognito();
    } catch (error) {
      console.error("Unable to log out", error);
    }
  };

  useEffect(() => {
    return onAuthStateChanged((user) => {
      setSignedIn(Boolean(user));
      setCurrentUser(user);
    });
  }, []);

  useEffect(() => {
    if (!signedIn || !currentUser || currentUser.isInstructor) {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    const loadNotifications = () => {
      void apiFetch("/api/me/doubts/")
        .then(async (response) => (await response.json()) as DoubtNotification[])
        .then((tickets) => {
          if (!cancelled) {
            setNotifications(
              tickets.filter((ticket) => ticket.reply && ticket.repliedAt),
            );
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) console.error("Unable to load notifications", error);
        });
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser, signedIn]);

  const visibleNav = currentUser?.isInstructor
    ? nav.filter((item) => item.to === "/doubts")
    : nav;

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/90 shadow-[0_8px_24px_rgb(18_8_15_/_5%)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-3 sm:gap-8 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src="/hts-logo-black.png" alt="HTS" className="h-10 w-auto max-w-[132px] object-contain sm:h-14 sm:max-w-[180px]" />
        </Link>
        <nav className="hidden items-center gap-1 rounded-full bg-sand/70 p-1 text-[11px] font-medium uppercase tracking-[0.15em] text-ink/70 md:flex">
          {currentUser ? (
            <>
              <Link
                to="/"
                activeOptions={{ exact: true }}
                className="rounded-full px-3 py-2 hover:bg-paper hover:text-ink"
                activeProps={{ className: "rounded-full bg-paper px-3 py-2 text-ink shadow-sm" }}
              >
                Dashboard
              </Link>
              {!currentUser.isInstructor && (
                <Link to="/courses" className="rounded-full px-3 py-2 hover:bg-paper hover:text-ink" activeProps={{ className: "rounded-full bg-paper px-3 py-2 text-ink shadow-sm" }}>
                  Courses
                </Link>
              )}
              {visibleNav.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-full px-3 py-2 hover:bg-paper hover:text-ink"
                  activeProps={{ className: "rounded-full bg-paper px-3 py-2 text-ink shadow-sm" }}
                >
                  {item.label}
                </Link>
              ))}
              {currentUser.isAdmin && (
                <Link
                  to="/admin/users"
                  className="rounded-full px-3 py-2 hover:bg-paper hover:text-ink"
                  activeProps={{ className: "rounded-full bg-paper px-3 py-2 text-ink shadow-sm" }}
                >
                  Admin
                </Link>
              )}
            </>
          ) : (
            <Link to="/login" className="rounded-full px-3 py-2 hover:bg-sand hover:text-ink" activeProps={{ className: "rounded-full bg-sand px-3 py-2 text-ink" }}>
              Sign in
            </Link>
          )}
        </nav>
        {currentUser && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-full border border-ink/15 font-mono text-sm shadow-sm md:hidden"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? "×" : "☰"}
          </button>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
          {signedIn && cognitoConfigured && !currentUser?.isInstructor && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}
                title="Notifications"
                className="relative grid size-8 place-items-center text-ink hover:text-clay"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-clay px-1 font-mono text-[9px] font-bold text-paper">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-ink/10 bg-paper p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest">Notifications</span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="font-mono text-[10px] text-fog hover:text-ink"
                    >
                      Close
                    </button>
                  </div>
                  {notifications.length ? (
                    <div className="space-y-2">
                      {notifications.slice(0, 5).map((notification) => (
                        <Link
                          key={notification.id}
                          to="/doubts"
                          onClick={() => setNotificationsOpen(false)}
                          className="block border-t border-ink/10 pt-2 text-left hover:bg-sand"
                        >
                          <div className="text-xs font-bold">Instructor replied</div>
                          <div className="mt-0.5 text-[11px] text-fog">{notification.title}</div>
                          <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-clay">
                            {notification.courseTitle}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-fog">No instructor replies yet.</p>
                  )}
                  {notifications.length > 5 && (
                    <Link to="/doubts" onClick={() => setNotificationsOpen(false)} className="mt-3 block font-mono text-[10px] uppercase underline">
                      View all replies
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          {signedIn && cognitoConfigured && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Log out"
              className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink hover:text-clay"
            >
              Log out
          </button>
          )}
          {currentUser?.isInstructor && (
            <span className="hidden font-mono text-[11px] text-ink/60 lg:block">Instructor</span>
          )}
          <div
            className="flex items-center gap-1 rounded-full border border-ink/15 bg-sand/60 px-1 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            aria-label="Website text size"
          >
            <button
              type="button"
              onClick={onZoomOut}
              disabled={!canZoomOut}
              className="px-1 text-ink/70 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Make website text smaller"
              title="Make website text smaller"
            >
              -
            </button>
            <button
              type="button"
              onClick={onResetZoom}
              className="min-w-[3.5rem] border-x border-ink/15 px-1 text-ink"
              aria-label={`Reset website text size to 100 percent; current size is ${Math.round(siteZoom * 100)} percent`}
              title="Reset website text size"
            >
              {Math.round(siteZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={onZoomIn}
              disabled={!canZoomIn}
              className="px-1 text-ink/70 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Make website text larger"
              title="Make website text larger"
            >
              +
            </button>
          </div>
          <div className="hidden -space-x-2 sm:flex">
            <span className="grid size-8 place-items-center rounded-full bg-sand font-mono text-[10px] text-fog">
              AO
            </span>
            <span className="size-8 rounded-full bg-moss" />
            <span className="size-8 rounded-full bg-clay" />
          </div>
        </div>
      </div>
      {mobileNavOpen && currentUser && (
        <nav className="border-t border-ink/10 bg-sand/80 px-3 py-3 backdrop-blur md:hidden" aria-label="Mobile navigation">
          <div className="grid gap-1 text-[11px] font-medium uppercase tracking-[0.15em] text-ink/70">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              onClick={() => setMobileNavOpen(false)}
              className="rounded-xl border border-transparent px-3 py-2 hover:border-ink/10 hover:bg-paper"
              activeProps={{ className: "rounded-xl border-ink/10 bg-paper text-ink shadow-sm" }}
            >
              Dashboard
            </Link>
            {!currentUser.isInstructor && (
              <Link
                to="/courses"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl border border-transparent px-3 py-2 hover:border-ink/10 hover:bg-paper"
                activeProps={{ className: "rounded-xl border-ink/10 bg-paper text-ink shadow-sm" }}
              >
                Courses
              </Link>
            )}
            {visibleNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl border border-transparent px-3 py-2 hover:border-ink/10 hover:bg-paper"
                activeProps={{ className: "rounded-xl border-ink/10 bg-paper text-ink shadow-sm" }}
              >
                {item.label}
              </Link>
            ))}
            {currentUser.isAdmin && (
              <Link
                to="/admin/users"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl border border-transparent px-3 py-2 hover:border-ink/10 hover:bg-paper"
                activeProps={{ className: "rounded-xl border-ink/10 bg-paper text-ink shadow-sm" }}
              >
                Admin
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

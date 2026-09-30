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
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src="/hts-logo-black.png" alt="HTS" className="h-14 w-auto max-w-[180px] object-contain" />
        </Link>
        <nav className="hidden items-center gap-6 text-[11px] font-medium uppercase tracking-[0.15em] text-ink/70 md:flex">
          {currentUser ? (
            <>
              <Link
                to="/"
                activeOptions={{ exact: true }}
                activeProps={{ className: "text-ink border-b-2 border-clay pb-0.5" }}
              >
                Dashboard
              </Link>
              {!currentUser.isInstructor && (
                <Link to="/courses" activeProps={{ className: "text-ink border-b-2 border-clay pb-0.5" }}>
                  Courses
                </Link>
              )}
              {visibleNav.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  activeProps={{ className: "text-ink border-b-2 border-clay pb-0.5" }}
                >
                  {item.label}
                </Link>
              ))}
            </>
          ) : (
            <Link to="/login" activeProps={{ className: "text-ink border-b-2 border-clay pb-0.5" }}>
              Sign in
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
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
                <div className="absolute right-0 top-10 z-30 w-72 border-2 border-ink bg-paper p-3 shadow-lg">
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
            className="flex items-center gap-1 border border-ink/25 px-1 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
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
          <div className="flex -space-x-2">
            <span className="grid size-8 place-items-center rounded-full bg-sand font-mono text-[10px] text-fog">
              AO
            </span>
            <span className="size-8 rounded-full bg-moss" />
            <span className="size-8 rounded-full bg-clay" />
          </div>
        </div>
      </div>
    </header>
  );
}

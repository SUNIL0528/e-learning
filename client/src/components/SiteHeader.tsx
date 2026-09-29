import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { student } from "@/data/platform";
import {
  cognitoConfigured,
  getCurrentAuthUser,
  onAuthStateChanged,
  signOutFromCognito,
  type AuthUser,
} from "@/lib/auth";

const nav = [
  { to: "/doubts", label: "Doubts" },
  { to: "/profile", label: "Profile" },
  { to: "/login", label: "Sign in" },
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

  const visibleNav = currentUser?.isInstructor
    ? nav.filter((item) => item.to === "/doubts")
    : nav;

  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="size-4 bg-moss" />
          <span className="font-mono text-sm font-bold tracking-tight">HTS</span>
        </Link>
        <nav className="hidden items-center gap-6 text-[11px] font-medium uppercase tracking-[0.15em] text-ink/70 md:flex">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-ink border-b-2 border-clay pb-0.5" }}
          >
            Dashboard
          </Link>
          {!currentUser?.isInstructor && (
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
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {signedIn && cognitoConfigured && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Log out"
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-fog hover:text-ink"
            >
              Log out
          </button>
          )}
          <span className="hidden font-mono text-[11px] text-ink/60 lg:block">
            {currentUser?.isInstructor ? "Instructor" : `${student.streak}-day streak`}
          </span>
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

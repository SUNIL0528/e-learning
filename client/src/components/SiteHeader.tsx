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

export function SiteHeader() {
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

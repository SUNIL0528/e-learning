import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const instructorGroup = String(import.meta.env.VITE_COGNITO_INSTRUCTOR_GROUP ?? "instructors").toLowerCase();
const cognitoRegion = import.meta.env.VITE_COGNITO_REGION as string | undefined;
const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID as string | undefined;
const s3Bucket = import.meta.env.VITE_S3_BUCKET as string | undefined;
const s3Region = import.meta.env.VITE_S3_REGION as string | undefined;
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const ACTIVE_SESSION_STORAGE_KEY = "hts.activeSessionId";

export const cognitoConfigured = Boolean(
  cognitoRegion && userPoolId && userPoolClientId,
);

if (cognitoConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId!,
        userPoolClientId: userPoolClientId!,
        ...(identityPoolId ? { identityPoolId } : {}),
        loginWith: { email: true, username: true },
      },
    },
    ...(identityPoolId && s3Bucket && s3Region
      ? {
          Storage: {
            S3: {
              bucket: s3Bucket,
              region: s3Region,
            },
          },
        }
      : {}),
  });
}

export type AuthUser = {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  groups: string[];
  isInstructor: boolean;
};

let currentUser: AuthUser | null = null;
let signOutInProgress = false;
const signOutListeners = new Set<(inProgress: boolean) => void>();

function setSignOutInProgress(inProgress: boolean) {
  signOutInProgress = inProgress;
  signOutListeners.forEach((listener) => listener(inProgress));
}

export function isSignOutInProgress() {
  return signOutInProgress;
}

export function onSignOutStateChanged(listener: (inProgress: boolean) => void) {
  listener(signOutInProgress);
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

async function readUser(forceRefresh = false): Promise<AuthUser | null> {
  if (!cognitoConfigured) return null;

  try {
    const user = await getCurrentUser();
    const session = forceRefresh
      ? await fetchAuthSession({ forceRefresh: true })
      : await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();
    if (!accessToken) throw new Error("No access token available.");
    await ensureActiveSession(accessToken);
    const claims = session.tokens?.idToken?.payload ?? {};
    const accessClaims = session.tokens?.accessToken?.payload ?? {};
    const email = String(claims.email ?? "");
    const displayName = String(claims.name ?? claims.email ?? user.username);
    const groups = Array.from(
      new Set(
        [claims["cognito:groups"], accessClaims["cognito:groups"]].flatMap((value) =>
          Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [],
        ),
      ),
    );
    currentUser = {
      uid: user.userId,
      username: user.username,
      email,
      displayName,
      groups,
      isInstructor: groups.some((group) =>
        [instructorGroup, "instructors", "instructor", "admins", "admin"].includes(group.toLowerCase()),
      ),
    };
    return currentUser;
  } catch {
    currentUser = null;
    return null;
  }
}

export function getCurrentAuthUser() {
  return currentUser;
}

export function getActiveSessionId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
}

function clearActiveSessionId() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }
}

function createActiveSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { detail?: string; error?: string };
    return data.detail ?? data.error ?? `Session request failed (${response.status})`;
  } catch {
    return `Session request failed (${response.status})`;
  }
}

async function registerActiveSession(accessToken: string) {
  const sessionId = createActiveSessionId();
  const response = await fetch(`${API_BASE_URL}/api/me/session/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  window.sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
}

async function validateActiveSession(accessToken: string, sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/api/me/session/validate/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Session-ID": sessionId,
    },
  });
  if (!response.ok) {
    clearActiveSessionId();
    throw new Error(await readApiError(response));
  }
}

async function ensureActiveSession(accessToken: string) {
  const existingSessionId = getActiveSessionId();
  if (existingSessionId) {
    await validateActiveSession(accessToken, existingSessionId);
  } else {
    await registerActiveSession(accessToken);
  }
}

export async function refreshAuthUser() {
  return readUser();
}

export async function signInWithCognito(username: string, password: string) {
  const result = await signIn({ username, password });
  await readUser(true);
  return result;
}

export async function signUpWithCognito(
  candidateNumber: string,
  email: string,
  phone: string,
  gender: string,
  password: string,
  name: string,
) {
  return signUp({
    username: candidateNumber,
    password,
    options: {
      userAttributes: {
        email,
        phone_number: phone,
        gender,
        name,
      },
    },
  });
}

async function waitForLocalSessionToClear(timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens?.accessToken && !session.tokens?.idToken) return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function signOutFromCognito() {
  setSignOutInProgress(true);
  currentUser = null;
  clearActiveSessionId();

  try {
    // Global sign-out revokes the user's Cognito sessions, including refresh
    // tokens, instead of only removing credentials from this browser.
    await signOut({ global: true });
    await waitForLocalSessionToClear();
  } finally {
    currentUser = null;
    setSignOutInProgress(false);
  }
}

export async function signOutLocallyFromCognito() {
  setSignOutInProgress(true);
  currentUser = null;
  clearActiveSessionId();
  try {
    await signOut();
  } finally {
    currentUser = null;
    setSignOutInProgress(false);
  }
}

export { confirmSignUp };

export function onAuthStateChanged(listener: (user: AuthUser | null) => void) {
  let cancelled = false;
  void readUser().then((user) => {
    if (!cancelled) listener(user);
  });

  const unsubscribe = Hub.listen("auth", ({ payload }) => {
    if (payload.event === "signedIn" || payload.event === "signedOut") {
      void readUser(payload.event === "signedIn").then((user) => {
        if (!cancelled) listener(user);
      });
    }
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

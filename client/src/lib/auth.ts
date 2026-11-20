import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const instructorGroup = String(import.meta.env.VITE_COGNITO_INSTRUCTOR_GROUP ?? "instructors").toLowerCase();
const adminGroup = String(import.meta.env.VITE_COGNITO_ADMIN_GROUP ?? "admins").toLowerCase();
const cognitoRegion = import.meta.env.VITE_COGNITO_REGION as string | undefined;
const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID as string | undefined;
const s3Bucket = import.meta.env.VITE_S3_BUCKET as string | undefined;
const s3Region = import.meta.env.VITE_S3_REGION as string | undefined;
export const localDev = import.meta.env.DEV && import.meta.env["VITE_LOCAL_DEV"] === "true";
export type LocalRole = "learner" | "instructor" | "admin";
const LOCAL_ROLE_KEY = "hts-local-dev-role";
const LOCAL_EMAIL_KEY = "hts-local-dev-email";
const LOCAL_NAME_KEY = "hts-local-dev-name";

export const cognitoConfigured = localDev || Boolean(
  cognitoRegion && userPoolId && userPoolClientId,
);

if (cognitoConfigured && !localDev) {
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
  isAdmin: boolean;
};

let currentUser: AuthUser | null = null;
let signOutInProgress = false;
const signOutListeners = new Set<(inProgress: boolean) => void>();
const localAuthListeners = new Set<(user: AuthUser | null) => void>();

function localUser(role: LocalRole, email?: string, name?: string): AuthUser {
  const localEmail = email?.trim() || `${role}@localhost.invalid`;
  const localName = name?.trim() || (email?.split("@")[0]?.trim() || `Local ${role.charAt(0).toUpperCase()}${role.slice(1)}`);
  return {
    uid: `local-dev-${role}`,
    username: `local-${role}`,
    email: localEmail,
    displayName: localName,
    groups: role === "learner" ? [] : [role === "admin" ? adminGroup : instructorGroup],
    isInstructor: role !== "learner",
    isAdmin: role === "admin",
  };
}

export function signInLocally(email: string, name = "") {
  if (!localDev || typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_ROLE_KEY, "learner");
  window.localStorage.setItem(LOCAL_EMAIL_KEY, email.trim());
  window.localStorage.setItem(LOCAL_NAME_KEY, name.trim());
  currentUser = localUser("learner", email, name);
  localAuthListeners.forEach((listener) => listener(currentUser));
}

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
  if (localDev) {
    const role = typeof window === "undefined" ? null : window.localStorage.getItem(LOCAL_ROLE_KEY);
    currentUser = role === "learner" || role === "instructor" || role === "admin"
      ? localUser(role, window.localStorage.getItem(LOCAL_EMAIL_KEY) ?? undefined, window.localStorage.getItem(LOCAL_NAME_KEY) ?? undefined)
      : null;
    return currentUser;
  }
  if (!cognitoConfigured) return null;

  try {
    const user = await getCurrentUser();
    const session = forceRefresh
      ? await fetchAuthSession({ forceRefresh: true })
      : await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();
    if (!accessToken) throw new Error("No access token available.");
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
        [instructorGroup, adminGroup, "instructors", "instructor", "admins", "admin"].includes(group.toLowerCase()),
      ),
      isAdmin: groups.some((group) => [adminGroup, "admins", "admin"].includes(group.toLowerCase())),
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

export async function refreshAuthUser() {
  return readUser();
}

export async function signInWithCognito(username: string, password: string) {
  const result = await signIn({ username, password });
  await readUser(true);
  return result;
}

export async function changePasswordWithCognito(oldPassword: string, newPassword: string) {
  if (localDev) throw new Error("Local demo accounts have no password.");
  return updatePassword({ oldPassword, newPassword });
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
  if (localDev) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LOCAL_ROLE_KEY);
      window.localStorage.removeItem(LOCAL_EMAIL_KEY);
      window.localStorage.removeItem(LOCAL_NAME_KEY);
    }
    currentUser = null;
    localAuthListeners.forEach((listener) => listener(null));
    return;
  }
  setSignOutInProgress(true);
  currentUser = null;

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
  if (localDev) return signOutFromCognito();
  setSignOutInProgress(true);
  currentUser = null;
  try {
    await signOut();
  } finally {
    currentUser = null;
    setSignOutInProgress(false);
  }
}

export { confirmSignUp };

export function onAuthStateChanged(listener: (user: AuthUser | null) => void) {
  if (localDev) {
    void readUser().then(listener);
    localAuthListeners.add(listener);
    return () => localAuthListeners.delete(listener);
  }
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

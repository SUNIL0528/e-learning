import { fetchAuthSession } from "aws-amplify/auth";
import { getActiveSessionId, signOutLocallyFromCognito } from "@/lib/auth";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const TOKEN_REFRESH_WINDOW_MS = 60_000;

async function getSessionWithProactiveRefresh() {
  const session = await fetchAuthSession();
  const expiresAt = session.tokens?.accessToken?.payload.exp;
  const expiresSoon =
    typeof expiresAt === "number" && expiresAt * 1000 <= Date.now() + TOKEN_REFRESH_WINDOW_MS;

  return expiresSoon ? fetchAuthSession({ forceRefresh: true }) : session;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const request = async (forceRefresh = false) => {
    const session = forceRefresh
      ? await fetchAuthSession({ forceRefresh: true })
      : await getSessionWithProactiveRefresh();
    const accessToken = session.tokens?.accessToken?.toString();
    const headers = new Headers(init.headers);

    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const activeSessionId = getActiveSessionId();
    if (activeSessionId) headers.set("X-Session-ID", activeSessionId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };

  let response = await request();

  // Access tokens are short-lived. If a tab was left open or the Identity Pool
  // was added after the session was created, refresh once before reporting an
  // authentication failure to the user.
  if (response.status === 401 || response.status === 403) {
    let detail = "";
    try {
      const errorData = (await response.clone().json()) as { detail?: string };
      detail = errorData.detail ?? "";
    } catch {
      // Retry normal authentication failures even when the response is not JSON.
    }
    if (detail !== "ACTIVE_SESSION_REPLACED") {
      response = await request(true);
    }
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errorData = (await response.clone().json()) as { detail?: string };
      detail = errorData.detail ?? "";
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }

    if (detail === "ACTIVE_SESSION_REPLACED") {
      await signOutLocallyFromCognito();
    }

    let message = `API request failed (${response.status})`;
    try {
      const data = (await response.json()) as { detail?: string; error?: string };
      message = data.detail ?? data.error ?? message;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(message);
  }
  return response;
}

export { API_BASE_URL };

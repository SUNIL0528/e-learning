const STORAGE_PREFIX = "hts-learning-seconds";

function storageKey(userId: string, courseId: string) {
  return `${STORAGE_PREFIX}:${userId}:${courseId}`;
}

export function addLearningSeconds(userId: string, courseId: string, seconds: number) {
  if (typeof window === "undefined" || seconds <= 0) return;

  const key = storageKey(userId, courseId);
  const current = Number(window.localStorage.getItem(key) || 0);
  window.localStorage.setItem(key, String(Math.max(0, current) + Math.floor(seconds)));
}

export function getTotalLearningSeconds(userId: string) {
  if (typeof window === "undefined") return 0;

  const prefix = `${STORAGE_PREFIX}:${userId}:`;
  let total = 0;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    total += Math.max(0, Number(window.localStorage.getItem(key) || 0));
  }
  return total;
}

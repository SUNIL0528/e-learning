const STORAGE_PREFIX = "hts-learning-seconds";
const ACTIVITY_PREFIX = "hts-learning-activity";

function storageKey(userId: string, courseId: string) {
  return `${STORAGE_PREFIX}:${userId}:${courseId}`;
}

function activityKey(userId: string, date: Date) {
  const dateValue = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, "0"))
    .join("-");
  return `${ACTIVITY_PREFIX}:${userId}:${dateValue}`;
}

export function addLearningSeconds(userId: string, courseId: string, seconds: number) {
  if (typeof window === "undefined" || seconds <= 0) return;

  const key = storageKey(userId, courseId);
  const current = Number(window.localStorage.getItem(key) || 0);
  window.localStorage.setItem(key, String(Math.max(0, current) + Math.floor(seconds)));

  const todayKey = activityKey(userId, new Date());
  const today = Number(window.localStorage.getItem(todayKey) || 0);
  window.localStorage.setItem(todayKey, String(Math.max(0, today) + Math.floor(seconds)));
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

export function getLearningActivity(userId: string, days = 70) {
  if (typeof window === "undefined") return Array.from({ length: days }, () => 0);

  const activity: number[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    activity.push(Math.max(0, Number(window.localStorage.getItem(activityKey(userId, date)) || 0)));
  }
  return activity;
}

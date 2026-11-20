import type { ModuleSixGameId } from "./module-six-data";

export type PracticeRecord = {
  version: 1;
  completed: boolean;
  answers: Record<string, string>;
  ratings: Record<string, { rating: string; due: string }>;
  updatedAt: string;
};

export const freshRecord = (): PracticeRecord => ({
  version: 1,
  completed: false,
  answers: {},
  ratings: {},
  updatedAt: "",
});

export const storageKey = (userId: string, id: ModuleSixGameId) =>
  `hts-m6-practice-v1:${userId}:${id}`;

export function readModuleSixRecord(userId: string, id: ModuleSixGameId): PracticeRecord {
  if (typeof window === "undefined") return freshRecord();
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey(userId, id)) ?? "null",
    ) as PracticeRecord | null;
    if (value?.version === 1 && value.answers && value.ratings) return value;
  } catch {
    /* Invalid local practice state starts fresh. */
  }
  return freshRecord();
}

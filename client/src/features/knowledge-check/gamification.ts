// Inspector Gamification Engine: XP, Levels, Streaks, and Achievements

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}

export interface InspectorProfile {
  xp: number;
  streak: number;
  highestStreak: number;
  completedActivities: string[];
  achievements: string[];
  lastActive: string;
}

const DEFAULT_PROFILE: InspectorProfile = {
  xp: 0,
  streak: 0,
  highestStreak: 0,
  completedActivities: [],
  achievements: [],
  lastActive: new Date().toISOString(),
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_game",
    title: "First Field Round",
    description: "Complete any knowledge check activity.",
    icon: "🎯",
  },
  {
    id: "speed_streak",
    title: "Rapid Recall",
    description: "Achieve a 5x answer streak without an error.",
    icon: "🔥",
  },
  {
    id: "flawless_combo",
    title: "Eagle Eye Inspector",
    description: "Reach an 8x combo streak across any practice mode.",
    icon: "⚡",
  },
  {
    id: "tool_master",
    title: "Master of Instruments",
    description: "Inspect and test instruments in the 3D Tool Room.",
    icon: "🔬",
  },
  {
    id: "site_certified",
    title: "Field Ready",
    description: "Submit a compliant inspection report in the 3D Site Mission.",
    icon: "🦺",
  },
  {
    id: "vault_veteran",
    title: "Vault Archivist",
    description: "Review and rate 12 or more cards in the Knowledge Vault.",
    icon: "🧠",
  },
  {
    id: "doc_detective",
    title: "Specification Sleuth",
    description: "Master document hierarchy in Document Detective.",
    icon: "📜",
  },
  {
    id: "defect_analyst",
    title: "Defect Investigator",
    description: "Diagnose 3D coating micro-defects in the Coating Lab.",
    icon: "🔍",
  },
  {
    id: "tip_master",
    title: "Spray Master 3D",
    description: "Decode airless spray tip geometry and test spray atomization in 3D.",
    icon: "🎨",
  },
  {
    id: "pds_detective",
    title: "PDS Codebreaker",
    description: "Crack the product data sheet escape room and mixing decision.",
    icon: "📑",
  },
  {
    id: "chemistry_scholar",
    title: "Formulation Chemist",
    description: "Master the five paint ingredients and CPVC critical concepts.",
    icon: "🧪",
  },
  {
    id: "c6_vault_master",
    title: "Module 6 Specialist",
    description: "Review and rate 20 or more cards in the Chapter 6 Vault.",
    icon: "📚",
  },
];

export interface LevelInfo {
  level: number;
  title: string;
  badge: string;
  minXp: number;
  maxXp: number;
  progressPercent: number;
}

const LEVEL_THRESHOLDS = [
  { level: 1, title: "Trainee Inspector", badge: "🦺", minXp: 0, maxXp: 150 },
  { level: 2, title: "Quality Inspector", badge: "🔍", minXp: 150, maxXp: 450 },
  { level: 3, title: "Certified QA/QC Specialist", badge: "🛡️", minXp: 450, maxXp: 950 },
  { level: 4, title: "Senior NACE/AMPP Level 2", badge: "⚡", minXp: 950, maxXp: 1800 },
  { level: 5, title: "Chief Technical Inspector", badge: "🏆", minXp: 1800, maxXp: 3000 },
];

export function calculateLevel(xp: number): LevelInfo {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    const t = LEVEL_THRESHOLDS[i]!;
    if (xp >= t.minXp) {
      const range = t.maxXp - t.minXp;
      const progress = range > 0 ? Math.min(100, Math.round(((xp - t.minXp) / range) * 100)) : 100;
      return {
        level: t.level,
        title: t.title,
        badge: t.badge,
        minXp: t.minXp,
        maxXp: t.maxXp,
        progressPercent: progress,
      };
    }
  }
  return {
    level: 1,
    title: LEVEL_THRESHOLDS[0]!.title,
    badge: LEVEL_THRESHOLDS[0]!.badge,
    minXp: 0,
    maxXp: 150,
    progressPercent: 0,
  };
}

const PROFILE_KEY = (userId: string) => `hts-inspector-gamification-v2:${userId}`;

export function loadProfile(userId: string): InspectorProfile {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE };
  try {
    const saved = localStorage.getItem(PROFILE_KEY(userId));
    if (saved) {
      return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
    }
  } catch {
    /* fallback */
  }
  return { ...DEFAULT_PROFILE };
}

export function saveProfile(userId: string, profile: InspectorProfile): void {
  if (typeof window === "undefined") return;
  profile.lastActive = new Date().toISOString();
  localStorage.setItem(PROFILE_KEY(userId), JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent("hts-profile-updated", { detail: profile }));
}

export function awardXp(
  userId: string,
  amount: number,
  reason?: string,
): { profile: InspectorProfile; leveledUp: boolean; newLevel?: LevelInfo } {
  const current = loadProfile(userId);
  const oldLevel = calculateLevel(current.xp);
  const nextXp = current.xp + amount;
  const newLevel = calculateLevel(nextXp);
  const leveledUp = newLevel.level > oldLevel.level;

  const updated: InspectorProfile = {
    ...current,
    xp: nextXp,
  };

  saveProfile(userId, updated);
  return { profile: updated, leveledUp, newLevel: leveledUp ? newLevel : undefined };
}

export function recordStreak(
  userId: string,
  correct: boolean,
): { profile: InspectorProfile; currentStreak: number; newBadge?: Achievement } {
  const current = loadProfile(userId);
  const newStreak = correct ? current.streak + 1 : 0;
  const highestStreak = Math.max(current.highestStreak, newStreak);

  const updated: InspectorProfile = {
    ...current,
    streak: newStreak,
    highestStreak,
  };

  let newBadge: Achievement | undefined;
  if (newStreak >= 5 && !updated.achievements.includes("speed_streak")) {
    updated.achievements.push("speed_streak");
    newBadge = ACHIEVEMENTS.find((a) => a.id === "speed_streak");
  }
  if (newStreak >= 8 && !updated.achievements.includes("flawless_combo")) {
    updated.achievements.push("flawless_combo");
    newBadge = ACHIEVEMENTS.find((a) => a.id === "flawless_combo");
  }

  saveProfile(userId, updated);
  return { profile: updated, currentStreak: newStreak, newBadge };
}

export function unlockAchievement(
  userId: string,
  achievementId: string,
): { unlocked: boolean; achievement?: Achievement } {
  const current = loadProfile(userId);
  if (current.achievements.includes(achievementId)) {
    return { unlocked: false };
  }
  const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!ach) return { unlocked: false };

  const updated: InspectorProfile = {
    ...current,
    achievements: [...current.achievements, achievementId],
    xp: current.xp + 50, // 50 bonus XP for each achievement
  };
  saveProfile(userId, updated);
  return { unlocked: true, achievement: ach };
}

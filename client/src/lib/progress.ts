import type { Course, Module } from "@/data/platform";
import type { AuthUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

// Kept as a compatibility filename for existing route imports. Data now lives
// in Django/PostgreSQL, not Firebase Firestore.

export type UserEnrollment = {
  courseId: string;
  courseTitle: string;
  progressPercent: number;
  status: string;
};

export type UserProfile = {
  uid: string;
  candidateNumber: string;
  email: string;
  name: string;
  phone: string;
  gender: string;
  position: string;
  company: string;
  location: string;
  bio: string;
};

export type UserProfileInput = Pick<
  UserProfile,
  "candidateNumber" | "name" | "phone" | "gender" | "position" | "company" | "location" | "bio"
>;

export type SavedChapterProgress = {
  completed: boolean;
  currentSlideIndex: number;
  highestCompletedSlideIndex: number;
  currentSlideId: string | null;
};

export type SavedCourseProgress = {
  chapters: Record<string, SavedChapterProgress>;
  modules: Record<string, { qaPassed: boolean }>;
};

// React Strict Mode can start the same course request twice during development.
// Share only concurrent requests; the entry is removed after completion so a
// later visit always gets fresh progress.
const inFlightCourseStructureRequests = new Map<string, Promise<SavedCourseProgress>>();
const inFlightProfileRequests = new Map<string, Promise<UserProfile | null>>();
const inFlightEnrollmentRequests = new Map<
  string,
  Promise<Record<string, UserEnrollment>>
>();

export async function ensureUserProfile(
  user: AuthUser,
  fields: Partial<UserProfileInput> = {},
) {
  await apiFetch("/api/me/profile/", {
    method: "PATCH",
    body: JSON.stringify({
      email: user.email,
      candidateNumber: fields.candidateNumber?.trim() || user.username,
      name: fields.name?.trim() || user.displayName,
      phone: fields.phone,
      gender: fields.gender,
      position: fields.position,
      company: fields.company,
      location: fields.location,
      bio: fields.bio,
    }),
  });
}

export async function getUserProfile(_userId?: string): Promise<UserProfile | null> {
  const requestKey = _userId || "current";
  const existingRequest = inFlightProfileRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = apiFetch("/api/me/profile/").then(
    (response) => response.json() as Promise<UserProfile>,
  );
  inFlightProfileRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightProfileRequests.get(requestKey) === request) {
      inFlightProfileRequests.delete(requestKey);
    }
  }
}

export async function getUserEnrollments(_userId?: string) {
  const requestKey = _userId || "current";
  const existingRequest = inFlightEnrollmentRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = apiFetch("/api/me/enrollments/").then(
    (response) => response.json() as Promise<Record<string, UserEnrollment>>,
  );
  inFlightEnrollmentRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightEnrollmentRequests.get(requestKey) === request) {
      inFlightEnrollmentRequests.delete(requestKey);
    }
  }
}

export async function ensureUserCourseStructure(user: AuthUser, course: Course) {
  const requestKey = `${user.uid}:${course.id}`;
  const existingRequest = inFlightCourseStructureRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = apiFetch(`/api/me/courses/${encodeURIComponent(course.id)}/structure/`, {
    method: "POST",
    body: JSON.stringify({ course }),
  })
    .then((response) => response.json() as Promise<SavedCourseProgress>);

  inFlightCourseStructureRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightCourseStructureRequests.get(requestKey) === request) {
      inFlightCourseStructureRequests.delete(requestKey);
    }
  }
}

export async function getCourseProgress(
  userId: string,
  courseId: string,
  _modules: Module[],
): Promise<SavedCourseProgress> {
  void userId;
  const response = await apiFetch(`/api/me/courses/${encodeURIComponent(courseId)}/progress/`);
  return (await response.json()) as SavedCourseProgress;
}

export async function saveChapterProgress({
  userId,
  courseId,
  moduleId,
  chapterId,
  courseProgressPercent,
  moduleProgressPercent,
}: {
  userId: string;
  courseId: string;
  moduleId: string;
  chapterId: string;
  courseProgressPercent: number;
  moduleProgressPercent: number;
}) {
  void userId;
  await apiFetch(`/api/me/courses/${encodeURIComponent(courseId)}/progress/chapter/`, {
    method: "PATCH",
    body: JSON.stringify({ moduleId, chapterId, courseProgressPercent, moduleProgressPercent }),
  });
}

export async function saveSlideProgress({
  userId,
  courseId,
  moduleId,
  chapterId,
  currentSlideIndex,
  currentSlideId,
  completed = false,
  completedSlideIndex,
}: {
  userId: string;
  courseId: string;
  moduleId: string;
  chapterId: string;
  currentSlideIndex: number;
  currentSlideId: string;
  completed?: boolean;
  completedSlideIndex?: number;
}) {
  void userId;
  await apiFetch(`/api/me/courses/${encodeURIComponent(courseId)}/progress/slide/`, {
    method: "PATCH",
    body: JSON.stringify({
      moduleId,
      chapterId,
      currentSlideIndex,
      currentSlideId,
      completed,
      completedSlideIndex,
    }),
  });
}

export async function saveModuleQuizResult({
  userId,
  courseId,
  moduleId,
  score,
  passed,
}: {
  userId: string;
  courseId: string;
  moduleId: string;
  score: number;
  passed: boolean;
}) {
  void userId;
  await apiFetch(`/api/me/courses/${encodeURIComponent(courseId)}/progress/quiz/`, {
    method: "POST",
    body: JSON.stringify({ moduleId, score, passed }),
  });
}

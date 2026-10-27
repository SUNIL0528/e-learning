export type InstructorLearner = {
  id: number;
  uid: string;
  candidateNumber: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  position: string;
  company: string;
  location: string;
  courseCount: number;
  averageProgress: number;
  pendingDescriptiveAnswers: number;
  descriptiveSubmissionCount: number;
};

export type InstructorAnswer = {
  id: number;
  questionId: string;
  question: string;
  answer: string;
  status: "pending" | "reviewed";
  score: number | null;
  maxScore: number;
  feedback: string;
  reviewerName: string | null;
  reviewedAt: string | null;
};

export type InstructorSubmission = {
  submissionId: string;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  submittedAt: string;
  status: "pending" | "reviewed";
  answers: InstructorAnswer[];
};

export type InstructorModule = {
  moduleId: string;
  title: string;
  progressPercent: number;
  status: string;
  score: number | null;
  passed: boolean;
  attempts: number;
  quizAttempts: Array<{ score: number; passed: boolean; createdAt: string }>;
  descriptiveSubmissions: InstructorSubmission[];
};

export type InstructorCourse = {
  courseId: string;
  courseTitle: string;
  status: string;
  progressPercent: number;
  enrolledAt: string | null;
  modules: InstructorModule[];
};

export type InstructorLearnerDetail = {
  learner: InstructorLearner;
  courses: InstructorCourse[];
  descriptiveSubmissions: InstructorSubmission[];
};

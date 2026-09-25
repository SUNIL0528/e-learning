import bayesianThumb from "@/assets/course-bayesian.jpg";
import figmaThumb from "@/assets/course-figma.jpg";
import sqlThumb from "@/assets/course-sql.jpg";
import motionThumb from "@/assets/course-motion.jpg";
import reactThumb from "@/assets/course-react.jpg";
import writingThumb from "@/assets/course-writing.jpg";

export type Status = "in-progress" | "completed" | "not-started";

export type Resource = { name: string; size: string; kind: string };

export type Question = {
  id: string;
  author: string;
  body: string;
  votes: number;
  answers: { author: string; role: string; body: string }[];
};

export type Slide = { title: string; bullets: string[] };

export type Chapter = {
  id: string;
  title: string;
  videoName?: string;
  duration: string;
  done: boolean;
  slides: Slide[];
  resources: Resource[];
  questions: Question[];
};

export type Module = { id: string; title: string; chapters: Chapter[] };

export type Course = {
  id: string;
  title: string;
  instructor: string;
  track: string;
  thumb: string;
  status: Status;
  progress: number;
  moduleCount: number;
  remaining: string;
  grade?: string;
  enrolled: boolean;
  level?: string;
  lessons?: number;
  modules: Module[];
};

export const ENABLED_COURSE_ID = "coating-inspection";

const chapter = (
  id: string,
  title: string,
  duration: string,
  done: boolean,
  extras: Partial<Chapter> = {},
): Chapter => ({
  id,
  title,
  duration,
  done,
  slides: [
    {
      title: title,
      bullets: [
        "What this chapter covers and why it matters",
        "The vocabulary you need before the demo",
        "How it connects to the previous chapter",
      ],
    },
    {
      title: "Key ideas",
      bullets: [
        "Definition and the one rule to remember",
        "A worked example, step by step",
        "The most common mistake and how to avoid it",
      ],
    },
    {
      title: "Before you watch",
      bullets: [
        "Have the worksheet open alongside the video",
        "Pause at each checkpoint and try it yourself",
        "Post anything unclear in the chapter Q&A",
      ],
    },
  ],
  resources: [
    { name: `${id}-slides.pdf`, size: "2.1 MB", kind: "Slides" },
    { name: `${id}-worksheet.pptx`, size: "840 KB", kind: "Deck" },
  ],
  questions: [],
  ...extras,
});

export const courses: Course[] = [
  {
    id: "coating-inspection",
    title: "Coating Inspection",
    instructor: "Vikash Bavisetty",
    track: "Track · DS",
    thumb: bayesianThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 18,
    enrolled: false,
    remaining: "07:33 left",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Foundations",
        chapters: [
          chapter("c1", "Frequentist vs Bayesian framing", "12:04", false),
          chapter("c2", "Priors, likelihoods, posteriors", "18:22", false),
        ],
      },
      {
        id: "m4",
        title: "Module 04 — Running experiments",
        chapters: [
          chapter("c11", "Sequential testing without peeking", "15:40", false),
          chapter("c12", "Posterior decision rules", "21:18", false, {
            questions: [
              {
                id: "q1",
                author: "Tomás V.",
                body: "Why do we scale the prior variance by sample size instead of keeping it fixed?",
                votes: 14,
                answers: [
                  {
                    author: "Vikash Bavisetty",
                    role: "Instructor",
                    body: "Because a fixed prior keeps dominating as data grows. Scaling keeps the prior weakly informative across experiment sizes.",
                  },
                ],
              },
              {
                id: "q2",
                author: "Aiko M.",
                body: "Is a 95% credible interval comparable to a 95% confidence interval when reporting to stakeholders?",
                votes: 7,
                answers: [],
              },
            ],
          }),
          chapter("c13", "Reporting lift with credible intervals", "14:02", false),
        ],
      },
    ],
  },
  {
    id: "figma-design-systems",
    title: "Figma Design Systems",
    instructor: "Nadia Kovač",
    track: "Design",
    thumb: figmaThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 9,
    enrolled: false,
    remaining: "03:12 left",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Token architecture",
        chapters: [
          chapter("c1", "Primitive vs semantic tokens", "11:10", false),
          chapter("c2", "Naming that survives handoff", "13:44", false, {
            questions: [
              {
                id: "q1",
                author: "Ruth O.",
                body: "How granular should semantic tokens get before they become noise?",
                votes: 9,
                answers: [
                  {
                    author: "Nadia Kovač",
                    role: "Instructor",
                    body: "Stop at the level your components actually branch on. If no component reads it, it is not a token yet.",
                  },
                ],
              },
            ],
          }),
        ],
      },
    ],
  },
  {
    id: "sql-for-analysts",
    title: "SQL for Analysts",
    instructor: "Tom Reyes",
    track: "Data",
    thumb: sqlThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 12,
    enrolled: false,
    remaining: "06:00 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Query shapes",
        chapters: [
          chapter("c1", "Filtering and aggregation", "09:30", false),
          chapter("c2", "Window functions in practice", "16:05", false),
        ],
      },
    ],
  },
  {
    id: "motion-design-101",
    title: "Motion Design 101",
    instructor: "Ivo Marek",
    track: "Motion",
    thumb: motionThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 7,
    enrolled: false,
    remaining: "Completed",
    grade: "96%",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Timing",
        chapters: [
          chapter("c1", "Easing curves", "10:12", false),
          chapter("c2", "The 12-frame rule", "12:55", false),
        ],
      },
    ],
  },
  {
    id: "react-native-basics",
    title: "React Native Basics",
    instructor: "Priya Nair",
    track: "Frontend",
    thumb: reactThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 14,
    enrolled: false,
    remaining: "Completed",
    grade: "92%",
    modules: [
      {
        id: "m1",
        title: "Module 01 — App shell",
        chapters: [
          chapter("c1", "Navigation patterns", "14:30", false),
          chapter("c2", "Auth and token refresh", "19:41", false),
        ],
      },
    ],
  },
  {
    id: "writing-for-product-teams",
    title: "Writing for Product Teams",
    instructor: "Marion Deltour",
    track: "Craft",
    thumb: writingThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 8,
    enrolled: false,
    level: "Beginner",
    lessons: 24,
    remaining: "04:20 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Clear by default",
        chapters: [
          chapter("c1", "Writing the one-sentence summary", "08:40", false),
          chapter("c2", "Cutting hedges and filler", "11:15", false),
        ],
      },
    ],
  },
  {
    id: "experiment-design-lab",
    title: "Experiment Design Lab",
    instructor: "Vikash Bavisetty",
    track: "Track · DS",
    thumb: bayesianThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 11,
    enrolled: false,
    level: "Advanced",
    lessons: 38,
    remaining: "09:10 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Hypotheses that hold up",
        chapters: [
          chapter("c1", "From metric to hypothesis", "13:20", false),
          chapter("c2", "Guardrail metrics", "10:55", false),
        ],
      },
    ],
  },
  {
    id: "prototyping-in-figma",
    title: "Prototyping in Figma",
    instructor: "Nadia Kovač",
    track: "Design",
    thumb: figmaThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 6,
    enrolled: false,
    level: "Intermediate",
    lessons: 19,
    remaining: "03:45 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Interactive components",
        chapters: [
          chapter("c1", "Variants and states", "12:02", false),
          chapter("c2", "Smart animate in practice", "09:48", false),
        ],
      },
    ],
  },
  {
    id: "data-storytelling",
    title: "Data Storytelling",
    instructor: "Tom Reyes",
    track: "Data",
    thumb: sqlThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 9,
    enrolled: false,
    level: "Intermediate",
    lessons: 27,
    remaining: "05:30 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — The narrative spine",
        chapters: [
          chapter("c1", "Choosing the one chart that matters", "10:30", false),
          chapter("c2", "Annotating for non-analysts", "14:12", false),
        ],
      },
    ],
  },
  {
    id: "after-effects-for-ui",
    title: "After Effects for UI",
    instructor: "Ivo Marek",
    track: "Motion",
    thumb: motionThumb,
    status: "not-started",
    progress: 0,
    moduleCount: 10,
    enrolled: false,
    level: "Advanced",
    lessons: 31,
    remaining: "07:05 total",
    modules: [
      {
        id: "m1",
        title: "Module 01 — Handoff-ready motion",
        chapters: [
          chapter("c1", "Composition setup", "11:40", false),
          chapter("c2", "Exporting to Lottie", "13:25", false),
        ],
      },
    ],
  },
];

const coatingModuleHeadings = [
  ["Role of the Inspector / Inspector Work", "Inspector"],
  ["Constructions and Materials", "Constructions and Materials"],
  ["Corrosion", "Corrosion"],
  ["Surface Preparation", "Surface Preparation"],
  ["Environment - Ambient Condition", "Environment - Ambient Condition"],
  ["Paints and coating materials", "Paints and coating materials"],
  [
    "Requirements for Execution of work / Role of Inspector",
    "Requirements for Execution of work / Role of Inspector",
  ],
  ["STANDARDS, SPECIFICATIONS AND PROCEDURES", "STANDARDS, SPECIFICATIONS AND PROCEDURES"],
  ["HEALTH – SAFETY – ENVIRONMENT", "HEALTH – SAFETY – ENVIRONMENT"],
  [
    "IMO (International Maritime Organisation) REQUIREMENTS",
    "IMO (International Maritime Organisation) REQUIREMENTS",
  ],
] as const;

const coatingModules: Module[] = coatingModuleHeadings.map(([title, videoName], index) => ({
  id: `m${index + 1}`,
  title: `Module ${String(index + 1).padStart(2, "0")} — ${title}`,
  chapters: [chapter(`m${index + 1}-video`, videoName, "Video", false, { videoName })],
}));

courses[0] = {
  ...courses[0]!,
  id: "coating-inspection",
  title: "Coating Inspection",
  track: "Coating Inspection",
  status: "not-started",
  progress: 0,
  moduleCount: 10,
  enrolled: false,
  remaining: "10 modules",
  grade: undefined,
  modules: coatingModules,
};

export const recommended = {
  title: "Writing for Product Teams",
  reason: "Because you finished Motion Design 101",
  thumb: writingThumb,
};

export const student = {
  name: "Amara Osei",
  email: "amara.osei@meridian.study",
  bio: "Analyst turning into a data scientist. Currently deep in experimentation and design systems.",
  location: "Accra, Ghana",
  level: "A2",
  streak: 12,
  hours: 142,
  certificates: 3,
  badges: ["Experimentation", "Design tokens", "Motion craft", "30-day streak"],
};

export const completedHistory: { course: string; date: string; grade: string }[] = [];

export type ForumPost = {
  id: string;
  tag: "General" | "Course" | "Job";
  title: string;
  author: string;
  region: string;
  body: string;
  votes: number;
  replies: number;
};

export const forumPosts: ForumPost[] = [
  {
    id: "f1",
    tag: "Job",
    title: "Hiring: Junior Data Analyst — Berlin (hybrid)",
    author: "Nordwind Labs",
    region: "Germany",
    body: "Looking for analysts with SQL plus an experimentation course completion. Two-stage interview, visa support available.",
    votes: 31,
    replies: 2,
  },
  {
    id: "f2",
    tag: "General",
    title: "Portfolio review thread — week 12",
    author: "Kenji Watanabe",
    region: "Japan",
    body: "Drop a link, get three pieces of feedback. Reviewing everything posted before Friday.",
    votes: 42,
    replies: 18,
  },
  {
    id: "f3",
    tag: "Course",
    title: "Coating Inspection — study group, Sundays 18:00 UTC",
    author: "Sofia Marchetti",
    region: "Italy",
    body: "We work through the posterior decision rules chapter together. Open to anyone past Module 03.",
    votes: 17,
    replies: 9,
  },
  {
    id: "f4",
    tag: "Job",
    title: "Contract: Design systems consultant — remote",
    author: "Halcyon Studio",
    region: "Canada",
    body: "Six weeks, token migration for a 40-component library. Figma Design Systems completion preferred.",
    votes: 12,
    replies: 4,
  },
];

export const candidates = [
  {
    name: "Amara Osei",
    level: "A2",
    region: "Ghana",
    completions: ["Motion Design 101", "React Native Basics"],
    certificates: 3,
    skills: ["SQL", "Experimentation", "Motion"],
  },
  {
    name: "Kenji Watanabe",
    level: "B1",
    region: "Japan",
    completions: ["SQL for Analysts", "Coating Inspection"],
    certificates: 5,
    skills: ["SQL", "Statistics", "Python"],
  },
  {
    name: "Sofia Marchetti",
    level: "A1",
    region: "Italy",
    completions: ["Figma Design Systems"],
    certificates: 1,
    skills: ["Design systems", "Figma"],
  },
  {
    name: "Ruth Okafor",
    level: "B1",
    region: "Nigeria",
    completions: ["React Native Basics", "Motion Design 101"],
    certificates: 4,
    skills: ["React", "Motion", "Design systems"],
  },
];

export type Doubt = {
  id: string;
  title: string;
  course: string;
  instructor: string;
  status: "pending" | "answered";
  asked: string;
  body: string;
  reply?: string;
};

export const doubts: Doubt[] = [
  {
    id: "d1",
    title: "When to use a prior vs a likelihood adjustment?",
    course: "Coating Inspection",
    instructor: "Vikash Bavisetty",
    status: "pending",
    asked: "2 hours ago",
    body: "In the lab I got a different answer depending on whether I encoded the business belief as a prior or reweighted the likelihood. Which is defensible in a write-up?",
  },
  {
    id: "d2",
    title: "Token expiry in the refresh flow",
    course: "React Native Basics",
    instructor: "Priya Nair",
    status: "answered",
    asked: "3 days ago",
    body: "My refresh call fires twice when the app returns from background. Is that expected?",
    reply:
      "Yes — the listener fires on both resume and focus. Debounce the refresh and store the in-flight promise so concurrent callers await the same request.",
  },
  {
    id: "d3",
    title: "Best easing for micro-interactions",
    course: "Motion Design 101",
    instructor: "Ivo Marek",
    status: "pending",
    asked: "5 days ago",
    body: "For 120ms button presses, is a spring overkill compared to a cubic-bezier?",
  },
];

export type GameId =
  "first-day" | "tool-room" | "defect-lab" | "vault" | "role-match" | "oadr" | "documents";

export const moduleOneGames: Array<{
  id: GameId;
  title: string;
  kind: string;
  objective: string;
  slides: string;
  minutes: string;
  review: string;
}> = [
  {
    id: "first-day",
    title: "Inspector's First Day",
    kind: "3D site mission",
    objective: "Explore a project site, assemble a field kit, assess evidence, and file a report.",
    slides: "Slides 2–8, 22–28, 35–37",
    minutes: "8 min",
    review: "Project authority is scenario-specific",
  },
  {
    id: "tool-room",
    title: "Inspector's Tool Room",
    kind: "3D instrument room",
    objective: "Inspect instruments, select tools for site needs, and check gauge readiness.",
    slides: "Slides 60–69",
    minutes: "7 min",
    review: "Training models are not operating instructions",
  },
  {
    id: "defect-lab",
    title: "Coating Defect 3D Lab",
    kind: "3D micro-defect lab",
    objective:
      "Examine 3D coating layers, inspect micro-failures (pinholes, blisters, sags), and diagnose repairs.",
    slides: "Slides 28, 56, 70–78",
    minutes: "6 min",
    review: "NACE/AMPP failure diagnosis simulation",
  },
  {
    id: "vault",
    title: "Knowledge Vault 3D",
    kind: "3D animated flashcards",
    objective:
      "Recall key terms and decisions with animated 3D cards, spaced repetition, and combos.",
    slides: "Across Module 1",
    minutes: "8 min",
    review: "Self-rated recall with combo multiplier",
  },
  {
    id: "role-match",
    title: "Who Am I?",
    kind: "Role cards",
    objective: "Identify the people involved in coating inspection.",
    slides: "Slides 9–17",
    minutes: "5 min",
    review: "Role authority is pending instructor review",
  },
  {
    id: "oadr",
    title: "OADR Mission",
    kind: "Sequence",
    objective: "Build the observation-to-report evidence chain.",
    slides: "Slides 5, 21, 35–36",
    minutes: "4 min",
    review: "Practice exercise",
  },
  {
    id: "documents",
    title: "Document Detective",
    kind: "File puzzle",
    objective: "Choose the right controlled document for each task.",
    slides: "Slides 24–26, 38–44",
    minutes: "6 min",
    review: "Document precedence is pending instructor review",
  },
];

export type ChoiceItem = {
  prompt: string;
  options: string[];
  accepted: string[];
  explanation: string;
  slides: string;
};

export const roleQuestions: ChoiceItem[] = [
  {
    prompt: "Who keeps the contractor's inspection and testing records?",
    options: [
      "QC Inspector",
      "QA Inspector",
      "Technical Service Inspector",
      "Independent Inspector",
    ],
    accepted: ["QC Inspector"],
    explanation:
      "The QC inspector documents contractor inspection and testing activity. Exact authority still depends on the project contract.",
    slides: "Slide 11",
  },
  {
    prompt: "Who monitors the contractor's work on the owner's behalf?",
    options: [
      "QC Inspector",
      "QA Inspector",
      "Technical Service Inspector",
      "Classification Inspector",
    ],
    accepted: ["QA Inspector"],
    explanation:
      "The QA role represents the owner in the slide example. Its delegated powers must be checked in the project documents.",
    slides: "Slide 12",
  },
  {
    prompt: "Who advises on coating application for the paint supplier?",
    options: [
      "Technical Service Inspector",
      "Third Party Inspector",
      "QC Inspector",
      "Independent Inspector",
    ],
    accepted: ["Technical Service Inspector"],
    explanation:
      "A technical service inspector or coating adviser provides supplier-side advice and recommendations.",
    slides: "Slide 13",
  },
  {
    prompt: "Who investigates a coating failure and provides an independent expert report?",
    options: ["Independent Inspector", "QC Inspector", "QA Inspector", "Classification Inspector"],
    accepted: ["Independent Inspector"],
    explanation:
      "The independent inspector is asked to assess evidence and report without a contractor-side interest.",
    slides: "Slide 14",
  },
  {
    prompt: "Who is typically a client-appointed independent inspection organization?",
    options: [
      "Third Party Inspector",
      "Technical Service Inspector",
      "QC Inspector",
      "Classification Inspector",
    ],
    accepted: ["Third Party Inspector"],
    explanation:
      "Third-party inspection is an independent appointment. Roles can overlap in real projects, so the contract remains decisive.",
    slides: "Slides 15–16",
  },
  {
    prompt: "Who checks relevant compliance at critical stages for certification?",
    options: [
      "Classification Inspector",
      "QC Inspector",
      "Technical Service Inspector",
      "QA Inspector",
    ],
    accepted: ["Classification Inspector"],
    explanation:
      "A classification or certification inspector checks criteria within the applicable certification scope.",
    slides: "Slide 17",
  },
];

export const documentQuestions: ChoiceItem[] = [
  {
    prompt: "Find the coating product's mixing ratio.",
    options: ["Specification", "PDS / TDS", "ITP", "SDS / MSDS"],
    accepted: ["PDS / TDS"],
    explanation:
      "The product data sheet gives product-specific application information such as the mixing ratio.",
    slides: "Slide 43",
  },
  {
    prompt: "Find the job's inspection checkpoints and responsible parties.",
    options: ["ITP", "PDS / TDS", "Batch certificate", "Daily log"],
    accepted: ["ITP"],
    explanation:
      "The inspection and test plan identifies checkpoints and the parties assigned to them for this project.",
    slides: "Slides 24–26",
  },
  {
    prompt: "Check chemical hazards and protective measures.",
    options: ["SDS / MSDS", "Specification", "ITP", "Approved procedure"],
    accepted: ["SDS / MSDS"],
    explanation: "The safety data sheet covers hazards and safe handling information.",
    slides: "Slide 43",
  },
  {
    prompt: "Find the project's required DFT acceptance criteria.",
    options: ["Specification", "PDS / TDS", "Batch certificate", "Daily log"],
    accepted: ["Specification"],
    explanation:
      "Start with the approved project specification and its ITP reference. Cross-check the product data sheet as applicable; product recommendations do not replace project acceptance criteria.",
    slides: "Slides 38–41, 43",
  },
  {
    prompt: "Check the approved method for carrying out application.",
    options: ["Approved procedure", "SDS / MSDS", "Batch certificate", "Daily log"],
    accepted: ["Approved procedure"],
    explanation: "The approved procedure explains the agreed method of work for the project.",
    slides: "Slide 42",
  },
  {
    prompt:
      "A newer draft conflicts with an older approved revision. Which copy should guide work?",
    options: [
      "Newer draft",
      "Latest approved applicable controlled copy",
      "Any file marked latest",
      "An old personal note",
    ],
    accepted: ["Latest approved applicable controlled copy"],
    explanation:
      "Use the applicable controlled copy approved for the project. A date or 'latest' label alone is not approval.",
    slides: "Slides 38–44",
  },
];

export const vaultCards = [
  [
    "What is an inspector's main responsibility?",
    "Assure work complies with the project specification.",
    "2",
  ],
  ["What does O in OADR stand for?", "Observation.", "5"],
  ["What does A in OADR stand for?", "Assessment.", "5"],
  ["What does D in OADR stand for?", "Document.", "5"],
  ["What does R in OADR stand for?", "Report.", "5"],
  ["Name four project representatives.", "Contractor, client, supplier, third party.", "9"],
  [
    "Who advises on paint application for a supplier?",
    "Technical Service Inspector / Coating Adviser.",
    "13",
  ],
  ["Who investigates coating failures independently?", "Independent Inspector / Expert.", "14"],
  ["What is an ITP?", "Inspection and Test Plan.", "24"],
  ["Who prepares the ITP in the slide example?", "The contractor's quality department.", "24"],
  ["Name three inspection-point types.", "Hold, witness, surveillance or review.", "26"],
  [
    "What is the purpose of a hold point?",
    "Require authorized release before progressing, as defined by the approved ITP.",
    "26–27",
  ],
  ["Name two surface checks.", "Cleanliness and surface profile.", "28"],
  [
    "What is assessed after coating?",
    "DFT, visual defects, and tests if required by the project.",
    "23, 28",
  ],
  ["What is a specification?", "A document establishing project requirements.", "38–41"],
  ["What explains the approved method of work?", "The approved procedure.", "42"],
  ["Where is a coating mix ratio typically found?", "Product Data Sheet (PDS).", "43"],
  ["What document covers chemical safety?", "Safety Data Sheet (SDS/MSDS).", "43"],
  ["Why use an inspector's daily log?", "Capture original site observations and results.", "51"],
  [
    "Correction versus corrective action?",
    "Fix the current issue versus address the cause to prevent recurrence.",
    "56",
  ],
  [
    "What should be checked before using a gauge?",
    "Condition, valid calibration, and verification required by the instrument and project instructions.",
    "66–69",
  ],
  ["What is a punch list?", "A recorded list of incomplete or defective work to rectify.", "80"],
] as const;

import seed from "./module-six-seed.json";

export type ModuleSixGameId =
  | "G02"
  | "G09"
  | "G11"
  | "G13"
  | "G24"
  | "G25"
  | "G27"
  | "G29"
  | "G30";
export type ModuleSixFilter = "All" | "Cards" | "Evidence" | "Sequence" | "Flashcards";
export const moduleSixGames: {
  id: ModuleSixGameId;
  title: string;
  kind: string;
  filter: Exclude<ModuleSixFilter, "All">;
  objective: string;
  slides: string;
  minutes: string;
}[] = [
  {
    id: "G13",
    title: "3D Airless Spray & Tip Lab",
    kind: "3D spray simulator",
    filter: "Cards",
    objective: "Decode three-digit tip labels (e.g. 517, 311) and test atomized 3D spray fans on structural steel.",
    slides: "S107–S114",
    minutes: "6 min",
  },
  {
    id: "G30",
    title: "3D Flame Spray & PFP Lab",
    kind: "3D simulation lab",
    filter: "Evidence",
    objective: "Simulate 3,000°C thermal metallizing and test 50x intumescent char expansion across structural steel profiles.",
    slides: "S072–S075, S192–S201",
    minutes: "7 min",
  },
  {
    id: "G29",
    title: "Knowledge Vault 3D",
    kind: "3D animated flashcards",
    filter: "Flashcards",
    objective: "Flip and rate all 56 sourced Chapter 6 review cards with 3D tilt, combos, and SRS scheduling.",
    slides: "S002–S285",
    minutes: "8 min",
  },
  {
    id: "G02",
    title: "Five Ingredients Match-Up",
    kind: "Match & flip",
    filter: "Cards",
    objective: "Pair coating ingredients with their roles, then inspect the explanation.",
    slides: "S005–S014",
    minutes: "5 min",
  },
  {
    id: "G09",
    title: "PDS Escape Room",
    kind: "Evidence puzzle",
    filter: "Evidence",
    objective: "Use a fictional training PDS to support a mixing decision.",
    slides: "S064–S085, S125–S129",
    minutes: "7 min",
  },
  {
    id: "G11",
    title: "Time Window Tactics",
    kind: "Timeline",
    filter: "Sequence",
    objective: "Separate induction, pot life and recoat clocks.",
    slides: "S082–S085, S125–S129",
    minutes: "5 min",
  },
  {
    id: "G24",
    title: "Specialty Coat Card Quest",
    kind: "Card sort",
    filter: "Cards",
    objective: "Sort specialty coating terms by their stated function.",
    slides: "S066–S069, S216–S219",
    minutes: "5 min",
  },
  {
    id: "G25",
    title: "Coating Family Top Trumps",
    kind: "Evidence draft",
    filter: "Evidence",
    objective: "Compare coating families and identify what a product PDS must confirm.",
    slides: "S002–S004, S265–S274",
    minutes: "6 min",
  },
  {
    id: "G27",
    title: "Process Sequencing Lab",
    kind: "Sequence",
    filter: "Sequence",
    objective: "Arrange conceptual process steps and review prerequisites.",
    slides: "S079–S083, S242–S259",
    minutes: "6 min",
  },
];

export const moduleSixSeed = seed;
export const ingredientPairs = [
  ...seed.matchingSets[0]!.pairs,
  { left: "Epoxy", right: "A binder family used in coating formulations" },
  { left: "Zinc phosphate", right: "An example of a corrosion-protective pigment" },
  { left: "Talc", right: "An example of an extender" },
  { left: "Alkyd", right: "A binder family associated with oxidative curing" },
  { left: "Thinner", right: "Added during application only if the product PDS permits it" },
];

export const specialtyPairs = [
  ...seed.matchingSets[2]!.pairs,
  { left: "Mist coat", right: "A light initial coat used where the approved system specifies it" },
  {
    left: "Holding primer",
    right: "Temporary protection while the approved coating sequence is pending",
  },
  { left: "Glass-flake coating", right: "A reinforced coating using flake-shaped material" },
  { left: "Soft coating", right: "A soft or non-curing protective material" },
  { left: "Tape wrapping", right: "An external wrap-based protection system" },
];

export const processDecks = [
  {
    id: "mix",
    title: "Two-pack preparation — conceptual",
    slides: [79, 80, 81, 82, 83],
    steps: [
      "Check the approved PDS",
      "Inspect the components",
      "Measure to the specified ratio",
      "Combine and mix",
      "Observe any specified induction",
      "Use within the stated pot life",
    ],
  },
  {
    id: "powder",
    title: "Powder manufacture — overview",
    slides: [242, 243, 244, 245, 246],
    steps: [
      "Dry raw materials",
      "Premix and extrude",
      "Cool and flake",
      "Mill and sieve",
      "Apply to the prepared item",
    ],
  },
  {
    id: "galvanizing",
    title: "Galvanizing — process overview",
    slides: [192, 193, 194, 195, 196, 197, 198, 199, 200, 201],
    steps: [
      "Confirm steel and process requirements",
      "Prepare and clean the steel",
      "Carry out the facility's fluxing stage",
      "Authorized facility immerses in molten zinc",
      "Cool and finish the item",
      "Inspect and document the coating",
    ],
  },
  {
    id: "brush",
    title: "Brush / roller — inspection overview",
    slides: [86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
    steps: [
      "Confirm approved PDS and project specification",
      "Verify surface preparation",
      "Identify details needing a specified stripe coat",
      "Authorized team applies the approved material",
      "Inspect coverage and record observations",
    ],
  },
  {
    id: "lining",
    title: "Lining project — inspection overview",
    slides: [248, 249, 250, 259],
    steps: [
      "Define substrate and chemical demand",
      "Confirm approved system and PDS",
      "Verify preparation requirements",
      "Authorized team applies material",
      "Inspect and document the lining",
    ],
  },
];

export const familyCards = [
  {
    name: "Alkyd",
    cure: "Oxidative cure, as a general family concept",
    check: "Substrate, environment, preparation and recoat instructions",
    slides: [15, 265],
  },
  {
    name: "Acrylic / vinyl",
    cure: "Physical drying, as a general family concept",
    check: "Product formulation, weathering and overcoating requirements",
    slides: [15, 267],
  },
  {
    name: "Two-pack epoxy",
    cure: "Chemical curing, as a general family concept",
    check: "Mixing ratio, pot life, exposure and compatibility",
    slides: [18, 270],
  },
  {
    name: "Polyurethane",
    cure: "Product-specific chemical cure",
    check: "Exact product type, UV exposure, recoat and system compatibility",
    slides: [72, 272],
  },
  {
    name: "Zinc-rich epoxy",
    cure: "Binder-dependent chemical cure",
    check: "Approved primer role, substrate preparation and topcoat compatibility",
    slides: [23, 269],
  },
  {
    name: "Zinc ethyl silicate",
    cure: "Inorganic zinc system; consult product data",
    check: "Humidity, cure, preparation and overcoating instructions",
    slides: [26, 274],
  },
];

export function slideLabel(slides: number[]) {
  return slides.map((slide) => `S${String(slide).padStart(3, "0")}`).join(" · ");
}

export function decodeTrainingTip(code: string) {
  if (!/^[1-9][0-9]{2}$/.test(code)) return null;
  return { angle: Number(code[0]) * 10, orifice: Number(code.slice(1)) / 1000 };
}

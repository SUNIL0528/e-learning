import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../server/question_bank.json", import.meta.url));
const destination = fileURLToPath(new URL("../src/data/question_bank.json", import.meta.url));
const bank = JSON.parse(readFileSync(source, "utf8"));
if (!bank || typeof bank !== "object" || Object.keys(bank).length !== 10 ||
    Object.values(bank).some((questions) => !Array.isArray(questions) || questions.length === 0)) {
  throw new Error("question_bank.json must contain ten nonempty chapters.");
}
copyFileSync(source, destination);
console.log("Synced chapter questions from server/question_bank.json");

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const references = path.join(root, "references");
const indexPath = path.join(references, "project-card-index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const errors = [];
const seenNumbers = new Set();
const seenNames = new Set();
const forbiddenKeys = new Set(["teacher_notes", "topic_teacher", "teaching_teacher", "learning_center", "health", "diet", "competitions", "source_pages", "model"]);

function scanForbiddenKeys(value, file, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, file, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (forbiddenKeys.has(key)) errors.push(`${file}: forbidden field ${nextTrail.join(".")}`);
    scanForbiddenKeys(child, file, nextTrail);
  }
}

if (index.schema_version !== 1) errors.push("project-card-index.json schema_version must be 1");
if (!Array.isArray(index.projects) || index.projects.length !== 11) {
  errors.push(`expected 11 project cards, found ${index.projects?.length ?? 0}`);
}

for (const item of index.projects ?? []) {
  if (seenNumbers.has(item.student_number)) errors.push(`duplicate student number: ${item.student_number}`);
  if (seenNames.has(item.student_name)) errors.push(`duplicate student name: ${item.student_name}`);
  seenNumbers.add(item.student_number);
  seenNames.add(item.student_name);

  const cardPath = path.join(references, item.file ?? "");
  if (!fs.existsSync(cardPath)) {
    errors.push(`missing card: ${item.file}`);
    continue;
  }

  const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
  for (const field of ["student_number", "student_name", "grade", "project", "project_summary", "one_sentence", "logic_chain", "concept_map", "questions_for_student"]) {
    if (card[field] === undefined || card[field] === null || card[field] === "") {
      errors.push(`${item.file}: missing ${field}`);
    }
  }
  scanForbiddenKeys(card, item.file);
  if (card.student_number !== item.student_number || card.student_name !== item.student_name || card.project !== item.project) {
    errors.push(`${item.file}: index/card identity mismatch`);
  }
}

const textFiles = [
  path.join(root, "SKILL.md"),
  path.join(references, "d3-retelling-coach.md"),
  path.join(references, "d3-presentation-coach.md")
];
for (const file of textFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("\u8bc4\u59d4")) errors.push(`${path.relative(root, file)}: forbidden audience term found`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("D3 content validation passed: 11 project cards, privacy fields clean, audience wording clean.");

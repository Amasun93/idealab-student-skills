#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { validateDeck } from "./classroom-deck-core.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error("Usage: node scripts/validate-classroom-deck.mjs --input <演示内容.json>");
  process.exit(2);
}

const inputPath = path.resolve(args.input);
let deck;
try {
  deck = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  console.error(`无法读取JSON: ${error.message}`);
  process.exit(1);
}

const { errors, warnings } = validateDeck(deck);
warnings.forEach((warning) => console.warn(`警告: ${warning}`));
if (errors.length) {
  errors.forEach((error) => console.error(`错误: ${error}`));
  process.exit(1);
}

console.log(`演示内容校验通过: ${deck.deck_type}, ${deck.slides.length}页。`);

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { validateDefenseSpec } from "./defense-core.mjs";

const inputIndex = process.argv.indexOf("--input");
const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
if (!input) {
  console.error("用法: node scripts/validate-defense-spec.mjs --input <答辩内容.json>");
  process.exitCode = 2;
} else {
  const absolute = path.resolve(input);
  const result = validateDefenseSpec(JSON.parse(fs.readFileSync(absolute, "utf8")), path.dirname(absolute));
  result.warnings.forEach((warning) => console.warn(`警告: ${warning}`));
  result.errors.forEach((error) => console.error(`错误: ${error}`));
  if (result.errors.length) process.exitCode = 1;
  else console.log("答辩内容校验通过");
}

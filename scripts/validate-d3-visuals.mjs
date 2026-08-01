#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { validateVisualSpec } from "./d3-visual-core.mjs";

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
  console.error("Usage: node scripts/validate-d3-visuals.mjs --input <D3图纸内容.json>");
  process.exit(2);
}

const inputPath = path.resolve(args.input);
let spec;
try {
  spec = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  console.error(`无法读取JSON: ${error.message}`);
  process.exit(1);
}

const { errors, warnings } = validateVisualSpec(spec, path.dirname(inputPath));
warnings.forEach((warning) => console.warn(`警告: ${warning}`));
if (errors.length) {
  errors.forEach((error) => console.error(`错误: ${error}`));
  process.exit(1);
}

console.log(`D3三张图校验通过: ${spec.project_title}`);

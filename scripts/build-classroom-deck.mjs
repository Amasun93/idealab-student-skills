#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeFileName, toPosix, validateDeck } from "./classroom-deck-core.mjs";

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

function uniqueDestination(directory, baseName, extension) {
  let candidate = path.join(directory, `${baseName}${extension}`);
  let version = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName}-v${version}${extension}`);
    version += 1;
  }
  return candidate;
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml"
  }[extension] ?? "application/octet-stream";
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output) {
  console.error("Usage: node scripts/build-classroom-deck.mjs --input <演示内容.json> --output <目标目录>");
  process.exit(2);
}

const inputPath = path.resolve(args.input);
const inputDirectory = path.dirname(inputPath);
const outputDirectory = path.resolve(args.output);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(skillRoot, "assets", "classroom-deck", "template.html");
const vendorPath = path.join(skillRoot, "assets", "classroom-deck", "vendor");

const deck = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const { errors, warnings } = validateDeck(deck);
warnings.forEach((warning) => console.warn(`警告: ${warning}`));
if (errors.length) {
  errors.forEach((error) => console.error(`错误: ${error}`));
  process.exit(1);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const runtimeDirectory = path.join(outputDirectory, "assets", "runtime");
const mediaDirectory = path.join(outputDirectory, "assets", "media");
copyDirectory(vendorPath, runtimeDirectory);
fs.mkdirSync(mediaDirectory, { recursive: true });

const normalized = structuredClone(deck);
const embedded = structuredClone(deck);
for (const slide of normalized.slides) {
  for (let imageIndex = 0; imageIndex < (slide.images ?? []).length; imageIndex += 1) {
    const image = slide.images[imageIndex];
    const embeddedImage = embedded.slides.find((item) => item.id === slide.id).images[imageIndex];
    if (/^data:image\//i.test(image.src)) {
      embeddedImage.src = image.src;
      continue;
    }
    const sourcePath = path.resolve(inputDirectory, image.src);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      console.error(`图片不存在: ${image.src}`);
      process.exit(1);
    }
    const extension = path.extname(sourcePath).toLowerCase() || ".png";
    const destinationName = `${slide.id.toLowerCase()}-${String(imageIndex + 1).padStart(2, "0")}${extension}`;
    const destinationPath = path.join(mediaDirectory, destinationName);
    fs.copyFileSync(sourcePath, destinationPath);
    image.src = toPosix(path.relative(outputDirectory, destinationPath));
    embeddedImage.src = `data:${mimeType(sourcePath)};base64,${fs.readFileSync(sourcePath).toString("base64")}`;
  }
}

const baseName = deck.deck_type === "d3-opening" ? "开题答辩" : "成果答辩";
const htmlPath = uniqueDestination(outputDirectory, baseName, ".html");
const dataPath = uniqueDestination(outputDirectory, "演示内容", ".json");
const notesPath = uniqueDestination(outputDirectory, "逐页讲稿", ".md");

const template = fs.readFileSync(templatePath, "utf8");
const safeJson = JSON.stringify(embedded).replace(/</g, "\\u003c");
if (!template.includes("__DECK_DATA__")) throw new Error("课堂演示模板缺少__DECK_DATA__占位符");
fs.writeFileSync(htmlPath, template.replace("__DECK_DATA__", safeJson), "utf8");
fs.writeFileSync(dataPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

const notes = [
  `# ${deck.meta.project_title}｜${baseName}逐页讲稿`,
  "",
  ...deck.slides.flatMap((slide, index) => [
    `## ${index + 1}. ${slide.title}`,
    "",
    slide.notes.trim(),
    ""
  ])
].join("\n");
fs.writeFileSync(notesPath, `${notes}\n`, "utf8");

console.log(JSON.stringify({
  html: htmlPath,
  data: dataPath,
  notes: notesPath,
  pptx_file_name: `${sanitizeFileName(deck.meta.output_name)}.pptx`,
  slides: deck.slides.length
}, null, 2));

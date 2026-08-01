#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeName, validateDefenseSpec } from "./defense-core.mjs";
import { inventoryMarkdown } from "./scan-defense-materials.mjs";

function args(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    result[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}

function bundlePaths(directory, prefix) {
  const outputs = [
    ["presentation", `${prefix}-答辩演示`, ".html"],
    ["script", `${prefix}-答辩逐页参考稿`, ".md"],
    ["practice", `${prefix}-答辩练习`, ".html"],
    ["spec", `${prefix}-答辩内容`, ".json"],
    ["inventory", `${prefix}-答辩素材盘点`, ".md"]
  ];
  let version = 1;
  const suffix = () => version === 1 ? "" : `-v${version}`;
  while (
    outputs.some(([, stem, extension]) => fs.existsSync(path.join(directory, `${stem}${suffix()}${extension}`)))
    || fs.existsSync(path.join(directory, `${prefix}-答辩演示${suffix()}-媒体`))
  ) version += 1;
  return {
    ...Object.fromEntries(outputs.map(([key, stem, extension]) => [key, path.join(directory, `${stem}${suffix()}${extension}`)])),
    media: path.join(directory, `${prefix}-答辩演示${suffix()}-媒体`)
  };
}

function imageMime(filePath) {
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" })[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function prepareMedia(spec, inputDirectory, outputDirectory, mediaDirectory) {
  const embedded = structuredClone(spec);
  for (const slide of embedded.slides) {
    for (const image of slide.images ?? []) {
      if (!["present", "generated"].includes(image.status) || /^data:image\//i.test(image.src ?? "")) continue;
      const absolute = path.resolve(inputDirectory, image.src);
      image.src = `data:${imageMime(absolute)};base64,${fs.readFileSync(absolute).toString("base64")}`;
    }
  }
  let videoIndex = 0;
  for (const slide of embedded.slides) {
    for (const video of slide.videos ?? []) {
      if (video.status !== "present") continue;
      const absolute = path.resolve(inputDirectory, video.src);
      fs.mkdirSync(mediaDirectory, { recursive: true });
      const parsed = path.parse(absolute);
      const fileName = `${String(++videoIndex).padStart(2, "0")}-${safeName(parsed.name)}${parsed.ext.toLowerCase()}`;
      const destination = path.join(mediaDirectory, fileName);
      fs.copyFileSync(absolute, destination);
      video.src = path.relative(outputDirectory, destination).split(path.sep).join("/");
    }
  }
  return embedded;
}

function scriptMarkdown(spec) {
  return [
    `# ${spec.meta.student_name}-${spec.meta.project_short_name} 答辩逐页参考稿`,
    "",
    `项目全名：${spec.meta.project_title}`,
    "",
    ...spec.slides.flatMap((slide, index) => [
      `## ${index + 1}. ${slide.title}`,
      "",
      slide.notes.trim(),
      "",
      slide.transition ? `过渡：${slide.transition}` : "",
      ""
    ])
  ].filter((value, index, values) => value || values[index - 1]).join("\n");
}

export function build(options) {
  if (!options.input || !options.output || !options.inventory) throw new Error("必须提供--input、--inventory和--output；最终生成必须绑定已确认的素材盘点");
  const inputPath = path.resolve(options.input);
  const inputDirectory = path.dirname(inputPath);
  const outputDirectory = path.resolve(options.output);
  const spec = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const inventoryPathInput = path.resolve(options.inventory);
  const inventory = JSON.parse(fs.readFileSync(inventoryPathInput, "utf8"));
  if (inventory?.schema_version !== 1 || inventory?.review?.confirmed !== true) throw new Error("素材盘点尚未确认；请先查看候选文件并将review.confirmed设为true");
  if (!Array.isArray(inventory?.checks) || inventory.checks.some((item) => item.status === "needs-review")) throw new Error("素材盘点仍有待确认候选；请逐项查看并改为present、missing或not-applicable");
  const specArchiveRoot = path.resolve(inputDirectory, spec?.meta?.archive_root ?? "");
  const inventoryArchiveRoot = path.resolve(inventory?.archive_root ?? "");
  if (specArchiveRoot.toLowerCase() !== inventoryArchiveRoot.toLowerCase()) throw new Error("答辩内容与素材盘点不是同一个学生档案");
  const validation = validateDefenseSpec(spec, inputDirectory);
  validation.warnings.forEach((warning) => console.warn(`警告: ${warning}`));
  if (validation.errors.length) throw new Error(validation.errors.join("\n"));
  const inventoryItems = new Map((Array.isArray(inventory.items) ? inventory.items : []).map((item) => [String(item.relative_path ?? "").replaceAll("\\", "/").toLowerCase(), item]));
  const checkByCategory = new Map(inventory.checks.map((item) => [item.category, item]));
  for (const slide of spec.slides) {
    for (const image of slide.images ?? []) {
      if (!["present", "generated"].includes(image.status)) continue;
      const absolute = path.resolve(inputDirectory, image.src);
      const relative = path.relative(specArchiveRoot, absolute).split(path.sep).join("/").toLowerCase();
      const item = inventoryItems.get(relative);
      if (!item || item.review_status !== "approved") throw new Error(`图片未在素材盘点中逐项确认: ${image.src}`);
      if (image.status === "generated" && item.origin !== "ai") throw new Error(`AI示意图必须在素材盘点中标记origin=ai: ${image.src}`);
      if (image.status === "present" && item.origin === "ai") throw new Error(`AI生成图片不能标记为真实素材present: ${image.src}`);
      if (["making", "prototype", "experiment"].includes(slide.section) && checkByCategory.get(slide.section)?.status !== "present") {
        throw new Error(`${slide.section}页面使用了真实素材，但素材盘点对应检查项尚未标记present`);
      }
    }
    for (const video of slide.videos ?? []) {
      if (video.status !== "present") continue;
      const absolute = path.resolve(inputDirectory, video.src);
      const relative = path.relative(specArchiveRoot, absolute).split(path.sep).join("/").toLowerCase();
      const item = inventoryItems.get(relative);
      if (!item || item.review_status !== "approved") throw new Error(`视频未在素材盘点中逐项确认: ${video.src}`);
      if (item.origin === "ai") throw new Error(`学生演示视频不能标记为AI生成素材: ${video.src}`);
      if (item.video_role !== "student-demo") throw new Error(`视频必须在素材盘点中确认并标记video_role=student-demo: ${video.src}`);
      if (checkByCategory.get("video")?.status !== "present") throw new Error("使用学生演示视频前，素材盘点中的video检查项必须标记为present");
    }
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const presentationTemplate = fs.readFileSync(path.join(moduleRoot, "assets", "presentation-template.html"), "utf8");
  const practiceTemplate = fs.readFileSync(path.join(moduleRoot, "assets", "practice-template.html"), "utf8");
  const prefix = `${safeName(spec.meta.student_name)}-${safeName(spec.meta.project_short_name)}`;
  const outputPaths = bundlePaths(outputDirectory, prefix);
  const htmlPath = outputPaths.presentation;
  const scriptPath = outputPaths.script;
  const practicePath = outputPaths.practice;
  const specPath = outputPaths.spec;
  const inventoryPath = outputPaths.inventory;
  const embedded = prepareMedia(spec, inputDirectory, outputDirectory, outputPaths.media);
  const safeJson = JSON.stringify(embedded).replaceAll("<", "\\u003c");
  fs.writeFileSync(htmlPath, presentationTemplate.replace("__DEFENSE_DATA__", safeJson), "utf8");
  fs.writeFileSync(practicePath, practiceTemplate.replace("__PRACTICE_DATA__", safeJson), "utf8");
  fs.writeFileSync(scriptPath, `${scriptMarkdown(spec)}\n`, "utf8");
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  fs.writeFileSync(inventoryPath, `${inventoryMarkdown(inventory)}\n`, "utf8");
  return { presentation: htmlPath, script: scriptPath, practice: practicePath, inventory: inventoryPath, spec: specPath, media_directory: fs.existsSync(outputPaths.media) ? outputPaths.media : null, slides: spec.slides.length, questions: spec.qa.length };
}

export function run(values = process.argv.slice(2)) {
  try {
    const result = build(args(values));
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run();

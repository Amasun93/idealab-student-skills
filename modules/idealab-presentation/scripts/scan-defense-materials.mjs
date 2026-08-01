#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMaterialInventory, safeName } from "./defense-core.mjs";

function args(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    result[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}

function uniquePath(directory, stem, extension) {
  let candidate = path.join(directory, `${stem}${extension}`);
  let version = 2;
  while (fs.existsSync(candidate)) candidate = path.join(directory, `${stem}-v${version++}${extension}`);
  return candidate;
}

export function inventoryMarkdown(inventory) {
  const present = inventory.checks.filter((item) => item.status === "present");
  const needsReview = inventory.checks.filter((item) => item.status === "needs-review");
  const missing = inventory.checks.filter((item) => item.status === "missing");
  const optional = inventory.checks.filter((item) => item.status === "not-applicable");
  const lines = [
    "# 答辩素材盘点",
    "",
    `- 档案：${inventory.archive_root}`,
    `- 文件总数：${inventory.total_files}`,
    "- 当前状态：待老师或学生确认使用方案",
    "",
    "## 完整可用",
    "",
    ...(present.length ? present.map((item) => `- ${item.label}：${item.count} 个文件`) : ["- 暂未自动识别到可直接使用的关键材料。"]),
    "",
    "## 可用但需确认",
    "",
    ...(needsReview.length ? needsReview.map((item) => `- ${item.label}：找到 ${item.count} 个候选文件。AI需查看内容、画面或预览视频后，再由老师或学生确认用途。`) : ["- 暂无待确认候选。"]),
    "",
    "## 缺失待补",
    "",
    ...(missing.length ? missing.map((item) => `- ${item.label}：缺失。请补充真实材料；原型、制作和实验素材不能用AI图代替。`) : ["- 未发现必需材料缺项。"]),
    "",
    "## 可选内容",
    "",
    ...(optional.length ? optional.map((item) => `- ${item.label}：当前没有材料，因此不强制生成这一页。`) : ["- 已找到调研或观察材料，可在确认后加入。"]),
    "",
    "## 允许AI生成",
    "",
    "- 封面背景图（不在图片中生成中文标题）。",
    "- 问题由来的生活场景示意图。",
    "- 现有方案的产品场景、工作原理或方案对比画面。",
    "- 基于已确认事实的概念图、流程图或硬件解释图。",
    "",
    "## 下一步确认",
    "",
    "请先查看候选文件内容，再确认：哪些本地材料会使用、哪些页面保留缺失占位、哪些示意图需要生成。确认后将盘点 JSON 中的 `review.confirmed` 改为 `true`，并填写确认人和时间。需要生图时，请先切换到生图能力较好的模型。",
    "",
    "## 文件明细",
    "",
    "| 类别 | 文件 | 视频身份 | 大小 |",
    "|---|---|---|---:|",
    ...inventory.items.map((item) => `| ${item.category} | ${item.relative_path.replaceAll("|", "\\|")} | ${item.video_role ?? "-"} | ${item.size} |`),
    ""
  ];
  return lines.join("\n");
}

export function run(values = process.argv.slice(2)) {
  const options = args(values);
  if (!options.archive || !options.output) {
    console.error("用法: node scripts/scan-defense-materials.mjs --archive <学生档案> --output <输出目录> [--name 姓名-项目简称]");
    return 2;
  }
  const inventory = buildMaterialInventory(options.archive);
  const outputDirectory = path.resolve(options.output);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const stem = `${safeName(options.name || "学生-项目")}-答辩素材盘点`;
  const jsonPath = uniquePath(outputDirectory, stem, ".json");
  const markdownPath = jsonPath.replace(/\.json$/i, ".md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, `${inventoryMarkdown(inventory)}\n`, "utf8");
  console.log(JSON.stringify({ inventory: jsonPath, summary: markdownPath, missing: inventory.checks.filter((item) => item.status === "missing").map((item) => item.label) }, null, 2));
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run();

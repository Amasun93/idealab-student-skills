#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const folders = [
  "01 开题书",
  "02 学生项目手册",
  "03 项目图纸",
  "04 项目代码",
  "05 项目关键性图片",
  "05 项目关键性图片/功能实现图（4张）",
  "05 项目关键性图片/实验关键图片（6张）",
  "05 项目关键性图片/项目原型图（1-2张）",
  "05 项目关键性图片/制作过程关键图（5张以上）",
  "05 项目关键性图片/其他参考资料",
  "06 答辩ppt",
  "07 项目视频",
  "08 项目装置交接单",
  "09 可选-学生论文",
  "10 研究日志",
  "99 待确认",
];

const topLevel = new Set(folders.filter((item) => !item.includes("/")));
const origins = {
  teacher: "老师提供版",
  student: "学生制作版",
  ai: "AI生成版",
  unknown: "待确认",
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = rest[i + 1];
    i += 1;
  }
  return args;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function cleanName(value, fallback = "未命名") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return cleaned || fallback;
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStructure(root) {
  await fs.mkdir(root, { recursive: true });
  for (const folder of folders) {
    await fs.mkdir(path.join(root, ...folder.split("/")), { recursive: true });
  }
}

async function readMetadata(root) {
  const metadataPath = path.join(root, "学生项目档案.json");
  if (!(await exists(metadataPath))) return null;
  return JSON.parse(await fs.readFile(metadataPath, "utf8"));
}

async function writeMetadata(root, metadata) {
  metadata.last_updated = localDate();
  await fs.writeFile(
    path.join(root, "学生项目档案.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const buffer = await fs.readFile(filePath);
  hash.update(buffer);
  return hash.digest("hex");
}

function withOrigin(fileName, origin) {
  const label = origins[origin];
  if (!label || origin === "unknown" || fileName.includes(label)) return fileName;
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `${base}-${label}${ext}`;
}

async function uniqueDestination(target) {
  if (!(await exists(target))) return target;
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  for (let version = 2; version < 1000; version += 1) {
    const candidate = `${base}-v${version}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  fail("同名版本过多，请老师检查目标目录。");
}

function assertInside(root, candidate) {
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalizedCandidate = path.resolve(candidate);
  if (!normalizedCandidate.startsWith(normalizedRoot)) {
    fail("目标路径超出当前学生档案，操作已停止。");
  }
}

async function appendRecord(root, record) {
  await fs.appendFile(
    path.join(root, "学生归档记录.jsonl"),
    `${JSON.stringify({ ...record, time: new Date().toISOString() })}\n`,
    "utf8",
  );
}

async function initArchive(args) {
  if (!args.name) fail("缺少 --name 学生姓名。");
  const base = path.resolve(args.base || process.cwd());
  const name = cleanName(args.name);
  const project = cleanName(args.project || "项目名称待补充");
  const root = path.join(base, `随堂调试-${name}-${project}`);
  await ensureStructure(root);

  const existing = await readMetadata(root);
  const metadata = existing || {
    number: null,
    name,
    source: "",
    grade: args.grade || "",
    topic_teacher: "",
    teaching_teacher: "",
    competitions: [],
    project_title: project,
    project_status: project === "项目名称待补充" ? "未定题" : "已定题",
    archive_schema_version: "ideaLab-student-archive-v1",
  };
  await writeMetadata(root, metadata);
  await appendRecord(root, { action: "init", root, created: !existing });
  process.stdout.write(`${JSON.stringify({ status: "ok", root, created: !existing }, null, 2)}\n`);
}

async function addMaterial(args) {
  if (!args.archive || !args.source || !args.category) {
    fail("add 需要 --archive、--source 和 --category。");
  }
  const root = path.resolve(args.archive);
  const source = path.resolve(args.source);
  const category = args.category;
  if (!topLevel.has(category)) fail(`不支持的一级目录：${category}`);
  if (!(await exists(root))) fail("学生档案不存在。");
  if (!(await exists(source))) fail("原文件不存在。");

  let targetDir = path.join(root, category);
  if (category === "05 项目关键性图片") {
    const allowed = folders
      .filter((item) => item.startsWith("05 项目关键性图片/"))
      .map((item) => item.split("/")[1]);
    const subfolder = args.subfolder || "其他参考资料";
    if (!allowed.includes(subfolder)) fail(`不支持的图片分类：${subfolder}`);
    targetDir = path.join(targetDir, subfolder);
  }
  assertInside(root, targetDir);
  await fs.mkdir(targetDir, { recursive: true });

  const stat = await fs.stat(source);
  let proposedName = cleanName(args.name || path.basename(source));
  proposedName = withOrigin(proposedName, args.origin);

  if (stat.isFile()) {
    const sourceHash = await hashFile(source);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const candidate = path.join(targetDir, entry.name);
      if ((await hashFile(candidate)) === sourceHash) {
        await appendRecord(root, { action: "duplicate", source, existing: candidate, sha256: sourceHash });
        process.stdout.write(`${JSON.stringify({ status: "duplicate", existing: candidate }, null, 2)}\n`);
        return;
      }
    }
    const destination = await uniqueDestination(path.join(targetDir, proposedName));
    assertInside(root, destination);
    await fs.copyFile(source, destination);
    await appendRecord(root, { action: "copy", source, destination, sha256: sourceHash });
    process.stdout.write(`${JSON.stringify({ status: "copied", destination }, null, 2)}\n`);
    return;
  }

  if (stat.isDirectory()) {
    const destination = await uniqueDestination(path.join(targetDir, proposedName));
    assertInside(root, destination);
    await fs.cp(source, destination, { recursive: true, errorOnExist: true });
    await appendRecord(root, { action: "copy-directory", source, destination });
    process.stdout.write(`${JSON.stringify({ status: "copied", destination }, null, 2)}\n`);
    return;
  }

  fail("只支持普通文件或文件夹。");
}

async function renameProject(args) {
  if (!args.archive || !args.project) fail("rename-project 需要 --archive 和 --project。");
  const root = path.resolve(args.archive);
  const metadata = await readMetadata(root);
  if (!metadata) fail("没有找到学生项目档案.json。");
  const project = cleanName(args.project);
  const nextRoot = path.join(path.dirname(root), `随堂调试-${cleanName(metadata.name)}-${project}`);
  if (path.resolve(root) !== path.resolve(nextRoot) && (await exists(nextRoot))) {
    fail("目标项目文件夹已经存在，未执行重命名。");
  }
  if (path.resolve(root) !== path.resolve(nextRoot)) await fs.rename(root, nextRoot);
  metadata.project_title = project;
  metadata.project_status = "已定题";
  await writeMetadata(nextRoot, metadata);
  await appendRecord(nextRoot, { action: "rename-project", from: root, to: nextRoot });
  process.stdout.write(`${JSON.stringify({ status: "renamed", root: nextRoot }, null, 2)}\n`);
}

async function countFiles(directory) {
  let count = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countFiles(item);
    else count += 1;
  }
  return count;
}

async function showStatus(args) {
  if (!args.archive) fail("status 需要 --archive。");
  const root = path.resolve(args.archive);
  if (!(await exists(root))) fail("学生档案不存在。");
  const counts = {};
  for (const folder of [...topLevel]) {
    counts[folder] = await countFiles(path.join(root, folder));
  }
  process.stdout.write(`${JSON.stringify({ status: "ok", root, counts }, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "init":
    await initArchive(args);
    break;
  case "add":
    await addMaterial(args);
    break;
  case "rename-project":
    await renameProject(args);
    break;
  case "status":
    await showStatus(args);
    break;
  default:
    fail("用法：archive-manager.mjs <init|add|rename-project|status> [参数]");
}


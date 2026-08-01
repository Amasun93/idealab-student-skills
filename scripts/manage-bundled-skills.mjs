#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_RELATIVE_PATH = "references/skill-registry.json";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim() || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.split("/").includes("..");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function loadRegistry(root = DEFAULT_ROOT) {
  const registryPath = path.join(root, REGISTRY_RELATIVE_PATH);
  let registry;

  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    return {
      registry: null,
      registryPath,
      errors: [`无法读取 Skill 注册表：${error.message}`]
    };
  }

  const errors = [];
  if (!isPlainObject(registry)) errors.push("Skill 注册表必须是一个 JSON 对象。");
  if (registry?.schema_version !== 1) errors.push("Skill 注册表 schema_version 必须为 1。");
  if (typeof registry?.bundle_id !== "string" || !registry.bundle_id.trim()) {
    errors.push("Skill 注册表缺少 bundle_id。");
  }
  if (!Array.isArray(registry?.skills)) errors.push("Skill 注册表 skills 必须是数组。");

  const seenIds = new Set();
  const registeredSkills = Array.isArray(registry?.skills) ? registry.skills : [];
  for (const [index, skill] of registeredSkills.entries()) {
    const label = `skills[${index}]`;
    if (!isPlainObject(skill)) {
      errors.push(`${label} 必须是对象。`);
      continue;
    }
    for (const field of ["id", "name", "description", "path", "entrypoint"]) {
      if (typeof skill[field] !== "string" || !skill[field].trim()) {
        errors.push(`${label} 缺少 ${field}。`);
      }
    }
    if (skill.id && seenIds.has(skill.id)) errors.push(`Skill id 重复：${skill.id}。`);
    if (skill.id) seenIds.add(skill.id);
    if (skill.path && !isSafeRelativePath(skill.path)) {
      errors.push(`${skill.id || label} 的 path 必须是仓库内的相对路径。`);
    }
    if (skill.entrypoint && !isSafeRelativePath(skill.entrypoint)) {
      errors.push(`${skill.id || label} 的 entrypoint 必须是模块内的相对路径。`);
    }
  }

  return { registry, registryPath, errors };
}

export function inspectBundledSkills(root = DEFAULT_ROOT) {
  const loaded = loadRegistry(root);
  if (!loaded.registry) return { ...loaded, skills: [] };

  const registeredSkills = Array.isArray(loaded.registry.skills)
    ? loaded.registry.skills.filter(isPlainObject)
    : [];
  const skills = registeredSkills.map((skill) => {
    const modulePath = path.resolve(root, skill.path || ".");
    const entrypointPath = path.resolve(modulePath, skill.entrypoint || ".");
    const problems = [];

    if (!isSafeRelativePath(skill.path) || !isInside(root, modulePath)) {
      problems.push("模块路径超出仓库范围");
    } else if (!fs.existsSync(modulePath) || !fs.statSync(modulePath).isDirectory()) {
      problems.push("模块目录不存在");
    }

    if (!isSafeRelativePath(skill.entrypoint) || !isInside(modulePath, entrypointPath)) {
      problems.push("入口路径超出模块范围");
    } else if (!fs.existsSync(entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
      problems.push(`入口文件不存在：${skill.entrypoint}`);
    }

    return {
      ...skill,
      modulePath,
      entrypointPath,
      available: problems.length === 0,
      problems
    };
  });

  return { ...loaded, skills };
}

function selectSkills(report, requestedId) {
  if (!requestedId) return report.skills;
  return report.skills.filter((skill) => skill.id === requestedId);
}

function printHumanReport(report, requestedId, command) {
  const selected = selectSkills(report, requestedId);
  const bundleName = report.registry?.bundle_name || report.registry?.bundle_id || "ideaLab Student";

  console.log(`${bundleName} 内置 Skill`);
  if (report.errors.length) {
    report.errors.forEach((error) => console.error(`配置错误：${error}`));
  }
  if (requestedId && selected.length === 0) {
    console.error(`未找到名为“${requestedId}”的内置 Skill。请先运行 list 查看可用模块。`);
    return;
  }
  if (selected.length === 0) {
    console.log("当前没有登记内置 Skill。");
    return;
  }

  for (const skill of selected) {
    const state = skill.available ? "可使用" : "需要修复";
    console.log(`- [${state}] ${skill.name} (${skill.id})`);
    console.log(`  ${skill.description}`);
    console.log(`  位置：${skill.path}/${skill.entrypoint}`);
    if (!skill.available) skill.problems.forEach((problem) => console.log(`  问题：${problem}`));
  }

  if (command === "check" && selected.every((skill) => skill.available) && report.errors.length === 0) {
    console.log(`检查完成：${selected.length} 个内置 Skill 均可使用。`);
  }
}

export function runCli(argv = process.argv.slice(2), root = DEFAULT_ROOT) {
  const [command = "list", ...rest] = argv;
  const jsonIndex = rest.indexOf("--json");
  const json = jsonIndex !== -1;
  if (json) rest.splice(jsonIndex, 1);
  const requestedId = rest[0];

  if (!["list", "check"].includes(command) || rest.length > 1) {
    console.error("用法：node scripts/manage-bundled-skills.mjs <list|check> [skill-id] [--json]");
    return 2;
  }

  const report = inspectBundledSkills(root);
  const selected = selectSkills(report, requestedId);
  if (json) {
    console.log(JSON.stringify({
      bundle_id: report.registry?.bundle_id ?? null,
      registry_errors: report.errors,
      skills: selected.map(({ id, name, description, path: skillPath, entrypoint, required, available, problems }) => ({
        id,
        name,
        description,
        path: skillPath,
        entrypoint,
        required: Boolean(required),
        available,
        problems
      }))
    }, null, 2));
  } else {
    printHumanReport(report, requestedId, command);
  }

  if (report.errors.length || (requestedId && selected.length === 0)) return 1;
  if (command === "check" && selected.some((skill) => !skill.available)) return 1;
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = runCli();

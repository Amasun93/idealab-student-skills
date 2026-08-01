import fs from "node:fs";
import path from "node:path";

const CONCEPT_ORIGINS = new Set(["ai-generated", "student-handdrawn", "opening-book-reference"]);
const CONCEPT_STATES = new Set(["approved", "fallback-handdrawn", "fallback-opening-book"]);
const QUALITY_KEYS = ["physical_product", "user_or_hand", "usage_scene", "interaction_visible", "matches_opening_book", "clear_image"];

function requiredText(errors, value, label, max = 500) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label}不能为空`);
  else if (value.length > max) errors.push(`${label}超过${max}字`);
}

function checkModules(errors, modules, label) {
  if (!Array.isArray(modules) || modules.length < 1) {
    errors.push(`${label}至少需要一项；尚未确认时写“待确认”及原因`);
    return;
  }
  modules.forEach((module, index) => {
    requiredText(errors, module?.name, `${label}[${index}].name`, 30);
    requiredText(errors, module?.purpose, `${label}[${index}].purpose`, 80);
  });
}

function localFile(errors, value, label, inputDirectory, extensions) {
  requiredText(errors, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const filePath = path.resolve(inputDirectory, value);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    errors.push(`${label}文件不存在: ${value}`);
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  if (!extensions.includes(extension)) errors.push(`${label}格式必须是${extensions.join("、")}`);
}

export function validateVisualSpec(spec, inputDirectory = process.cwd()) {
  const errors = [];
  const warnings = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { errors: ["根内容必须是JSON对象"], warnings };
  if (spec.schema_version !== 1) errors.push("schema_version必须是1");
  requiredText(errors, spec.project_title, "project_title", 60);
  localFile(errors, spec.source_opening_book, "source_opening_book", inputDirectory, [".png", ".jpg", ".jpeg", ".webp"]);
  if (typeof spec.uses_ai !== "boolean") errors.push("uses_ai必须是true或false");

  const concept = spec.concept ?? {};
  localFile(errors, concept.output, "concept.output", inputDirectory, [".png", ".jpg", ".jpeg", ".webp"]);
  if (!CONCEPT_ORIGINS.has(concept.origin)) errors.push("concept.origin无效");
  if (!Number.isInteger(concept.attempt) || concept.attempt < 1 || concept.attempt > 2) errors.push("concept.attempt只能是1或2");
  if (!CONCEPT_STATES.has(concept.review_status)) errors.push("concept.review_status无效");
  requiredText(errors, concept.description, "concept.description", 160);
  const checks = concept.quality_checks;
  if (!checks || typeof checks !== "object") errors.push("concept.quality_checks不能为空");
  else {
    const requiredChecks = concept.origin === "ai-generated" ? QUALITY_KEYS : ["physical_product", "matches_opening_book", "clear_image"];
    requiredChecks.forEach((key) => {
      if (checks[key] !== true) errors.push(`concept质量检查未通过: ${key}`);
    });
  }
  if (concept.origin === "ai-generated" && concept.review_status !== "approved") errors.push("AI概念图通过检查后review_status必须是approved");
  if (concept.origin !== "ai-generated" && concept.attempt !== 2) errors.push("只有两次AI生成都不合格后才能使用手绘图或开题书参考图兜底");

  const flow = spec.flow ?? {};
  localFile(errors, flow.output, "flow.output", inputDirectory, [".svg", ".png"]);
  requiredText(errors, flow.student_retelling, "flow.student_retelling", 500);
  if (!Array.isArray(flow.modes) || flow.modes.length < 1) errors.push("flow.modes至少需要一种模式");
  let totalSteps = 0;
  (flow.modes ?? []).forEach((mode, modeIndex) => {
    requiredText(errors, mode?.name, `flow.modes[${modeIndex}].name`, 24);
    if (!Array.isArray(mode?.steps) || mode.steps.length < 2) errors.push(`flow.modes[${modeIndex}].steps至少需要2步`);
    totalSteps += mode?.steps?.length ?? 0;
    (mode?.steps ?? []).forEach((step, stepIndex) => requiredText(errors, step, `flow.modes[${modeIndex}].steps[${stepIndex}]`, 50));
  });
  if (totalSteps < 6) warnings.push("流程图少于6个主要步骤，请确认没有为了简单而删掉关键逻辑");

  const hardware = spec.hardware ?? {};
  localFile(errors, hardware.output, "hardware.output", inputDirectory, [".svg", ".png"]);
  requiredText(errors, hardware.controller?.name, "hardware.controller.name", 30);
  requiredText(errors, hardware.controller?.purpose, "hardware.controller.purpose", 80);
  checkModules(errors, hardware.sensors, "hardware.sensors");
  checkModules(errors, hardware.actuators, "hardware.actuators");
  checkModules(errors, hardware.power, "hardware.power");
  checkModules(errors, hardware.communication, "hardware.communication");
  if (!Array.isArray(hardware.ai)) errors.push("hardware.ai必须是数组");
  if (spec.uses_ai === true && !hardware.ai?.length) errors.push("项目使用AI时必须填写hardware.ai分支");
  if (spec.uses_ai === false && hardware.ai?.length) errors.push("项目未使用AI时hardware.ai必须为空数组");
  (hardware.ai ?? []).forEach((module, index) => {
    ["name", "input", "purpose", "output", "runtime"].forEach((key) => requiredText(errors, module?.[key], `hardware.ai[${index}].${key}`, 80));
  });

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

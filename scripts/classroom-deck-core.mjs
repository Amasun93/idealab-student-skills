import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const EXPECTED_IDS = {
  "d3-opening": ["D3-01", "D3-02", "D3-03", "D3-04", "D3-05", "D3-06"],
  "d7-final": ["D7-01", "D7-02", "D7-03", "D7-04", "D7-05", "D7-06", "D7-07", "D7-08", "D7-09", "D7-10"]
};

const HTML_RE = /<\/?[a-z][^>]*>|javascript:|data:text\/html/i;
const D3_FORBIDDEN = ["制作过程", "原型成品", "实验结果", "已经证明", "已经完成制作"];
const IMAGE_ROLES = new Set(["scene-photo", "concept", "process-flow", "hardware-block", "opening-book", "student-sketch", "prototype", "making-process", "experiment", "result", "reference"]);
const IMAGE_ORIGINS = new Set(["ai-generated", "student-handdrawn", "opening-book", "teacher-provided", "project-archive", "web-source"]);
const REVIEW_STATES = new Set(["approved", "fallback-handdrawn", "fallback-opening-book", "unreviewed"]);
const D3_REQUIRED_ROLES = {
  "D3-01": "scene-photo",
  "D3-03": "concept",
  "D3-04": "process-flow",
  "D3-05": "hardware-block",
  "D3-06": "opening-book"
};

function textValues(slide) {
  return [
    slide.kicker,
    slide.title,
    slide.subtitle,
    slide.summary,
    ...(slide.source_refs ?? []),
    ...(slide.bullets ?? []),
    ...(slide.items ?? []).flatMap((item) => [item.title, item.body]),
    ...(slide.images ?? []).flatMap((image) => [image.alt, image.caption]),
    slide.notes
  ].filter(Boolean);
}

function checkText(errors, value, label, max, required = false) {
  if (required && (!value || !String(value).trim())) errors.push(`${label}不能为空`);
  if (value !== undefined && typeof value !== "string") errors.push(`${label}必须是文字`);
  if (typeof value === "string" && value.length > max) errors.push(`${label}超过${max}字`);
  if (typeof value === "string" && HTML_RE.test(value)) errors.push(`${label}不能包含HTML或脚本`);
}

export function validateDeck(deck) {
  const errors = [];
  const warnings = [];

  if (!deck || typeof deck !== "object" || Array.isArray(deck)) return { errors: ["根内容必须是JSON对象"], warnings };
  if (deck.schema_version !== 1) errors.push("schema_version必须是1");
  if (!EXPECTED_IDS[deck.deck_type]) errors.push("deck_type必须是d3-opening或d7-final");

  const meta = deck.meta ?? {};
  checkText(errors, meta.student_name, "meta.student_name", 30, true);
  checkText(errors, meta.grade, "meta.grade", 20);
  checkText(errors, meta.project_title, "meta.project_title", 60, true);
  checkText(errors, meta.one_sentence, "meta.one_sentence", 120);
  checkText(errors, meta.output_name, "meta.output_name", 80, true);

  if (!Array.isArray(deck.slides)) {
    errors.push("slides必须是数组");
    return { errors, warnings };
  }

  const expected = EXPECTED_IDS[deck.deck_type] ?? [];
  if (deck.slides.length !== expected.length) errors.push(`${deck.deck_type}必须正好有${expected.length}页`);

  deck.slides.forEach((slide, index) => {
    const prefix = `slides[${index}]`;
    if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
      errors.push(`${prefix}必须是对象`);
      return;
    }
    if (slide.id !== expected[index]) errors.push(`${prefix}.id应为${expected[index] ?? "不存在"}`);
    checkText(errors, slide.kicker, `${prefix}.kicker`, 24);
    checkText(errors, slide.title, `${prefix}.title`, 36, true);
    checkText(errors, slide.subtitle, `${prefix}.subtitle`, 90);
    checkText(errors, slide.summary, `${prefix}.summary`, 180);
    checkText(errors, slide.notes, `${prefix}.notes`, 1000, true);

    if (slide.bullets !== undefined && !Array.isArray(slide.bullets)) errors.push(`${prefix}.bullets必须是数组`);
    if ((slide.bullets ?? []).length > 5) errors.push(`${prefix}.bullets最多5条`);
    (slide.bullets ?? []).forEach((value, itemIndex) => checkText(errors, value, `${prefix}.bullets[${itemIndex}]`, 80, true));

    if (slide.items !== undefined && !Array.isArray(slide.items)) errors.push(`${prefix}.items必须是数组`);
    if ((slide.items ?? []).length > 4) errors.push(`${prefix}.items最多4项`);
    (slide.items ?? []).forEach((item, itemIndex) => {
      checkText(errors, item?.title, `${prefix}.items[${itemIndex}].title`, 24, true);
      checkText(errors, item?.body, `${prefix}.items[${itemIndex}].body`, 100, true);
    });

    if (slide.source_refs !== undefined && !Array.isArray(slide.source_refs)) errors.push(`${prefix}.source_refs必须是数组`);
    if ((slide.source_refs ?? []).length > 6) errors.push(`${prefix}.source_refs最多6项`);
    (slide.source_refs ?? []).forEach((value, sourceIndex) => checkText(errors, value, `${prefix}.source_refs[${sourceIndex}]`, 260, true));

    if (slide.images !== undefined && !Array.isArray(slide.images)) errors.push(`${prefix}.images必须是数组`);
    if ((slide.images ?? []).length > 4) errors.push(`${prefix}.images最多4张`);
    (slide.images ?? []).forEach((image, imageIndex) => {
      checkText(errors, image?.src, `${prefix}.images[${imageIndex}].src`, 500, true);
      checkText(errors, image?.alt, `${prefix}.images[${imageIndex}].alt`, 80, true);
      checkText(errors, image?.caption, `${prefix}.images[${imageIndex}].caption`, 80);
      checkText(errors, image?.description, `${prefix}.images[${imageIndex}].description`, 180);
      if (image?.fit && !["contain", "cover"].includes(image.fit)) errors.push(`${prefix}.images[${imageIndex}].fit只能是contain或cover`);
      if (image?.role && !IMAGE_ROLES.has(image.role)) errors.push(`${prefix}.images[${imageIndex}].role无效`);
      if (image?.origin && !IMAGE_ORIGINS.has(image.origin)) errors.push(`${prefix}.images[${imageIndex}].origin无效`);
      if (image?.review_status && !REVIEW_STATES.has(image.review_status)) errors.push(`${prefix}.images[${imageIndex}].review_status无效`);
    });

    textValues(slide).forEach((value) => {
      if (HTML_RE.test(value)) errors.push(`${prefix}包含HTML或脚本内容`);
    });
  });

  if (deck.deck_type === "d3-opening") {
    Object.entries(D3_REQUIRED_ROLES).forEach(([id, role]) => {
      const slide = deck.slides.find((item) => item.id === id);
      if (!slide?.images?.length) {
        errors.push(`${id}必须包含${role}图片`);
        return;
      }
      const image = slide.images[0];
      if (image.role !== role) errors.push(`${id}首张图片role必须是${role}`);
      if (!IMAGE_ORIGINS.has(image.origin)) errors.push(`${id}首张图片必须填写有效origin`);
      if (!REVIEW_STATES.has(image.review_status) || image.review_status === "unreviewed") errors.push(`${id}首张图片必须完成质量检查`);
      if (!image.description?.trim()) errors.push(`${id}首张图片必须填写画面含义description`);
    });
    ["D3-02", "D3-03", "D3-04", "D3-05", "D3-06"].forEach((id) => {
      const slide = deck.slides.find((item) => item.id === id);
      if (!slide?.source_refs?.length) errors.push(`${id}必须填写source_refs，说明内容依据`);
    });
    const problemSlide = deck.slides.find((item) => item.id === "D3-02");
    if (!problemSlide?.images?.some((image) => image.role === "scene-photo")) warnings.push("D3-02建议使用一张清晰的相关场景图");
    const concept = deck.slides.find((item) => item.id === "D3-03")?.images?.[0];
    if (concept?.src && (/\.svg(?:$|[?#])/i.test(concept.src) || /^data:image\/svg\+xml/i.test(concept.src))) {
      errors.push("D3-03概念图必须是实体场景效果图，不能使用SVG框图");
    }
    if (concept) {
      const checks = concept.quality_checks;
      const requiredChecks = ["physical_product", "matches_opening_book", "clear_image"];
      if (concept.origin === "ai-generated") requiredChecks.push("user_or_hand", "usage_scene", "interaction_visible");
      if (!checks || typeof checks !== "object") errors.push("D3-03概念图必须填写quality_checks质量检查");
      else requiredChecks.forEach((key) => {
        if (checks[key] !== true) errors.push(`D3-03概念图质量检查未通过: ${key}`);
      });
    }
    const visible = deck.slides.flatMap(textValues).join("\n");
    D3_FORBIDDEN.forEach((term) => {
      if (visible.includes(term)) errors.push(`D3开题内容不能使用“${term}”`);
    });
  }

  if (deck.deck_type === "d7-final") {
    ["D7-06", "D7-07", "D7-09"].forEach((id) => {
      const slide = deck.slides.find((item) => item.id === id);
      if (!slide?.images?.length) warnings.push(`${id}尚未提供图片或证据材料，生成前应请学生或老师确认`);
    });
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (!length || length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function rasterDimensions(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ([".jpg", ".jpeg"].includes(extension) && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return jpegDimensions(buffer);
  return null;
}

function readImageSource(src, inputDirectory) {
  const dataMatch = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(src ?? "");
  if (dataMatch) return { buffer: Buffer.from(dataMatch[2], "base64"), extension: dataMatch[1].toLowerCase() === "png" ? ".png" : ".jpg", label: "内嵌图片" };
  const filePath = path.resolve(inputDirectory, src ?? "");
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { error: `图片不存在: ${src}` };
  return { buffer: fs.readFileSync(filePath), extension: path.extname(filePath).toLowerCase(), label: src };
}

export function validateDeckMedia(deck, inputDirectory) {
  const errors = [];
  const warnings = [];
  if (deck?.deck_type !== "d3-opening" || !Array.isArray(deck.slides)) return { errors, warnings };

  const hashes = new Map();
  for (const slide of deck.slides) {
    for (const image of slide.images ?? []) {
      const source = readImageSource(image.src, inputDirectory);
      if (source.error) { errors.push(source.error); continue; }
      const hash = crypto.createHash("sha256").update(source.buffer).digest("hex");
      if (["concept", "process-flow", "hardware-block", "opening-book"].includes(image.role)) {
        const previous = hashes.get(hash);
        if (previous) errors.push(`${slide.id}与${previous}使用了相同图片，三张图和开题书必须各自对应`);
        else hashes.set(hash, slide.id);
      }
      if (["scene-photo", "concept"].includes(image.role)) {
        const dimensions = rasterDimensions(source.buffer, source.extension);
        if (dimensions && (dimensions.width < 1280 || dimensions.height < 720)) {
          errors.push(`${slide.id}图片清晰度不足: ${source.label} 为${dimensions.width}×${dimensions.height}，至少需要1280×720`);
        } else if (!dimensions && ![".webp"].includes(source.extension)) {
          warnings.push(`${slide.id}无法自动识别图片尺寸，请人工确认清晰度: ${source.label}`);
        }
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function sanitizeFileName(value) {
  return String(value || "课堂演示")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "课堂演示";
}

export function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

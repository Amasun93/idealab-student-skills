import path from "node:path";

export const EXPECTED_IDS = {
  "d3-opening": ["D3-01", "D3-02", "D3-03", "D3-04", "D3-05", "D3-06", "D3-07"],
  "d7-final": ["D7-01", "D7-02", "D7-03", "D7-04", "D7-05", "D7-06", "D7-07", "D7-08", "D7-09", "D7-10"]
};

const HTML_RE = /<\/?[a-z][^>]*>|javascript:|data:text\/html/i;
const D3_FORBIDDEN = ["制作过程", "原型成品", "实验结果", "已经证明", "已经完成制作"];

function textValues(slide) {
  return [
    slide.kicker,
    slide.title,
    slide.subtitle,
    slide.summary,
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

    if (slide.images !== undefined && !Array.isArray(slide.images)) errors.push(`${prefix}.images必须是数组`);
    if ((slide.images ?? []).length > 4) errors.push(`${prefix}.images最多4张`);
    (slide.images ?? []).forEach((image, imageIndex) => {
      checkText(errors, image?.src, `${prefix}.images[${imageIndex}].src`, 500, true);
      checkText(errors, image?.alt, `${prefix}.images[${imageIndex}].alt`, 80, true);
      checkText(errors, image?.caption, `${prefix}.images[${imageIndex}].caption`, 80);
      if (image?.fit && !["contain", "cover"].includes(image.fit)) errors.push(`${prefix}.images[${imageIndex}].fit只能是contain或cover`);
    });

    textValues(slide).forEach((value) => {
      if (HTML_RE.test(value)) errors.push(`${prefix}包含HTML或脚本内容`);
    });
  });

  if (deck.deck_type === "d3-opening") {
    ["D3-04", "D3-05", "D3-06"].forEach((id) => {
      const slide = deck.slides.find((item) => item.id === id);
      if (!slide?.images?.length) errors.push(`${id}必须包含老师确认的图纸图片`);
    });
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

export function sanitizeFileName(value) {
  return String(value || "课堂演示")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "课堂演示";
}

export function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

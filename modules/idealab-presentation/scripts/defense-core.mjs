import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const GRADE_BANDS = new Set(["primary", "middle", "high"]);
export const EVIDENCE_SECTIONS = new Set(["making", "prototype", "experiment"]);
export const REQUIRED_SECTIONS = ["cover", "problem", "current-state", "goal", "solution", "experiment", "summary"];
export const MATERIAL_STATES = new Set(["present", "missing", "generated", "not-applicable"]);
export const SECTION_ALIASES = Object.freeze({
  background: "problem",
  context: "problem",
  "existing-solutions": "current-state",
  existing_solutions: "current-state",
  market: "current-state",
  objective: "goal",
  objectives: "goal",
  target: "goal",
  method: "solution",
  methods: "solution",
  approach: "solution",
  testing: "experiment",
  results: "experiment",
  validation: "experiment",
  conclusion: "summary",
  conclusions: "summary"
});

const KNOWN_SECTIONS = new Set(["cover", "problem", "current-state", "research", "goal", "solution", "principle", "diagrams", "making", "prototype", "experiment", "summary"]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const BROWSER_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".md", ".txt", ".xlsx", ".csv"]);

export function isMedia(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

export function isImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isVideo(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function inferVideoRole(filePath) {
  const normalized = toPosix(filePath).toLowerCase();
  if (includesAny(normalized, ["学生演示", "学生版", "学生讲解", "学生展示", "student-demo", "student demo"])) return "student-demo";
  if (includesAny(normalized, ["老师演示", "教师演示", "老师版", "教师版", "老师讲解", "教师讲解", "teacher-demo", "teacher demo"])) return "teacher-reference";
  return "needs-review";
}

export function canonicalSection(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll(" ", "-");
  return SECTION_ALIASES[normalized] ?? normalized;
}

export function normalizeDefenseSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  const normalized = structuredClone(spec);
  if (Array.isArray(normalized.slides)) {
    normalized.slides = normalized.slides.map((slide) => ({ ...slide, section: canonicalSection(slide?.section) }));
  }
  return normalized;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isValidImageFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || !isImage(filePath)) return false;
  const extension = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  if (extension === ".svg") return /<svg\b/i.test(buffer.subarray(0, 4096).toString("utf8"));
  if (extension === ".png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if ([".jpg", ".jpeg"].includes(extension)) return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === ".gif") return buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (extension === ".webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export function isValidVideoFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || !BROWSER_VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  const extension = path.extname(filePath).toLowerCase();
  const buffer = Buffer.alloc(32);
  const handle = fs.openSync(filePath, "r");
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(handle, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  const header = buffer.subarray(0, bytesRead);
  if ([".mp4", ".mov"].includes(extension)) return header.length >= 12 && header.subarray(4, 8).toString("ascii") === "ftyp";
  if (extension === ".webm") return header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

export function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  const handle = fs.openSync(filePath, "r");
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytesRead));
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

function includesAny(value, terms) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

export function classifyArchiveFile(relativePath) {
  const normalized = toPosix(relativePath);
  const extension = path.extname(normalized).toLowerCase();
  if (extension === ".mp") return "code";
  if (normalized.startsWith("01 ") || normalized.includes("/01 ")) return "opening-book";
  if (normalized.startsWith("02 ") || normalized.includes("/02 ")) return "handbook";
  if (normalized.startsWith("03 ") || normalized.includes("/03 ")) return "drawing";
  if (normalized.startsWith("04 ") || normalized.includes("/04 ")) return "code";
  if (includesAny(normalized, ["制作过程", "组装", "调试", "加工", "切割", "焊接"])) return "making";
  if (includesAny(normalized, ["实验", "测试", "数据", "记录表"])) return "experiment";
  if (includesAny(normalized, ["原型", "成品", "实物", "装置"])) return "prototype";
  if (includesAny(normalized, ["问卷", "访谈", "调研", "观察记录"])) return "research";
  if (includesAny(normalized, ["功能实现", "运行效果", "演示"])) return "function";
  if (normalized.startsWith("06 ") || normalized.includes("/06 ")) return "presentation";
  if (normalized.startsWith("07 ") || normalized.includes("/07 ") || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (normalized.startsWith("10 ") || normalized.includes("/10 ")) return "log";
  if (normalized.startsWith("99 ") || normalized.includes("/99 ")) return "needs-review";
  if (IMAGE_EXTENSIONS.has(extension)) return "reference-image";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "other";
}

export function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

export function buildMaterialInventory(root) {
  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`学生档案不存在或不是文件夹: ${absoluteRoot}`);
  }
  const items = walkFiles(absoluteRoot).map((absolute) => {
    const relative = toPosix(path.relative(absoluteRoot, absolute));
    const stat = fs.statSync(absolute);
    return {
      relative_path: relative,
      category: classifyArchiveFile(relative),
      media: isMedia(absolute),
      media_kind: isImage(absolute) ? "image" : isVideo(absolute) ? "video" : "other",
      ...(isVideo(absolute) ? { video_role: inferVideoRole(relative) } : {}),
      ...(path.extname(relative).toLowerCase() === ".mp" ? { package_kind: "mindplus-project" } : {}),
      origin: "unknown",
      review_status: "unreviewed",
      size: stat.size,
      sha256: sha256(absolute)
    };
  });
  const byCategory = Object.groupBy ? Object.groupBy(items, (item) => item.category) : items.reduce((result, item) => {
    (result[item.category] ??= []).push(item);
    return result;
  }, {});
  const evidenceCandidates = (category) => (byCategory[category] ?? []).filter((item) => {
    const extension = path.extname(item.relative_path).toLowerCase();
    if (["making", "prototype"].includes(category)) return IMAGE_EXTENSIONS.has(extension);
    if (category === "experiment") return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);
    if (category === "opening-book") return IMAGE_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);
    return true;
  });
  const required = [
    ["opening-book", "开题书或项目说明"],
    ["drawing", "概念图、流程图或硬件框图"],
    ["making", "制作过程照片"],
    ["prototype", "真实原型照片"],
    ["experiment", "实验记录、照片或数据"]
  ].map(([category, label]) => {
    const candidates = evidenceCandidates(category);
    return { category, label, status: candidates.length ? "needs-review" : "missing", count: candidates.length };
  });
  const researchCandidates = evidenceCandidates("research");
  const optionalResearch = { category: "research", label: "问卷、访谈或观察记录（可选）", status: researchCandidates.length ? "needs-review" : "not-applicable", count: researchCandidates.length };
  const videoCandidates = items.filter((item) => item.media_kind === "video" && item.video_role !== "teacher-reference");
  const teacherVideos = items.filter((item) => item.media_kind === "video" && item.video_role === "teacher-reference");
  const optionalVideo = {
    category: "video",
    label: "学生演示视频（原视频直接播放）",
    status: videoCandidates.length ? "needs-review" : teacherVideos.length ? "missing" : "not-applicable",
    count: videoCandidates.length,
    teacher_reference_count: teacherVideos.length
  };
  return {
    schema_version: 1,
    archive_root: absoluteRoot,
    generated_at: new Date().toISOString(),
    total_files: items.length,
    review: { confirmed: false, confirmed_at: null, confirmed_by: null },
    items,
    categories: Object.fromEntries(Object.entries(byCategory).map(([key, value]) => [key, value.length])),
    checks: [...required, optionalResearch, optionalVideo]
  };
}

function checkText(errors, value, label, required = false) {
  if (required && (typeof value !== "string" || !value.trim())) errors.push(`${label}不能为空`);
  else if (value !== undefined && typeof value !== "string") errors.push(`${label}必须是文字`);
}

export function validateDefenseSpec(spec, baseDirectory = process.cwd()) {
  const errors = [];
  const warnings = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { errors: ["根内容必须是JSON对象"], warnings };
  if (spec.schema_version !== 1) errors.push("schema_version必须是1");
  const meta = spec.meta ?? {};
  checkText(errors, meta.student_name, "meta.student_name", true);
  checkText(errors, meta.project_title, "meta.project_title", true);
  checkText(errors, meta.project_short_name, "meta.project_short_name", true);
  checkText(errors, meta.core_problem, "meta.core_problem", true);
  checkText(errors, meta.archive_root, "meta.archive_root", true);
  if (!GRADE_BANDS.has(meta.grade_band)) errors.push("meta.grade_band必须是primary、middle或high");
  if (spec.plan_confirmed !== true) errors.push("plan_confirmed必须为true；先完成素材盘点并让用户确认");
  if (!Array.isArray(spec.slides) || !spec.slides.length) errors.push("slides必须是非空数组");
  const archiveRoot = typeof meta.archive_root === "string" ? path.resolve(baseDirectory, meta.archive_root) : null;
  if (archiveRoot && (!fs.existsSync(archiveRoot) || !fs.statSync(archiveRoot).isDirectory())) errors.push(`meta.archive_root不存在或不是文件夹: ${meta.archive_root}`);
  const archiveRootReal = archiveRoot && fs.existsSync(archiveRoot) && fs.statSync(archiveRoot).isDirectory() ? fs.realpathSync(archiveRoot) : null;
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const sections = new Set();
  for (const [index, slide] of slides.entries()) {
    const label = `slides[${index}]`;
    checkText(errors, slide?.section, `${label}.section`, true);
    checkText(errors, slide?.title, `${label}.title`, true);
    checkText(errors, slide?.notes, `${label}.notes`, true);
    const rawSection = slide?.section;
    const section = canonicalSection(rawSection);
    if (typeof rawSection === "string" && rawSection.trim() && section !== rawSection.trim().toLowerCase()) warnings.push(`${label}.section已自动映射：${rawSection} → ${section}`);
    if (section && !KNOWN_SECTIONS.has(section)) errors.push(`${label}.section不支持“${rawSection}”；可使用cover、problem、current-state、goal、solution、making、prototype、experiment或summary`);
    if (typeof slide?.title === "string" && slide.title.length > 52) errors.push(`${label}.title当前${slide.title.length}字，超过52字；请缩短标题或拆页`);
    else if (typeof slide?.title === "string" && slide.title.length > 30) warnings.push(`${label}.title当前${slide.title.length}字，生成器会自动缩小标题；建议压缩到30字以内`);
    if (typeof slide?.summary === "string" && slide.summary.length > 180) errors.push(`${label}.summary超过180字`);
    if (section) sections.add(section);
    if (slide?.source_refs !== undefined && !Array.isArray(slide.source_refs)) errors.push(`${label}.source_refs必须是数组`);
    if (slide?.images !== undefined && !Array.isArray(slide.images)) errors.push(`${label}.images必须是数组`);
    if (slide?.videos !== undefined && !Array.isArray(slide.videos)) errors.push(`${label}.videos必须是数组`);
    if (slide?.bullets !== undefined && !Array.isArray(slide.bullets)) errors.push(`${label}.bullets必须是数组`);
    if (section === "goal") {
      checkText(errors, slide?.goal_statement, `${label}.goal_statement`, true);
      if (!Array.isArray(slide?.goal_pairs)) errors.push(`${label}.goal_pairs必须是2–4组“问题—功能”对应关系`);
      else {
        if (slide.goal_pairs.length < 2 || slide.goal_pairs.length > 4) errors.push(`${label}.goal_pairs必须有2–4组对应关系`);
        slide.goal_pairs.forEach((pair, pairIndex) => {
          checkText(errors, pair?.problem, `${label}.goal_pairs[${pairIndex}].problem`, true);
          checkText(errors, pair?.function, `${label}.goal_pairs[${pairIndex}].function`, true);
          if (typeof pair?.problem === "string" && pair.problem.length > 34) warnings.push(`${label}.goal_pairs[${pairIndex}].problem超过34字；建议保留学生能一眼看懂的关键词句`);
          if (typeof pair?.function === "string" && pair.function.length > 42) warnings.push(`${label}.goal_pairs[${pairIndex}].function超过42字；把技术细节移到方案页`);
        });
      }
    }
    const bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];
    if (bullets.length > 5) errors.push(`${label}.bullets最多5条`);
    bullets.forEach((value, bulletIndex) => {
      checkText(errors, value, `${label}.bullets[${bulletIndex}]`, true);
      if (typeof value === "string") {
        const parameterLine = /(?:[A-Z][A-Z0-9_]{2,}\s*=)|(?:d[XYZ]\s*[≈=])/i.test(value);
        const hardLimit = parameterLine ? 120 : 100;
        const warningLimit = meta.grade_band === "primary" ? 56 : 72;
        if (value.length > hardLimit) errors.push(`${label}.bullets[${bulletIndex}]当前${value.length}字，超过${hardLimit}字；请拆成两条或把解释移到逐页参考稿`);
        else if (value.length > warningLimit) warnings.push(`${label}.bullets[${bulletIndex}]当前${value.length}字，投屏时偏长；建议只保留结论和关键词`);
      }
    });
    const images = Array.isArray(slide?.images) ? slide.images : [];
    if (images.length > 4) errors.push(`${label}.images最多4张；更多素材请拆页`);
    for (const [imageIndex, image] of images.entries()) {
      const imageLabel = `${label}.images[${imageIndex}]`;
      if (!MATERIAL_STATES.has(image?.status)) errors.push(`${imageLabel}.status无效`);
      checkText(errors, image?.label, `${imageLabel}.label`, true);
      if (image?.status === "present" || image?.status === "generated") {
        checkText(errors, image?.src, `${imageLabel}.src`, true);
        const absolute = path.resolve(baseDirectory, image?.src ?? "");
        if (archiveRoot && image?.src && !isInside(archiveRoot, absolute)) errors.push(`${imageLabel}必须位于当前学生档案内: ${image.src}`);
        if (archiveRootReal && fs.existsSync(absolute) && !isInside(archiveRootReal, fs.realpathSync(absolute))) errors.push(`${imageLabel}不能通过链接读取学生档案外文件: ${image.src}`);
        if (image?.src && !isValidImageFile(absolute)) errors.push(`${imageLabel}不是有效的PNG、JPG、WEBP、GIF或SVG图片: ${image.src}`);
      }
      if (image?.status === "missing") {
        checkText(errors, image?.needed, `${imageLabel}.needed`, true);
        checkText(errors, image?.requested_from, `${imageLabel}.requested_from`, true);
      }
      if (EVIDENCE_SECTIONS.has(section) && image?.status === "generated") {
        errors.push(`${imageLabel}不能用AI生成图充当${section}证据`);
      }
    }
    const videos = Array.isArray(slide?.videos) ? slide.videos : [];
    if (videos.length > 1) errors.push(`${label}.videos最多1个；同一页只展示一个学生演示视频`);
    for (const [videoIndex, video] of videos.entries()) {
      const videoLabel = `${label}.videos[${videoIndex}]`;
      if (!["present", "missing", "not-applicable"].includes(video?.status)) errors.push(`${videoLabel}.status无效；视频不能标记为AI生成`);
      checkText(errors, video?.label, `${videoLabel}.label`, true);
      if (video?.status === "present") {
        checkText(errors, video?.src, `${videoLabel}.src`, true);
        if (video?.role !== "student-demo") errors.push(`${videoLabel}.role必须是student-demo；老师演示版只能作理解参考，不能进入学生答辩`);
        const absolute = path.resolve(baseDirectory, video?.src ?? "");
        if (archiveRoot && video?.src && !isInside(archiveRoot, absolute)) errors.push(`${videoLabel}必须位于当前学生档案内: ${video.src}`);
        if (archiveRootReal && fs.existsSync(absolute) && !isInside(archiveRootReal, fs.realpathSync(absolute))) errors.push(`${videoLabel}不能通过链接读取学生档案外文件: ${video.src}`);
        if (video?.src && !isValidVideoFile(absolute)) errors.push(`${videoLabel}必须是浏览器可直接播放的有效MP4、MOV或WEBM视频: ${video.src}`);
        if (inferVideoRole(video?.src ?? "") === "teacher-reference") errors.push(`${videoLabel}检测为老师演示版，不能进入学生答辩: ${video.src}`);
      }
      if (video?.status === "missing") {
        checkText(errors, video?.needed, `${videoLabel}.needed`, true);
        checkText(errors, video?.requested_from, `${videoLabel}.requested_from`, true);
      }
    }
    if (EVIDENCE_SECTIONS.has(section) && !images.length && !videos.length) {
      errors.push(`${label}属于证据页面，必须提供真实素材或missing占位`);
    }
    if (meta.grade_band === "primary" && bullets.length > 4 && section !== "goal") warnings.push(`${label}面向小学生但有${bullets.length}条正文；建议保留3–4条，其余移入参考稿`);
  }
  for (const section of REQUIRED_SECTIONS) if (!sections.has(section)) errors.push(`缺少必要章节: ${section}`);
  if (sections.has("research") && !slides.find((slide) => canonicalSection(slide.section) === "research")?.source_refs?.length) {
    errors.push("调研页只有在存在材料时才保留，并必须填写source_refs");
  }
  const existingSolutions = Array.isArray(spec.existing_solutions) ? spec.existing_solutions : [];
  if (!existingSolutions.length) errors.push("existing_solutions至少需要一项代表性现有方案");
  if (existingSolutions.length > 3) errors.push("existing_solutions最多3项；只保留最具代表性的方案");
  for (const [index, item] of existingSolutions.entries()) {
    checkText(errors, item?.name, `existing_solutions[${index}].name`, true);
    checkText(errors, item?.source_ref, `existing_solutions[${index}].source_ref`);
    checkText(errors, item?.strength, `existing_solutions[${index}].strength`, true);
    checkText(errors, item?.limitation, `existing_solutions[${index}].limitation`, true);
    checkText(errors, item?.project_advantage, `existing_solutions[${index}].project_advantage`, true);
  }
  const currentState = slides.find((slide) => canonicalSection(slide?.section) === "current-state");
  const currentStateImages = (Array.isArray(currentState?.images) ? currentState.images : []).filter((item) => ["present", "generated"].includes(item?.status));
  if (currentState && currentStateImages.length === 0) errors.push("现有方案页缺少视觉素材：请生成1张包含全部方案的对比图，或为每个现有方案各准备1张图片");
  else if (currentState && currentStateImages.length > 1 && currentStateImages.length < existingSolutions.length) errors.push(`现有方案有${existingSolutions.length}项，但只有${currentStateImages.length}张图片；请改为1张完整对比图，或补齐到每项1张`);
  const experiments = Array.isArray(spec.experiments) ? spec.experiments : [];
  if (!experiments.length) errors.push("experiments至少需要一项");
  const effectiveness = experiments.filter((item) => item.type === "effectiveness").length;
  if (meta.grade_band === "middle" && effectiveness < 1) errors.push("初中生实验至少包含一项有效性对比");
  if (meta.grade_band === "high" && effectiveness < 2) errors.push("高中生实验至少包含两项有效性验证");
  for (const [index, item] of experiments.entries()) {
    if (!["functional", "effectiveness", "performance"].includes(item?.type)) errors.push(`experiments[${index}].type无效`);
    if (!["documented", "interview-confirmed", "planned"].includes(item?.status)) errors.push(`experiments[${index}].status无效`);
    checkText(errors, item?.purpose, `experiments[${index}].purpose`, true);
    checkText(errors, item?.method, `experiments[${index}].method`, true);
    if (item?.status !== "documented" && item?.numeric_result !== undefined) warnings.push(`experiments[${index}]没有书面记录，不应把预测数字写成真实结果`);
  }
  const questions = Array.isArray(spec.qa) ? spec.qa : [];
  if (!questions.length) errors.push("qa至少需要一组项目化问题和参考答案");
  for (const [index, item] of questions.entries()) {
    checkText(errors, item?.question, `qa[${index}].question`, true);
    checkText(errors, item?.answer, `qa[${index}].answer`, true);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function safeName(value) {
  return String(value || "答辩演示").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/[. ]+$/g, "").slice(0, 100);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMaterialInventory, validateDefenseSpec } from "../modules/idealab-presentation/scripts/defense-core.mjs";
import { build } from "../modules/idealab-presentation/scripts/build-idealab-presentation.mjs";

function fakePng(filePath, marker = 1) {
  const content = Buffer.alloc(32, marker);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(content, 0);
  content.writeUInt32BE(1600, 16);
  content.writeUInt32BE(900, 20);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function fakeMp4(filePath, marker = 1) {
  const content = Buffer.alloc(64, marker);
  content.writeUInt32BE(24, 0);
  content.write("ftyp", 4, "ascii");
  content.write("isom", 8, "ascii");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function image(status, src, label, extra = {}) {
  return { status, src, label, caption: label, ...extra };
}

function validSpec(directory, gradeBand = "middle") {
  const cover = path.join(directory, "cover.png");
  const prototype = path.join(directory, "prototype.png");
  const experiment = path.join(directory, "experiment.png");
  const studentVideo = path.join(directory, "学生演示版.mp4");
  fakePng(cover, 1); fakePng(prototype, 2); fakePng(experiment, 3); fakeMp4(studentVideo, 4);
  const slides = [
    { section: "cover", title: "图书馆智慧导览书架", summary: "让找书和归位更清楚", logic_link: "从生活问题开始", images: [image("generated", "cover.png", "封面背景")], notes: "大家好，我是测试学生。" },
    { section: "problem", title: "找不到和放不回去，会同时影响读者与馆员", summary: "书架信息与人的动作没有及时对应。", logic_link: "明确核心问题", bullets: ["读者找书慢", "错放后下一位更难找"], notes: "先从生活里的找书经历讲起。" },
    { section: "current-state", title: "现有办法能提示分类，但反馈仍不够具体", logic_link: "找到现有方案不足", notes: "比较代表性方案。" },
    { section: "goal", title: "把一次找书和归位变成清楚的即时引导", logic_link: "确定唯一核心目标", notes: "我们的目标不是增加功能数量。" },
    { section: "solution", title: "识别、匹配与亮灯共同回应核心问题", logic_link: "功能对应问题", bullets: ["NFC识别书本", "仓位匹配", "灯光反馈"], notes: "沿着输入、判断、输出讲。" },
    { section: "prototype", title: "原型已经呈现主要交互结构", logic_link: "展示真实装置状态", images: [image("present", "prototype.png", "原型照片")], videos: [{ status: "present", src: "学生演示版.mp4", role: "student-demo", label: "学生演示视频", caption: "学生完成一次完整操作" }], notes: "说明实物中的主要结构，再点击播放学生演示视频。" },
    { section: "experiment", title: "实验验证识别与引导是否达到目标", logic_link: "用证据回到核心目标", images: [image("present", "experiment.png", "实验记录")], notes: "说明测试方法和结果。" },
    { section: "summary", title: "用更具体的反馈改善找书与归位", logic_link: "总结亮点和下一步", notes: "最后回到最初的问题。" }
  ];
  return {
    schema_version: 1,
    plan_confirmed: true,
    meta: { student_name: "测试学生", project_title: "AI智慧交互导览书架", project_short_name: "智慧书架", grade_band: gradeBand, core_problem: "读者找书和归位效率低", archive_root: "." },
    slides,
    existing_solutions: [{ name: "分类标签", solution: "按类别标识书架", strength: "成本低，容易理解", limitation: "不能指出具体仓位，也不能在错放时反馈", project_advantage: "用识别和亮灯给出即时、具体的位置反馈" }],
    experiments: gradeBand === "primary"
      ? [{ type: "functional", status: "planned", purpose: "检查亮灯是否正确", method: "连续放入多本测试书并记录" }]
      : gradeBand === "middle"
        ? [{ type: "effectiveness", status: "planned", purpose: "比较找书时间", method: "同样书目分别使用普通标签和本装置" }]
        : [{ type: "effectiveness", status: "planned", purpose: "比较找书时间", method: "控制书目和距离" }, { type: "effectiveness", status: "planned", purpose: "比较归位正确率", method: "控制测试次数和参与者" }],
    qa: [{ category: "背景与目标", question: "为什么不只加大分类标签？", answer: "因为项目要解决的是具体仓位和即时反馈，而不只是看见类别。" }]
  };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "idealab-defense-"));
try {
  const complete = validSpec(directory);
  assert.deepEqual(validateDefenseSpec(complete, directory).errors, []);

  const noResearch = structuredClone(complete);
  assert.equal(noResearch.slides.some((slide) => slide.section === "research"), false);
  assert.deepEqual(validateDefenseSpec(noResearch, directory).errors, []);

  const missingEvidence = structuredClone(complete);
  missingEvidence.slides.find((slide) => slide.section === "prototype").images = [{ status: "missing", label: "原型照片", needed: "装置正面和使用状态", requested_from: "指导老师或学生" }];
  assert.deepEqual(validateDefenseSpec(missingEvidence, directory).errors, []);

  const fakeEvidence = structuredClone(complete);
  fakeEvidence.slides.find((slide) => slide.section === "experiment").images[0].status = "generated";
  assert.ok(validateDefenseSpec(fakeEvidence, directory).errors.some((error) => error.includes("不能用AI生成图")));

  const outsideArchive = structuredClone(complete);
  outsideArchive.slides.find((slide) => slide.section === "experiment").images[0].src = path.resolve(directory, "..", "outside.png");
  assert.ok(validateDefenseSpec(outsideArchive, directory).errors.some((error) => error.includes("当前学生档案内")));

  const teacherVideoPath = path.join(directory, "老师演示版.mp4");
  fakeMp4(teacherVideoPath, 5);
  const teacherVideo = structuredClone(complete);
  teacherVideo.slides.find((slide) => slide.section === "prototype").videos[0].src = "老师演示版.mp4";
  assert.ok(validateDefenseSpec(teacherVideo, directory).errors.some((error) => error.includes("老师演示版")));

  const malformed = structuredClone(complete);
  malformed.slides = {};
  assert.doesNotThrow(() => validateDefenseSpec(malformed, directory));
  assert.ok(validateDefenseSpec(malformed, directory).errors.includes("slides必须是非空数组"));

  const genericComparison = structuredClone(complete);
  genericComparison.existing_solutions[0].project_advantage = "";
  assert.ok(validateDefenseSpec(genericComparison, directory).errors.some((error) => error.includes("project_advantage")));

  assert.deepEqual(validateDefenseSpec(validSpec(directory, "primary"), directory).errors, []);
  assert.deepEqual(validateDefenseSpec(validSpec(directory, "middle"), directory).errors, []);
  assert.deepEqual(validateDefenseSpec(validSpec(directory, "high"), directory).errors, []);
  const weakHigh = validSpec(directory, "high");
  weakHigh.experiments = weakHigh.experiments.slice(0, 1);
  assert.ok(validateDefenseSpec(weakHigh, directory).errors.includes("高中生实验至少包含两项有效性验证"));

  const archive = path.join(directory, "随堂调试-测试学生-智慧书架");
  fs.mkdirSync(path.join(archive, "01 开题书"), { recursive: true });
  fs.writeFileSync(path.join(archive, "01 开题书", "开题书.txt"), "开题书");
  fakePng(path.join(archive, "05 项目关键性图片", "项目原型图（1-2张）", "原型.png"), 4);
  const inventory = buildMaterialInventory(archive);
  assert.equal(inventory.checks.find((item) => item.category === "opening-book").status, "needs-review");
  assert.equal(inventory.checks.find((item) => item.category === "research").status, "not-applicable");
  assert.equal(inventory.checks.find((item) => item.category === "experiment").status, "missing");

  const fakeArchive = path.join(directory, "fake-archive");
  fs.mkdirSync(path.join(fakeArchive, "05 项目关键性图片", "项目原型图（1-2张）"), { recursive: true });
  fs.mkdirSync(path.join(fakeArchive, "05 项目关键性图片", "实验关键图片（6张）"), { recursive: true });
  fs.writeFileSync(path.join(fakeArchive, "05 项目关键性图片", "项目原型图（1-2张）", "原型.txt"), "not an image");
  fs.writeFileSync(path.join(fakeArchive, "05 项目关键性图片", "实验关键图片（6张）", "实验.bin"), "not evidence");
  const fakeInventory = buildMaterialInventory(fakeArchive);
  assert.equal(fakeInventory.checks.find((item) => item.category === "prototype").status, "missing");
  assert.equal(fakeInventory.checks.find((item) => item.category === "experiment").status, "missing");

  const videoArchive = path.join(directory, "video-archive");
  fakeMp4(path.join(videoArchive, "学生演示版.mp4"), 6);
  fakeMp4(path.join(videoArchive, "老师演示版.mp4"), 7);
  const videoInventory = buildMaterialInventory(videoArchive);
  assert.equal(videoInventory.items.find((item) => item.relative_path === "学生演示版.mp4").video_role, "student-demo");
  assert.equal(videoInventory.items.find((item) => item.relative_path === "老师演示版.mp4").video_role, "teacher-reference");
  assert.equal(videoInventory.checks.find((item) => item.category === "video").count, 1);

  const inputPath = path.join(directory, "spec.json");
  const output = path.join(directory, "output");
  fs.writeFileSync(inputPath, JSON.stringify(complete));
  const confirmedInventory = buildMaterialInventory(directory);
  confirmedInventory.checks = confirmedInventory.checks.map((item) => ["prototype", "experiment"].includes(item.category) ? { ...item, status: "present" } : item.status === "needs-review" ? { ...item, status: "present" } : item);
  confirmedInventory.items = confirmedInventory.items.map((item) => ({ ...item, review_status: "approved", origin: item.relative_path === "cover.png" ? "ai" : "teacher" }));
  confirmedInventory.review = { confirmed: true, confirmed_at: "2026-08-01T00:00:00.000Z", confirmed_by: "测试老师" };
  const inventoryPath = path.join(directory, "inventory.json");
  fs.writeFileSync(inventoryPath, JSON.stringify(confirmedInventory));
  const built = build({ input: inputPath, inventory: inventoryPath, output });
  for (const value of [built.presentation, built.script, built.practice, built.inventory, built.spec]) assert.equal(fs.existsSync(value), true);
  const html = fs.readFileSync(built.presentation, "utf8");
  assert.equal(html.includes("AI生成示意图"), false);
  assert.ok(html.includes("测试学生"));
  assert.ok(html.includes("智慧书架"));
  assert.ok(html.includes("current-state-media"));
  assert.ok(html.includes("点击播放学生演示"));
  assert.ok(html.includes("答辩演示-媒体/01-学生演示版.mp4"));
  assert.equal(html.includes("data:video"), false);
  assert.equal(fs.existsSync(built.media_directory), true);
  assert.equal(fs.existsSync(path.join(built.media_directory, "01-学生演示版.mp4")), true);
  const practice = fs.readFileSync(built.practice, "utf8");
  assert.ok(practice.includes("查看参考回答"));
  assert.ok(practice.includes("已经会了"));
  assert.ok(practice.includes("category-filter"));

  const unboundOutput = path.join(directory, "unbound-output");
  assert.throws(() => build({ input: inputPath, output: unboundOutput }), /必须提供--input、--inventory和--output/);
  assert.equal(fs.existsSync(unboundOutput), false);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("idealab presentation tests passed");

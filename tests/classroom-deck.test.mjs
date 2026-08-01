import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateDeck, validateDeckMedia } from "../scripts/classroom-deck-core.mjs";
import { validateVisualSpec } from "../scripts/d3-visual-core.mjs";

function image(role, src = `${role}.png`) {
  const result = {
    src,
    alt: `${role}测试图`,
    role,
    origin: "teacher-provided",
    review_status: "approved",
    description: `${role}画面含义已经确认`
  };
  if (role === "concept") {
    result.origin = "ai-generated";
    result.quality_checks = {
      physical_product: true,
      user_or_hand: true,
      usage_scene: true,
      interaction_visible: true,
      matches_opening_book: true,
      clear_image: true
    };
  }
  return result;
}

function validDeck() {
  return {
    schema_version: 1,
    deck_type: "d3-opening",
    meta: {
      student_name: "测试学生",
      grade: "X4",
      project_title: "测试项目",
      one_sentence: "一句话说明测试项目",
      output_name: "测试项目_D3开题答辩"
    },
    slides: [
      { id: "D3-01", title: "测试项目", images: [image("scene-photo")], notes: "介绍项目名称。" },
      { id: "D3-02", title: "问题由来", source_refs: ["01 开题书/开题书.png"], notes: "说明问题由来。" },
      { id: "D3-03", title: "装置概念图", source_refs: ["01 开题书/开题书.png"], images: [image("concept")], notes: "说明作品外形和使用方法。" },
      { id: "D3-04", title: "工作流程图", source_refs: ["01 开题书/开题书.png"], images: [image("process-flow", "process-flow.svg")], notes: "沿箭头说明完整流程。" },
      { id: "D3-05", title: "硬件框图", source_refs: ["01 开题书/开题书.png"], images: [image("hardware-block", "hardware-block.svg")], notes: "说明各模块及作用。" },
      { id: "D3-06", title: "原始开题书", source_refs: ["01 开题书/开题书.png"], images: [image("opening-book")], notes: "说明前面内容来自原始开题书。" }
    ]
  };
}

function fakePng(width, height, marker) {
  const buffer = Buffer.alloc(32, marker);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

{
  const result = validateDeck(validDeck());
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.includes("D3-02建议使用一张清晰的相关场景图"));
}

{
  const deck = validDeck();
  deck.slides.push({ id: "D3-07", title: "旧验证计划", notes: "旧页面" });
  const result = validateDeck(deck);
  assert.ok(result.errors.some((error) => error.includes("必须正好有6页")));
}

{
  const deck = validDeck();
  deck.slides[2].images[0].src = "concept.svg";
  const result = validateDeck(deck);
  assert.ok(result.errors.includes("D3-03概念图必须是实体场景效果图，不能使用SVG框图"));
}

{
  const deck = validDeck();
  deck.slides[2].images[0].quality_checks.interaction_visible = false;
  const result = validateDeck(deck);
  assert.ok(result.errors.includes("D3-03概念图质量检查未通过: interaction_visible"));
}

{
  const deck = validDeck();
  deck.slides[3].images[0].role = "hardware-block";
  const result = validateDeck(deck);
  assert.ok(result.errors.includes("D3-04首张图片role必须是process-flow"));
}

{
  const deck = validDeck();
  delete deck.slides[1].source_refs;
  const result = validateDeck(deck);
  assert.ok(result.errors.includes("D3-02必须填写source_refs，说明内容依据"));
}

{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "idealab-deck-"));
  try {
    const deck = validDeck();
    for (const [index, slide] of deck.slides.entries()) {
      for (const item of slide.images ?? []) {
        if (item.src.endsWith(".svg")) fs.writeFileSync(path.join(directory, item.src), `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><text>${index}</text></svg>`);
        else fs.writeFileSync(path.join(directory, item.src), fakePng(1600, 900, index + 1));
      }
    }
    assert.deepEqual(validateDeckMedia(deck, directory).errors, []);

    fs.writeFileSync(path.join(directory, "opening-book.png"), fs.readFileSync(path.join(directory, "concept.png")));
    const duplicate = validateDeckMedia(deck, directory);
    assert.ok(duplicate.errors.some((error) => error.includes("使用了相同图片")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

console.log("classroom-deck tests passed");

{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "idealab-visual-"));
  try {
    fs.writeFileSync(path.join(directory, "opening.png"), fakePng(1600, 900, 1));
    fs.writeFileSync(path.join(directory, "concept.png"), fakePng(1600, 900, 2));
    fs.writeFileSync(path.join(directory, "flow.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
    fs.writeFileSync(path.join(directory, "hardware.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
    const spec = {
      schema_version: 1,
      project_title: "测试项目",
      source_opening_book: "opening.png",
      uses_ai: true,
      concept: {
        output: "concept.png",
        origin: "ai-generated",
        attempt: 1,
        review_status: "approved",
        description: "孩子在场景中使用实体装置并看到灯光反馈。",
        quality_checks: {
          physical_product: true,
          user_or_hand: true,
          usage_scene: true,
          interaction_visible: true,
          matches_opening_book: true,
          clear_image: true
        }
      },
      flow: {
        output: "flow.svg",
        student_retelling: "学生先操作，传感器获得信息，ESP32判断后控制灯光和声音反馈。",
        modes: [{ name: "主要流程", steps: ["学生操作", "传感器采集", "ESP32判断", "控制执行器", "产生反馈", "学生看到结果"] }]
      },
      hardware: {
        output: "hardware.svg",
        controller: { name: "ESP32", purpose: "读取输入并控制输出" },
        sensors: [{ name: "摄像头", purpose: "采集图像" }],
        actuators: [{ name: "灯带", purpose: "显示反馈" }],
        power: [{ name: "USB电源", purpose: "为装置供电" }],
        communication: [{ name: "USB", purpose: "连接电脑和主控" }],
        ai: [{ name: "识图模型", input: "棋子图像", purpose: "识别数字和位置", output: "识别结果", runtime: "电脑端" }]
      }
    };
    assert.deepEqual(validateVisualSpec(spec, directory).errors, []);

    spec.concept.quality_checks.usage_scene = false;
    assert.ok(validateVisualSpec(spec, directory).errors.includes("concept质量检查未通过: usage_scene"));
    spec.concept.quality_checks.usage_scene = true;
    spec.uses_ai = false;
    assert.ok(validateVisualSpec(spec, directory).errors.includes("项目未使用AI时hardware.ai必须为空数组"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

console.log("d3-visual tests passed");

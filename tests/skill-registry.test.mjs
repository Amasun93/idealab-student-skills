import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectBundledSkills, loadRegistry, runCli } from "../scripts/manage-bundled-skills.mjs";

function createFixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idealab-skill-registry-"));
  fs.mkdirSync(path.join(root, "references"), { recursive: true });
  fs.mkdirSync(path.join(root, "modules", "idealab-presentation"), { recursive: true });
  fs.writeFileSync(path.join(root, "modules", "idealab-presentation", "SKILL.md"), "# Defense\n");
  const registry = {
    schema_version: 1,
    bundle_id: "idealab-student-skills",
    bundle_name: "ideaLab Student",
    skills: [{
      id: "idealab-presentation",
      name: "演讲与答辩",
      description: "生成演讲答辩演示。",
      path: "modules/idealab-presentation",
      entrypoint: "SKILL.md",
      required: true
    }],
    ...overrides
  };
  fs.writeFileSync(path.join(root, "references", "skill-registry.json"), JSON.stringify(registry));
  return root;
}

test("loads a valid registry and locates its bundled module", (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const report = inspectBundledSkills(root);
  assert.deepEqual(report.errors, []);
  assert.equal(report.skills.length, 1);
  assert.equal(report.skills[0].id, "idealab-presentation");
  assert.equal(report.skills[0].available, true);
});

test("reports a missing module entrypoint without trying to download it", (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, "modules", "idealab-presentation", "SKILL.md"));

  const report = inspectBundledSkills(root);
  assert.equal(report.skills[0].available, false);
  assert.match(report.skills[0].problems.join(" "), /入口文件不存在/);
  assert.equal(runCli(["check", "idealab-presentation", "--json"], root), 1);
});

test("rejects module paths that escape the repository", (t) => {
  const root = createFixture({
    skills: [{
      id: "unsafe",
      name: "不安全模块",
      description: "不应加载。",
      path: "../outside",
      entrypoint: "SKILL.md"
    }]
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const loaded = loadRegistry(root);
  assert.match(loaded.errors.join(" "), /仓库内的相对路径/);
  const report = inspectBundledSkills(root);
  assert.equal(report.skills[0].available, false);
  assert.match(report.skills[0].problems.join(" "), /超出仓库范围/);
});

test("reports a malformed skills collection without crashing", (t) => {
  const root = createFixture({ skills: {} });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const report = inspectBundledSkills(root);
  assert.match(report.errors.join(" "), /skills 必须是数组/);
  assert.deepEqual(report.skills, []);
  assert.equal(runCli(["check", "--json"], root), 1);
});

test("reports a malformed skill item without crashing", (t) => {
  const root = createFixture({ skills: [null] });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const report = inspectBundledSkills(root);
  assert.match(report.errors.join(" "), /skills\[0\] 必须是对象/);
  assert.deepEqual(report.skills, []);
});

test("check returns failure for an unknown skill id", (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(runCli(["check", "not-registered", "--json"], root), 1);
});

test("check returns success when all selected modules are available", (t) => {
  const root = createFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(runCli(["check", "--json"], root), 0);
});

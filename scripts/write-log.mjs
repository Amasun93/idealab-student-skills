#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFile(filePath) {
  if (!(await exists(filePath))) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);
  for (let version = 2; version < 1000; version += 1) {
    const candidate = `${base}-v${version}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  fail("当天日志版本过多，请老师检查目录。");
}

function score(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return "未评分";
  return `${parsed}/5`;
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeDate(value) {
  const candidate = String(value || localDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    fail("日期必须使用 YYYY-MM-DD 格式。");
  }
  return candidate;
}

const args = parseArgs(process.argv.slice(2));
if (!args.archive || !args.input) fail("需要 --archive 学生档案目录和 --input 回答记录JSON。");

const archive = path.resolve(args.archive);
const inputPath = path.resolve(args.input);
const metadataPath = path.join(archive, "学生项目档案.json");
if (!(await exists(metadataPath))) fail("没有找到学生项目档案.json。");
if (!(await exists(inputPath))) fail("没有找到回答记录JSON。");

const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
const answers = JSON.parse(await fs.readFile(inputPath, "utf8"));
const date = safeDate(answers.date);
const day = String(answers.day || "D1").replace(/[<>:"/\\|?*]/g, "_");
const dailyDir = path.join(archive, "10 研究日志", `${date}_${day}`);
await fs.mkdir(dailyDir, { recursive: true });

const learned = Array.isArray(answers.learned) ? answers.learned : [answers.learned].filter(Boolean);
const log = `# ${metadata.name} ${date} ${day} 研究日志

## 今天学到的内容

${learned.length ? learned.map((item) => `- ${item}`).join("\n") : "- 暂未填写"}

## 今天完成的事情

${answers.completed || "暂未填写"}

## 我的感觉

${answers.feeling || "暂未填写"}

## 遇到的难点

${answers.challenge || "暂未填写"}

## 我是怎么解决的

${answers.solution || "暂未填写"}

## 我和AI怎样合作

- AI提供的帮助：${answers.ai_help || "暂未填写"}
- 我自己的判断和修改：${answers.student_decision || "暂未填写"}

## 我还想了解什么

${answers.interest || "暂未填写"}

## 今日评分

- 难度：${score(answers.difficulty)}。${answers.difficulty_reason || ""}
- 成就感：${score(answers.achievement)}。${answers.achievement_reason || ""}
`;

const outline = `# ${metadata.name} ${date} ${day} 视频日志提纲

建议时长：60—90秒。看关键词讲，不需要逐字背诵。

1. **开头**：大家好，我是${metadata.name}，我的项目是“${metadata.project_title || "项目名称待补充"}”。
2. **今天学到的**：${learned[0] || "说一件今天学到的具体内容"}
3. **今天完成的**：${answers.completed || "说清今天完成了哪一步"}
4. **最大的困难**：${answers.challenge || "说出最难的地方"}
5. **解决方法**：${answers.solution || "说出自己怎样尝试和解决"}
6. **AI与我的分工**：
   - AI提供：${answers.ai_help || "说出AI给了什么建议"}
   - 我的选择或修改：${answers.student_decision || "说出自己采用、修改或放弃了什么"}
7. **感受与下一步**：成就感${score(answers.achievement)}；下一步：${answers.interest || "继续完成项目的下一步"}。
`;

const logPath = await uniqueFile(path.join(dailyDir, "研究日志.md"));
const outlinePath = await uniqueFile(path.join(dailyDir, "视频日志提纲.md"));
const answersPath = await uniqueFile(path.join(dailyDir, "回答记录.json"));

await fs.writeFile(logPath, `${log.trim()}\n`, "utf8");
await fs.writeFile(outlinePath, `${outline.trim()}\n`, "utf8");
await fs.writeFile(answersPath, `${JSON.stringify(answers, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  status: "ok",
  daily_directory: dailyDir,
  research_log: logPath,
  video_outline: outlinePath,
  answers: answersPath,
}, null, 2)}\n`);

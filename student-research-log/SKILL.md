---
name: student-research-log
description: Interview a student about the day's ideaLab learning, save a structured research log inside the student's existing project archive, and generate a truthful 60–90 second video reflection outline for a teacher to record. Use after a half-day or full-day class when a student needs to review learning, feelings, challenges, solutions, interests, difficulty, achievement, and AI collaboration. Optimize for primary-school students using voice and one short question at a time.
---

# 学生研究日志

通过口述采访帮助学生完成每日研究日志，并生成老师拍摄视频日志时可用的提纲。

## 找到学生档案

1. 在当前目录及其父目录寻找 `学生项目档案.json`。
2. 找到后读取学生姓名、项目名称和年级。
3. 未找到时只询问学生项目文件夹在哪里，不重新建立另一套档案。
4. 将所有产物保存到该档案的 `10 研究日志`。

## 采访方式

读取 `references/questions.md`，一次只问一个问题。允许学生口述，不要求完整书面句子。

- 回答太短时追问一个具体细节，不连续追问多个问题。
- 不替学生编造收获、困难或解决方法。
- 对低年级学生使用具体选项和生活化表达。
- 对学生的真实感受保持中性，不要求每天都说“很开心”。

## 形成日志

采访完成后：

1. 用学生原意整理为简洁、第一人称的研究日志。
2. 单独列出难度评分和成就感评分。
3. 写清AI提供了什么帮助，以及学生自己做了什么选择或修改。
4. 生成60—90秒视频提纲，使用关键词和短句，不写需要死背的长篇逐字稿。
5. 把完整内容读给学生确认；只在确认后保存。

若可运行 Node.js，先按 `references/questions.md` 中的数据结构形成JSON，再执行：

```bash
node scripts/write-log.mjs --archive "学生档案目录" --input "回答记录.json"
```

若不能运行脚本，使用WorkBuddy原生文件能力创建完全相同的每日目录和三个文件。

## 保存结构

每天建立：`10 研究日志/YYYY-MM-DD_Dn/`

其中包含：

- `研究日志.md`
- `视频日志提纲.md`
- `回答记录.json`

同一天重新生成时不覆盖旧内容，使用 `-v2`、`-v3` 保存新版本。

## 完成提示

保存后告诉学生：

1. 日志已经放在哪里。
2. 视频提纲有多长。
3. 下一步请找随堂老师拍摄视频日志。
4. 视频拍好后可以调用学生项目归档Skill，归入当天研究日志目录。


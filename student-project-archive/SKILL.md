---
name: student-project-archive
description: Create and maintain a student's ideaLab classroom project archive in WorkBuddy. Use when a student needs to create the standard project folder, archive teacher-provided or self-generated files, update a project name, find where materials belong, inspect archive completeness, or prepare the folder for teacher handoff. Optimize every interaction for primary-school students using voice, one short question at a time, explicit confirmation, and safe copy-only file handling.
---

# 学生项目归档

帮助学生用口述方式建立并整理个人项目文件夹。保持目录与教师端随堂调试母档案一致，方便结课后直接合并。

## 固定目录结构

第一次建档时，一次性创建下面的完整结构。即使某个目录暂时没有材料，也必须保留空目录；不要改动编号、名称或层级。

```text
随堂调试-{学生姓名}-{项目名称}/
├─ 01 开题书/
├─ 02 学生项目手册/
├─ 03 项目图纸/
├─ 04 项目代码/
├─ 05 项目关键性图片/
│  ├─ 功能实现图（4张）/
│  ├─ 实验关键图片（6张）/
│  ├─ 项目原型图（1-2张）/
│  ├─ 制作过程关键图（5张以上）/
│  └─ 其他参考资料/
├─ 06 答辩ppt/
├─ 07 项目视频/
├─ 08 项目装置交接单/
├─ 09 可选-学生论文/
├─ 10 研究日志/
└─ 99 待确认/
```

同时在根目录维护两个由Skill使用的文件：

- `学生项目档案.json`：记录姓名、年级、项目名称和档案版本。
- `学生归档记录.jsonl`：记录每次复制、去重和改名操作。

`10 研究日志` 由学生研究日志Skill继续建立每日子目录：

```text
10 研究日志/YYYY-MM-DD_Dn/
├─ 研究日志.md
├─ 视频日志提纲.md
└─ 回答记录.json
```

无法确认属于哪个目录的材料统一复制到 `99 待确认`，不要自行猜测。

## 开始前

1. 按上面的固定目录建档，并读取 `references/folder-schema.json` 进行核对；两处不一致时停止创建并提醒随堂老师。
2. 需要判断文件去向时，读取 `references/file-routing.md`。
3. 优先在当前目录及其父目录寻找 `学生项目档案.json`。找到后沿用其中的姓名、项目和档案根目录，不重复询问。

## 与学生交流

- 一次只问一个短问题。
- 优先给出两到三个选项，让学生口述选择。
- 不要求学生输入长路径；先查看桌面、下载目录和最近生成的文件，再展示少量候选。
- 每次写入前，用一句话复述“哪个文件将复制到哪里”，得到确认后再执行。
- 使用“找到了、放这里、再确认一下”等小学生能理解的表达。

## 第一次建档

依次询问：

1. 你叫什么名字？
2. 你的项目叫什么？如果尚未定题，使用“项目名称待补充”。
3. 你的年级是什么？不知道时允许跳过。
4. 文件夹放在哪里？默认建议桌面上的 `ideaLab学生项目`。

确认后创建：`随堂调试-姓名-项目名称`。

创建完成后，向学生展示根目录名称和 `01—10、99` 的目录清单，说明“以后老师材料、自己做的材料和AI生成的材料都放进这个项目档案”。

若可运行 Node.js，使用：

```bash
node scripts/archive-manager.mjs init --base "目标父目录" --name "学生姓名" --project "项目名称" --grade "年级"
```

若不能运行脚本，使用WorkBuddy原生文件能力按 `references/folder-schema.json` 创建完全相同的结构和 `学生项目档案.json`。

## 归档材料

1. 确认当前学生档案。
2. 找到学生所说的文件；路径不明确时，从桌面和下载目录的近期文件中给出候选。
3. 根据内容判断分类，不仅看扩展名。
4. 询问来源：老师提供、学生制作、AI生成，或暂不确定。
5. 给出目标目录和建议文件名，等待确认。
6. 只复制，不移动或删除原文件。

若可运行 Node.js，使用：

```bash
node scripts/archive-manager.mjs add --archive "学生档案目录" --source "原文件" --category "03 项目图纸" --origin student
```

归档代码文件夹时保留其内部结构。图片进入 `05 项目关键性图片` 时必须选择二级分类。无法判断时放入 `99 待确认`，不要猜测。

## 修改项目名称

学生定题或改题后：

1. 读出当前项目名称和新名称。
2. 明确提醒将重命名档案根目录。
3. 得到确认后执行，不覆盖同名文件夹。

```bash
node scripts/archive-manager.mjs rename-project --archive "当前学生档案目录" --project "新项目名称"
```

## 查看状态与结课交接

使用以下命令统计各目录文件数量：

```bash
node scripts/archive-manager.mjs status --archive "学生档案目录"
```

结课时只检查并交付整个 `随堂调试-姓名-项目名称` 文件夹。不要替教师判断材料质量；缺失、模糊或分类不确定的内容保留提示，交由教师端合并和核验。

## 安全边界

- 永不递归删除学生文件。
- 永不覆盖已有文件；同名不同内容自动建立新版本。
- 相同内容通过 SHA-256 识别，不重复复制。
- 未经学生确认，不重命名档案根目录。
- 不把一个学生的材料写入另一个学生档案。
- 路径超出当前学生档案时停止并重新确认。

# 小红书图文推文：我给 Chrome 的每个页签加了备注

> 页签备注 v0.3.1 的小红书发布文案、配图顺序与 Dots3 Note Preview 推荐。状态：可发布；日期：2026-08-17。

## 来源声明

- 🟦 页签备注的功能、快捷键、隐私与性能数据来自本地代码和回归测试。
- 🟦 Dots3 Note Preview 的参数和能力来自官方 GitHub README：https://github.com/studio-dots-ai/dots3-note-prev
- 🟨 “适合 Vibe Coding 小插件”等表述是使用建议，不代表官方结论。

## 标题候选

推荐标题：

```text
Chrome 页签太多？我给每个网页加了备注
```

其他候选：

```text
Vibe Coding 了一个页签备注插件
再也不怕 Chrome 的 100 个相似页签了
```

## 可直接复制的正文

```text
我的 Chrome 经常同时开几十个网页：
产品页面、参考资料、文章、文档……

最崩溃的是，它们的标题经常长得一模一样。
过一会儿就完全不记得：
哪个是产品资料？哪个准备晚点读？哪个需要继续整理？

所以我 Vibe Coding 了一个小工具——「页签备注」。

现在可以直接右键 Chrome 左侧垂直标签栏或顶部水平标签栏里的任意 Tab，点击「修改页签备注」，给网页添加：

🔵 标签短标题
🟣 分类和颜色
📝 详细备注
📌 可折叠的网页备注卡

保存后，备注会直接出现在原网页标题前面：

🩷 Rednote｜Rednote 是小红书的英文名 · 小红书

这样不用逐个点开，看一眼标签栏就知道每个网页是干什么的。

我还加了几个自己很需要的功能：

1. 侧边栏搜索所有已打开网页
2. 已关闭网页的备注也会保留
3. 点击记录可以直接切换或重新打开网页
4. ⌥ Shift + N 快速打开侧边栏
5. ⌘ Enter 直接保存备注
6. 所有数据只保存在本机，不需要账号，也不会上传服务器

因为我平时经常开 80～100 个 Tab，这次还专门优化了性能：修改一条备注时，只更新对应网页，不再把所有标签页重新刷新一遍。

如果你也想把工作里的小痛点做成插件、脚本或者个人工具，我很推荐试试 Dots3 Note Preview 来 Vibe Coding。

它是 dots3 系列首个开放权重模型：多模态 MoE 架构，共 280B 参数、激活 16B，支持最高 512K 上下文；可以理解文本、图片、视频和音频，也支持代码生成、工具调用、多步 Agent 和长上下文任务。

你可以把需求、界面截图、交互想法一起交给它，让模型帮你拆需求、看页面、写代码、迭代小工具。

Dots3 Note Preview 入口：

中文：https://studio.dots.ai/dots/dots3-zh.html
英文：https://studio.dots.ai/dots/dots3-en.html
Hugging Face：https://huggingface.co/dots-studio/dots3-note-prev
GitHub：https://github.com/studio-dots-ai/dots3-note-prev
API 服务（国内）：https://dots.ai/platform/

插件下载：https://github.com/xmu-xiaoma666/tab-notes/releases/latest
项目源码：https://github.com/xmu-xiaoma666/tab-notes
Chrome 商店地址：审核通过后补充

你们还有什么每天都想吐槽、但一直没人做的小工具？也可以留言，我继续 Vibe Coding 👀
```

## 配图顺序

以下配图均来自真实 Chrome 窗口：左侧使用垂直标签栏，中间打开 `https://www.xiaohongshu.com/explore`，右侧为“页签备注”的实际侧栏；没有使用 SVG 或重新绘制浏览器界面。

### 图 1：功能总览 / 封面

![垂直标签栏中的页签备注功能总览](store-assets/screenshot-1280x800.png)

封面文字建议：

```text
Chrome 页签太多？
我给每个网页加了备注
```

### 图 2：备注编辑细节

![小红书网页与页签备注侧栏细节](store-assets/guide-workflow.png)

图片说明：放大查看网页右上角备注卡，以及右侧的短标题、分类、颜色和详细备注编辑区。

### 图 3：右键快捷入口

建议录制 3～5 秒短视频：在左侧垂直标签栏右键目标 Tab，选择“修改页签备注”，右侧编辑器立即打开。

### 图 4：细节截图

建议截取侧边栏上半部分，重点展示：

- 标签短标题、分类和颜色选择；
- 详细备注和标签预览；
- “保存备注”按钮。

### 图 5：大量标签页前后对比

建议制作左右对比图：

- 左侧：多个同名控制台标签，难以区分；
- 右侧：加上彩色圆点、短标题和备注摘要，一眼可辨。

### 图 6：Dots3 Note Preview 推荐

建议使用 Dots3 Note Preview 官方介绍页或 GitHub 首页截图，并配文：

```text
把你的工作痛点
Vibe Coding 成下一个小插件
```

## 话题标签

```text
#VibeCoding #Chrome插件 #效率工具 #程序员工具 #AI编程 #浏览器插件 #开源模型 #Dots3 #生产力工具 #独立开发
```

## 发布前检查

- Chrome 商店审核通过后补充正式链接；当前可以直接使用 GitHub Release 下载。
- 小红书正文中的外链可能不便直接点击，建议把五个 Dots3 链接同步放在置顶评论或个人主页。
- 当前截图使用公开的小红书 Explore 页面和无账号浏览器；正式发布前仍建议快速检查一遍画面内容。
- 首图优先使用简短大字，不要堆完整功能列表。

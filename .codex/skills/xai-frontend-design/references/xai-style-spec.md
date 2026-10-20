# xAI / Grok 前端视觉规格

这份规格记录了对 `https://x.ai/solutions` 与 `https://x.ai/grok` 的可渲染页面证据，供实现时查数值。它描述的是 xAI 公开页面的视觉语言，不是本项目的业务内容或生产 URL。

## 证据与适用范围

本次浏览器勘察时间为 2026-10-13。真实页面在浏览器中返回 Cloudflare 阻断页，因此以下数值来自可渲染的 Wayback 快照，并用 accessibility tree、computed style、桌面/手机截图交叉核对：

- Solutions：`https://web.archive.org/web/20260522182653id_/https://x.ai/solutions`
- Grok：`https://web.archive.org/web/20260524095150id_/https://x.ai/grok`
- 桌面基准：1280×900 视口，页面截图按完整页面观察。
- 手机基准：390×844 视口。

页面未来可能改版。若真实 URL 可访问，先以实时页面为准；若仍被拦截，沿用本规格并在交付说明中标注证据来源。

## 1. 视觉原则

- 画布保持白/黑的平面感，主色只承担文字、边框、按钮和状态，不用装饰性渐变制造层次。
- 用大块空白、少量 1px 分隔线和低透明度文字建立层级；阴影只用于导航下拉，不给普通卡片加浮夸阴影。
- 形状以 `16px` 圆角卡片和 `9999px` 胶囊为主。边框通常是 1px、低透明度；探索类卡片使用 1px dashed。
- 图标为单色线性图标，常用 14/16/28px 容器，线宽约 1.5–1.75，圆角端点；不要混用彩色 emoji 或厚重填充图标。
- 内容语气短而直接；标题用 Display 字体，说明文字用较低透明度的 Text 字体，链接用低透明度并在 hover 时增强。

## 2. 颜色与主题 token

页面 CSS 使用 HSL token，再通过 `hsl(var(--token))` 或 alpha 变体消费。优先定义语义 token，下面同时列出勘察到的基础色：

| Token | HSL 来源 | 近似值 | 用途 |
| --- | --- | --- | --- |
| `--color-jet` / `--primary` (light) | `0 0% 4%` | `#0A0A0A` | 主文字、浅色主按钮背景 |
| `--color-white` / `--background` (light) | `0 0% 100%` | `#FFFFFF` | 浅色画布、输入背景 |
| `--color-charcoal` / `--card` (dark) | `0 0% 10%` | `#1A1A1A` | 深色卡片、移动菜单中的层次 |
| `--color-ivory` / `--card` (light) | `40 18% 97%` | `#F9F8F6` | Solutions 卡片、Grok 演示卡 |
| `--color-dove` / `--border` (light) | `222 19% 86%` | `#D5D9E2` | 浅色分隔线、滚动条 thumb |
| `--color-umbra` / `--border` (dark) | `221 12% 14%` | `#1F2228` | 深色分隔线和边框 |
| `--color-fog` / `--secondary` | `216 4% 51%` | `#7D8187` | 次要文字 |
| `--color-pewter` | `213 12% 70%` | — | 次次要文字、hover 辅助 |
| `--color-nimbus` | `228 21.74% 95.49%` | — | 浅色 hover/反差背景 |
| `--color-sunset` / `--accent` | `22 100% 51.6%` | — | 仅在确有强调语义时使用；常规营销页不依赖它 |

建议的完整语义层：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 4%;
  --primary: 0 0% 4%;
  --primary-hover: 221 12% 14%;
  --secondary: 216 4% 51%;
  --card: 40 18% 97%;
  --border: 222 19% 86%;
  --input: 0 0% 100%;
  --radius: 0.5rem;
}

.dark {
  --background: 0 0% 4%;
  --foreground: 222 19% 86%;
  --primary: 0 0% 100%;
  --primary-hover: 40 18% 97%;
  --secondary: 216 4% 51%;
  --card: 0 0% 10%;
  --border: 221 12% 14%;
  --input: 216 4% 51%;
}
```

透明度约定：

- 主文字：`rgb(var(--primary) / 1)`；普通辅助文字 `primary / 0.5`，小标签 `primary / 0.4`，弱链接 `primary / 0.3`。
- 卡片边框：`primary / 0.06`；虚线探索卡默认 `primary / 0.10`，hover `primary / 0.18`。
- 滚动中的非活动 Grok feature：`opacity: 0.2`；活动项 `opacity: 1`。
- 深色模式下不要直接把浅色灰色反转；让 `--primary`、`--card`、`--border` 语义 token 完成换色。

## 3. 字体与类型阶梯

页面使用两套 Universal Sans：

- 正文/导航：`universalSans, "universalSans Fallback"`，Text 400 与 550。
- 标题：`universalSansDisplay, "universalSansDisplay Fallback"`，Display 400 与 550。
- 代码/技术数字：`GeistMono, ui-monospace, SFMono-Regular, Menlo, monospace`。
- fallback 使用度量调整过的 Arial 类字体；项目没有授权字体时，宁可使用本地 fallback，也不要提交来源不明的 woff2。

| 场景 | 桌面 | 手机 | 字重/字距 | 颜色 |
| --- | --- | --- | --- | --- |
| body | 16/24 | 16/24 | Text 400 | `primary` |
| 顶部导航 | 14/20 | 菜单 18/27 | Text 500 | 当前 `primary`，其余 `primary/0.5` |
| hero H1 | 60/60 | 36/39.6 | Display 500，桌面 `-1.5px`，手机 `-0.9px` | `primary` |
| hero 说明 | 18/29.25 | 18/29.25 | Text 400 | `primary/0.5` |
| Solutions 卡片标题 | 24/32 | 24/32 | Display 400，`-0.6px` | `primary` |
| Grok feature 标题 | 30/36 | 30/36 | Display 400，`-0.75px` | active `primary` |
| section H2 | 36/40 | 30/36 | Display 400，约 `-0.9px` | `primary` |
| 普通卡片标题 | 20/28 | 20/28 | Display 400，约 `-0.5px` | `primary` |
| 卡片正文 | 14/24 | 14/24 | Text 400 | `primary/0.5` |
| feature 清单标题 | 14/20 | 14/20 | Text 500 | `primary/0.8` |
| feature 清单说明 | 12/19.5 | 12/19.5 | Text 400 | `primary/0.4` |
| footer 分组标题 | 13/19.5 | 13/19.5 | Text 500 | `primary/0.7` |
| footer 链接 | 13/21 | 13/21 | Text 400 | `primary/0.5` |
| footer 署名 | 10/10 | 10/10 | Text 400 | `secondary` |

标题不要默认全大写，也不要给所有字母增加 tracking；站点的紧凑感主要来自 Display 字体和负字距。

## 4. 容器、断点和通用壳体

采用接近 Tailwind 默认的断点：`sm=640px`、`md=768px`、`lg=1024px`、`xl=1280px`。

```css
.xai-container {
  width: 100%;
  margin-inline: auto;
  padding-inline: 16px;
}

@media (min-width: 1024px) {
  .xai-container { padding-inline: 24px; }
}

@media (min-width: 1280px) {
  .xai-container { max-width: 1280px; }
}
```

### 固定顶栏

- `position: fixed; inset: 0 0 auto; z-index: 50;`，透明背景，默认不画底框。
- 桌面导航高度约 80px；logo 24×24，导航项 `padding: 6px 12px`、间距 4px。
- 手机保留 16px 上下内边距，logo 24×24；菜单按钮 48×48，圆形，`1px primary/0.15` 边框。
- 顶栏滚动后显示从背景色向下的弱渐变遮罩：桌面约 96px 高，手机约 128px 高，使用 200ms opacity 过渡；默认 opacity 0。
- logo 只用当前颜色的 X 形 SVG/图标，禁止给 logo 加白底或阴影。

### 导航

桌面顺序为 `Products / Solutions / Developer / Company / Pricing / News`。前三/四个有 12px chevron，线宽约 1.75；当前路由为 `primary`，非当前项为 `primary/0.5`，hover 恢复 `primary`。

右侧为一个浅色描边的 `Contact Sales` 胶囊和黑/白主色的分段 `Try Grok` 胶囊：外层 36px 高、全圆角；左段为文字 CTA，右段 36px 方形区域，分隔处沿纵向切开，右段仅放下箭头。

桌面 hover 导航时显示下拉菜单：约 12px 圆角、`card` 背景、`shadow-xl` 黑色 10% 阴影、左右两栏；左栏约 220px 宽，链接行 `padding: 12px 16px`，右栏展示该产品的静态预览。打开/关闭主要过渡 opacity，约 180ms；关闭时同时禁用 pointer events，避免透明层挡住页面。

手机导航改为全屏覆盖层：背景跟随主题，左右 24px；Products、Solutions、Developer、Company 是带底部 1px 低透明边框的 52px 行，Pricing/News 为普通链接；可展开的行右侧放 16px chevron。底部固定 48px 高的全宽主 CTA，下面放 Contact、Legal、News 等低调链接。打开菜单时锁定 body 滚动，关闭按钮仍保持 48px 可点击区域。

## 5. Solutions 页面模式

### Hero

- 桌面 hero 约 `padding-top: 224px; padding-bottom: 96px`，手机约 `160px 16px 64px`。
- 内容在 `max-width: 768px` 的区域内居中。
- 小标签为 14/20、`primary/0.4`、Text 500；标签到 H1 间距 16px。
- H1 为 `Grok for every team.`；H1 到说明间距 16px，说明到 CTA 行间距 32px。
- CTA 行居中，gap 12px；主次按钮都 44px 高，横向 padding 20px。主按钮是 primary 背景 + background 文字；次按钮透明 + `primary/0.15` 细边框。

### 解决方案卡片

页面顺序：Business、Government、Customer Support、Legal、Security、Explore use cases。

```css
.solutions-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 768px) {
  .solutions-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1024px) {
  .solutions-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.solution-card {
  min-height: 240px;
  padding: 32px;
  border-radius: 16px;
  background: hsl(var(--card));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

@media (min-width: 640px) {
  .solution-card { padding: 40px; }
}
```

卡片标题之后留 12px；正文为 14/24、`primary/0.5`；底部链接为 14/20、`primary/0.3`，上方留 24px，右侧用细线箭头。普通卡 hover 只使用 `filter: brightness(0.97)`，链接文字变为 `primary/0.6`。Explore 卡片透明底、1px dashed `primary/0.1`，hover 只增强边框到约 `primary/0.18`。

### Footer

- footer 上边为 1px `border`；桌面内部 `padding: 40px 24px 64px`，手机也保留 40px 顶部空间。
- 桌面左侧品牌区宽约 280px，右侧之前放一条 1px dashed 竖分隔线；链接使用 5 列网格，列间约 56px，组间垂直 gap 40px。
- 左侧放极小的 “A division of” 和 SpaceX 标记、版权、底部 theme/build 标识。它们保持 `secondary` / `primary/0.25`，不要抢主内容注意力。
- 手机改为两列 footer 链接，隐藏桌面竖分隔线；所有列允许自然增高，不要固定高度导致溢出。

## 6. Grok 页面模式

### Hero 与 CTA

Hero 与 Solutions 共用标题、说明和胶囊按钮 token，但内容为两行：`The truth-seeking` / `AI assistant.`。第二行可用 `primary/0.5`，形成截图中黑/灰的层次。上方是带 Grok 图标的 12px 可用平台说明，下方是 44px 的 `Try Grok` 主按钮与 `Get SuperGrok` 次按钮。

桌面 hero 内容大致位于 y=200–520，底部以 1px border 分隔；手机在 80px 顶栏下保留约 80px 上方留白，标题按 36px 换行，CTA 在说明后约 32px。

### 四段滚动 feature

桌面 feature 区上边 1px border，容器内边距约 96px 24px；内容是 `grid-template-columns: 1fr 1.3fr`，列间 64px。左栏四段 Chat、Multi-agent、Search、Imagine，每段约 `min-height: 50vh`（1280×900 下约 450px），标题图标与标题同行。

- 当前段显示完整不透明度；非当前段为 `opacity: 0.2`。
- 透明度过渡约 500ms；不要让整个页面重新布局。
- 用 IntersectionObserver 或滚动进度在段落进入中心区域时切换当前项；初始 Chat active。
- 标题 30/36，正文 16/26，正文宽度约 448px；核对项用低对比度的 `✓`/线性图标和 14px 左右文字。
- 右侧为 sticky 演示卡：桌面宽约 660px、高约 440px，`top: calc(50vh - 220px)`，16px 圆角，背景 `card`，1px `primary/0.06` 边框。内部内容可用静态消息、思考状态和结果来模拟，不需要真实 AI 请求。
- 演示卡底部 composer 是白色 95% 背景的胶囊，约 46px 高、13px 字体、8px 10px 内边距；两端使用 28px 圆形图标按钮，中间 placeholder 截断不换行。

手机不使用 sticky 双栏：feature 内容单列排列，演示预览嵌入对应段落或置于标题下方，控制按钮展示为可触达的 28px 圆形区域；不要在 390px 视口压缩桌面卡到不可读。

### And much more

该区以 1px border 开始，桌面/手机上内边距约 96px/64px 24px/16px。标题为 36/40（手机 30/36），说明为 14/22.75。功能列表为桌面 3 列，列间约 40–56px、行间约 32px；每项使用 `display:flex; align-items:flex-start; gap:12px`，左侧图标约 18px，标题 14/20 `primary/0.8`，说明 12/19.5 `primary/0.4`。

### Get started

居中的 H2 与副说明之后放三张步骤卡：`01 Open Grok`、`02 Sign in`、`03 Start chatting`。桌面为 3 列、gap 24px；每张约 395×180px，padding 32px，16px 圆角，1px `primary/0.06` 边框。编号使用小号低对比度文字，标题 20/28，正文 14/24。卡片下方居中放主次 CTA，仍为 44px 胶囊。

### Building on Grok

以 1px border 分隔，内部 padding 桌面约 96px 24px。内容是一张暖灰/深灰卡，16px 圆角；桌面约 `padding: 56px 48px`，标题/说明在左，`Get API Key` 和 `Read Docs` 在右，使用 `display:flex; justify-content:space-between; align-items:center`。手机改为纵向，卡片约 `padding:40px 32px`，按钮紧接说明排列。

## 7. 主题、状态和可访问交互

- 主题切换使用 `.dark` 根类或项目既有主题机制，至少支持 light/dark；若支持 system，循环按钮 label 要反映下一状态并持久化选择。
- 主题切换只改变 semantic token，不复制两套组件 CSS。主按钮在浅色为黑底白字，深色为白底黑字；次按钮始终透明、边框随 primary 变化。
- 所有链接和按钮要有可见 focus：约 2px outline、2px offset；保留键盘 Tab 顺序。图标按钮必须有 aria-label，即使原始视觉页面有空 label，也不要复刻可访问性缺陷。
- hover 不改变布局尺寸：卡片使用 brightness、文字使用 alpha、下拉使用 opacity/height；focus 不依赖 hover 才可见。
- 菜单、下拉和 tooltip 在关闭时不得留透明的点击层；移动菜单打开时将焦点放到关闭按钮，Escape 可关闭，关闭后还原焦点。
- `prefers-reduced-motion: reduce` 下把 180/200/500ms 过渡设为近零或直接切换，仍保留 active/inactive 对比。

## 8. 视觉复核清单

在交付前按下列顺序截图核对：

1. 1280×900：容器是否从 24px 开始，hero 标题是否 60px，顶栏是否 80px，Solutions 是否三列，Grok 演示卡是否约 660×440。
2. 768×900：是否从三列降为两列，footer 和按钮是否仍有足够间距，标题是否出现不自然的孤行。
3. 390×844：容器是否为 16px，hero H1 是否 36px，菜单按钮是否 48px，卡片是否单列，移动菜单是否锁滚动。
4. Light/Dark：检查 body、card、border、secondary、主次按钮和 dashed card 的对比度；不要出现深色模式下的白色大块输入框或浅色模式下的黑色卡片。
5. Hover/scroll/focus：检查导航 dropdown 180ms、卡片 brightness、Grok active opacity 1/0.2、键盘 focus、Escape 关闭菜单和 reduced-motion。

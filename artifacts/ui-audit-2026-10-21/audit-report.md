# Toka 管理中心全页面前端审计

日期：2026-10-21  
范围：本地 Mock 环境中的已登记页面、主要表单和关键弹窗；桌面视口 1920×1080，窄屏视口 390×844。

## 总体结论

页面框架在两个尺寸下都没有文档级横向溢出。桌面 1920px 视口中，侧栏宽 224px；主内容可用区从 x=224 到 x=1920，宽 1696px。`.main-content` 的计算宽度为 1686px、`max-width: none`，右侧 10px 是滚动条预留。页面内的常规留白是内边距，不是固定宽度容器。390px 窄屏下 `document` 与 `body` 宽度均为 390px。当前工作区的侧栏分组和侧栏边缘也都没有分割线。

视觉系统整体简洁、间距和按钮层级一致；认证文件和 API 密钥页能支持较密集的数据扫描，移动端表单、筛选和导航会调整布局。主要风险集中在 API 密钥列表的 ARIA 表格语义、低对比度辅助文字，以及配置页移动端固定操作栏遮住表单内容。

## 审计步骤与健康度

| # | 页面或状态 | 健康度 | 证据与说明 |
|---|---|---|---|
| 1 | 登录页 `/login` | 良好 | 连接信息和主操作明确；桌面品牌区较重，移动端隐藏品牌大图后表单居中。 |
| 2 | 仪表盘 `/`、`/dashboard` | 良好 | 四项概览与当前配置分区清楚；Mock 数量少时页面下半部留白较多。 |
| 3 | 配置面板可视化 `/config` | 需关注 | 桌面分组与左侧锚点清晰；移动端折叠为手风琴，但固定底部保存栏会盖住末端字段。 |
| 4 | 配置面板源文件编辑 | 受 Mock 限制 | 编辑器布局铺满可用区；重新登录后的 Mock 返回 404，编辑器显示 `key: value` 占位内容，不能据此判断真实配置文件体验。 |
| 5 | API 密钥 `/api-keys` | 需关注 | 桌面行和移动卡片都能显示范围、状态、操作；axe 检出 ARIA 行/组语义错误和多处对比度不足。 |
| 6 | AI 提供商 Codex 列表 | 良好 | 搜索、排序和表格操作清楚；空数据时移动端空状态提供直接添加入口。 |
| 7 | AI 提供商 Claude 列表 | 良好 | 与其他提供商共用同一结构；表格列对齐。 |
| 8 | AI 提供商 OpenAI 兼容列表 | 良好 | Base URL、模型/请求头、状态分列呈现；操作列密集但可辨。 |
| 9 | Codex 提供商编辑表单 | 良好 | 表单按凭证、Base URL、传输和模型分组；桌面弹窗纵向滚动并保留底部操作。 |
| 10 | OpenAI 兼容提供商编辑表单 | 需关注 | 配置项较多、分组有效；弹窗内容高度较长，窄屏状态未单独捕获。 |
| 11 | Claude 提供商编辑表单 | 良好 | 桌面表单密度适中；移动端弹窗接近全宽，内容滚动且底部保存按钮始终可见。 |
| 12 | Claude `/models` 模型选择 | 受 Mock 限制 | 搜索、重新获取、返回和禁用的添加按钮可见；本地 Mock 未提供模型，列表为空。 |
| 13 | 认证文件 `/auth-files` | 良好 | 桌面四列卡片和规则摘要利用宽屏；移动端改为单列卡片并保持操作可达。 |
| 14 | OAuth 禁用模型规则 | 良好 | 提供商选择、规则标签、已禁用模型和保存状态层次清楚；模型选择器不可用时可手动输入的提示明确。 |
| 15 | OAuth 模型别名/思考等级规则 `/auth-files/oauth-model-alias` | 需关注 | 直接访问该路径时仍选中“禁用的模型”页签；手动切换后别名空状态与添加入口清楚，但模型来源提示显示原始 i18n key。 |
| 16 | OAuth 登录 `/oauth` | 良好 | 五种服务商卡片清晰；移动端纵向排列，主按钮宽且易点。未启动实际 OAuth 外部流程。 |
| 17 | 使用统计 `/usage` | 良好 | 概览卡片和 API/模型明细层级清楚；移动端导入/导出操作纵向排列。Mock 当前没有真实统计数据。 |
| 18 | 请求详情 `/request-logs` | 良好 | 搜索、成功/失败筛选和空状态明确；移动端筛选控件能换行，无横向溢出。 |
| 19 | 日志查看 `/logs` 日志内容 | 良好 | 结构化筛选、刷新、自动刷新和原始日志开关分层明确；移动端日志按行换行显示。 |
| 20 | 日志查看 `/logs` 错误请求日志 | 良好 | 空说明、状态提示和下载操作明确；当前 Mock 提供两条文件样例。 |
| 21 | 管理中心信息 `/system` | 需关注 | 版本信息和登录信息操作清楚；Mock 模型列表返回 Network Error。axe 检出版本/构建标签对比度不足。 |
| 22 | 移动端导航抽屉 | 良好 | 菜单抽屉有遮罩，当前项可辨；主要页面在 390px 下保持 390px 文档宽度。 |
| 23 | 移动端 API 密钥、认证文件、AI 提供商 | 良好 | 列表转卡片/单列；API 密钥状态和操作区可见。认证文件、提供商的移动端数据状态因 Mock 重置为空，不能评估大量真实记录下的密度。 |
| 24 | 移动端配置、OAuth、统计、请求详情、日志、系统、登录 | 良好 | 已覆盖主要页面结构；所有采样页面 `documentElement.scrollWidth` 与 390px 视口相同。 |

## 重点发现

### 1. API 密钥列表的辅助技术语义需要修正

在 `/api-keys` 运行 axe WCAG 2 A/AA 规则时，列表中的 `role="row"` 缺少 `cell`/`columnheader` 子级；`role="rowgroup"` 又包含 `article` 子级，触发 `aria-required-children` 与 `aria-required-parent` 两项严重问题。视觉上列表可读，但读屏软件可能无法按预期理解表格行列。建议改成真实 table 语义，或使用完整一致的 grid/row/cell 结构。

### 2. 小号辅助文字对比度偏低

axe 在 API 密钥页检出 19 个对比度节点，过滤项、结果数量、列标题、徽标和范围摘要约 3.4–3.91:1；系统信息页的版本和构建标签为 3.91:1。它们均低于普通文字 4.5:1 的 WCAG AA 阈值。优先加深辅助文字颜色，保留现有状态色含义。

### 3. 配置页移动端底部操作栏遮挡内容

390×844 配置页截图中，固定保存栏覆盖了认证配置附近的末端内容。建议让操作栏为表单预留底部空间，或让它在滚动到表单末端时不覆盖字段。

### 4. 空数据状态占比较大

仪表盘、使用统计、请求详情和提供商列表在 Mock 数据较少时有较大留白。已有空状态文案和添加入口能说明下一步；真实数据量、长名称及大规模日志的视觉密度未在本轮 Mock 中验证。

### 5. OAuth 规则深链接与页签不匹配，且有未翻译文案

直接访问 `/auth-files/oauth-model-alias` 后，截图仍显示“禁用的模型”页签处于选中状态；页面需要用户再切换到“模型别名与思考等级”。同一状态下模型来源提示显示原始字符串 `oauth_model_rules.model_source_manual`。建议让深链接决定初始页签，并补齐/核对中文资源键。

## 全屏宽度核对

1920×1080 下 `.content` 实测为 x=224、宽 1696、右边缘 1920；`.main-content` 为 x=224、宽 1686、`max-width: none`。窄屏 390×844 下文档和 body 宽度均为 390。当前页面是在侧栏之外铺满可用工作区，内容保留页面内边距；这不是 1440px 居中限宽布局。

## 证据边界

- 所有浏览器截图来自独立 agent-browser Chromium 会话，只访问 `127.0.0.1` 本地页面和 Mock API，没有使用远程账户数据。
- 第一次登录后的 Mock 有样例配置、密钥和认证文件；登出再登录后数据变为空，配置接口返回 404，系统模型列表返回 Network Error。因此报告同时保留了已加载状态截图和后续错误/空状态截图；错误状态不能归因到生产 API 或真实账号。
- axe 只抽查了系统信息、API 密钥和 OAuth 登录页面；没有完成全站键盘、屏幕阅读器、放大、动态对比度和所有交互状态检查。截图或 axe 抽查都不能证明完整 WCAG 合规。
- OAuth 登录按钮未启动外部授权流程；保存、删除、导入等会改变数据的操作没有执行。

## 截图证据

以下为本轮采集并逐张检查的截图。图片均保存在本目录。

### 桌面主页面与列表

![Dashboard seeded desktop](01-dashboard-desktop.png)
![Dashboard desktop](10-dashboard-desktop.png)
![Config panel desktop](11-config-panel-desktop-full.png)
![API keys desktop initial capture](03-api-keys-desktop.png)
![API keys desktop](12-api-keys-desktop-audit.png)
![Auth files desktop](14-auth-files-desktop-viewport.png)
![Auth files full page](13-auth-files-desktop-full.png)
![AI providers desktop](09-ai-providers-index-desktop.png)
![AI providers Codex table](04-ai-providers-desktop.png)
![AI providers OpenAI compatible desktop](04b-ai-providers-openai-desktop.png)
![OAuth login desktop](16-oauth-login-desktop.png)
![Usage desktop](17-usage-desktop.png)
![Request details desktop](18-request-details-desktop.png)
![Logs desktop](19-logs-desktop.png)
![Error request logs desktop](20-error-request-logs-desktop.png)
![System info desktop](21-system-info-desktop.png)

### 表单和规则弹窗

![Codex provider form](05-codex-editor-desktop.png)
![OpenAI compatible provider form](06-openai-editor-desktop.png)
![Claude provider form](07-claude-editor-desktop.png)
![Claude new provider modal](08-claude-new-modal-desktop.png)
![OAuth Anthropic disabled model rules](15-oauth-anthropic-rules-modal.png)
![OAuth Codex disabled model route](32-oauth-model-rules-codex-route.png)
![OAuth model alias tab](33-oauth-model-alias-route.png)
![OAuth model alias direct route](43-oauth-model-alias-direct-route.png)
![OAuth excluded route](34-oauth-excluded-route.png)
![Claude model selector desktop](31-claude-model-selector-desktop.png)
![Auth file model list modal](22-auth-file-model-list-modal.png)

### 窄屏与错误/空状态

![Mobile navigation drawer](24-mobile-nav-open.png)
![Mobile auth files](23-auth-files-mobile.png)
![Mobile API keys](28-api-keys-mobile.png)
![Mobile AI providers empty state](41-ai-providers-mobile-empty.png)
![Mobile OAuth login](42-oauth-login-mobile.png)
![Mobile usage](25-usage-mobile.png)
![Mobile request details](29-request-details-mobile.png)
![Mobile logs](26-logs-mobile.png)
![Mobile config panel](27-config-panel-mobile.png)
![Mobile Claude provider form](35-claude-form-mobile.png)
![Mobile Claude model selector](36-claude-model-selector-mobile.png)
![Mobile system info](30-system-info-mobile.png)
![Mobile login](38-login-mobile.png)
![Desktop login](37-login-desktop.png)
![Config error state from local Mock](39-config-local-empty-state.png)
![Config source editor from local Mock](40-config-source-editor.png)

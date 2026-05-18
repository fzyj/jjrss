# RSS 阅读器设计文档

**日期**: 2026-05-18
**状态**: 已确认

---

## 概述

开发一个自托管的 RSS 阅读器，采用三栏式布局 + 极简纯文本风格。服务端 SQLite 存储，单人使用，无需登录。

## 技术选型

| 类别 | 选择 | 说明 |
|------|------|------|
| 框架 | Next.js 16 (App Router) | 项目已有 |
| 样式 | Tailwind CSS v4 | 项目已有 |
| 数据库 | better-sqlite3 | 同步 API、零配置、单文件 |
| RSS 解析 | rss-parser | 支持 RSS/Atom |
| 全文提取 | @mozilla/readability + jsdom | 提取文章正文 |
| OPML | 手写 XML 解析/生成 | 格式简单，无需额外依赖 |
| 字体 | Geist + Geist Mono | 项目已有 |

---

## 数据库设计

四张表，Mermaid 关系：

```mermaid
erDiagram
    feeds ||--o{ articles : has
    categories ||--o{ feeds : groups
    settings }
```

### feeds

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增 |
| url | TEXT UNIQUE | RSS 订阅 URL |
| title | TEXT | 订阅源标题 |
| description | TEXT | 源描述 |
| link | TEXT | 网站主页 |
| category_id | INTEGER FK | 所属分类，可为空 |
| last_fetched_at | TEXT | 上次拉取时间 ISO |
| error_count | INTEGER DEFAULT 0 | 连续失败次数 |
| created_at | TEXT | 创建时间 |

### articles

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增 |
| feed_id | INTEGER FK | 所属订阅源 |
| guid | TEXT | 文章唯一标识 |
| title | TEXT | 标题 |
| url | TEXT | 原文链接 |
| summary | TEXT | RSS 摘要 |
| full_content | TEXT | 全文提取内容，可为空 |
| author | TEXT | 作者 |
| published_at | TEXT | 发布时间 |
| is_read | INTEGER DEFAULT 0 | 已读 |
| is_starred | INTEGER DEFAULT 0 | 星标收藏 |
| created_at | TEXT | 入库时间 |

UNIQUE(feed_id, guid)

### categories

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增 |
| name | TEXT UNIQUE | 分类名 |
| parent_id | INTEGER FK | 父分类，可为空 |
| sort_order | INTEGER DEFAULT 0 | 排序 |

### settings

| 列 | 类型 | 说明 |
|----|------|------|
| key | TEXT PK | 配置键 |
| value | TEXT | 配置值 |

预置配置项：`refresh_interval`（默认 30 分钟）、`max_articles_per_feed`（默认 200）

---

## API 路由

全部在 `app/api/` 下，返回 JSON。

### 订阅源管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/feeds` | 所有订阅源，含每源未读计数 |
| POST | `/api/feeds` | 添加订阅源。传入 URL，服务端自动发现 RSS |
| DELETE | `/api/feeds/[id]` | 删除订阅源及其文章 |
| PUT | `/api/feeds/[id]` | 更新分类、标题等 |

### 文章

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles` | 文章列表。支持 `?feed_id=&category_id=&starred=&page=&page_size=` |
| GET | `/api/articles/[id]` | 单篇文章详情 |
| PUT | `/api/articles/[id]` | 更新 `is_read` 或 `is_starred` |
| POST | `/api/articles/mark-all-read` | 标记源/分类全部已读 |

### 刷新

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/feeds/refresh` | 刷新所有或指定源。返回刷新的文章数 |

### OPML

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/opml/import` | 上传 OPML 文件导入 |
| GET | `/api/opml/export` | 导出 OPML 文件 |

### 搜索/发现

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/discover` | 按关键词搜索文章 |

---

## 组件树

```
layout.tsx                          — 根布局，三栏 flex 容器
├── Sidebar                         — 左侧面板 (w-64, ~240px)
│   ├── SidebarHeader               — 标题/Logo + 添加按钮
│   ├── CategoryList                — 分类列表
│   │   └── CategoryItem            — 分类（全部/星标/自定义分类）
│   └── FeedList                    — 订阅源列表
│       └── FeedItem                — 源名 + 未读计数
├── ArticleList                     — 中间面板 (flex-1, 最小宽)
│   ├── ArticleListHeader           — 当前筛选标题 + 未读统计
│   └── ArticleItem[]               — 标题/摘要/时间/星标
└── ArticleReader                   — 右侧面板 (flex-1)
    ├── EmptyState                   — 未选中文章时的提示
    ├── ArticleHeader                — 标题/来源/时间/操作按钮
    ├── ArticleSummary               — 摘要模式渲染（HTML 清洗）
    └── ArticleFullText              — 全文模式渲染
```

所有面板支持响应式：小屏时堆叠，点击切换面板。

---

## 数据流

### 首次加载
1. 页面加载 → `GET /api/feeds` 获取左侧面板数据
2. 默认选中"全部"，`GET /api/articles` 获取文章列表
3. 点击文章 → `GET /api/articles/[id]` 获取详情（含全文）

### 添加订阅源
1. 用户输入 URL → `POST /api/feeds {url}`
2. 服务端：请求 URL → 检测 RSS link → 用 rss-parser 解析 → 标题等信息存入 feeds 表
3. 同步拉取文章 → 存入 articles 表
4. 返回新 feed，客户端更新列表

### 刷新订阅源
1. 定时触发（前端轮询 `GET /api/feeds/refresh` 或服务端 `setInterval`）
2. 对每个 feed：请求 RSS → 解析 → 新文章写入 → 清理旧文章
3. 全文提取为异步：文章入库时仅存摘要，点击阅读时延迟提取并存 full_content

### 全文提取
1. 用户点击"阅读模式" → 文章 id → 检查 full_content 是否已存在
2. 不存在 → GET 原文 HTML → Readability 提取 → 清洗 → 存入 full_content
3. 返回清洗后的 HTML → 渲染阅读视图

### OPML 导入
1. 上传文件 → 解析 XML outline 结构 → 批量创建 feeds → 拉取文章

---

## 错误处理

- **RSS 拉取失败**：递增 error_count，连续 3 次失败后在 UI 显示警告，静默跳过
- **全文提取失败**：回退到显示原始网页链接
- **SQLite 锁**：better-sqlite3 同步模式天然避免锁竞争，单用户无并发问题
- **OPML 解析失败**：返回结构化错误信息，指出无效节点

---

## 测试策略

- **单元测试**：`lib/rss.ts`（RSS 解析）、`lib/reader.ts`（全文提取）、`lib/opml.ts`（OPML 解析）
- **API 测试**：各 API 路由的请求/响应验证
- **无 E2E**：初期不写端到端测试，以效率优先

---

## 文件结构

```
app/
├── layout.tsx                # 根布局（已有，需要修改）
├── page.tsx                  # 首页（替换默认内容）
├── globals.css               # 全局样式（已有，需添加极简风格定制）
├── api/
│   ├── feeds/
│   │   ├── route.ts          # GET/POST
│   │   ├── [id]/route.ts     # DELETE/PUT
│   │   └── refresh/route.ts  # POST
│   ├── articles/
│   │   ├── route.ts          # GET
│   │   ├── [id]/route.ts     # GET/PUT
│   │   └── mark-all-read/route.ts
│   ├── opml/
│   │   ├── import/route.ts   # POST
│   │   └── export/route.ts   # GET
│   └── discover/route.ts     # GET
├── components/
│   ├── sidebar.tsx
│   ├── article-list.tsx
│   ├── article-reader.tsx
│   ├── feed-form.tsx          # 添加订阅源表单
│   ├── opml-upload.tsx        # OPML 上传
│   └── ui/                    # 通用 UI 组件（按钮、模态框等）
lib/
├── db.ts                      # 数据库初始化和连接
├── schema.ts                  # 建表语句和迁移
├── rss.ts                     # RSS 解析和拉取
├── reader.ts                  # 全文提取（Readability）
├── opml.ts                    # OPML 解析和生成
└── types.ts                   # TypeScript 类型定义
```

## 实现步骤

1. 安装依赖 (`better-sqlite3`, `rss-parser`, `@mozilla/readability`, `jsdom`)
2. 创建数据库 schema 和连接 (`lib/db.ts`, `lib/schema.ts`)
3. 实现 RSS 服务 (`lib/rss.ts`) 和 OPML 服务 (`lib/opml.ts`)
4. 实现 API 路由（feeds → articles → opml → discover）
5. 实现三栏布局和组件
6. 实现全文提取 (`lib/reader.ts`)
7. 添加服务端定时刷新
8. 样式打磨（极简风格）

# 时间线博物馆（Timeline Museum）

> 一个注重设计质感的个人时间线网站。前台展示人生重要时刻，后台管理所有内容。**配色克制、动效精准——每个像素都有存在的理由。**

![](https://img.shields.io/badge/Python-3.10+-blue) ![](https://img.shields.io/badge/FastAPI-0.110+-green) ![](https://img.shields.io/badge/Three.js-r128-orange) ![](https://img.shields.io/badge/GSAP-3.12-purple)

---

## 功能

### 前台（公开访问）

| 功能 | 说明 |
|---|---|
| 时间线展示 | 纵向滚动，事件左右交替排列，按年份分组 |
| 3D 粒子背景 | Three.js 渲染，缓慢漂移 + 呼吸感透明度波动 |
| 自定义光标 | 鼠标跟随 + 拖尾效果，悬停时放大 |
| 分类筛选 | 人生 / 学业 / 项目 / 旅行 / 成就，一键过滤 |
| 关键词搜索 | 实时搜索事件标题、描述、标签 |
| 缩放控制 | 按钮或 Ctrl+滚轮，缩放事件间距 |
| 暗色/亮色主题 | 一键切换，颜色过渡平滑，偏好自动保存 |
| 事件详情弹窗 | 点击卡片查看完整信息 |
| 响应式适配 | 桌面 / 平板 / 手机三档断点，触摸设备自动隐藏光标 |
| 毛玻璃质感 | backdrop-filter 实现卡片磨砂效果 |

### 后台（需登录）

| 功能 | 说明 |
|---|---|
| 事件管理 | 增删改查、搜索、按分类筛选，所有修改实时生效 |
| 个人资料 | 姓名、简介、头像 URL、GitHub / 博客 / 邮箱 |
| 网站设置 | 页脚引用语、版权信息、滚动提示文字 |
| 图片上传 | 拖拽上传、自动生成 URL、一键复制，支持 JPG/PNG/GIF/WebP/SVG |
| 修改密码 | bcrypt 加密存储，旧密码验证 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python · FastAPI · JWT (python-jose) · bcrypt |
| 前端 | Vanilla JS · Three.js · GSAP (ScrollTrigger) |
| 样式 | CSS Custom Properties · backdrop-filter · CSS Animations |
| 数据 | JSON 文件存储（无需数据库） |
| 部署 | uvicorn · Nginx 反代（可选） |

---

## 项目结构

```
timeline-museum/
├── main.py                 # FastAPI 应用（路由、认证、安全中间件、CRUD）
├── requirements.txt        # Python 依赖
├── data/
│   ├── events.json         # 时间线事件 + 个人资料
│   └── site.json           # 网站设置 + 密码哈希（自动生成）
├── templates/
│   ├── index.html          # 前台页面
│   ├── admin-login.html    # 后台登录页
│   └── admin.html          # 后台管理面板
└── static/
    ├── css/
    │   └── style.css       # 全局样式（含响应式）
    ├── js/
    │   ├── effects.js      # Three.js 粒子系统 + 自定义光标
    │   ├── timeline.js     # 时间线渲染引擎
    │   └── main.js         # 前台主逻辑
    └── uploads/            # 上传的图片
```

---

## 快速开始

### 1. 安装依赖

```bash
cd timeline-museum
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8080
```

### 3. 访问

| 地址 | 说明 |
|---|---|
| `http://localhost:8080` | 前台——时间线博物馆 |
| `http://localhost:8080/admin` | 后台——管理登录 |

默认管理员密码：**`admin123`**（登录后立即修改）

---

## 部署到服务器

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `TIMELINE_SECRET` | JWT 签名密钥 | 随机生成（重启后所有登录失效） |
| `HTTPS` | 设为 `true` 启用 Cookie Secure 标志 | 不设（HTTP 模式） |

### HTTP 部署（无备案）

```bash
export TIMELINE_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8080 > server.log 2>&1 &
```

### HTTPS 部署（有备案）

```bash
export TIMELINE_SECRET="<你的密钥>"
export HTTPS=true
nohup python -m uvicorn main:app --host 127.0.0.1 --port 8080 > server.log 2>&1 &
```

配合 Nginx 反代处理 SSL：

```nginx
server {
    listen 443 ssl;
    server_name www.404soul.fun;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态文件直接由 Nginx 服务（可选，减轻 Python 负载）
    location /static/ {
        root /path/to/timeline-museum;
        expires 30d;
    }
}
```

---

## 安全措施

| 措施 | 实现 |
|---|---|
| 密码加密 | bcrypt 哈希，不可逆 |
| 认证 | JWT 令牌，HttpOnly + SameSite Cookie |
| 速率限制 | 登录接口基于 IP，5 分钟最多 10 次 |
| 输入清洗 | 所有管理员输入经过长度截断、分类白名单校验 |
| 文件上传 | 扩展名白名单 + MIME 类型校验 + 大小限制 + UUID 重命名 |
| 安全响应头 | X-Frame-Options / X-Content-Type-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy |
| XSS 防护 | HTML 转义输出、HttpOnly Cookie |
| 路径遍历防护 | UUID 重命名上传文件 |

---

## 数据备份

日常备份这两个目录即可：

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/ static/uploads/
```

- `data/` — 全部事件、个人资料、网站设置
- `static/uploads/` — 上传的图片

---

## 自定义

### 修改默认密码

首次启动后 `data/site.json` 会自动生成，包含默认密码的哈希。登录后台后通过「修改密码」功能更换，或直接删除 `admin_password_hash` 字段后重启（会重置为 `admin123`）。

### 添加新的事件分类

1. `data/events.json` 中给事件设置新的 `category` 值
2. `main.py` 的 `sanitize_event()` 中把新分类加入 `allowed_cats` 白名单
3. `templates/index.html` 的筛选栏添加对应按钮
4. `templates/admin.html` 的分类下拉框添加对应选项

### 修改配色

所有颜色通过 CSS 自定义属性集中管理，修改 `static/css/style.css` 中 `:root` 块的变量即可全局生效：

```css
:root {
  --bg-root: #09090b;      /* 背景色 */
  --accent-2: #d4a574;     /* 主强调色（暖琥珀） */
  --accent-3: #c47a8b;     /* 次强调色（玫瑰） */
  --text-primary: #eeece6; /* 主文字色 */
  /* ... */
}
```

---

## 开发

```bash
# 安装开发依赖
pip install -r requirements.txt

# 启动（修改自动重载）
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload

# 验证 JSON 数据完整性
python -c "import json; json.load(open('data/events.json', encoding='utf-8'))"
```

---

## License

MIT — 自由使用、修改、分发。

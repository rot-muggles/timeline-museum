"""
Timeline Museum — 个人时间线博物馆
=====================================
FastAPI 驱动的全栈个人网站。
- 前台：公开的时间线展示页
- 后台：受JWT保护的管理面板（事件CRUD、资料编辑、图片上传）
- 安全：速率限制、bcrypt密码哈希、安全响应头、输入清洗
"""

import json
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from fastapi import (
    FastAPI, Request, Response, HTTPException,
    Form, File, UploadFile,
)
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import jwt, JWTError

# ══════════════════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════════════════
BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
UPLOAD_DIR = BASE / "static" / "uploads"
EVENTS_FILE = DATA_DIR / "events.json"
SITE_FILE = DATA_DIR / "site.json"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 密钥：优先从环境变量读取，否则随机生成（重启后所有token失效）
SECRET_KEY = os.environ.get("TIMELINE_SECRET", secrets.token_urlsafe(32))
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24                       # 登录有效期24小时
MAX_UPLOAD_SIZE = 10 * 1024 * 1024          # 上传限制10MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_EVENTS = 500                            # 防止数据文件无限膨胀


# ══════════════════════════════════════════════════════════════
# 密码工具 — 直接用bcrypt，避免passlib兼容问题
# ══════════════════════════════════════════════════════════════
def hash_password(pw: str) -> str:
    """用bcrypt哈希密码，返回可存储的字符串"""
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    """验证明文密码与哈希是否匹配"""
    return bcrypt.checkpw(pw.encode(), hashed.encode())


# ══════════════════════════════════════════════════════════════
# App 初始化
# ══════════════════════════════════════════════════════════════
app = FastAPI(title="Timeline Museum", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


def render_html(filename: str) -> HTMLResponse:
    """直接读取HTML文件返回，不使用Jinja2模板引擎。
    规避了Starlette/Jinja2版本间的cache key哈希冲突问题。"""
    path = BASE / "templates" / filename
    return HTMLResponse(path.read_text(encoding="utf-8"))


# ══════════════════════════════════════════════════════════════
# JSON文件读写辅助
# ══════════════════════════════════════════════════════════════
def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_site():
    """获取网站设置，首次运行时自动创建默认配置"""
    if not SITE_FILE.exists():
        default = {
            "admin_password_hash": hash_password("admin123"),
            "footer_quote": "「我们都是由自己经历的故事组成的。」",
            "footer_copy": "© 2026 星河 · 用心构建",
            "hero_scroll_hint": "向下滚动，探索我的人生",
        }
        save_json(SITE_FILE, default)
    return load_json(SITE_FILE)


def get_events_data():
    data = load_json(EVENTS_FILE)
    # 读取后也排一次序，确保API返回始终有序
    data["events"].sort(key=lambda e: e["date"])
    return data


def save_events_data(data):
    # 保存前按日期排序，保证新事件自动插入正确位置
    data["events"].sort(key=lambda e: e["date"])
    save_json(EVENTS_FILE, data)


# ══════════════════════════════════════════════════════════════
# 安全中间件 — 每个响应统一注入安全头
# ══════════════════════════════════════════════════════════════
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    # 防 MIME 类型嗅探
    response.headers["X-Content-Type-Options"] = "nosniff"
    # 禁止被 iframe 嵌入（防点击劫持）
    response.headers["X-Frame-Options"] = "DENY"
    # 浏览器XSS过滤器
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # 限制 Referer 信息泄露
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # 禁用不必要的浏览器API
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # 隐藏服务器标识
    response.headers["Server"] = ""
    return response


# ══════════════════════════════════════════════════════════════
# 速率限制 — 基于内存的滑动窗口实现
# ══════════════════════════════════════════════════════════════
_rate_store: dict[str, list[float]] = {}

def check_rate(key: str, limit: int, window: int) -> bool:
    """
    检查指定key在window秒内是否超过limit次请求。
    用于登录防暴力破解。
    """
    now = time.time()
    if key not in _rate_store:
        _rate_store[key] = []
    # 清理过期记录
    _rate_store[key] = [t for t in _rate_store[key] if now - t < window]
    if len(_rate_store[key]) >= limit:
        return False
    _rate_store[key].append(now)
    return True


# ══════════════════════════════════════════════════════════════
# JWT 认证工具
# ══════════════════════════════════════════════════════════════
def create_token(data: dict) -> str:
    """生成JWT，包含过期时间和签发时间"""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {**data, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALG)


def verify_token(token: str) -> Optional[dict]:
    """验证JWT，失败返回None"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALG])
    except JWTError:
        return None


def admin_required(request: Request):
    """
    管理员认证依赖注入。
    从Cookie中提取JWT，验证失败直接抛出401。
    """
    token = request.cookies.get("admin_token")
    if not token:
        raise HTTPException(401, detail="未登录")
    payload = verify_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(401, detail="登录已过期")
    return payload


# ══════════════════════════════════════════════════════════════
# 输入清洗 — 防止XSS和数据污染
# ══════════════════════════════════════════════════════════════
def sanitize_str(s: str, max_len: int = 5000) -> str:
    """截断字符串，去除首尾空白，非字符串返回空字符串"""
    if not isinstance(s, str):
        return ""
    return s.strip()[:max_len]


def sanitize_event(e: dict) -> dict:
    """
    清洗事件数据：限制长度、校验分类白名单、过滤非法标签。
    即便攻击者绕过了前端校验，这一层也会兜底。
    """
    allowed_cats = {"life", "education", "project", "travel", "achievement"}
    return {
        "id": int(e.get("id", 0)),
        "date": sanitize_str(e.get("date", ""), 20),
        "title": sanitize_str(e.get("title", ""), 200),
        "description": sanitize_str(e.get("description", ""), 2000),
        "category": sanitize_str(e.get("category", ""), 30)
        if e.get("category", "") in allowed_cats else "life",
        "tags": [sanitize_str(t, 50) for t in e.get("tags", []) if isinstance(t, str)][:10],
        "icon": sanitize_str(e.get("icon", ""), 30),
        "location": sanitize_str(e.get("location", ""), 200),
        "featured": bool(e.get("featured", False)),
        "image": sanitize_str(e.get("image", ""), 500),
    }


# ══════════════════════════════════════════════════════════════
# PUBLIC ROUTES — 前台，无需登录
# ══════════════════════════════════════════════════════════════

@app.get("/")
def index(request: Request):
    """前台主页：时间线博物馆"""
    return render_html("index.html")


@app.get("/api/events")
def api_events():
    """公开API：返回全部事件 + 个人资料"""
    return get_events_data()


@app.get("/api/stats")
def api_stats():
    """公开API：返回聚合统计数据（总数、分类、年份跨度）"""
    data = get_events_data()
    events = data["events"]
    cats = {}
    years_set = set()
    for e in events:
        cats[e["category"]] = cats.get(e["category"], 0) + 1
        years_set.add(e["date"][:4])
    return {
        "total": len(events),
        "categories": cats,
        "year_span": f"{min(years_set)} - {max(years_set)}" if years_set else "",
        "year_count": len(years_set),
    }


@app.get("/api/site")
def api_site():
    """公开API：返回网站设置（页脚文字等）"""
    site = get_site()
    return {
        "footer_quote": site.get("footer_quote", ""),
        "footer_copy": site.get("footer_copy", ""),
        "hero_scroll_hint": site.get("hero_scroll_hint", ""),
    }


# ══════════════════════════════════════════════════════════════
# ADMIN PAGE ROUTES — 后台页面
# ══════════════════════════════════════════════════════════════

@app.get("/admin")
def admin_login_page(request: Request):
    """后台登录页。已登录则直接跳转仪表盘。"""
    token = request.cookies.get("admin_token")
    if token and verify_token(token):
        return RedirectResponse("/admin/dashboard", status_code=303)
    return render_html("admin-login.html")


@app.get("/admin/dashboard")
def admin_dashboard(request: Request):
    """后台仪表盘。未登录则重定向到登录页。"""
    token = request.cookies.get("admin_token")
    if not token or not verify_token(token):
        return RedirectResponse("/admin", status_code=303)
    return render_html("admin.html")


# ══════════════════════════════════════════════════════════════
# AUTH API — 登录 / 登出 / 改密
# ══════════════════════════════════════════════════════════════

@app.post("/api/admin/login")
def admin_login(
    response: Response,
    request: Request,
    password: str = Form(...),
):
    """
    管理员登录。
    - 基于IP做速率限制（5分钟内最多10次）
    - 密码验证成功后签发JWT，写入HttpOnly Cookie
    - HttpOnly + SameSite=Lax 防止XSS读取token
    """
    ip = request.client.host if request.client else "unknown"
    if not check_rate(f"login:{ip}", limit=10, window=300):
        raise HTTPException(429, detail="登录尝试过于频繁，请5分钟后再试")

    site = get_site()
    if not verify_password(password, site.get("admin_password_hash", "")):
        raise HTTPException(401, detail="密码错误")

    token = create_token({"role": "admin", "ip": ip})
    response = JSONResponse({"ok": True})
    response.set_cookie(
        key="admin_token",
        value=token,
        httponly=True,          # JS无法读取，防XSS
        secure=os.environ.get("HTTPS", "").lower() == "true",  # HTTPS时设环境变量HTTPS=true
        samesite="lax",         # 防CSRF
        max_age=JWT_EXPIRE_HOURS * 3600,
    )
    return response


@app.post("/api/admin/logout")
def admin_logout(response: Response):
    """清除认证Cookie"""
    response = JSONResponse({"ok": True})
    response.delete_cookie("admin_token")
    return response


@app.post("/api/admin/change-password")
def admin_change_password(
    request: Request,
    old_password: str = Form(...),
    new_password: str = Form(..., min_length=6, max_length=128),
):
    """修改管理员密码，需验证旧密码"""
    admin_required(request)
    site = get_site()
    if not verify_password(old_password, site["admin_password_hash"]):
        raise HTTPException(400, detail="旧密码错误")
    site["admin_password_hash"] = hash_password(new_password)
    save_json(SITE_FILE, site)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# ADMIN API — 事件CRUD
# ══════════════════════════════════════════════════════════════

@app.get("/api/admin/events")
def admin_list_events(request: Request):
    """管理员获取全部事件（含非公开字段）"""
    admin_required(request)
    return get_events_data()


@app.post("/api/admin/events")
async def admin_create_event(request: Request):
    """创建新事件。输入经过sanitize_event清洗。"""
    admin_required(request)
    form = await request.form()
    data = get_events_data()

    if len(data["events"]) >= MAX_EVENTS:
        raise HTTPException(400, detail=f"最多{MAX_EVENTS}条事件")

    new_id = max((e["id"] for e in data["events"]), default=0) + 1

    event = sanitize_event({
        "id": new_id,
        "date": form.get("date", ""),
        "title": form.get("title", ""),
        "description": form.get("description", ""),
        "category": form.get("category", "life"),
        "tags": [t.strip() for t in form.get("tags", "").split(",") if t.strip()],
        "icon": form.get("icon", "star"),
        "location": form.get("location", ""),
        "featured": form.get("featured", "false") == "true",
        "image": form.get("image", ""),
    })
    data["events"].append(event)
    save_events_data(data)
    return {"ok": True, "event": event}


@app.put("/api/admin/events/{event_id}")
async def admin_update_event(event_id: int, request: Request):
    """更新事件。未提供的字段保留原值。"""
    admin_required(request)
    form = await request.form()
    data = get_events_data()

    idx = next((i for i, e in enumerate(data["events"]) if e["id"] == event_id), None)
    if idx is None:
        raise HTTPException(404, detail="事件不存在")

    # 用原数据做fallback，只覆盖用户提交的字段
    old = data["events"][idx]
    updated = sanitize_event({
        "id": event_id,
        "date": form.get("date", old["date"]),
        "title": form.get("title", old["title"]),
        "description": form.get("description", old["description"]),
        "category": form.get("category", old["category"]),
        "tags": [t.strip() for t in form.get("tags", "").split(",") if t.strip()]
        if form.get("tags") else old["tags"],
        "icon": form.get("icon", old["icon"]),
        "location": form.get("location", old["location"]),
        "featured": form.get("featured", str(old["featured"])) == "true",
        "image": form.get("image", old["image"]),
    })
    data["events"][idx] = updated
    save_events_data(data)
    return {"ok": True, "event": updated}


@app.delete("/api/admin/events/{event_id}")
def admin_delete_event(event_id: int, request: Request):
    """删除事件。不可恢复。"""
    admin_required(request)
    data = get_events_data()
    idx = next((i for i, e in enumerate(data["events"]) if e["id"] == event_id), None)
    if idx is None:
        raise HTTPException(404, detail="事件不存在")
    data["events"].pop(idx)
    save_events_data(data)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# ADMIN API — 个人资料
# ══════════════════════════════════════════════════════════════

@app.put("/api/admin/profile")
async def admin_update_profile(request: Request):
    """更新个人资料（姓名、简介、头像、社交链接）"""
    admin_required(request)
    form = await request.form()
    data = get_events_data()
    p = data["profile"]
    p["name"] = sanitize_str(form.get("name", p["name"]), 100)
    p["bio"] = sanitize_str(form.get("bio", p["bio"]), 200)
    p["avatar"] = sanitize_str(form.get("avatar", p.get("avatar", "")), 500)
    p["social"]["github"] = sanitize_str(form.get("github", p["social"]["github"]), 500)
    p["social"]["blog"] = sanitize_str(form.get("blog", p["social"]["blog"]), 500)
    p["social"]["email"] = sanitize_str(form.get("email", p["social"]["email"]), 200)
    save_events_data(data)
    return {"ok": True, "profile": p}


# ══════════════════════════════════════════════════════════════
# ADMIN API — 网站设置
# ══════════════════════════════════════════════════════════════

@app.put("/api/admin/site")
async def admin_update_site(request: Request):
    """更新网站全局设置。返回时剔除敏感字段（密码哈希）。"""
    admin_required(request)
    form = await request.form()
    site = get_site()
    site["footer_quote"] = sanitize_str(form.get("footer_quote", site["footer_quote"]), 500)
    site["footer_copy"] = sanitize_str(form.get("footer_copy", site["footer_copy"]), 200)
    site["hero_scroll_hint"] = sanitize_str(form.get("hero_scroll_hint", site["hero_scroll_hint"]), 200)
    save_json(SITE_FILE, site)
    # 返回时排除密码哈希
    return {"ok": True, "site": {k: v for k, v in site.items() if not k.endswith("_hash")}}


# ══════════════════════════════════════════════════════════════
# ADMIN API — 图片上传
# ══════════════════════════════════════════════════════════════

@app.post("/api/admin/upload")
async def admin_upload(request: Request, file: UploadFile = File(...)):
    """
    上传图片到 static/uploads/。
    - 校验文件扩展名白名单
    - 校验MIME类型
    - 限制文件大小
    - 用UUID重命名防止路径遍历攻击
    """
    admin_required(request)

    # 校验扩展名
    ext = Path(file.filename or "unknown.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, detail=f"不支持的文件类型: {ext}")

    # 校验MIME类型（防止伪造扩展名）
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, detail="只允许上传图片文件")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(400, detail=f"文件大小不能超过{MAX_UPLOAD_SIZE // (1024*1024)}MB")

    # UUID重命名：防止文件名冲突和路径遍历
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)

    url = f"/static/uploads/{filename}"
    return {"ok": True, "url": url, "filename": filename}


# ══════════════════════════════════════════════════════════════
# 启动检查
# ══════════════════════════════════════════════════════════════
@app.on_event("startup")
def startup():
    get_site()  # 确保 site.json 存在
    if not EVENTS_FILE.exists():
        raise RuntimeError("data/events.json not found")
    print(f"Timeline Museum started (secret: {SECRET_KEY[:8]}...)")

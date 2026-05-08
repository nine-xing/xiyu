<?php
/**
 * 管理员口令：优先使用 CLUB_ADMIN_PASSWORD_HASH（bcrypt）。
 * 生成哈希：在 backend 目录执行 php gen_password_hash.php 你的密码
 * 复制后将此文件重命名为 config.php，并修改所有占位符为真实值。
 */
define('CLUB_ADMIN_PASSWORD_HASH', '');
/** 若留空则仅使用上方哈希；仅当 HASH 为空时才会读取平文（不推荐） */
define('CLUB_ADMIN_PASSWORD', '请在此填入你的管理员密码');

/** 登录挑战 HMAC 密钥，须为长随机串，勿与 JWT 相同 */
define('CLUB_LOGIN_CHALLENGE_SECRET', '请在此填入随机生成的HMAC密钥');

define('CLUB_JWT_SECRET', '请在此填入随机生成的JWT密钥');

/** Cloudflare Turnstile（可选）：不启用则留空 */
define('CLUB_TURNSTILE_SECRET', '');
define('CLUB_TURNSTILE_VERIFY_URL', 'https://challenges.cloudflare.com/turnstile/v0/siteverify');

define('CLUB_JWT_TTL', 7 * 24 * 3600);

define('CLUB_SESSION_COOKIE', 'club_session');

/** 挑战有效秒数；须先 GET /api/login-challenge 再 POST /api/login */
define('CLUB_LOGIN_CHALLENGE_TTL', 300);
/** 允许客户端时钟与服务器相差秒数 */
define('CLUB_LOGIN_CLOCK_SKEW', 60);
/** 同一 IP 在时间窗口内最多尝试登录次数 */
define('CLUB_LOGIN_RATE_MAX', 12);
define('CLUB_LOGIN_RATE_WINDOW', 600);

define('CLUB_DATA_FILE', __DIR__ . '/data/content.json');
define('CLUB_UPLOAD_DIR', __DIR__ . '/uploads');
define('CLUB_UPLOAD_BASE', '/api/uploads');
define('CLUB_UPLOAD_MAX_IMAGE', 10 * 1024 * 1024);
define('CLUB_UPLOAD_MAX_VIDEO', 80 * 1024 * 1024);
define('CLUB_UPLOAD_MAX_DOCUMENT', 20 * 1024 * 1024);

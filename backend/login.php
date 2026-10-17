<?php
require __DIR__ . '/config.php';
require __DIR__ . '/jwt.php';
require __DIR__ . '/security_login.php';
require __DIR__ . '/util.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    club_json_response(405, array('error' => '方法不允许'));
}

$body = club_read_json_body();
if ($body === null) {
    club_json_response(400, array('error' => '请求体须为 JSON'));
}

$password = isset($body['password']) ? (string) $body['password'] : '';
$turnstileToken = isset($body['turnstileToken']) ? (string) $body['turnstileToken'] : '';
$ch = isset($body['challenge']) && is_array($body['challenge']) ? $body['challenge'] : null;

if ($ch === null) {
    club_json_response(400, array('error' => '缺少登录凭证，请刷新页面后重试'));
}

$id = isset($ch['id']) ? (string) $ch['id'] : '';
$iat = isset($ch['iat']) ? (int) $ch['iat'] : 0;
$mac = isset($ch['mac']) ? (string) $ch['mac'] : '';

$failMsg = array('error' => '登录失败，请检查密钥或稍后重试');

if ($id === '' || $iat <= 0 || $mac === '') {
    club_json_response(401, $failMsg);
}

if (!club_login_verify_challenge_mac($id, $iat, $mac)) {
    club_json_response(401, $failMsg);
}

$skew = defined('CLUB_LOGIN_CLOCK_SKEW') ? (int) CLUB_LOGIN_CLOCK_SKEW : 60;
$win = club_login_challenge_window();
$now = time();
if (abs($now - $iat) > $win + $skew) {
    club_json_response(401, $failMsg);
}

if (!club_login_consume_nonce($id, $iat)) {
    club_json_response(401, $failMsg);
}

$ip = club_login_client_ip();
if (!club_login_rate_take_slot($ip)) {
    header('Retry-After: 120');
    club_json_response(429, array('error' => '尝试次数过多，请两分钟后再试'));
}

if (club_turnstile_enabled() && !club_turnstile_verify($turnstileToken, $ip)) {
    club_json_response(401, $failMsg);
}

if ($password === '') {
    club_json_response(400, array('error' => '请输入密码'));
}

if (!club_verify_admin_password($password)) {
    usleep(random_int(80000, 220000));
    club_json_response(401, $failMsg);
}

$csrf = bin2hex(random_bytes(16));
$token = club_jwt_encode(
    array(
        'sub' => 'admin',
        'iat' => time(),
        'exp' => time() + CLUB_JWT_TTL,
        'csrf' => $csrf,
    ),
    CLUB_JWT_SECRET
);

club_set_auth_cookie($token, time() + CLUB_JWT_TTL);
club_json_response(200, array('ok' => true, 'csrfToken' => $csrf));

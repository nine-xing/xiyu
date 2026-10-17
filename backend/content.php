<?php
require __DIR__ . '/config.php';
require __DIR__ . '/jwt.php';
require __DIR__ . '/util.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $data = club_load_content();
    club_json_response(200, $data);
}

if ($method === 'PUT') {
    $tok = club_auth_token();
    if ($tok === '') {
        club_json_response(401, array('error' => '未登录或登录已过期，请重新登录'));
    }
    $payload = club_jwt_decode($tok, CLUB_JWT_SECRET);
    if ($payload === null) {
        club_json_response(403, array('error' => '登录已过期或无效，请重新登录'));
    }
    $csrfToken = club_csrf_header_token();
    $csrfClaim = isset($payload['csrf']) ? (string) $payload['csrf'] : '';
    if ($csrfToken === '' || $csrfClaim === '' || !hash_equals($csrfClaim, $csrfToken)) {
        club_json_response(403, array('error' => '请求校验失败，请刷新后重试'));
    }

    $body = club_read_json_body();
    if ($body === null) {
        club_json_response(400, array('error' => '请求体须为 JSON'));
    }

    $normalized = club_normalize_put($body);
    $dir = dirname(CLUB_DATA_FILE);
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true)) {
            club_json_response(500, array('error' => '无法创建数据目录'));
        }
    }

    $json = json_encode($normalized, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        club_json_response(500, array('error' => '序列化失败'));
    }

    if (file_put_contents(CLUB_DATA_FILE, $json, LOCK_EX) === false) {
        club_json_response(500, array('error' => '写入失败，请检查 data 目录权限'));
    }

    club_json_response(200, array('ok' => true));
}

club_json_response(405, array('error' => '方法不允许'));

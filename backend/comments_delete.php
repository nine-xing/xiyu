<?php
require_once __DIR__ . '/util.php';
club_json_api_begin();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/comments_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    club_json_response(405, array('error' => '方法不允许'));
}

$tok = club_auth_token();
if ($tok === '') {
    club_json_response(401, array('error' => '未登录或登录已过期，请重新登录'));
}
$payload = club_jwt_decode($tok, CLUB_JWT_SECRET);
if ($payload === null || !isset($payload['sub']) || $payload['sub'] !== 'admin') {
    club_json_response(403, array('error' => '无权删除评论'));
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

$year = isset($body['year']) ? (int) $body['year'] : 0;
$beatId = isset($body['beatId']) ? (string) $body['beatId'] : '';
$half = isset($body['half']) ? (string) $body['half'] : 'first';
$index = isset($body['index']) ? (int) $body['index'] : 0;
$commentId = isset($body['commentId']) ? trim((string) $body['commentId']) : '';

if ($year < 1990 || $year > 2100) {
    club_json_response(400, array('error' => '年份无效'));
}
if ($commentId === '' || !preg_match('/^[a-fA-F0-9]{16}$/', $commentId)) {
    club_json_response(400, array('error' => '评论标识无效'));
}

$key = club_comment_make_key($year, $beatId, $half, $index);
$store = club_comment_load_store();
if (!isset($store[$key]) || !is_array($store[$key])) {
    club_json_response(404, array('error' => '未找到评论'));
}

$list = $store[$key];
$found = false;
$newList = array();
foreach ($list as $row) {
    if (!is_array($row)) {
        continue;
    }
    $id = isset($row['id']) ? (string) $row['id'] : '';
    if (hash_equals($id, $commentId)) {
        $found = true;
        continue;
    }
    $newList[] = $row;
}

if (!$found) {
    club_json_response(404, array('error' => '未找到评论'));
}

$store[$key] = $newList;
if (!club_comment_save_store($store)) {
    club_json_response(500, array('error' => '保存失败'));
}

club_json_response(200, array('ok' => true));

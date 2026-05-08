<?php
require_once __DIR__ . '/util.php';
club_json_api_begin();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/comments_lib.php';
require_once __DIR__ . '/comments_banned.php';
require_once __DIR__ . '/security_login.php';

function club_comment_utf8_len($s)
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($s, 'UTF-8');
    }
    return strlen($s);
}

function club_comment_rate_file()
{
    return dirname(CLUB_DATA_FILE) . '/comment_post_rate.json';
}

function club_comment_rate_allow_post($ip)
{
    $path = club_comment_rate_file();
    $window = 600;
    $max = 24;
    $now = time();
    $fh = @fopen($path, 'c+');
    if ($fh === false) {
        return true;
    }
    if (!@flock($fh, LOCK_EX)) {
        fclose($fh);
        return true;
    }
    $raw = stream_get_contents($fh);
    $data = array();
    if ($raw !== false && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }
    $pruned = array();
    foreach ($data as $k => $v) {
        if (!is_array($v)) {
            continue;
        }
        $nv = array();
        foreach ($v as $ts) {
            $ts = (int) $ts;
            if ($now - $ts < $window) {
                $nv[] = $ts;
            }
        }
        if (count($nv) > 0) {
            $pruned[$k] = $nv;
        }
    }
    $myList = isset($pruned[$ip]) ? $pruned[$ip] : array();
    if (count($myList) >= $max) {
        flock($fh, LOCK_UN);
        fclose($fh);
        return false;
    }
    $myList[] = $now;
    $pruned[$ip] = $myList;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($pruned));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $year = isset($_GET['year']) ? (int) $_GET['year'] : 0;
    $beatId = isset($_GET['beatId']) ? (string) $_GET['beatId'] : '';
    $half = isset($_GET['half']) ? (string) $_GET['half'] : 'first';
    $index = isset($_GET['index']) ? (int) $_GET['index'] : 0;
    if ($year < 1990 || $year > 2100) {
        club_json_response(400, array('error' => '年份无效'));
    }
    $key = club_comment_make_key($year, $beatId, $half, $index);
    $store = club_comment_load_store();
    $list = isset($store[$key]) && is_array($store[$key]) ? $store[$key] : array();
    usort($list, function ($a, $b) {
        $ta = isset($a['createdAt']) ? (int) $a['createdAt'] : 0;
        $tb = isset($b['createdAt']) ? (int) $b['createdAt'] : 0;
        return $tb - $ta;
    });
    club_json_response(200, array('comments' => $list));
}

if ($method === 'POST') {
    $body = club_read_json_body();
    if ($body === null) {
        club_json_response(400, array('error' => '请求体须为 JSON'));
    }
    $year = isset($body['year']) ? (int) $body['year'] : 0;
    $beatId = isset($body['beatId']) ? (string) $body['beatId'] : '';
    $half = isset($body['half']) ? (string) $body['half'] : 'first';
    $index = isset($body['index']) ? (int) $body['index'] : 0;
    $text = isset($body['text'])
        ? club_utf8_safe_string(trim(strip_tags((string) $body['text'])))
        : '';
    $nick = isset($body['nick'])
        ? club_utf8_safe_string(trim(strip_tags((string) $body['nick'])))
        : '';
    if ($year < 1990 || $year > 2100) {
        club_json_response(400, array('error' => '年份无效'));
    }
    if ($text === '') {
        club_json_response(400, array('error' => '评论内容不能为空'));
    }
    if (club_comment_utf8_len($text) > 500) {
        club_json_response(400, array('error' => '评论过长'));
    }
    if (club_comment_contains_banned($text)) {
        club_json_response(400, array('error' => '评论包含不当用语，请修改后重试'));
    }
    if ($nick === '') {
        $nick = '访客';
    }
    if (club_comment_utf8_len($nick) > 24) {
        club_json_response(400, array('error' => '昵称过长'));
    }
    $ip = club_login_client_ip();
    if (!club_comment_rate_allow_post($ip)) {
        header('Retry-After: 120');
        club_json_response(429, array('error' => '发送过于频繁，请稍后再试'));
    }
    $key = club_comment_make_key($year, $beatId, $half, $index);
    $store = club_comment_load_store();
    if (!isset($store[$key]) || !is_array($store[$key])) {
        $store[$key] = array();
    }
    $entry = array(
        'id' => club_random_hex(8),
        'nick' => $nick,
        'text' => $text,
        'createdAt' => time(),
    );
    $store[$key][] = $entry;
    if (count($store[$key]) > 300) {
        $store[$key] = array_slice($store[$key], -300);
    }
    if (!club_comment_save_store($store)) {
        club_json_response(500, array(
            'error' =>
                '保存评论失败。请在服务器上为 backend/data 目录开启写权限（含新建 comments.json）；若权限正常仍失败，请去掉评论中的异常符号后重试。',
        ));
    }
    club_json_response(200, array('ok' => true, 'comment' => $entry));
}

club_json_response(405, array('error' => '方法不允许'));

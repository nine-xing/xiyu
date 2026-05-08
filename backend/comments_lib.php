<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/util.php';

function club_comments_path()
{
    return dirname(CLUB_DATA_FILE) . '/comments.json';
}

function club_comment_make_key($year, $beatId, $half, $index)
{
    $year = (int) $year;
    $bid = trim((string) $beatId);
    if ($bid !== '') {
        $safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $bid);
        if ($safe === '') {
            $safe = 'id';
        }
        return $year . '_' . $safe;
    }
    $h = ($half === 'second') ? 'second' : 'first';
    $idx = max(0, (int) $index);
    return $year . '_' . $h . '_' . $idx;
}

function club_comment_load_store()
{
    $path = club_comments_path();
    if (!is_readable($path)) {
        return array();
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return array();
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : array();
}

function club_comment_save_store(array $store)
{
    $path = club_comments_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true)) {
            return false;
        }
    }
    $store = club_utf8_safe_deep($store);
    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $json = json_encode($store, $flags);
    if ($json === false) {
        return false;
    }
    $tmp = $path . '.tmp.' . getmypid();
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return @file_put_contents($path, $json, LOCK_EX) !== false;
    }
    return true;
}

<?php

if (!defined('CLUB_DATA_FILE')) {
    require_once __DIR__ . '/config.php';
}

function club_comment_banned_words_path()
{
    return dirname(CLUB_DATA_FILE) . '/comment_banned_words.txt';
}

/**
 * @return string[]
 */
function club_comment_banned_list()
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $cached = array();
    $path = club_comment_banned_words_path();
    if (!is_readable($path)) {
        return $cached;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $cached;
    }
    foreach (explode("\n", $raw) as $line) {
        $line = trim($line);
        if ($line === '' || (isset($line[0]) && $line[0] === '#')) {
            continue;
        }
        $cached[] = $line;
    }
    return $cached;
}

function club_comment_contains_banned($text)
{
    $text = (string) $text;
    if ($text === '') {
        return false;
    }
    foreach (club_comment_banned_list() as $word) {
        if ($word === '') {
            continue;
        }
        if (function_exists('mb_stripos')) {
            if (mb_stripos($text, $word, 0, 'UTF-8') !== false) {
                return true;
            }
        } elseif (stripos($text, $word) !== false) {
            return true;
        }
    }
    return false;
}

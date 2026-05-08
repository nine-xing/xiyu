<?php

/**
 * Stop notices/warnings from being printed as HTML before JSON (breaks fetch().json()).
 */
function club_json_api_begin()
{
    if (function_exists('ini_set')) {
        @ini_set('display_errors', '0');
    }
}

/**
 * Hex id of $byteLength random bytes (PHP 5.6+ friendly).
 */
function club_random_hex($byteLength)
{
    $byteLength = (int) $byteLength;
    if ($byteLength < 1) {
        $byteLength = 8;
    }
    if (function_exists('random_bytes')) {
        try {
            return bin2hex(random_bytes($byteLength));
        } catch (Exception $e) {
            // fall through (PHP 7+ may throw Error instead; openssl/mt_rand below)
        }
    }
    if (function_exists('openssl_random_pseudo_bytes')) {
        $raw = openssl_random_pseudo_bytes($byteLength);
        if ($raw !== false && strlen($raw) === $byteLength) {
            return bin2hex($raw);
        }
    }
    $hex = '';
    for ($i = 0; $i < $byteLength; $i++) {
        $hex .= sprintf('%02x', mt_rand(0, 255));
    }
    return $hex;
}

/**
 * Strip invalid UTF-8 sequences so json_encode / mb_* won't break (PHP 8+ strict).
 */
function club_utf8_safe_string($s)
{
    $s = (string) $s;
    if ($s === '') {
        return '';
    }
    if (function_exists('mb_convert_encoding')) {
        return mb_convert_encoding($s, 'UTF-8', 'UTF-8');
    }
    if (function_exists('iconv')) {
        $t = @iconv('UTF-8', 'UTF-8//IGNORE', $s);
        return $t !== false ? $t : $s;
    }
    return $s;
}

function club_utf8_safe_deep($data)
{
    if (is_array($data)) {
        $out = array();
        foreach ($data as $k => $v) {
            $nk = is_string($k) ? club_utf8_safe_string($k) : $k;
            $out[$nk] = club_utf8_safe_deep($v);
        }
        return $out;
    }
    if (is_string($data)) {
        return club_utf8_safe_string($data);
    }
    return $data;
}

function club_json_response($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function club_read_json_body()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function club_bearer_token()
{
    $h = '';
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                $h = $value;
                break;
            }
        }
    }
    if ($h === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $h = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if ($h === '' && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $h = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if ($h === '' && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) {
            $h = $headers['Authorization'];
        } elseif (isset($headers['authorization'])) {
            $h = $headers['authorization'];
        }
    }
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) {
        return $m[1];
    }
    return '';
}

function club_auth_token()
{
    if (defined('CLUB_SESSION_COOKIE') && isset($_COOKIE[CLUB_SESSION_COOKIE])) {
        $cookieToken = trim((string) $_COOKIE[CLUB_SESSION_COOKIE]);
        if ($cookieToken !== '') {
            return $cookieToken;
        }
    }
    return club_bearer_token();
}

function club_is_https()
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443) {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
        return true;
    }
    return false;
}

function club_set_auth_cookie($jwtToken, $expireTs)
{
    $name = defined('CLUB_SESSION_COOKIE') ? CLUB_SESSION_COOKIE : 'club_session';
    $params = array(
        'expires' => (int) $expireTs,
        'path' => '/api/',
        'secure' => club_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    );
    setcookie($name, $jwtToken, $params);
}

function club_clear_auth_cookie()
{
    $name = defined('CLUB_SESSION_COOKIE') ? CLUB_SESSION_COOKIE : 'club_session';
    $params = array(
        'expires' => time() - 3600,
        'path' => '/api/',
        'secure' => club_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    );
    setcookie($name, '', $params);
}

function club_csrf_header_token()
{
    if (!empty($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        return trim((string) $_SERVER['HTTP_X_CSRF_TOKEN']);
    }
    return '';
}

function club_default_content()
{
    return array(
        'version' => 1,
        'hero' => array(
            'title' => '未命名的',
            'titleAccent' => '纪行',
            'lead' => '将招新、比赛与日常，收进同一卷磁带。向下滚动，逐幕回放。',
        ),
        'years' => array(),
    );
}

function club_load_content()
{
    $path = CLUB_DATA_FILE;
    if (!is_readable($path)) {
        return club_default_content();
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return club_default_content();
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return club_default_content();
    }
    if (!isset($data['version'])) {
        $data['version'] = 1;
    }
    if (!isset($data['hero']) || !is_array($data['hero'])) {
        $data['hero'] = club_default_content()['hero'];
    }
    if (!isset($data['years']) || !is_array($data['years'])) {
        $data['years'] = array();
    }
    return $data;
}

function club_normalize_put(array $in)
{
    $def = club_default_content();
    $out = array(
        'version' => isset($in['version']) ? (int) $in['version'] : 1,
        'hero' => $def['hero'],
        'years' => array(),
    );
    if (isset($in['hero']) && is_array($in['hero'])) {
        $h = $in['hero'];
        $out['hero'] = array(
            'title' => isset($h['title']) ? (string) $h['title'] : '',
            'titleAccent' => isset($h['titleAccent']) ? (string) $h['titleAccent'] : '',
            'lead' => isset($h['lead']) ? (string) $h['lead'] : '',
        );
    }
    if (isset($in['years']) && is_array($in['years'])) {
        foreach ($in['years'] as $y) {
            if (!is_array($y) || !isset($y['year'])) {
                continue;
            }
            $yearNum = (int) $y['year'];
            $row = array(
                'year' => $yearNum,
                'synopsis' => isset($y['synopsis']) ? (string) $y['synopsis'] : '',
                'firstHalf' => club_normalize_half(isset($y['firstHalf']) ? $y['firstHalf'] : array()),
                'secondHalf' => club_normalize_half(isset($y['secondHalf']) ? $y['secondHalf'] : array()),
            );
            $out['years'][] = $row;
        }
    }
    return $out;
}

function club_normalize_half(array $half)
{
    $syn = isset($half['synopsis']) ? (string) $half['synopsis'] : '';
    $beats = array();
    if (isset($half['beats']) && is_array($half['beats'])) {
        foreach ($half['beats'] as $b) {
            if (!is_array($b)) {
                continue;
            }
            $images = array();
            $media = array();
            if (isset($b['media']) && is_array($b['media'])) {
                foreach ($b['media'] as $m) {
                    if (!is_array($m)) {
                        continue;
                    }
                    $type = isset($m['type']) ? (string) $m['type'] : '';
                    $url = isset($m['url']) ? (string) $m['url'] : '';
                    if ($url === '' || ($type !== 'image' && $type !== 'video')) {
                        continue;
                    }
                    $media[] = array('type' => $type, 'url' => $url);
                    if ($type === 'image') {
                        $images[] = $url;
                    }
                }
            } elseif (isset($b['images']) && is_array($b['images'])) {
                foreach ($b['images'] as $img) {
                    if (!is_string($img) || $img === '') {
                        continue;
                    }
                    $images[] = $img;
                    $media[] = array('type' => 'image', 'url' => $img);
                }
            }
            $beats[] = array(
                'id' => isset($b['id']) ? (string) $b['id'] : '',
                'date' => isset($b['date']) ? (string) $b['date'] : '',
                'title' => isset($b['title']) ? (string) $b['title'] : '',
                'text' => isset($b['text']) ? (string) $b['text'] : '',
                'images' => $images,
                'media' => $media,
            );
        }
    }
    return array('synopsis' => $syn, 'beats' => $beats);
}

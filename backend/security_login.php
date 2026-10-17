<?php

require_once __DIR__ . '/config.php';

function club_login_client_ip()
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return $ip !== '' ? $ip : '0.0.0.0';
}

function club_login_challenge_secret()
{
    if (defined('CLUB_LOGIN_CHALLENGE_SECRET') && CLUB_LOGIN_CHALLENGE_SECRET !== '') {
        return CLUB_LOGIN_CHALLENGE_SECRET;
    }
    return CLUB_JWT_SECRET;
}

function club_login_challenge_sign($id, $iat)
{
    $msg = $id . ':' . (string) (int) $iat;
    return hash_hmac('sha256', $msg, club_login_challenge_secret(), true);
}

function club_login_verify_challenge_mac($id, $iat, $mac_hex)
{
    if (!is_string($mac_hex)) {
        return false;
    }
    $mac_hex = strtolower(trim($mac_hex));
    if (strlen($mac_hex) !== 64 || !ctype_xdigit($mac_hex)) {
        return false;
    }
    $expected = club_login_challenge_sign($id, $iat);
    $got = hex2bin($mac_hex);
    if ($got === false || strlen($got) !== 32) {
        return false;
    }
    return hash_equals($expected, $got);
}

function club_login_challenge_window()
{
    return defined('CLUB_LOGIN_CHALLENGE_TTL') ? (int) CLUB_LOGIN_CHALLENGE_TTL : 300;
}

function club_login_rate_limit_window()
{
    return defined('CLUB_LOGIN_RATE_WINDOW') ? (int) CLUB_LOGIN_RATE_WINDOW : 600;
}

function club_login_rate_limit_max()
{
    return defined('CLUB_LOGIN_RATE_MAX') ? (int) CLUB_LOGIN_RATE_MAX : 12;
}

function club_login_rate_file()
{
    return dirname(CLUB_DATA_FILE) . '/login_rate.json';
}

function club_login_nonce_file()
{
    return dirname(CLUB_DATA_FILE) . '/login_nonces.txt';
}

/**
 * @return bool false if over limit
 */
function club_login_rate_take_slot($ip)
{
    $path = club_login_rate_file();
    $window = club_login_rate_limit_window();
    $max = club_login_rate_limit_max();
    $now = time();
    $fh = fopen($path, 'c+');
    if ($fh === false) {
        return true;
    }
    if (!flock($fh, LOCK_EX)) {
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

/**
 * Mark challenge id as used; false if already used (replay).
 * @return bool
 */
function club_login_consume_nonce($id, $challenge_iat)
{
    if (!is_string($id) || strlen($id) !== 32 || !ctype_xdigit($id)) {
        return false;
    }
    $path = club_login_nonce_file();
    $now = time();
    $keep_until = (int) $challenge_iat + club_login_challenge_window() + 3600;
    $fh = fopen($path, 'c+');
    if ($fh === false) {
        return false;
    }
    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        return false;
    }
    $lines = array();
    $raw = stream_get_contents($fh);
    if ($raw !== false && $raw !== '') {
        foreach (explode("\n", trim($raw)) as $line) {
            if ($line === '') {
                continue;
            }
            $parts = explode("\t", $line, 2);
            if (count($parts) !== 2) {
                continue;
            }
            $exp = (int) $parts[0];
            $nid = $parts[1];
            if ($exp < $now) {
                continue;
            }
            if (hash_equals($nid, $id)) {
                flock($fh, LOCK_UN);
                fclose($fh);
                return false;
            }
            $lines[] = $line;
        }
    }
    $lines[] = $keep_until . "\t" . $id;
    if (count($lines) > 8000) {
        $lines = array_slice($lines, -4000);
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, implode("\n", $lines) . "\n");
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

function club_verify_admin_password($plain)
{
    if (!is_string($plain) || $plain === '') {
        return false;
    }
    if (defined('CLUB_ADMIN_PASSWORD_HASH') && CLUB_ADMIN_PASSWORD_HASH !== '') {
        return password_verify($plain, CLUB_ADMIN_PASSWORD_HASH);
    }
    if (defined('CLUB_ADMIN_PASSWORD') && CLUB_ADMIN_PASSWORD !== '') {
        return hash_equals(CLUB_ADMIN_PASSWORD, $plain);
    }
    return false;
}

function club_turnstile_enabled()
{
    return defined('CLUB_TURNSTILE_SECRET') && trim((string) CLUB_TURNSTILE_SECRET) !== '';
}

/**
 * @param string $token
 * @param string $ip
 * @return bool
 */
function club_turnstile_verify($token, $ip)
{
    if (!club_turnstile_enabled()) {
        return true;
    }
    $token = trim((string) $token);
    if ($token === '') {
        return false;
    }
    $payload = http_build_query(array(
        'secret' => CLUB_TURNSTILE_SECRET,
        'response' => $token,
        'remoteip' => (string) $ip,
    ));
    $url = defined('CLUB_TURNSTILE_VERIFY_URL') ? CLUB_TURNSTILE_VERIFY_URL : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    $raw = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(array(
            'http' => array(
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $payload,
                'timeout' => 5,
            ),
        ));
        $raw = @file_get_contents($url, false, $ctx);
    }
    if ($raw === false || $raw === '') {
        return false;
    }
    $json = json_decode($raw, true);
    return is_array($json) && !empty($json['success']);
}

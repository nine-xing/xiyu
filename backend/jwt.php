<?php

function club_b64url_encode($bin)
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function club_b64url_decode($str)
{
    $pad = strlen($str) % 4;
    if ($pad) {
        $str .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($str, '-_', '+/'));
}

/**
 * @return string JWT
 */
function club_jwt_encode(array $payload, $secret)
{
    $header = array('typ' => 'JWT', 'alg' => 'HS256');
    $h = club_b64url_encode(json_encode($header));
    $p = club_b64url_encode(json_encode($payload));
    $signing = $h . '.' . $p;
    $sig = hash_hmac('sha256', $signing, $secret, true);
    return $signing . '.' . club_b64url_encode($sig);
}

/**
 * @return array|null payload
 */
function club_jwt_decode($token, $secret)
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    $signing = $parts[0] . '.' . $parts[1];
    $sig = club_b64url_decode($parts[2]);
    if ($sig === false) {
        return null;
    }
    $expected = hash_hmac('sha256', $signing, $secret, true);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $payload = json_decode(club_b64url_decode($parts[1]), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
        return null;
    }
    return $payload;
}

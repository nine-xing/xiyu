<?php
require __DIR__ . '/security_login.php';
require __DIR__ . '/util.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    club_json_response(405, array('error' => '方法不允许'));
}

$id = bin2hex(random_bytes(16));
$iat = time();
$mac = bin2hex(club_login_challenge_sign($id, $iat));

club_json_response(200, array(
    'challenge' => array(
        'id' => $id,
        'iat' => $iat,
        'mac' => $mac,
    ),
));

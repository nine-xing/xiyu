<?php
require __DIR__ . '/config.php';
require __DIR__ . '/util.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    club_json_response(405, array('error' => '方法不允许'));
}

club_clear_auth_cookie();
club_json_response(200, array('ok' => true));

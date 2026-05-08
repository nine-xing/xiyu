<?php
require __DIR__ . '/config.php';
require __DIR__ . '/jwt.php';
require __DIR__ . '/util.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    club_json_response(405, array('error' => '方法不允许'));
}

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

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    club_json_response(400, array('error' => '未找到上传文件'));
}

$f = $_FILES['file'];
if (!isset($f['error']) || (int) $f['error'] !== UPLOAD_ERR_OK) {
    club_json_response(400, array('error' => '上传失败'));
}

$tmp = isset($f['tmp_name']) ? $f['tmp_name'] : '';
if ($tmp === '' || !is_uploaded_file($tmp)) {
    club_json_response(400, array('error' => '上传文件无效'));
}

$mime = '';
if (function_exists('finfo_open')) {
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    if ($fi) {
        $mime = (string) finfo_file($fi, $tmp);
        finfo_close($fi);
    }
}
$mime = strtolower(trim($mime));
if ($mime === '' || $mime === 'application/octet-stream') {
    $clientType = isset($f['type']) ? strtolower(trim((string) $f['type'])) : '';
    if ($clientType !== '') {
        $mime = $clientType;
    }
}

$ext = '';
$type = '';
$size = isset($f['size']) ? (int) $f['size'] : 0;

$allow = array(
    'image/jpeg' => array('ext' => 'jpg', 'type' => 'image', 'max' => CLUB_UPLOAD_MAX_IMAGE),
    'image/png' => array('ext' => 'png', 'type' => 'image', 'max' => CLUB_UPLOAD_MAX_IMAGE),
    'image/webp' => array('ext' => 'webp', 'type' => 'image', 'max' => CLUB_UPLOAD_MAX_IMAGE),
    'image/gif' => array('ext' => 'gif', 'type' => 'image', 'max' => CLUB_UPLOAD_MAX_IMAGE),
    'video/mp4' => array('ext' => 'mp4', 'type' => 'video', 'max' => CLUB_UPLOAD_MAX_VIDEO),
    'video/webm' => array('ext' => 'webm', 'type' => 'video', 'max' => CLUB_UPLOAD_MAX_VIDEO),
    'video/quicktime' => array('ext' => 'mov', 'type' => 'video', 'max' => CLUB_UPLOAD_MAX_VIDEO),
    'application/pdf' => array('ext' => 'pdf', 'type' => 'document', 'max' => CLUB_UPLOAD_MAX_DOCUMENT),
);

if (!isset($allow[$mime])) {
    $origName = isset($f['name']) ? (string) $f['name'] : '';
    $byExt = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    $mapByExt = array(
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'pdf' => 'application/pdf',
    );
    if (isset($mapByExt[$byExt])) {
        $mime = $mapByExt[$byExt];
    }
}

if (!isset($allow[$mime])) {
    club_json_response(400, array('error' => '格式不支持，仅支持 jpg/jpeg/png/webp/gif/mp4/webm/mov/pdf'));
}
$ext = $allow[$mime]['ext'];
$type = $allow[$mime]['type'];
if ($size <= 0 || $size > $allow[$mime]['max']) {
    $err = '文件过大';
    if ($type === 'image') {
        $err = '图片过大（<=10MB）';
    } elseif ($type === 'video') {
        $err = '视频过大（<=80MB）';
    } elseif ($type === 'document') {
        $err = '文档过大（<=20MB）';
    }
    club_json_response(400, array('error' => $err));
}

if (!is_dir(CLUB_UPLOAD_DIR) && !@mkdir(CLUB_UPLOAD_DIR, 0755, true)) {
    club_json_response(500, array('error' => '无法创建上传目录'));
}

$name = date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
$dest = rtrim(CLUB_UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR . $name;
if (!move_uploaded_file($tmp, $dest)) {
    club_json_response(500, array('error' => '保存上传文件失败'));
}

$base = rtrim(CLUB_UPLOAD_BASE, '/');
club_json_response(200, array(
    'type' => $type,
    'url' => $base . '/' . $name,
));

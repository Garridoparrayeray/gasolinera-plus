<?php

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($uri === '/api/shell.php') {
    http_response_code(404);
    return true;
}

if (preg_match('#^/data/[\w.-]+\.(json|bin)$#', $uri) && is_file(__DIR__ . $uri)) {
    header('Access-Control-Allow-Origin: *');
    if (str_ends_with($uri, '.json')) {
        header('Content-Type: application/json; charset=utf-8');
    } else {
        header('Content-Type: application/octet-stream');
    }
    readfile(__DIR__ . $uri);
    return true;
}

if ($uri !== '/' && is_file(__DIR__ . $uri)) {
    return false;
}

if (str_starts_with($uri, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}
if ($uri === '/' || preg_match('#^/stations/#', $uri)) {
    require __DIR__ . '/api/shell.php';
    return true;
}

http_response_code(404);
echo 'Not found';

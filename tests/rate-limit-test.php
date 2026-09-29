<?php

declare(strict_types=1);

require __DIR__ . '/../api/Core/RateLimit.php';

use Core\RateLimit;

$dir = sys_get_temp_dir() . '/gp_rl_test_' . uniqid();
mkdir($dir);
$failures = [];

$results = [];
for ($i = 0; $i < 5; $i++) {
    $results[] = RateLimit::allow('203.0.113.9', 3, 86400, $dir);
}
if ($results !== [true, true, true, false, false]) {
    $failures[] = 'el limite de 3 peticiones no se aplica: ' . json_encode($results);
}
if (!RateLimit::allow('203.0.113.10', 3, 86400, $dir)) {
    $failures[] = 'otra IP no debe verse afectada';
}
if (!RateLimit::allow('127.0.0.1', 1, 86400, $dir) || !RateLimit::allow('127.0.0.1', 1, 86400, $dir)) {
    $failures[] = 'las peticiones locales no se limitan';
}

foreach (glob($dir . '/*') as $file) {
    unlink($file);
}
rmdir($dir);

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "rate-limit: FALLA\n";
    exit(1);
}
echo "rate-limit: OK\n";

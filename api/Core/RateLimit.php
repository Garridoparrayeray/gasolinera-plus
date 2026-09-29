<?php

namespace Core;

final class RateLimit
{
    public static function clientIp(): string
    {
        foreach (['HTTP_X_VERCEL_FORWARDED_FOR', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP'] as $key) {
            if (!empty($_SERVER[$key])) {
                return trim(explode(',', (string)$_SERVER[$key])[0]);
            }
        }
        if (isset($_SERVER['REMOTE_ADDR'])) {
            return (string)$_SERVER['REMOTE_ADDR'];
        }
        return '';
    }

    public static function allow(string $ip, int $limit, int $windowSeconds, ?string $directory = null): bool
    {
        if ($ip === '' || $ip === '127.0.0.1' || $ip === '::1') {
            return true;
        }
        $dir = $directory;
        if ($dir === null) {
            $dir = sys_get_temp_dir();
        }
        $window = (int)floor(time() / $windowSeconds);
        $file = $dir . '/gp_rl_' . hash('sha256', $ip) . '_' . $window;
        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return true;
        }
        flock($handle, LOCK_EX);
        $count = (int)stream_get_contents($handle) + 1;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, (string)$count);
        flock($handle, LOCK_UN);
        fclose($handle);
        if ($count === 1) {
            self::removeOld($dir, $window);
        }
        return $count <= $limit;
    }

    private static function removeOld(string $dir, int $window): void
    {
        $paths = glob($dir . '/gp_rl_*');
        if ($paths === false) {
            return;
        }
        foreach ($paths as $path) {
            $parts = explode('_', basename($path));
            if ((int)end($parts) < $window - 1) {
                @unlink($path);
            }
        }
    }
}

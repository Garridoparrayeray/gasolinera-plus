<?php

namespace Core;

class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        if ($status >= 200 && $status < 300) {
            header('Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
        } else {
            header('Cache-Control: no-store');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(string $message, int $status = 400): void
    {
        self::json(['error' => $message], $status);
    }

    public static function internalError(\Throwable $e): void
    {
        error_log('Gasolinera+ API: ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
        self::error('Error interno del servidor', 500);
    }
}

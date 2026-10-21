<?php

namespace Core;

class Country
{
    public const DEFAULT = 'es';
    private static ?array $all = null;

    public static function all(): array
    {
        if (self::$all === null) {
            self::$all = json_decode((string)file_get_contents(__DIR__ . '/../../config/countries.json'), true);
        }
        return self::$all;
    }

    public static function code(): string
    {
        $requested = '';
        if (isset($_GET['pais']) && is_string($_GET['pais'])) {
            $requested = strtolower(trim($_GET['pais']));
        }
        if (isset(self::all()[$requested])) {
            return $requested;
        }
        return self::DEFAULT;
    }

    public static function current(): array
    {
        return self::all()[self::code()];
    }

    public static function dbPath(): string
    {
        return __DIR__ . '/../../' . self::current()['db'];
    }

    public static function hasData(): bool
    {
        return is_file(self::dbPath());
    }
}

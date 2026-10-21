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
        } elseif (isset($_SERVER['REQUEST_URI']) && preg_match('#^/(pt|fr)(/|$|\?)#', (string)$_SERVER['REQUEST_URI'], $match)) {
            $requested = $match[1];
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
        return self::dbPathFor(self::code());
    }

    public static function dbPathFor(string $code): string
    {
        return __DIR__ . '/../../' . self::all()[$code]['db'];
    }

    public static function hasData(): bool
    {
        return is_file(self::dbPath());
    }

    public static function withData(): array
    {
        $codes = [];
        foreach (array_keys(self::all()) as $code) {
            if (is_file(self::dbPathFor($code))) {
                $codes[] = $code;
            }
        }
        return $codes;
    }

    public static function prefix(string $code): string
    {
        if ($code === self::DEFAULT) {
            return '';
        }
        return '/' . $code;
    }
}

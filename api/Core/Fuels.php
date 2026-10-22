<?php

namespace Core;

class Fuels
{
    private static ?array $catalog = null;

    public static function catalog(): array
    {
        if (self::$catalog === null) {
            self::$catalog = [];
            foreach (json_decode((string)file_get_contents(__DIR__ . '/../../config/fuels.json'), true) as $fuel) {
                self::$catalog[$fuel['slug']] = $fuel;
            }
        }
        return self::$catalog;
    }

    public static function known(): array
    {
        return array_keys(self::catalog());
    }

    public static function main(): array
    {
        return Country::current()['mainFuels'];
    }

    public static function headline(): array
    {
        return Country::current()['headline'];
    }
}

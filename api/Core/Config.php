<?php

namespace Core;

class Config
{
    private static ?array $current = null;

    
    public static function current(): array
    {
        if (self::$current === null) {
            $config = require __DIR__ . '/../Config/config.php';
            $config['db_path'] = Country::dbPath();
            $config['attribution'] = 'Datos: ' . Country::current()['source'];
            $config['country'] = Country::code();
            self::$current = $config;
        }
        return self::$current;
    }
}

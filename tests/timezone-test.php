<?php

require __DIR__ . '/../api/Core/Country.php';

$failures = 0;

function expectZone(string $country, float $lat, float $lon, string $expected): void
{
    global $failures;
    $_GET['pais'] = $country;
    $actual = \Core\Country::timezoneFor($lat, $lon);
    if ($actual !== $expected) {
        $failures++;
        echo "MAL $country ($lat, $lon): esperaba $expected y salio $actual\n";
    }
}

expectZone('es', 40.4168, -3.7038, 'Europe/Madrid');
expectZone('es', 43.2630, -2.9350, 'Europe/Madrid');
expectZone('es', 28.1235, -15.4363, 'Atlantic/Canary');
expectZone('es', 28.4636, -16.2518, 'Atlantic/Canary');
expectZone('es', 39.5696, 2.6502, 'Europe/Madrid');
expectZone('pt', 38.7223, -9.1393, 'Europe/Lisbon');
expectZone('pt', 32.6669, -16.9241, 'Europe/Lisbon');
expectZone('pt', 37.7412, -25.6756, 'Atlantic/Azores');
expectZone('fr', 48.8566, 2.3522, 'Europe/Paris');

if ($failures > 0) {
    echo "timezone: $failures fallos\n";
    exit(1);
}
echo "timezone: OK\n";

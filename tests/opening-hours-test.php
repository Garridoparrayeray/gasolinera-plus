<?php

require __DIR__ . '/../api/Services/OpeningHours.php';

use Services\OpeningHours;

$failures = 0;

function at(string $isoDateTime): \DateTime
{
    return new \DateTime($isoDateTime, new \DateTimeZone('Europe/Madrid'));
}

function expectSame(string $name, mixed $expected, mixed $actual): void
{
    global $failures;
    if ($expected !== $actual) {
        $failures++;
        echo "MAL $name: esperaba " . var_export($expected, true) . ', obtuvo ' . var_export($actual, true) . "\n";
    }
}

$monday = '2026-09-28';
$friday = '2026-10-02';
$saturday = '2026-10-03';
$sunday = '2026-10-04';

expectSame('abre mañana', 'Cerrado, abre mañana a las 06:00', OpeningHours::describe('L-D: 06:00-22:00', at("$monday 23:00"))['texto']);
expectSame('abre hoy', 'Cerrado, abre a las 06:00', OpeningHours::describe('L-D: 06:00-22:00', at("$monday 05:00"))['texto']);
expectSame('abre el lunes', 'Cerrado, abre el lunes a las 07:00', OpeningHours::describe('L-V: 07:00-21:00', at("$saturday 10:00"))['texto']);
expectSame('abierto cierra', 'Abierto, cierra a las 22:00', OpeningHours::describe('L-D: 06:00-22:00', at("$monday 12:00"))['texto']);
expectSame('nocturno viernes noche', true, OpeningHours::isOpenAt('V-S: 20:00-02:00', at("$friday 23:30")));
expectSame('nocturno madrugada del sabado', true, OpeningHours::isOpenAt('V-S: 20:00-02:00', at("$saturday 01:00")));
expectSame('nocturno madrugada del domingo', true, OpeningHours::isOpenAt('V-S: 20:00-02:00', at("$sunday 01:00")));
expectSame('nocturno madrugada del viernes cerrado', false, OpeningHours::isOpenAt('V-S: 20:00-02:00', at("$friday 01:00")));
expectSame('nocturno cierra a las 02', 'Abierto, cierra a las 02:00', OpeningHours::describe('V-S: 20:00-02:00', at("$saturday 01:00"))['texto']);
expectSame('partido tarde', true, OpeningHours::isOpenAt('L-V: 08:00-14:00 Y 16:00-20:00', at("$monday 17:00")));
expectSame('partido mediodia', false, OpeningHours::isOpenAt('L-V: 08:00-14:00 Y 16:00-20:00', at("$monday 15:00")));
expectSame('24h texto', true, OpeningHours::isAlwaysOpen('L-D: 24H'));
expectSame('24h rango', true, OpeningHours::isAlwaysOpen('L-D: 00:00-24:00'));
expectSame('24h por bloques', true, OpeningHours::isAlwaysOpen('L-V: 00:00-23:59; S-D: 00:00-24:00'));
expectSame('24h solo entre semana', false, OpeningHours::isAlwaysOpen('L-V: 00:00-24:00; S: 08:00-14:00'));
expectSame('vacio', null, OpeningHours::isOpenAt('', at("$monday 12:00")));
expectSame('ilegible', 'desconocido', OpeningHours::describe('SEGÚN TEMPORADA', at("$monday 12:00"))['estado']);

if ($failures > 0) {
    echo "horarios: $failures fallos\n";
    exit(1);
}
echo "horarios: OK\n";

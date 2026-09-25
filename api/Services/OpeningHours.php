<?php

namespace Services;

class OpeningHours
{
    private const DAY_CODES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    private const DAY_NAMES = [1 => 'el lunes', 2 => 'el martes', 3 => 'el miércoles', 4 => 'el jueves', 5 => 'el viernes', 6 => 'el sábado', 7 => 'el domingo'];

    public static function isAlwaysOpen(string $horarioRaw): bool
    {
        $normalized = self::normalize($horarioRaw);
        if ($normalized === '') {
            return false;
        }
        if (str_contains($normalized, '24H') || str_contains($normalized, '24 H')) {
            return true;
        }
        $ranges = self::parseRanges($normalized);
        if ($ranges === null) {
            return false;
        }
        $fullDays = [];
        foreach ($ranges as $range) {
            if ($range['fromMinutes'] === 0 && $range['toMinutes'] >= 1439) {
                foreach ($range['days'] as $day) {
                    $fullDays[$day] = true;
                }
            }
        }
        return count($fullDays) === 7;
    }

    public static function isOpenAt(string $horarioRaw, \DateTime $when): ?bool
    {
        $normalized = self::normalize($horarioRaw);
        if ($normalized === '') {
            return null;
        }
        if (self::isAlwaysOpen($horarioRaw)) {
            return true;
        }
        $ranges = self::parseRanges($normalized);
        if ($ranges === null) {
            return null;
        }
        return self::openRangeAt($ranges, $when) !== null;
    }

    public static function describe(string $horarioRaw, \DateTime $when): array
    {
        $normalized = self::normalize($horarioRaw);
        if ($normalized === '') {
            return ['estado' => 'desconocido', 'texto' => 'Horario no disponible', 'raw' => $horarioRaw];
        }
        if (self::isAlwaysOpen($horarioRaw)) {
            return ['estado' => 'abierto', 'texto' => 'Abierto 24 horas', 'raw' => $horarioRaw];
        }
        $ranges = self::parseRanges($normalized);
        if ($ranges === null) {
            return ['estado' => 'desconocido', 'texto' => $horarioRaw, 'raw' => $horarioRaw];
        }

        $openRange = self::openRangeAt($ranges, $when);
        if ($openRange !== null) {
            return ['estado' => 'abierto', 'texto' => 'Abierto, cierra a las ' . self::formatMinutes($openRange['toMinutes']), 'raw' => $horarioRaw];
        }

        $next = self::nextOpening($ranges, $when);
        if ($next === null) {
            return ['estado' => 'cerrado', 'texto' => 'Cerrado ahora', 'raw' => $horarioRaw];
        }
        $time = self::formatMinutes($next['minutes']);
        if ($next['offset'] === 0) {
            return ['estado' => 'cerrado', 'texto' => 'Cerrado, abre a las ' . $time, 'raw' => $horarioRaw];
        }
        if ($next['offset'] === 1) {
            return ['estado' => 'cerrado', 'texto' => 'Cerrado, abre mañana a las ' . $time, 'raw' => $horarioRaw];
        }
        return ['estado' => 'cerrado', 'texto' => 'Cerrado, abre ' . self::DAY_NAMES[$next['weekday']] . ' a las ' . $time, 'raw' => $horarioRaw];
    }

    private static function normalize(string $raw): string
    {
        return mb_strtoupper(trim($raw), 'UTF-8');
    }

    private static function parseRanges(string $normalized): ?array
    {
        $ranges = [];
        foreach (explode(';', $normalized) as $block) {
            $block = trim($block);
            if ($block === '') {
                continue;
            }
            if (!preg_match('/^([LMXJVSD])(?:-([LMXJVSD]))?\s*:\s*(.+)$/', $block, $blockMatch)) {
                return null;
            }
            $toDay = $blockMatch[1];
            if ($blockMatch[2] !== '') {
                $toDay = $blockMatch[2];
            }
            $days = self::dayRange($blockMatch[1], $toDay);
            if ($days === null) {
                return null;
            }
            foreach (preg_split('/\s+Y\s+/u', trim($blockMatch[3])) as $span) {
                if (!preg_match('/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/', trim($span), $timeMatch)) {
                    return null;
                }
                $ranges[] = [
                    'days' => $days,
                    'fromMinutes' => ((int)$timeMatch[1]) * 60 + (int)$timeMatch[2],
                    'toMinutes' => ((int)$timeMatch[3]) * 60 + (int)$timeMatch[4],
                ];
            }
        }
        if (empty($ranges)) {
            return null;
        }
        return $ranges;
    }

    private static function dayRange(string $fromCode, string $toCode): ?array
    {
        $fromIdx = array_search($fromCode, self::DAY_CODES, true);
        $toIdx = array_search($toCode, self::DAY_CODES, true);
        if ($fromIdx === false || $toIdx === false) {
            return null;
        }
        $days = [];
        $i = $fromIdx;
        while (true) {
            $days[] = $i + 1;
            if ($i === $toIdx) {
                break;
            }
            $i = ($i + 1) % 7;
        }
        return $days;
    }

    private static function openRangeAt(array $ranges, \DateTime $when): ?array
    {
        $weekday = (int)$when->format('N');
        $yesterday = (($weekday + 5) % 7) + 1;
        $minutesNow = ((int)$when->format('H')) * 60 + (int)$when->format('i');

        foreach ($ranges as $range) {
            $overnight = $range['fromMinutes'] > $range['toMinutes'];
            if (in_array($weekday, $range['days'], true)) {
                if (!$overnight && $minutesNow >= $range['fromMinutes'] && $minutesNow < $range['toMinutes']) {
                    return $range;
                }
                if ($overnight && $minutesNow >= $range['fromMinutes']) {
                    return $range;
                }
            }
            if ($overnight && in_array($yesterday, $range['days'], true) && $minutesNow < $range['toMinutes']) {
                return $range;
            }
        }
        return null;
    }

    private static function nextOpening(array $ranges, \DateTime $when): ?array
    {
        $weekday = (int)$when->format('N');
        $minutesNow = ((int)$when->format('H')) * 60 + (int)$when->format('i');

        for ($offset = 0; $offset <= 7; $offset++) {
            $day = (($weekday - 1 + $offset) % 7) + 1;
            $best = null;
            foreach ($ranges as $range) {
                if (!in_array($day, $range['days'], true)) {
                    continue;
                }
                if ($offset === 0 && $range['fromMinutes'] <= $minutesNow) {
                    continue;
                }
                if ($best === null || $range['fromMinutes'] < $best) {
                    $best = $range['fromMinutes'];
                }
            }
            if ($best !== null) {
                return ['offset' => $offset, 'weekday' => $day, 'minutes' => $best];
            }
        }
        return null;
    }

    private static function formatMinutes(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60) % 24, $minutes % 60);
    }
}

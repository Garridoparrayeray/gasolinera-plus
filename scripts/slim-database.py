#!/usr/bin/env python3
"""Reduce el tamaño de una base de datos para desplegarla dentro de la función de Vercel.

El histórico de precios se guarda como tabla sin rowid con la clave (estación, carburante, fecha), que ya hace de
índice de las consultas por estación, y se descartan el índice duplicado y la tabla original. El contenido no cambia.
"""
import os
import sqlite3
import sys


def slim(path):
    before = os.path.getsize(path)
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode = DELETE')
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'price_history'").fetchone()
    if exists:
        info = db.execute("SELECT sql FROM sqlite_master WHERE name = 'price_history'").fetchone()[0]
        if 'WITHOUT ROWID' not in info:
            rows = db.execute('SELECT COUNT(*) FROM price_history').fetchone()[0]
            db.execute('DROP TABLE IF EXISTS price_history_slim')
            db.execute(
                'CREATE TABLE price_history_slim ('
                'ideess TEXT NOT NULL, fecha TEXT NOT NULL, carburante TEXT NOT NULL, precio REAL NOT NULL, '
                'PRIMARY KEY (ideess, carburante, fecha)) WITHOUT ROWID'
            )
            db.execute('INSERT INTO price_history_slim SELECT ideess, fecha, carburante, precio FROM price_history')
            copied = db.execute('SELECT COUNT(*) FROM price_history_slim').fetchone()[0]
            if copied != rows:
                raise SystemExit(f'{path}: se copiaron {copied} de {rows} filas; no se modifica la base')
            db.execute('DROP TABLE price_history')
            db.execute('ALTER TABLE price_history_slim RENAME TO price_history')
            db.execute('CREATE INDEX idx_history_zone_lookup ON price_history (fecha, carburante)')
            db.commit()
    db.execute('VACUUM')
    db.close()
    after = os.path.getsize(path)
    print(f'{path}: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB')


for target in sys.argv[1:]:
    if os.path.exists(target):
        slim(target)

"""Сверка двух баз после переноса (docs/load-readiness.md): число строк в
каждой таблице, расширения и EXCLUDE-констрейнт брони. Только чтение.

    venv/Scripts/python -m scripts.compare_dbs <old_url> <new_url>
"""

from __future__ import annotations

import asyncio
import sys

import asyncpg


async def _snapshot(url: str) -> dict:
    conn = await asyncpg.connect(url.split("?")[0], ssl="require")
    try:
        tables = [
            r["tablename"]
            for r in await conn.fetch("select tablename from pg_tables where schemaname = 'public' order by 1")
        ]
        counts = {t: await conn.fetchval(f'select count(*) from public."{t}"') for t in tables}
        extensions = sorted(r["extname"] for r in await conn.fetch("select extname from pg_extension"))
        excludes = sorted(
            r["conname"] for r in await conn.fetch("select conname from pg_constraint where contype = 'x'")
        )
        return {"counts": counts, "extensions": extensions, "excludes": excludes}
    finally:
        await conn.close()


async def main(old: str, new: str) -> int:
    a, b = await asyncio.gather(_snapshot(old), _snapshot(new))
    ok = True
    for table in sorted(set(a["counts"]) | set(b["counts"])):
        x, y = a["counts"].get(table), b["counts"].get(table)
        mark = "ok" if x == y else "DIFF"
        ok &= x == y
        print(f"{mark:4} {table:28} {x!s:>6} -> {y!s:>6}")
    for key in ("extensions", "excludes"):
        same = set(a[key]) <= set(b[key])
        ok &= same
        print(f"{'ok' if same else 'DIFF':4} {key}: {b[key]}")
    print("MATCH" if ok else "MISMATCH")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1], sys.argv[2])))

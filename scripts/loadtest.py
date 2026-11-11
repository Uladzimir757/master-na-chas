"""Нагрузочный замер публичного сценария бронирования (docs/load-readiness.md).

Каждый виртуальный пользователь по кругу проходит путь клиента до выбора
слота — без создания брони:
    /api/translations -> /api/cities -> /api/providers?city= ->
    /api/providers/{id}/services -> /api/availability (неделя)
с паузой «на чтение» между шагами. Ступени по числу пользователей, на каждой
p50/p95 и доля ошибок. Гонять НЕ на проде: локальный API против одноразовой
ветки Neon.

    venv/Scripts/python -m scripts.loadtest --base http://127.0.0.1:8010
"""

from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import time
from datetime import date, timedelta

import httpx


async def _get(client: httpx.AsyncClient, url: str, samples: list[float], errors: list[str]):
    started = time.perf_counter()
    try:
        resp = await client.get(url)
        samples.append(time.perf_counter() - started)
        if resp.status_code >= 400:
            errors.append(f"{resp.status_code} {url.split('?')[0]}")
            return None
        return resp.json()
    except Exception as exc:  # noqa: BLE001 — a load test counts every failure
        samples.append(time.perf_counter() - started)
        errors.append(f"{type(exc).__name__} {url.split('?')[0]}")
        return None


async def _user(client, base, deadline, think, samples, errors):
    today = date.today()
    while time.perf_counter() < deadline:
        await _get(client, f"{base}/api/translations?lang=pl", samples, errors)
        cities = await _get(client, f"{base}/api/cities", samples, errors) or []
        city = cities[0]["slug"] if cities else None
        await asyncio.sleep(think())
        providers = await _get(client, f"{base}/api/providers" + (f"?city={city}" if city else ""), samples, errors) or []
        if not providers:
            continue
        provider = random.choice(providers)
        await asyncio.sleep(think())
        services = await _get(client, f"{base}/api/providers/{provider['id']}/services?lang=pl", samples, errors) or []
        if not services:
            continue
        service = random.choice(services)
        await asyncio.sleep(think())
        await _get(
            client,
            f"{base}/api/availability?service_id={service['id']}&provider_id={provider['id']}"
            f"&date_from={today}&date_to={today + timedelta(days=6)}",
            samples,
            errors,
        )
        await asyncio.sleep(think())


async def _stage(base: str, users: int, seconds: float, think_s: float) -> dict:
    samples: list[float] = []
    errors: list[str] = []
    deadline = time.perf_counter() + seconds
    limits = httpx.Limits(max_connections=users, max_keepalive_connections=users)
    async with httpx.AsyncClient(timeout=30, limits=limits) as client:
        think = lambda: random.uniform(0.5 * think_s, 1.5 * think_s)  # noqa: E731
        await asyncio.gather(*(_user(client, base, deadline, think, samples, errors) for _ in range(users)))
    samples.sort()
    pct = lambda p: samples[min(len(samples) - 1, int(p * len(samples)))] * 1000 if samples else 0.0  # noqa: E731
    return {
        "users": users,
        "requests": len(samples),
        "rps": len(samples) / seconds,
        "p50": pct(0.50),
        "p95": pct(0.95),
        "max": samples[-1] * 1000 if samples else 0.0,
        "errors": len(errors),
        "error_share": len(errors) / len(samples) if samples else 0.0,
        "error_kinds": sorted(set(errors))[:5],
        "mean": statistics.fmean(samples) * 1000 if samples else 0.0,
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8010")
    ap.add_argument("--stages", default="10,30,60,100,200")
    ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--think", type=float, default=1.0, help="mean pause between steps, s")
    args = ap.parse_args()

    # прогрев: первый запрос будит API и базу, в замер не идёт
    async with httpx.AsyncClient(timeout=60) as c:
        await c.get(f"{args.base}/health")
        await c.get(f"{args.base}/api/cities")

    print("| VU | запросов | RPS | p50, мс | p95, мс | max, мс | ошибки |")
    print("|---:|---:|---:|---:|---:|---:|---:|")
    for users in (int(x) for x in args.stages.split(",")):
        r = await _stage(args.base, users, args.seconds, args.think)
        print(
            f"| {r['users']} | {r['requests']} | {r['rps']:.1f} | {r['p50']:.0f} | {r['p95']:.0f} | {r['max']:.0f} "
            f"| {r['errors']} ({r['error_share']:.1%}) |",
            flush=True,
        )
        if r["error_kinds"]:
            print(f"<!-- {users} VU errors: {', '.join(r['error_kinds'])} -->", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

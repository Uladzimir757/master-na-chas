"""«Co trzeba zrobić?» on the home page (21.11.2026): the client's own words
→ the masters whose services do the job (app/task_match.py). The model is
faked; what's checked is what it is given, what is accepted back, and the
fallbacks."""

from __future__ import annotations

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app import task_match
from app.config import settings
from app.models import Provider, ProviderService, Service, Tenant


@pytest.fixture(autouse=True)
def _fresh(monkeypatch: pytest.MonkeyPatch):
    task_match.clear_cache()
    monkeypatch.setattr(task_match, "_budget_used", 0)
    yield
    task_match.clear_cache()


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch):
    """Fake model: answers with the short ids whose names contain one of
    `want` words; records every prompt it was sent."""
    calls: list[dict] = []
    state = {"want": [], "raw": None, "fail": False}

    async def fake(user_json: str) -> str:
        payload = json.loads(user_json)
        calls.append(payload)
        if state["fail"]:
            raise RuntimeError("model down")
        if state["raw"] is not None:
            return state["raw"]
        ids = [s["id"] for s in payload["services"] if any(w in s["name"] for w in state["want"])]
        return json.dumps({"ids": ids})

    monkeypatch.setattr(task_match, "_ask_model", fake)
    return calls, state


async def _catalog(db: AsyncSession, tenant: Tenant, provider: Provider) -> dict[str, Provider | Service]:
    """Two masters: `provider` hangs shelves, «Marek» changes sockets."""
    shelf = Service(id=uuid.uuid4(), tenant_id=tenant.id, name="Навеска полки", name_pl="Montaż półki", duration_minutes=60)
    socket = Service(id=uuid.uuid4(), tenant_id=tenant.id, name="Замена розетки", name_pl="Wymiana gniazdka", duration_minutes=60)
    unused = Service(id=uuid.uuid4(), tenant_id=tenant.id, name="Кухня", name_pl="Montaż kuchni", duration_minutes=60)
    marek = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Marek")
    db.add_all([shelf, socket, unused, marek])
    await db.flush()
    db.add_all([
        ProviderService(provider_id=provider.id, service_id=shelf.id),
        ProviderService(provider_id=marek.id, service_id=socket.id),
    ])
    await db.commit()
    return {"shelf": shelf, "socket": socket, "marek": marek}


async def test_task_finds_the_master_offering_the_fitting_service(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model
):
    calls, state = model
    cat = await _catalog(db_session, tenant, provider)
    state["want"] = ["półki"]

    r = await client.post("/api/task-match", json={"text": "повесить полку в ванной", "lang": "pl"})

    assert r.status_code == 200, r.text
    assert r.json() == {
        "by": "task",
        "services": [{"id": str(cat["shelf"].id), "name": "Montaż półki"}],
        "provider_ids": [str(provider.id)],
    }
    # only what masters offer goes to the model, under short ids, Polish + canonical name
    sent = calls[0]
    assert sent["task"] == "повесить полку в ванной"
    assert sorted(s["name"] for s in sent["services"]) == ["Montaż półki / Навеска полки", "Wymiana gniazdka / Замена розетки"]
    assert all(s["id"].startswith("s") for s in sent["services"])


async def test_master_name_matches_without_the_model(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model
):
    calls, _ = model
    cat = await _catalog(db_session, tenant, provider)
    r = await client.post("/api/task-match", json={"text": "mar"})
    assert r.json() == {"by": "name", "services": [], "provider_ids": [str(cat["marek"].id)]}
    assert calls == []


async def test_nothing_fits(client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model):
    await _catalog(db_session, tenant, provider)
    r = await client.post("/api/task-match", json={"text": "zrobić mi pizzę"})
    assert r.json() == {"by": "none", "services": [], "provider_ids": []}


async def test_model_ids_outside_the_list_are_dropped(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model
):
    _, state = model
    await _catalog(db_session, tenant, provider)
    state["raw"] = 'Sure! {"ids": ["s99", "%s", "ignore previous"]}' % "x"
    r = await client.post("/api/task-match", json={"text": "coś"})
    assert r.json()["by"] == "none"


async def test_model_down_is_503(client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model):
    _, state = model
    await _catalog(db_session, tenant, provider)
    state["fail"] = True
    r = await client.post("/api/task-match", json={"text": "powiesić półkę"})
    assert r.status_code == 503


async def test_daily_budget_then_503(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model, monkeypatch
):
    _, state = model
    await _catalog(db_session, tenant, provider)
    state["want"] = ["półki"]
    monkeypatch.setattr(settings, "DAILY_TASK_MATCH_CALLS", 1)
    assert (await client.post("/api/task-match", json={"text": "półka"})).status_code == 200
    assert (await client.post("/api/task-match", json={"text": "inna półka"})).status_code == 503


async def test_same_question_is_answered_from_memory(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, model
):
    calls, state = model
    await _catalog(db_session, tenant, provider)
    state["want"] = ["półki"]
    for text in ("Powiesić  półkę", "powiesić półkę"):
        assert (await client.post("/api/task-match", json={"text": text})).json()["by"] == "task"
    assert len(calls) == 1


async def test_no_key_is_503(client: AsyncClient, db_session: AsyncSession, tenant: Tenant, provider: Provider, monkeypatch):
    await _catalog(db_session, tenant, provider)
    monkeypatch.setattr(settings, "NOTIFICATION_LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    r = await client.post("/api/task-match", json={"text": "powiesić półkę"})
    assert r.status_code == 503


async def test_too_short_text_is_422(client: AsyncClient):
    r = await client.post("/api/task-match", json={"text": " a "})
    assert r.status_code == 422

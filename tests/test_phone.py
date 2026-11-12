import pytest

from app.phone import normalize_phone


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("600111222", "+48600111222"),
        ("600 111 222", "+48600111222"),
        ("+48 600-111-222", "+48600111222"),
        ("0048600111222", "+48600111222"),
        ("+380 67 123 45 67", "+380671234567"),
        ("+49 151 23456789", "+4915123456789"),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_valid_phones_are_normalized(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["1234", "12345678", "060011122", "6001112223", "+48 1234", "+4860011122", "+1234", "abc", "+48abc111222", "+0123456789"],
)
def test_invalid_phones_are_rejected(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)


async def test_booking_with_a_bogus_phone_is_rejected(client, service, provider):
    from tests.conftest import NEXT_MONDAY  # noqa: F401
    resp = await client.post(
        "/api/bookings",
        json={
            "service_id": str(service.id),
            "provider_id": str(provider.id),
            "start_at": "2030-01-07T10:00:00+01:00",
            "client_name": "Test",
            "client_phone": "1234",
        },
    )
    assert resp.status_code == 422, resp.text

-- Карта клиента у мастера: заметки и личный чёрный список (22.11.2026).
-- Идемпотентно.
CREATE TABLE IF NOT EXISTS client_note (
    provider_id    uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    client_phone   text NOT NULL,
    note           text,
    blocked        boolean NOT NULL DEFAULT false,
    block_reason   text CHECK (block_reason IN ('no_payment', 'no_access', 'rude', 'other')),
    block_comment  text,
    blocked_at     timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_id, client_phone)
);

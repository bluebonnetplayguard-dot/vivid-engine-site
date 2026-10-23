-- Square replaces Square. Existing rows keep provider = 'square' so history stays readable; new plans are 'square'.
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'square';
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS square_customer_id text;
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS square_subscription_id text UNIQUE;
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS card_id text;
ALTER TABLE ai_subscriptions ADD COLUMN IF NOT EXISTS canceled_date timestamptz;
ALTER TABLE video_subscriptions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'square';
ALTER TABLE video_subscriptions ADD COLUMN IF NOT EXISTS square_customer_id text;
ALTER TABLE video_subscriptions ADD COLUMN IF NOT EXISTS square_subscription_id text UNIQUE;
ALTER TABLE video_subscriptions ADD COLUMN IF NOT EXISTS card_id text;
ALTER TABLE video_subscriptions ADD COLUMN IF NOT EXISTS canceled_date timestamptz;

-- One row per payment we asked Square to take (one-time purchases and invoice payments).
CREATE TABLE IF NOT EXISTS payments (
  id            text PRIMARY KEY DEFAULT new_id(),
  provider      text NOT NULL DEFAULT 'square',
  external_id   text UNIQUE,                       -- Square payment id
  kind          text NOT NULL,                     -- invoice | catalog | production
  reference     text,                              -- our invoice id or plan id
  amount_cents  int NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  status        text NOT NULL,                     -- Square status: COMPLETED, PENDING, FAILED, CANCELED
  method        text,                              -- card | afterpay | apple_pay | google_pay | cash_app_pay
  buyer_email   text,
  user_id       text,
  location_id   text,
  receipt_url   text,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_reference_idx ON payments(kind, reference);

-- Square subscription plan variations we created, so a price is only created once.
CREATE TABLE IF NOT EXISTS square_catalog (
  key           text PRIMARY KEY,                  -- kind:tier:seats:cents
  plan_id       text NOT NULL,
  variation_id  text NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now()
);

-- Webhook events already handled (Square retries; we must not apply one twice).
CREATE TABLE IF NOT EXISTS webhook_events (
  provider      text NOT NULL,
  event_id      text NOT NULL,
  type          text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Shared by every WhatsApp send lane in Roster Pages and the notification Worker.
-- Operational launch reservations do not advance the Roster business revision.
CREATE TABLE IF NOT EXISTS gsis_whatsapp_sender (
 phone_id TEXT PRIMARY KEY,
 next_at INTEGER NOT NULL DEFAULT 0,
 cooldown_until INTEGER NOT NULL DEFAULT 0,
 reservation_id TEXT
);
CREATE TABLE IF NOT EXISTS gsis_whatsapp_recipient_pacing (
 phone_id TEXT NOT NULL,
 mobile TEXT NOT NULL,
 next_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(phone_id,mobile)
);
CREATE INDEX IF NOT EXISTS gsis_whatsapp_recipient_expiry ON gsis_whatsapp_recipient_pacing(next_at);

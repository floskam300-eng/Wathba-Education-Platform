-- Migration 0010: machine-aware device-alert deduplication
--
-- Problem: device_id is a random per-browser-storage identifier. The same
-- physical computer (new browser, incognito window, cleared storage) mints a
-- fresh device_id on every attempt, and alert dedup keyed on device_id never
-- collapsed them — so one computer appeared as many "different devices" in
-- the security alerts.
--
-- Fix: store the hardware identity hash on each alert so dedup runs on the
-- MACHINE instead of the storage ID.

ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS hardware_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_device_alerts_dedup ON device_alerts(student_id, status, hardware_hash);

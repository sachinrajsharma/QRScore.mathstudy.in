-- Every student gets a short, readable QR ID built from their name (for example GQ-RIYA-4821). It is shown on their dashboard next to the QR code.
-- Idempotent like every portal migration: a duplicate column or index is skipped.
ALTER TABLE student_profiles ADD COLUMN qr_id VARCHAR(32) NULL;
CREATE UNIQUE INDEX uq_student_profiles_qr_id ON student_profiles (qr_id);

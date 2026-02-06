-- Migration to add PIN column
ALTER TABLE attendance_employees ADD COLUMN IF NOT EXISTS pin TEXT;

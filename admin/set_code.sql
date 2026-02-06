-- Manually update Daily Code to 4321
-- Assuming id 1 is the single row. If we use upsert in JS, we should ensure it matches here.
-- Our new JS uses id: 1 for upsert.
INSERT INTO attendance_settings (id, daily_code)
VALUES (1, '4321')
ON CONFLICT (id) DO UPDATE
SET daily_code = '4321', created_at = NOW();

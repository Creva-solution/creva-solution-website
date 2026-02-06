-- Attendance System Schema

-- 1. Employees Table
CREATE TABLE IF NOT EXISTS attendance_employees (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    employee_id TEXT UNIQUE NOT NULL, -- e.g. EMP001
    role TEXT,
    join_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'Active', -- Active, Inactive
    photo_url TEXT, -- Optional profile photo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Settings Table (Stores Daily Code & Retention Policy)
CREATE TABLE IF NOT EXISTS attendance_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    daily_code TEXT, -- The 4-6 digit code for today
    last_code_update DATE, -- To reset code daily if needed
    retention_days INT DEFAULT 30, -- 30, 90, 180, 3650 (Permanent)
    last_cleanup_run TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert default settings row if not exists
INSERT INTO attendance_settings (daily_code, retention_days)
SELECT '1234', 30
WHERE NOT EXISTS (SELECT 1 FROM attendance_settings);

-- 3. Attendance Logs
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES attendance_employees(id),
    employee_name TEXT, -- Cached for faster report export
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    date_logged DATE DEFAULT CURRENT_DATE,
    selfie_url TEXT, -- Path in Storage
    location_coords TEXT, -- Optional Lat/Lng
    verification_method TEXT DEFAULT 'Code+Selfie',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RPC Function to safely verify daily code without exposing it
CREATE OR REPLACE FUNCTION verify_daily_code(input_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM attendance_settings 
    WHERE daily_code = input_code
  );
END;
$$;

-- RLS Policies (Enable RLS generally first)
ALTER TABLE attendance_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Employees (Public Select for Kiosk Search, Admin All)
CREATE POLICY "Public Read Employees" ON attendance_employees FOR SELECT USING (true);
CREATE POLICY "Admin All Employees" ON attendance_employees FOR ALL USING (auth.role() = 'authenticated');

-- Policy: Logs (Public Insert for Kiosk, Admin Select/Delete)
CREATE POLICY "Public Insert Logs" ON attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin Select Logs" ON attendance_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin Delete Logs" ON attendance_logs FOR DELETE USING (auth.role() = 'authenticated');

-- Policy: Settings (Admin All, Public Read via RPC?)
-- Actually, for RPC `SECURITY DEFINER` works around RLS, so Settings table doesn't need public read.
CREATE POLICY "Admin All Settings" ON attendance_settings FOR ALL USING (auth.role() = 'authenticated');

-- Storage Bucket Policy (You must create 'attendance_proofs' bucket in dashboard)
-- Policy: Public Upload to 'attendance_proofs'
-- (This usually needs to be done in Supabase Dashboard -> Storage -> Policies)
-- "Give anon users INSERT permission to bucket 'attendance_proofs'"

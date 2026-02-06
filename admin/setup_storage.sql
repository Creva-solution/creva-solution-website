-- Create the storage bucket 'attendance_proofs'
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance_proofs', 'attendance_proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Delete" ON storage.objects;

-- Policy: Allow public access to view photos (so they show in dashboard)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'attendance_proofs' );

-- Policy: Allow authenticated users (Admin) and Anon (Kiosk) to upload
-- Note: Kiosk uses anon key, Admin uses auth. For simplicity, we allow anon uploads to this bucket.
CREATE POLICY "Allow Uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'attendance_proofs' );

-- Policy: Allow Admin to delete (for cleanup)
CREATE POLICY "Allow Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'attendance_proofs' );

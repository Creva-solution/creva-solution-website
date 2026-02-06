-- Add Face Verification columns to logs
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS match_score FLOAT, 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Verified'; -- Verified, Rejected, Manual

-- Optional: Index for faster stats if needed later
-- CREATE INDEX IF NOT EXISTS idx_logs_status ON attendance_logs(status);

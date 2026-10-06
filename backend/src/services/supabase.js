// Saves inquiries to the existing table public.contact_submissions (schema unchanged).
// Uses the PUBLIC anon key: RLS allows INSERT only, so this server cannot read, change or delete inquiries.
import { createClient } from '@supabase/supabase-js';

export const TABLE = 'contact_submissions';

export function createSupabaseService({ url, anonKey }) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    /**
     * Inserts one submission with a caller-chosen id (the browser's submission id), so retries of the same
     * submission hit the primary key instead of creating a second row.
     * @returns {Promise<{ inserted: true } | { duplicate: true }>}
     */
    async function insertSubmission({ id, name, email, mobile, service, message }) {
        // No .select(): the anon role has INSERT permission only.
        const { error } = await client.from(TABLE).insert([{ id, name, email, mobile, service, message }]);
        if (!error) return { inserted: true };
        if (error.code === '23505') return { duplicate: true };          // primary key already exists
        const err = new Error('Supabase insert failed');
        err.code = error.code;                                             // code only; details stay server-side
        err.detail = error.message;
        throw err;
    }

    return { insertSubmission };
}

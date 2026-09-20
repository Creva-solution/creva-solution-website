// Public Supabase client for read-only pages (Blog list and Blog article).
// Uses the public anon key only. What visitors can read is limited by Row Level Security in Supabase:
// they can SELECT published blog posts and nothing else (no insert / update / delete).
(function () {
    var SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';
    if (typeof supabase !== 'undefined' && !window.supabaseClient) {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
})();

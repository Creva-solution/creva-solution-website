// Supabase Configuration
// Replace these values with your actual Supabase project details
const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const SUPABASE_ANON_PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';

// Initialize the Supabase client
// This assumes the supabase-js library is loaded via script tag in HTML
if (typeof supabase !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_PUBLIC_KEY);
    console.log('Supabase initialized globally');
} else {
    console.error('Supabase library not loaded! Make sure to include the CDN link.');
}

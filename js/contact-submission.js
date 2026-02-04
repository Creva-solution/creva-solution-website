// Initialize Supabase (Use your public keys from the admin config)
// NOTE: Ideally we would export this from a shared config, but for simplicity/path issues, we redefine it.
// USER MUST REPLACE THESE VALUES
const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';

// Initialize
let supabaseContact;
if (typeof supabase !== 'undefined') {
    // Only init if script loaded
    // Check if we can get values from admin config if avail? No, cross-folder.
    // For now, we rely on the user editing this file too, or better, we fetch from a common json? 
    // Let's assume the user will paste credentials here as part of setup.
    // BUT WAIT: The user has credentials in `admin/js/config.js`. 
    // We can try to load that script if paths allow, but typically 'admin' is separate.
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[name="contact"]');
    if (!form) return;

    // Check if Supabase Lib Loaded
    if (typeof supabase === 'undefined') {
        console.error('Supabase client library not found on contact page.');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Get Values
        const name = form.querySelector('[name="name"]').value;
        const email = form.querySelector('[name="email"]').value;
        const service = form.querySelector('[name="service"]').value;
        const message = form.querySelector('[name="message"]').value;
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;

        // 2. Init Client (Lazy init to allow user to paste keys)
        // We will try to read from a global var if we can inject it, or just use placeholders
        // For this implementation, we will assume the user has pasted keys OR we try to read window.SUPABASE_URL

        let client;
        if (window.supabaseClient) {
            client = window.supabaseClient;
        } else {
            // Fallback if they didn't set up a global client
            // We'll prompt them in console or alert
            if (SUPABASE_URL.includes('your-project-id')) {
                alert('SYSTEM ERROR: Supabase keys not set in js/contact-submission.js');
                return;
            }
            client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }

        try {
            btn.disabled = true;
            btn.innerText = 'Sending...';

            const { error } = await client
                .from('contact_messages')
                .insert([{ name, email, service, message }]);

            if (error) throw error;

            alert('Message Sent Successfully!');
            form.reset();
        } catch (err) {
            console.error(err);
            alert('Failed to send message: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
});

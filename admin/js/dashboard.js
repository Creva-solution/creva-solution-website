// Dashboard Stats Logic

document.addEventListener('DOMContentLoaded', async () => {
    // Check if Supabase is available
    if (!window.supabaseClient) {
        console.error('Supabase Client not found.');
        return;
    }

    await fetchStats();
});

async function fetchStats() {
    try {
        const client = window.supabaseClient;

        // 1. Fetch Total Visits (Attendance Logs Count)
        const { count: visitsCount, error: visitsError } = await client
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true });

        if (visitsError) console.error('Error fetching visits:', visitsError);

        const visitEl = document.getElementById('stat-visits');
        if (visitEl) {
            visitEl.innerText = visitsError ? 'Err' : (visitsCount || 0);
        }

        // 2. Fetch Inquiries (contact form submissions count)
        const { count: inquiriesCount, error: inquiriesError } = await client
            .from('contact_submissions')
            .select('*', { count: 'exact', head: true });

        if (inquiriesError) console.error('Error fetching inquiries:', inquiriesError);

        const inquiryEl = document.getElementById('stat-inquiries');
        if (inquiryEl) {
            inquiryEl.innerText = inquiriesError ? 'Err' : (inquiriesCount || 0);
        }


        // 3. Blog statistics (drafts are visible to authorised admins only)
        const { data: blogRows, error: blogError } = await client.from('blog_posts').select('published');
        const setStat = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = blogError ? '--' : v; };
        const all = blogRows || [];
        setStat('stat-blogs-total', all.length);
        setStat('stat-blogs-published', all.filter(b => b.published).length);
        setStat('stat-blogs-drafts', all.filter(b => !b.published).length);
    } catch (err) {
        console.error('Data fetch error:', err);
    }
}

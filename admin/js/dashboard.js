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

        // 2. Fetch Inquiries (Contact Messages Count)
        const { count: inquiriesCount, error: inquiriesError } = await client
            .from('contact_messages')
            .select('*', { count: 'exact', head: true });

        if (inquiriesError) console.error('Error fetching inquiries:', inquiriesError);

        const inquiryEl = document.getElementById('stat-inquiries');
        if (inquiryEl) {
            inquiryEl.innerText = inquiriesError ? 'Err' : (inquiriesCount || 0);
        }

    } catch (err) {
        console.error('Data fetch error:', err);
    }
}

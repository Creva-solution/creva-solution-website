// Auth Logic

// Check session on page load
async function checkSession() {
    const client = window.supabaseClient;
    if (!client) return; // Wait for init or handle error

    const { data: { session }, error } = await client.auth.getSession();

    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/admin/');

    if (session) {
        // If logged in and on login page, redirect to dashboard
        if (isLoginPage) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // If not logged in and NOT on login page, redirect to login
        if (!isLoginPage) {
            window.location.href = 'index.html';
        }
    }
}

// Login Function
async function handleLogin(email, password) {
    const errorMsgElement = document.getElementById('error-message');
    const loginBtn = document.querySelector('button[type="submit"]');

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';
        errorMsgElement.style.display = 'none';

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // Redirect on success
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Login error:', error.message);
        errorMsgElement.textContent = error.message || 'Failed to login';
        errorMsgElement.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
}

// Logout Function
async function handleLogout() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) throw error;
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error.message);
        alert('Error logging out');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    checkSession();

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            handleLogin(email, password);
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});

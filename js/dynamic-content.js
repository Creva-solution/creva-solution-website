// dynamic-content.js
// Fetches content from Supabase for the public website

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for Supabase Client
    if (typeof supabase === 'undefined' || !window.supabaseClient) {
        console.warn('Supabase client not initialized. CMS content cannot be loaded.');
        return;
    }
    const client = window.supabaseClient;

    // 2. Load Clients (Partners)
    const clientsContainer = document.getElementById('clients-container');
    if (clientsContainer) {
        try {
            const { data: clients, error } = await client
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (clients && clients.length > 0) {
                renderClients(clients, clientsContainer);
            } else {
                clientsContainer.innerHTML = ''; // Clear loading text
            }
        } catch (err) {
            console.error('Error loading clients:', err);
            clientsContainer.innerHTML = ''; // Hide on error
        }
    }

    // 3. Load Testimonials
    const testimonialsContainer = document.getElementById('testimonials-container');
    if (testimonialsContainer) {
        try {
            const { data: testimonials, error } = await client
                .from('testimonials')
                .select('*')
                .order('created_at', { ascending: false }); // Limit? .limit(3)

            if (error) throw error;

            if (testimonials && testimonials.length > 0) {
                renderTestimonials(testimonials, testimonialsContainer);
            } else {
                testimonialsContainer.innerHTML = '<div class="col-span-3 text-center text-gray-400">No testimonials yet.</div>';
            }
        } catch (err) {
            console.error('Error loading testimonials:', err);
            testimonialsContainer.innerHTML = '';
        }
    }

    // 4. Load Services (for services.html)
    const itContainer = document.getElementById('it-services-grid');
    const civilContainer = document.getElementById('civil-services-grid');

    if (itContainer || civilContainer) {
        try {
            const { data: services, error } = await client
                .from('services')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (services && services.length > 0) {
                if (itContainer) {
                    const itServices = services.filter(s => s.category === 'IT' || s.category === 'IT Service');
                    renderServices(itServices, itContainer);
                }
                if (civilContainer) {
                    const civilServices = services.filter(s => s.category === 'Civil' || s.category === 'Civil Service');
                    renderServices(civilServices, civilContainer);
                }
            } else {
                if (itContainer) itContainer.innerHTML = '<p class="text-gray-500 col-span-3 text-center">No IT services listed.</p>';
                if (civilContainer) civilContainer.innerHTML = '<p class="text-gray-500 col-span-3 text-center">No Civil services listed.</p>';
            }

        } catch (err) {
            console.error('Error loading services:', err);
            const errorMsg = `<div class="col-span-3 text-center text-red-500 p-4 border border-red-100 rounded-lg bg-red-50"><p class="font-bold">Error loading services</p><p class="text-sm">${err.message}</p></div>`;
            if (itContainer) itContainer.innerHTML = errorMsg;
            if (civilContainer) civilContainer.innerHTML = errorMsg;
        }
    }

    // 5. Load Team Members (for about.html)
    const teamContainer = document.getElementById('team-container');
    if (teamContainer) {
        try {
            const { data: team, error } = await client.from('team_members').select('*').order('created_at', { ascending: true });
            if (error) throw error;
            if (team && team.length > 0) {
                renderTeam(team, teamContainer);
            } else {
                teamContainer.innerHTML = '<p class="text-gray-500 col-span-4 text-center">No team members listed yet.</p>';
            }
        } catch (err) {
            console.error('Error loading team:', err);
            teamContainer.innerHTML = `<div class="col-span-4 text-center text-red-500 p-4 border border-red-100 rounded-lg bg-red-50"><p class="font-bold">Error loading team</p><p class="text-sm">${err.message}</p></div>`;
        }
    }

    // 6. Dynamic Clients Page (clients.html)
    const itClientsGrid = document.getElementById('it-clients-grid');
    const civilClientsGrid = document.getElementById('civil-clients-grid');
    if (itClientsGrid || civilClientsGrid) {
        try {
            const { data: clients, error } = await client.from('clients').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            if (clients && clients.length > 0) {
                if (itClientsGrid) {
                    const itList = clients.filter(c => c.category === 'IT');
                    renderClientsGrid(itList, itClientsGrid);
                }
                if (civilClientsGrid) {
                    const civilList = clients.filter(c => c.category === 'Civil');
                    renderClientsGrid(civilList, civilClientsGrid);
                }
            } else {
                const noDataMsg = '<p class="text-gray-500 col-span-4 text-center">No clients listed.</p>';
                if (itClientsGrid) itClientsGrid.innerHTML = noDataMsg;
                if (civilClientsGrid) civilClientsGrid.innerHTML = noDataMsg;
            }
        } catch (err) {
            console.error('Error loading clients page:', err);
            const errorMsg = `<div class="col-span-4 text-center text-red-500 p-4 border border-red-100 rounded-lg bg-red-50"><p class="font-bold">Error loading clients</p><p class="text-sm">${err.message}</p></div>`;
            if (itClientsGrid) itClientsGrid.innerHTML = errorMsg;
            if (civilClientsGrid) civilClientsGrid.innerHTML = errorMsg;
        }
    }

});

function renderClients(clients, container) {
    // Render clients once for static layout
    const html = clients.map(client => {
        if (client.logo_url) {
            return `<img src="${client.logo_url}" alt="${client.name}" title="${client.name}" class="h-12 md:h-16 w-auto object-contain hover:opacity-100 transition-all opacity-80 grayscale hover:grayscale-0">`;
        } else {
            return `<span class="text-xl md:text-2xl font-bold font-heading text-gray-300 hover:text-primary transition-colors cursor-default select-none whitespace-nowrap">${client.name}</span>`;
        }
    }).join('');

    container.innerHTML = html;
}

function renderTestimonials(items, container) {
    container.innerHTML = ''; // Clear hardcoded

    // Limit to 3 items for the grid layout
    const displayItems = items.slice(0, 3);

    displayItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.setAttribute('data-aos', 'fade-up');
        div.setAttribute('data-aos-delay', (index * 100).toString());
        div.className = "h-full"; // Ensure height matches for grid

        div.innerHTML = `
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 p-8 h-full flex flex-col relative overflow-hidden">
                <!-- Soft background quote icon -->
                <i data-lucide="quote" class="text-blue-50/50 absolute -top-4 -right-4 rotate-12 w-[120px] h-[120px]" stroke-width="1"></i>

                <!-- Content with left accent line for emphasis -->
                <div class="relative z-10 flex-grow border-l-4 border-primary/20 pl-6 my-4">
                    <p class="text-gray-600 text-lg leading-relaxed">
                        ${item.quote}
                    </p>
                </div>

                <div class="flex items-center mt-8 relative z-10 pt-6 border-t border-gray-100">
                    <img src="${item.photo_url || 'https://via.placeholder.com/60'}" 
                        alt="${item.name}" 
                        class="w-14 h-14 rounded-full object-cover mr-4 shadow-sm border-2 border-white ring-1 ring-gray-100" />
                    <div>
                        <h4 class="font-bold text-dark text-lg">${item.name}</h4>
                        <p class="text-sm text-primary font-medium tracking-wide uppercase">${item.role || 'Client'}</p>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    // Re-init generic icons/animations if needed, though Lucide usually needs explicit re-run
    if (window.lucide) window.lucide.createIcons();
}

function renderServices(items, container) {
    container.innerHTML = '';
    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.setAttribute('data-aos', 'fade-up');
        div.setAttribute('data-aos-delay', (index * 100).toString());

        // Determine icon background color based on container/category context strictly for visuals if needed, 
        // but we can stick to the generic blue/orange theme used in the HTML.
        // Actually, let's detect category from item to set color:
        const isCivil = item.category.includes('Civil');
        const bgClass = isCivil ? 'bg-orange-100 text-orange-500 group-hover:bg-orange-500' : 'bg-blue-50 text-primary group-hover:bg-primary';
        const borderClass = isCivil ? 'hover:border-orange-100' : 'hover:border-blue-100';

        div.innerHTML = `
            <div class="h-full flex flex-col items-start p-8 border border-gray-100 ${borderClass} transition-colors group bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div class="w-14 h-14 rounded-xl ${bgClass} flex items-center justify-center mb-6 group-hover:text-white transition-colors duration-300">
                    <i data-lucide="${item.icon || 'star'}" class="w-7 h-7"></i>
                </div>
                <h3 class="text-xl font-bold font-heading text-dark mb-3 group-hover:text-primary transition-colors">
                    ${item.title}
                </h3>
                <p class="text-gray-600 mb-6 flex-grow leading-relaxed">${item.description}</p>
            </div>
         `;
        container.appendChild(div);
    });
    if (window.lucide) window.lucide.createIcons();
}

function renderTeam(items, container) {
    container.innerHTML = '';
    items.forEach(member => {
        const div = document.createElement('div');
        div.className = "flex flex-col items-center text-center group cursor-pointer";

        // Use addEventListener directly to avoid JSON quoting issues in HTML attributes
        div.addEventListener('click', () => {
            if (window.openTeamModal) {
                window.openTeamModal({
                    name: member.name,
                    role: member.role,
                    image: member.photo_url || 'https://via.placeholder.com/150',
                    bio: member.bio || '',
                    linkedin: member.linkedin_url || '#',
                    instagram: member.instagram_url || '#',
                    facebook: member.facebook_url || '#'
                });
            } else {
                console.error('openTeamModal function not found');
            }
        });

        div.innerHTML = `
            <div class="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden mb-6 border-4 border-white shadow-sm group-hover:border-blue-50 group-hover:shadow-md transition-all duration-300 relative">
                <div class="absolute inset-0 bg-dark/0 group-hover:bg-dark/10 transition-colors duration-300 z-10 flex items-center justify-center">
                    <span class="opacity-0 group-hover:opacity-100 text-white font-medium text-sm transition-opacity duration-300 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">View</span>
                </div>
                <img src="${member.photo_url || 'https://via.placeholder.com/150'}"
                    alt="${member.name}"
                    class="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500">
            </div>
            <h3 class="text-lg font-bold text-dark mb-1 group-hover:text-primary transition-colors">${member.name}</h3>
            <p class="text-sm text-primary font-medium uppercase tracking-wide">${member.role}</p>
        `;
        container.appendChild(div);
    });
}

function renderClientsGrid(items, container) {
    container.innerHTML = '';
    items.forEach(client => {
        // Theme based on category
        const isCivil = client.category === 'Civil';
        const hoverBorder = isCivil ? 'hover:border-orange-100' : 'hover:border-blue-100';
        const shadowColor = isCivil ? 'hover:shadow-orange-500/5' : 'hover:shadow-blue-500/5';
        const textColor = isCivil ? 'group-hover:text-orange-500' : 'group-hover:text-primary';
        const bgOverlay = isCivil ? 'bg-orange-50/50' : 'bg-blue-50/50';

        const div = document.createElement('div');
        div.className = `group bg-white border border-gray-100 ${hoverBorder} rounded-2xl p-8 flex items-center justify-center h-40 transition-all duration-300 hover:shadow-lg ${shadowColor} hover:-translate-y-1 cursor-pointer relative overflow-hidden`;

        // Use addEventListener directly
        div.addEventListener('click', () => {
            if (window.openClientModal) {
                window.openClientModal({
                    name: client.name,
                    category: client.category,
                    review: client.description || '',
                    website: client.website_url || '#',
                    logo: client.logo_url || ''
                });
            }
        });

        let content = '';
        if (client.logo_url) {
            content = `<img src="${client.logo_url}" alt="${client.name}" class="relative z-10 max-h-20 max-w-full object-contain transition-all duration-300">`;
        } else {
            content = `<span class="relative z-10 text-lg font-bold text-gray-400 ${textColor} transition-colors duration-300">${client.name}</span>`;
        }

        div.innerHTML = `
            ${content}
            <div class="absolute inset-0 ${bgOverlay} opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-95 group-hover:scale-100 rounded-2xl"></div>
        `;
        container.appendChild(div);
    });
}

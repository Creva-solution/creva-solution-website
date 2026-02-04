// CMS Logic for managing generic content

// Helper:// Helper to get client
function getClient() {
    if (!window.supabaseClient) {
        throw new Error('Supabase client not initialized. Check config.js and network.');
    }
    return window.supabaseClient;
}

// Upload Image Function (for S3 bucket)
async function uploadImage(file, folder) {
    const client = getClient();
    const timestamp = new Date().getTime();
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${timestamp}_${fileName}`;

    const { data, error } = await client.storage
        .from('site-assets')
        .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = client.storage
        .from('site-assets')
        .getPublicUrl(filePath);

    return publicUrl;
}

// Helper: Convert Image to WebP
async function convertToWebP(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                            type: "image/webp",
                        });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas to Blob failed'));
                    }
                }, 'image/webp', 0.8); // 0.8 quality
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Clients Functions
async function fetchClients() {
    const client = getClient();
    const { data, error } = await client
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function addClient(clientData, file) {
    const client = getClient();
    // 1. Convert to WebP
    const webpFile = await convertToWebP(file);

    // 2. Upload Image
    const logoUrl = await uploadImage(webpFile, 'clients');

    // 3. Insert
    // Handle legacy calls or new object calls
    const { error } = await client
        .from('clients')
        .insert([{
            name: clientData.name,
            logo_url: logoUrl,
            category: clientData.category,
            description: clientData.description,
            website_url: clientData.website
        }]);

    if (error) throw error;
}

async function deleteClient(id) {
    const client = getClient();
    const { error } = await client
        .from('clients')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Testimonials Functions
// (Add similar generic functions or specific ones as we build specific pages)

// Team Members Functions
async function fetchTeamMembers() {
    const client = getClient();
    const { data, error } = await client
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function addTeamMember(teamData, file) {
    const client = getClient();
    // 1. Convert to WebP
    const webpFile = await convertToWebP(file);

    // 2. Upload Image
    const photoUrl = await uploadImage(webpFile, 'team');

    // 3. Insert Record
    const { data, error } = await client
        .from('team_members')
        .insert([{
            ...teamData,
            photo_url: photoUrl
        }]);

    if (error) throw error;
    return data;
}

async function deleteTeamMember(id) {
    const client = getClient();
    const { error } = await client
        .from('team_members')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Services Functions
async function fetchServices() {
    const client = getClient();
    const { data, error } = await client
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function addService(serviceData) {
    const client = getClient();
    const { data, error } = await client
        .from('services')
        .insert([serviceData]);

    if (error) throw error;
    return data;
}

async function deleteService(id) {
    const client = getClient();
    const { error } = await client
        .from('services')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Testimonials Functions
async function fetchTestimonials() {
    const client = getClient();
    const { data, error } = await client
        .from('testimonials')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function addTestimonial(data, file) {
    const client = getClient();
    let photoUrl = null;
    if (file) {
        const webpFile = await convertToWebP(file);
        photoUrl = await uploadImage(webpFile, 'testimonials');
    }

    // DEBUG: Check user
    const { data: { user } } = await client.auth.getUser();
    console.log('Attempting insert as user:', user);

    const { error } = await client
        .from('testimonials')
        .insert([{ ...data, photo_url: photoUrl }]);

    if (error) throw error;
}

async function deleteTestimonial(id) {
    const client = getClient();
    const { error } = await client
        .from('testimonials')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Contact Messages Functions
async function fetchMessages() {
    const client = getClient();
    const { data, error } = await client
        .from('contact_messages')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function deleteMessage(id) {
    const client = getClient();
    const { error } = await client
        .from('contact_messages')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

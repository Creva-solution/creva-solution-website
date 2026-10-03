// Shared helpers for the public Blog list and Blog article pages.
var BLOG_SITE = 'https://crevasolution.in';

var BLOG_SERVICES = {
    'web-development': { name: 'Web Development', icon: 'monitor', url: '/it-services/web-development.html', text: 'Fast, secure, mobile-friendly websites and web applications.' },
    'mobile-app-development': { name: 'Mobile App Development', icon: 'smartphone', url: '/it-services/mobile-app-development.html', text: 'Android and iOS apps designed around your users.' },
    'ui-ux-design': { name: 'UI/UX Design', icon: 'pen-tool', url: '/it-services/ui-ux-design.html', text: 'User-centred interfaces, wireframes and prototypes.' },
    'software-development': { name: 'Software Development', icon: 'code', url: '/it-services/software-development.html', text: 'Custom business software and integrations.' },
    'digital-marketing': { name: 'Digital Marketing', icon: 'megaphone', url: '/it-services/digital-marketing.html', text: 'SEO, social media and content that brings enquiries.' },
    'branding': { name: 'Branding', icon: 'sparkles', url: '/it-services/branding.html', text: 'Logos and brand identity that build recognition.' },
    '2d-drafting': { name: '2D Drafting', icon: 'ruler', url: '/civil-services/2d-drafting.html', text: 'Floor plans, elevations, sections and working drawings.', civil: true },
    '3d-modeling': { name: '3D Modeling', icon: 'box', url: '/civil-services/3d-modeling.html', text: 'Realistic 3D models and elevation renders.', civil: true },
    'planning': { name: 'Planning / Architectural Services', icon: 'map', url: '/civil-services/planning.html', text: 'Layouts and design concepts for your plot and needs.', civil: true },
    'civil-design': { name: 'Civil Design Services', icon: 'hard-hat', url: '/civil-services/civil-design.html', text: 'Structural layouts, detailing and estimates.', civil: true }
};

// Category -> colour tone, icon and the three most relevant service pages
var BLOG_CATEGORIES = {
    'Web Development': { tone: 'it', icon: 'monitor', services: ['web-development', 'ui-ux-design', 'digital-marketing'] },
    'UI/UX Design': { tone: 'it', icon: 'pen-tool', services: ['ui-ux-design', 'web-development', 'branding'] },
    'Mobile App Development': { tone: 'it', icon: 'smartphone', services: ['mobile-app-development', 'ui-ux-design', 'software-development'] },
    'Software Development': { tone: 'it', icon: 'code', services: ['software-development', 'web-development', 'mobile-app-development'] },
    'Digital Marketing': { tone: 'mkt', icon: 'megaphone', services: ['digital-marketing', 'web-development', 'branding'] },
    'Branding': { tone: 'it', icon: 'sparkles', services: ['branding', 'digital-marketing', 'ui-ux-design'] },
    'Civil Design': { tone: 'civil', icon: 'hard-hat', services: ['civil-design', 'planning', '2d-drafting'] },
    '2D Drafting': { tone: 'civil', icon: 'ruler', services: ['2d-drafting', 'planning', '3d-modeling'] },
    '3D Modeling': { tone: 'civil', icon: 'box', services: ['3d-modeling', '2d-drafting', 'planning'] },
    'Technology': { tone: 'it', icon: 'cpu', services: ['software-development', 'web-development', 'digital-marketing'] },
    'Business': { tone: 'it', icon: 'briefcase', services: ['digital-marketing', 'web-development', 'software-development'] }
};
var BLOG_DEFAULT_CAT = { tone: 'it', icon: 'book-open', services: ['web-development', 'digital-marketing', 'software-development'] };
var BLOG_TONE_HEAD = { it: 'bg-blue-50 text-primary', civil: 'bg-orange-50 text-orange-600', mkt: 'bg-green-50 text-green-600' };
var BLOG_TONE_CHIP = { it: 'bg-blue-100 text-primary', civil: 'bg-orange-100 text-orange-600', mkt: 'bg-green-100 text-green-600' };

function blogCat(name) { return BLOG_CATEGORIES[name] || BLOG_DEFAULT_CAT; }

function blogEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Only http(s) or site-relative URLs are allowed in src/href values built from database fields.
function blogSafeUrl(u) {
    return /^(https?:\/\/|\/)/i.test(u || '') ? u : '';
}
function blogFmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function blogUrl(slug) { return '/blog/post.html?slug=' + encodeURIComponent(slug); }

// Card used on the Blog page and in "Related Articles" (same look as the existing blog cards).
function blogCardHtml(p, i) {
    var cat = blogCat(p.category);
    var img = blogSafeUrl(p.featured_image);
    var media = img
        ? '<a href="' + blogUrl(p.slug) + '" tabindex="-1" aria-hidden="true" class="block w-full h-48 overflow-hidden"><img src="' + blogEsc(img) + '" alt="' + blogEsc(p.title) + '" class="w-full h-48 object-cover" loading="lazy" decoding="async"></a>'
        : '<a href="' + blogUrl(p.slug) + '" tabindex="-1" aria-hidden="true" class="w-full h-48 ' + BLOG_TONE_HEAD[cat.tone] + ' flex items-center justify-center"><i data-lucide="' + cat.icon + '" class="w-16 h-16"></i></a>';
    var date = blogFmtDate(p.published_at);
    return '<article class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow flex flex-col">' +
        media +
        '<div class="p-6 flex flex-col flex-grow">' +
        '<div class="flex items-center text-sm text-gray-500 mb-2">' +
        (p.category ? '<span class="' + BLOG_TONE_CHIP[cat.tone] + ' px-2 py-1 rounded-full text-xs font-semibold">' + blogEsc(p.category) + '</span>' : '') +
        (p.category && date ? '<span class="mx-2">•</span>' : '') +
        (date ? '<time datetime="' + blogEsc(p.published_at) + '">' + blogEsc(date) + '</time>' : '') +
        '</div>' +
        '<h3 class="text-xl font-bold mb-3 text-dark hover:text-primary transition-colors"><a href="' + blogUrl(p.slug) + '">' + blogEsc(p.title) + '</a></h3>' +
        '<p class="text-gray-600 mb-4 line-clamp-3 flex-grow">' + blogEsc(p.excerpt || '') + '</p>' +
        '<a href="' + blogUrl(p.slug) + '" class="inline-flex items-center text-primary font-semibold hover:underline" aria-label="Read more: ' + blogEsc(p.title) + '">Read More <i data-lucide="arrow-right" class="ml-2 w-4 h-4"></i></a>' +
        '</div></article>';
}

function blogRefreshIcons() { if (window.lucide) window.lucide.createIcons(); }

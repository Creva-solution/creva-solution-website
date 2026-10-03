// Footer "Legal" links: generated from Supabase (public.legal_pages). A link appears only while the page is
// marked Visible in Admin Panel -> Legal Pages. Visitors can only read visible rows (Row Level Security),
// so a hidden page simply is not in the result. If the lookup fails, the static links stay (fail-open).
(function () {
    var URL_ = 'https://xtivwelnoccdontbrxft.supabase.co/rest/v1/legal_pages?select=slug,title&is_visible=eq.true';
    var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';
    var ORDER = ['privacy-policy', 'terms-and-conditions'];

    var list = document.querySelector('[data-legal-links]');
    if (!list) return;
    var heading = list.previousElementSibling;   // the "Legal" h4
    var first = list.querySelector('li');
    var link = first && first.querySelector('a');
    if (!link) { list.removeAttribute('data-pending'); return; }
    var prefix = link.getAttribute('href').replace(/[^\/]*$/, '');   // "" or "../"
    var template = first.cloneNode(true);

    function reveal() { list.removeAttribute('data-pending'); }

    function build(rows) {
        var bySlug = {};
        rows.forEach(function (r) { bySlug[r.slug] = r; });
        list.innerHTML = '';
        ORDER.forEach(function (slug) {
            var r = bySlug[slug];
            if (!r) return;
            var li = template.cloneNode(true);
            var a = li.querySelector('a');
            a.setAttribute('href', prefix + slug + '.html');
            // keep the "›" span, replace only the text
            Array.prototype.slice.call(a.childNodes).forEach(function (n) { if (n.nodeType === 3) a.removeChild(n); });
            a.appendChild(document.createTextNode(r.title));
            list.appendChild(li);
        });
        var any = list.children.length > 0;
        list.hidden = !any;
        if (heading) heading.hidden = !any;   // no empty "Legal" heading when both pages are hidden
        reveal();
    }

    fetch(URL_, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(build)
        .catch(reveal);
})();

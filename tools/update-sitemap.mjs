// Adds every PUBLISHED blog post to sitemap.xml (static hosting cannot generate this automatically).
// Usage (Node 18+):  node tools/update-sitemap.mjs
// Run it after publishing/unpublishing articles, then commit + push sitemap.xml.
// Uses the public anon key only (published posts are publicly readable by design).
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://xtivwelnoccdontbrxft.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0aXZ3ZWxub2NjZG9udGJyeGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDk2NjgsImV4cCI6MjA4NTc4NTY2OH0.zImQM_l1437a62HpO-lAqkWbp0KxOqz9Hg9OmqHgoXU';
const SITE = 'https://crevasolution.in';
const file = new URL('../sitemap.xml', import.meta.url);

const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=slug,updated_at,published_at&published=eq.true&order=published_at.desc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
});
if (!res.ok) { console.error('Could not read blog posts:', res.status, await res.text()); process.exit(1); }
const posts = await res.json();

let xml = readFileSync(file, 'utf8');
// drop all previous blog article entries, then add the current ones
xml = xml.replace(/\s*<url>\s*<loc>[^<]*\/blog\/post\.html\?slug=[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const entries = posts.map(p => `  <url>
    <loc>${SITE}/blog/post.html?slug=${encodeURIComponent(p.slug)}</loc>
    <lastmod>${(p.updated_at || p.published_at || new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');
xml = xml.replace('</urlset>', `${entries}\n</urlset>`);
writeFileSync(file, xml);
console.log(`sitemap.xml updated with ${posts.length} blog article(s).`);

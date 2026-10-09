// Cloudflare Pages Function — GET /api/posts
// Depuis juin 2026, l'API GraphQL de Hashnode est réservée au plan Pro.
// On lit donc le flux RSS public du blog côté serveur (pas de souci de CORS)
// et on renvoie un JSON simple à la landing page, mis en cache 1 h au bord.

const FEED_URL = 'https://lokolabs.hashnode.dev/rss.xml';
const MAX_POSTS = 6;

function decode(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function field(item, tag) {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function brief(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? text.slice(0, 177).trimEnd() + '…' : text;
}

export async function onRequestGet() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'loko-labs-landing/1.0' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    const xml = await res.text();
    if (!res.ok) throw new Error(`RSS HTTP ${res.status} : ${xml.slice(0, 200)}`);

    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const posts = items.slice(0, MAX_POSTS).map(item => {
      const categories = [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)]
        .map(m => decode(m[1]));
      return {
        title: field(item, 'title'),
        url: field(item, 'link'),
        publishedAt: field(item, 'pubDate'),
        brief: brief(field(item, 'description')),
        tags: categories.map(name => ({ name, slug: name.toLowerCase().replace(/\s+/g, '-') })),
      };
    }).filter(p => p.title && p.url);

    return Response.json({ posts }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return Response.json({ posts: [], error: String(err.message || err) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

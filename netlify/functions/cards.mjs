// Lista de todas las cartas de Riftbound.
// Se descarga de la base pública api.riftcodex.com y se guarda en caché 24 h.
import { store, checkAdmin, json } from "../lib/common.mjs";

const API = "https://api.riftcodex.com/cards";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function fetchPage(page) {
  const res = await fetch(`${API}?size=100&page=${page}&sort=collector_number&dir=1`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`riftcodex respondió ${res.status}`);
  return res.json();
}

function normalize(c) {
  const set = c.set || {};
  const cl = c.classification || {};
  const at = c.attributes || {};
  const md = c.metadata || {};
  const media = c.media || {};
  const text = c.text || {};
  const domains = Array.isArray(cl.domain) ? cl.domain : cl.domain ? [cl.domain] : [];
  return {
    id: String(c.id || c.riftbound_id || c.public_code || c.name),
    code: c.public_code || c.riftbound_id || "",
    n: c.name || "",
    s: String(set.set_id || set.id || "").toUpperCase(),
    sl: set.label || set.name || "",
    num: c.collector_number ?? null,
    r: cl.rarity || "",
    d: domains,
    t: cl.type || "",
    st: cl.supertype || "",
    e: at.energy ?? null,
    m: at.might ?? null,
    p: at.power ?? null,
    img: media.image_url || "",
    art: media.artist || "",
    txt: text.plain || "",
    alt: !!md.alternate_art,
    sig: !!md.signature,
    ov: !!md.overnumbered,
    o: c.orientation || "",
  };
}

async function downloadAll() {
  const first = await fetchPage(1);
  const pages = first.pages || Math.ceil((first.total || 0) / 100) || 1;
  let items = [...(first.items || [])];
  const rest = [];
  for (let p = 2; p <= pages; p++) rest.push(p);
  // de a 5 páginas en paralelo
  for (let i = 0; i < rest.length; i += 5) {
    const batch = await Promise.all(rest.slice(i, i + 5).map(fetchPage));
    for (const b of batch) items = items.concat(b.items || []);
  }
  const seen = new Set();
  const cards = [];
  for (const raw of items) {
    const c = normalize(raw);
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push(c);
  }
  return { updatedAt: new Date().toISOString(), count: cards.length, cards };
}

export default async (req) => {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (forceRefresh) {
    const denied = checkAdmin(req);
    if (denied) return denied;
  }

  const s = store();
  let cached = null;
  try {
    cached = await s.get("cards", { type: "json" });
  } catch {}

  const fresh = cached && Date.now() - Date.parse(cached.updatedAt) < MAX_AGE_MS;
  if (cached && fresh && !forceRefresh) {
    return json(cached, 200, { "cache-control": "public, max-age=600" });
  }

  try {
    const data = await downloadAll();
    if (data.count > 0) await s.setJSON("cards", data);
    return json(data, 200, { "cache-control": "public, max-age=600" });
  } catch (err) {
    // Si falla la descarga pero hay una copia vieja, usamos esa.
    if (cached) return json({ ...cached, stale: true }, 200);
    return json({ error: "No se pudo descargar la lista de cartas: " + err.message }, 502);
  }
};

export const config = { path: "/api/cards" };

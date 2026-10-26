// Lista de todas las cartas de Riftbound.
// GET: devuelve la copia guardada. Si no hay copia, intenta descargarla de api.riftcodex.com.
// POST (solo administrador): guarda la lista que descargó el navegador del administrador.
import { store, checkAdmin, json } from "../lib/common.mjs";

const API = "https://api.riftcodex.com/cards";

async function fetchPage(page) {
  const res = await fetch(`${API}?size=100&page=${page}&sort=collector_number&dir=1`, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; TiendaRiftbound/1.0)",
    },
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

// Revisa la lista que manda el administrador.
function cleanUpload(body) {
  if (!body || !Array.isArray(body.cards) || !body.cards.length || body.cards.length > 20000) return null;
  const S = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const N = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cards = body.cards
    .filter((c) => c && typeof c === "object" && c.id && c.n)
    .map((c) => ({
      id: S(String(c.id), 80),
      code: S(c.code, 40),
      n: S(c.n, 120),
      s: S(c.s, 12),
      sl: S(c.sl, 60),
      num: N(c.num),
      r: S(c.r, 30),
      d: Array.isArray(c.d) ? c.d.slice(0, 6).map((x) => S(x, 20)) : [],
      t: S(c.t, 30),
      st: S(c.st, 30),
      e: N(c.e),
      m: N(c.m),
      p: N(c.p),
      img: /^https:\/\//.test(c.img || "") ? S(c.img, 400) : "",
      art: S(c.art, 80),
      txt: S(c.txt, 1500),
      alt: !!c.alt,
      sig: !!c.sig,
      ov: !!c.ov,
      o: S(c.o, 20),
    }));
  if (!cards.length) return null;
  return { updatedAt: new Date().toISOString(), count: cards.length, cards };
}

export default async (req) => {
  const s = store();

  if (req.method === "POST") {
    const denied = checkAdmin(req);
    if (denied) return denied;
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Datos inválidos." }, 400);
    }
    const data = cleanUpload(body);
    if (!data) return json({ error: "La lista de cartas vino vacía o con errores." }, 400);
    await s.setJSON("cards", data);
    return json({ ok: true, count: data.count, updatedAt: data.updatedAt });
  }

  let cached = null;
  try {
    cached = await s.get("cards", { type: "json" });
  } catch {}
  if (cached && cached.cards && cached.cards.length) {
    return json(cached, 200, { "cache-control": "public, max-age=300" });
  }

  try {
    const data = await downloadAll();
    if (data.count > 0) await s.setJSON("cards", data);
    return json(data, 200, { "cache-control": "public, max-age=300" });
  } catch (err) {
    return json({ error: "No se pudo descargar la lista de cartas: " + err.message }, 502);
  }
};

export const config = { path: "/api/cards" };

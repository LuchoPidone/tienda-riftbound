// Mi carpeta: tus cartas, colección, mazos, préstamos, compras/ventas y dónde guardás cada carta en venta.
// Todo es privado: GET y POST piden la contraseña de administrador (encabezado x-admin-password).
import { store, checkAdmin, json } from "../lib/common.mjs";

const EMPTY = { people: [], decks: [], copies: [], tx: [], updatedAt: null };
const MAX_BYTES = 4 * 1024 * 1024;
const SALE_LOCS = new Set(["carpeta", "bulk", "cajonera"]);

function cleanSaleLoc(v) {
  const out = {};
  if (v && typeof v === "object") {
    for (const [id, loc] of Object.entries(v).slice(0, 5000)) {
      if (SALE_LOCS.has(loc)) out[String(id).slice(0, 80)] = loc;
    }
  }
  return out;
}

function cleanData(d) {
  if (!d || typeof d !== "object") return null;
  const arr = (x, max) => (Array.isArray(x) ? x.filter((o) => o && typeof o === "object").slice(0, max) : []);
  return {
    people: arr(d.people, 1000),
    decks: arr(d.decks, 1000),
    copies: arr(d.copies, 30000),
    tx: arr(d.tx, 30000),
    updatedAt: new Date().toISOString(),
  };
}

export default async (req) => {
  const denied = checkAdmin(req);
  if (denied) return denied;
  const s = store();

  if (req.method === "GET") {
    let data = null;
    let saleLoc = null;
    try { data = await s.get("coleccion", { type: "json" }); } catch {}
    try { saleLoc = await s.get("ubicaciones-venta", { type: "json" }); } catch {}
    return json({ data: data || EMPTY, saleLoc: saleLoc || {} }, 200, { "cache-control": "no-store" });
  }

  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json({ error: "Demasiados datos para guardar de una vez." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Datos inválidos." }, 400); }
    const out = { ok: true };
    if (body.data) {
      const data = cleanData(body.data);
      if (!data) return json({ error: "Datos inválidos." }, 400);
      await s.setJSON("coleccion", data);
      out.updatedAt = data.updatedAt;
    }
    if (body.saleLoc) {
      await s.setJSON("ubicaciones-venta", cleanSaleLoc(body.saleLoc));
    }
    return json(out);
  }

  return json({ error: "Método no permitido." }, 405);
};

export const config = { path: "/api/coleccion" };

// Stock, precios y configuración de la tienda.
// GET: público (lo usa la tienda). POST: solo administrador (encabezado x-admin-password).
import { store, checkAdmin, json } from "../lib/common.mjs";

const DEFAULT = {
  settings: {
    storeName: "Mi Tienda Riftbound",
    whatsapp: "",
    currency: "$",
    note: "",
    rarityPrices: {},
  },
  items: {},
  updatedAt: null,
};

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function price(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
}

function clean(body) {
  const s = body.settings || {};
  const rp = {};
  if (s.rarityPrices && typeof s.rarityPrices === "object") {
    for (const [k, v] of Object.entries(s.rarityPrices).slice(0, 30)) {
      const p = price(v);
      if (p !== null) rp[str(k, 40)] = p;
    }
  }
  const items = {};
  if (body.items && typeof body.items === "object") {
    for (const [id, it] of Object.entries(body.items).slice(0, 5000)) {
      if (!it || typeof it !== "object") continue;
      const q = Math.max(0, Math.min(9999, Math.floor(Number(it.q) || 0)));
      const p = price(it.p);
      // qc / pc: stock y precio de las cartas en chino.
      const qc = Math.max(0, Math.min(9999, Math.floor(Number(it.qc) || 0)));
      const pc = price(it.pc);
      if (q === 0 && p === null && qc === 0 && pc === null) continue;
      const out = { q, p };
      if (qc) out.qc = qc;
      if (pc !== null) out.pc = pc;
      items[str(id, 80)] = out;
    }
  }
  return {
    settings: {
      storeName: str(s.storeName, 80) || DEFAULT.settings.storeName,
      whatsapp: str(s.whatsapp, 20).replace(/\D/g, ""),
      currency: str(s.currency, 6) || "$",
      note: str(s.note, 300),
      rarityPrices: rp,
    },
    items,
    updatedAt: new Date().toISOString(),
  };
}

export default async (req) => {
  const s = store();

  if (req.method === "GET") {
    let data = null;
    try {
      data = await s.get("inventory", { type: "json" });
    } catch {}
    return json(data || DEFAULT, 200, { "cache-control": "no-store" });
  }

  if (req.method === "POST") {
    const denied = checkAdmin(req);
    if (denied) return denied;
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Datos inválidos." }, 400);
    }
    if (body && body.check) return json({ ok: true });
    const data = clean(body || {});
    await s.setJSON("inventory", data);
    return json({ ok: true, updatedAt: data.updatedAt });
  }

  return json({ error: "Método no permitido." }, 405);
};

export const config = { path: "/api/inventory" };

import { getStore } from "@netlify/blobs";

export const STORE_NAME = "tienda-riftbound";

export function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export function adminPassword() {
  try {
    if (globalThis.Netlify?.env?.get) {
      const v = globalThis.Netlify.env.get("ADMIN_PASSWORD");
      if (v) return v;
    }
  } catch {}
  return process.env.ADMIN_PASSWORD || "";
}

// Devuelve null si está todo bien, o una Response de error.
export function checkAdmin(req) {
  const expected = adminPassword();
  if (!expected) {
    return json({ error: "Falta configurar ADMIN_PASSWORD en Netlify." }, 500);
  }
  const given = req.headers.get("x-admin-password") || "";
  if (!safeEqual(given, expected)) {
    return json({ error: "Contraseña incorrecta." }, 401);
  }
  return null;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

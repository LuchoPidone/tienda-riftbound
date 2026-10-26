// Funciones compartidas por la tienda y el panel de administrador.
window.RB = (() => {
  const DOMAIN_COLORS = {
    Fury: "#e5484d",
    Calm: "#3fb27f",
    Mind: "#3e8bff",
    Body: "#f08a24",
    Chaos: "#a855f7",
    Order: "#e8c547",
    Colorless: "#9aa4b2",
  };
  const DOMAIN_ES = {
    Fury: "Furia",
    Calm: "Calma",
    Mind: "Mente",
    Body: "Cuerpo",
    Chaos: "Caos",
    Order: "Orden",
    Colorless: "Incoloro",
  };
  const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Showcase", "Promo"];
  const RARITY_ES = {
    Common: "Común",
    Uncommon: "Poco común",
    Rare: "Rara",
    Epic: "Épica",
    Showcase: "Showcase",
    Promo: "Promo",
  };
  const TYPE_ES = {
    Unit: "Unidad",
    Spell: "Hechizo",
    Gear: "Equipo",
    Legend: "Leyenda",
    Battlefield: "Campo de batalla",
    Rune: "Runa",
    Token: "Ficha",
  };

  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
    return data;
  }

  // ---------- Lista de cartas ----------
  const API = "https://api.riftcodex.com/cards";
  const DAY = 24 * 60 * 60 * 1000;

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

  // Descarga todas las cartas desde el navegador del visitante.
  async function fetchFromBrowser(onProgress) {
    const page = async (n) => {
      const res = await fetch(`${API}?size=100&page=${n}&sort=collector_number&dir=1`);
      if (!res.ok) throw new Error("riftcodex respondió " + res.status);
      return res.json();
    };
    const first = await page(1);
    const pages = first.pages || Math.ceil((first.total || 0) / 100) || 1;
    let items = [...(first.items || [])];
    onProgress && onProgress(1, pages);
    for (let p = 2; p <= pages; p += 4) {
      const nums = [];
      for (let k = p; k < p + 4 && k <= pages; k++) nums.push(k);
      const res = await Promise.all(nums.map(page));
      res.forEach((r) => (items = items.concat(r.items || [])));
      onProgress && onProgress(nums[nums.length - 1], pages);
    }
    const seen = new Set();
    const cards = [];
    for (const raw of items) {
      const c = normalize(raw);
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cards.push(c);
    }
    if (!cards.length) throw new Error("la lista vino vacía");
    return { updatedAt: new Date().toISOString(), count: cards.length, cards };
  }

  // opts: { password, refresh, onProgress }
  // Con password (administrador) actualiza la copia guardada en el servidor si falta o es vieja.
  async function loadCards(opts = {}) {
    let server = null;
    if (!opts.refresh) {
      try {
        server = await getJSON("/api/cards");
      } catch {}
    }
    const has = server && server.cards && server.cards.length;
    const old = has && Date.now() - Date.parse(server.updatedAt) > DAY;
    if (has && !(opts.password && old)) return server;
    if (!opts.password && has) return server;
    try {
      const data = await fetchFromBrowser(opts.onProgress);
      if (opts.password) {
        try {
          await getJSON("/api/cards", {
            method: "POST",
            headers: { "content-type": "application/json", "x-admin-password": opts.password },
            body: JSON.stringify(data),
          });
          data.saved = true;
        } catch (e) {
          data.saveError = e.message;
        }
      }
      return data;
    } catch (e) {
      if (has) return server;
      throw new Error("No se pudo descargar la lista de cartas (" + e.message + ")");
    }
  }
  const loadInventory = () => getJSON("/api/inventory", { cache: "no-store" });

  function rarityRank(r) {
    const i = RARITY_ORDER.indexOf(r);
    return i === -1 ? 99 : i;
  }

  function effectivePrice(card, inv) {
    const it = inv.items[card.id];
    if (it && it.p !== null && it.p !== undefined) return it.p;
    const rp = inv.settings.rarityPrices || {};
    const v = rp[card.r];
    return v === undefined || v === null ? null : v;
  }

  function stock(card, inv) {
    const it = inv.items[card.id];
    return it ? it.q || 0 : 0;
  }

  function money(n, inv) {
    if (n === null || n === undefined) return "Consultar";
    const cur = (inv && inv.settings.currency) || "$";
    return cur + " " + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }

  function variantLabel(c) {
    const v = [];
    if (c.alt) v.push("Arte alternativo");
    if (c.sig) v.push("Firma");
    if (c.ov) v.push("Sobrenumerada");
    return v;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  }

  function cleanText(t) {
    return String(t || "")
      .replace(/:rb_energy_(\d+):/gi, "[$1]")
      .replace(/:rb_([a-z_]+):/gi, (_, w) => "[" + w.replace(/_/g, " ") + "]");
  }

  function dom(c) {
    return (c.d && c.d.length ? c.d : ["Colorless"]);
  }

  function uniqueSorted(cards, fn, sorter) {
    const m = new Map();
    for (const c of cards) {
      const vals = [].concat(fn(c));
      for (const v of vals) if (v !== "" && v !== null && v !== undefined) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.keys()].sort(sorter || ((a, b) => String(a).localeCompare(String(b))));
  }

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  return {
    DOMAIN_COLORS, DOMAIN_ES, RARITY_ES, TYPE_ES, loadCards, loadInventory, getJSON,
    rarityRank, effectivePrice, stock, money, variantLabel, esc, cleanText, dom, uniqueSorted, store,
  };
})();

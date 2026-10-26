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

  const loadCards = (refresh, password) =>
    getJSON("/api/cards" + (refresh ? "?refresh=1" : ""), {
      headers: password ? { "x-admin-password": password } : {},
    });
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

// Mi carpeta: dónde está cada carta, mis cartas, colección, mazos, préstamos y compras/ventas. (v4)
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => RB.esc(s);
  const DAY = 24 * 60 * 60 * 1000;
  const LATE_DAYS = 30;
  const PAGE = 60;
  // Link al lector de fotos en Claude.
  const PHOTO_URL = "https://claude.ai/artifact/LKNSmgC9wk9rEUs4qVHGzn";

  const SALE = {
    carpeta: { i: "📁", l: "Carpeta de ventas" },
    bulk: { i: "📦", l: "Caja de bulk" },
    cajonera: { i: "🗄️", l: "Cajonera" },
  };
  const SET_PREF = ["OGN", "SFD", "UNL", "VEN", "RAD", "OGS", "PR", "OPP", "JDG"];
  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  let pw = "";
  let cards = [];
  let byId = new Map();
  let inv = { settings: { currency: "$", rarityPrices: {} }, items: {} };
  let D = { people: [], decks: [], copies: [], tx: [] };
  let saleLoc = {};

  let tab = "todo";
  const view = { deck: null, person: null, year: new Date().getFullYear(), txType: "" };
  let list = [];
  let shown = 0;
  let sortBy = "name";

  const f = {
    q: "", locs: new Set(), langs: new Set(), sets: new Set(), doms: new Set(), types: new Set(), rars: new Set(), vars: new Set(),
    eMin: null, eMax: null, pMin: null, pMax: null,
  };

  // ---------- Utilidades ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysSince(s) {
    if (!s) return 0;
    const [y, m, d] = s.split("-").map(Number);
    return Math.max(0, Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / DAY));
  }
  function fdate(s) {
    if (!s) return "";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }
  const money = (n) => RB.money(n, inv);
  const nc = (n) => `${n} ${n === 1 ? "carta" : "cartas"}`;
  const person = (id) => D.people.find((p) => p.id === id);
  const deck = (id) => D.decks.find((d) => d.id === id);
  const pname = (id) => (person(id) || {}).name || "?";
  const dname = (id) => (deck(id) || {}).name || "?";
  const stockOf = (id) => { const it = (inv.items || {})[id] || {}; return (it.q || 0) + (it.qc || 0); };
  // Idioma de cada copia física: inglés (por defecto) o chino.
  const lg = (x) => (x && x.l === "cn" ? "cn" : "en");
  const CN = "🇨🇳 Chino";
  const isLate = (cp) => cp.loc === "loan" && daysSince(cp.ls) > LATE_DAYS;

  function cardMeta(c) {
    const v = RB.variantLabel(c);
    return `${c.sl || c.s}${c.num !== null ? " #" + c.num : ""} · ${RB.RARITY_ES[c.r] || c.r}${v.length ? " · " + v.join(", ") : ""}`;
  }

  // ---------- Servidor ----------
  function api(method, body) {
    return RB.getJSON("/api/coleccion", {
      method,
      cache: "no-store",
      headers: { "content-type": "application/json", "x-admin-password": pw },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  let saveT;
  let saving = Promise.resolve();
  function save() {
    setState("Guardando…");
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      saving = saving.then(async () => {
        try {
          await api("POST", { data: D });
          setState("Guardado ✓");
        } catch (e) {
          setState("No se pudo guardar: " + e.message + " · tocá para reintentar", true);
        }
      });
    }, 350);
  }
  async function saveSaleLoc() {
    try {
      await api("POST", { saleLoc });
    } catch (e) {
      toast("No se pudo guardar la ubicación: " + e.message);
    }
  }
  // Cambia el stock de la tienda partiendo de la versión más nueva del servidor.
  async function changeStock(fn) {
    const fresh = await RB.loadInventory();
    fresh.items = fresh.items || {};
    const res = fn(fresh.items);
    await RB.getJSON("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ settings: fresh.settings, items: fresh.items }),
    });
    inv = fresh;
    return res;
  }
  function setState(t, bad) {
    const el = $("saveState");
    el.textContent = t;
    el.classList.toggle("bad", !!bad);
  }
  $("saveState").addEventListener("click", () => {
    if ($("saveState").classList.contains("bad")) save();
  });

  // ---------- Entrar ----------
  function getPw() {
    try { return sessionStorage.getItem("rb-admin") || ""; } catch { return ""; }
  }
  function setPw(v) {
    try { v ? sessionStorage.setItem("rb-admin", v) : sessionStorage.removeItem("rb-admin"); } catch {}
  }
  async function check(p) {
    await RB.getJSON("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": p },
      body: JSON.stringify({ check: true }),
    });
  }
  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginErr").textContent = "";
    try {
      await check($("pw").value);
      pw = $("pw").value;
      setPw(pw);
      start();
    } catch (err) {
      $("loginErr").textContent = err.message;
    }
  });
  $("logout").addEventListener("click", () => {
    setPw("");
    location.reload();
  });

  async function start() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("logout").hidden = false;
    $("searchBox").hidden = false;
    try {
      const [c, i, col] = await Promise.all([RB.loadCards(), RB.loadInventory(), api("GET")]);
      cards = c.cards || [];
      byId = new Map(cards.map((x) => [x.id, x]));
      inv = i;
      inv.items = inv.items || {};
      D = Object.assign({ people: [], decks: [], copies: [], tx: [] }, col.data || {});
      saleLoc = col.saleLoc || {};
    } catch (e) {
      $("main").innerHTML = `<div class="empty">No se pudieron cargar los datos: ${esc(e.message)}</div>`;
      return;
    }
    buildIndex();
    buildFilters();
    // Las que solo existen en foil no llevan la marca aparte.
    let fixed = 0;
    for (const cp of D.copies) if (cp.f && foilOnly(byId.get(cp.c))) { delete cp.f; fixed++; }
    if (fixed) save();
    const h = location.hash.slice(1);
    if (["todo", "mine", "col", "decks", "loans", "tx"].includes(h)) tab = h;
    render();
  }

  // ---------- Filtros (los mismos de la tienda + dónde está) ----------
  function checkList(el, values, setRef, labelFn, countFn) {
    el.innerHTML = values
      .map((v) => `<label class="check"><input type="checkbox" value="${esc(v)}"> ${esc(labelFn(v))}${countFn ? `<span class="cnt">${countFn(v)}</span>` : ""}</label>`)
      .join("");
    el.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("change", () => {
        inp.checked ? setRef.add(inp.value) : setRef.delete(inp.value);
        renderMain();
      })
    );
  }
  function buildFilters() {
    const locs = { home: "🏠 En casa", deck: "🃏 En un mazo", loan: "🤝 Prestada", late: "⚠️ Prestada hace +1 mes", bor: "🫴 Me la prestaron", sale: "🏷️ En venta en la tienda" };
    checkList($("fLocs"), Object.keys(locs), f.locs, (v) => locs[v]);

    const setLabels = new Map(cards.map((c) => [c.s, c.sl || c.s]));
    const sets = RB.uniqueSorted(cards, (c) => c.s, (a, b) => setLabels.get(a).localeCompare(setLabels.get(b)));
    checkList($("fSets"), sets, f.sets, (v) => setLabels.get(v));

    const doms = RB.uniqueSorted(cards, (c) => RB.dom(c));
    $("fDoms").innerHTML = doms
      .map((d) => `<button class="chip" aria-pressed="false" data-v="${esc(d)}"><span class="dot" style="background:${RB.DOMAIN_COLORS[d] || "#888"}"></span>${esc(RB.DOMAIN_ES[d] || d)}</button>`)
      .join("");
    $("fDoms").querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.v;
        f.doms.has(v) ? f.doms.delete(v) : f.doms.add(v);
        b.setAttribute("aria-pressed", f.doms.has(v));
        renderMain();
      })
    );
    checkList($("fTypes"), RB.uniqueSorted(cards, (c) => c.t), f.types, (v) => RB.TYPE_ES[v] || v);
    checkList($("fRars"), RB.uniqueSorted(cards, (c) => c.r, (a, b) => RB.rarityRank(a) - RB.rarityRank(b)), f.rars, (v) => RB.RARITY_ES[v] || v);
    const vlab = { normal: "Normal", alt: "Arte alternativo", sig: "Firma", ov: "Sobrenumerada" };
    checkList($("fVars"), ["normal", "alt", "sig", "ov"], f.vars, (v) => vlab[v]);
    checkList($("fLangs"), ["en", "cn"], f.langs, (v) => RB.LANGS[v]);
  }
  const num = (v) => (v === "" || v === null || isNaN(Number(v)) ? null : Number(v));

  function cardMatches(c) {
    if (!c) return false;
    if (f.q) {
      const hay = norm(c.n + " " + c.txt + " " + c.st + " " + c.code + " " + (c.sl || ""));
      if (!norm(f.q).split(" ").every((w) => hay.includes(w))) return false;
    }
    if (f.sets.size && !f.sets.has(c.s)) return false;
    if (f.doms.size && !RB.dom(c).some((d) => f.doms.has(d))) return false;
    if (f.types.size && !f.types.has(c.t)) return false;
    if (f.rars.size && !f.rars.has(c.r)) return false;
    if (f.vars.size) {
      const ok = (f.vars.has("normal") && !c.alt && !c.sig && !c.ov) || (f.vars.has("alt") && c.alt) || (f.vars.has("sig") && c.sig) || (f.vars.has("ov") && c.ov);
      if (!ok) return false;
    }
    if (f.eMin !== null && (c.e === null || c.e < f.eMin)) return false;
    if (f.eMax !== null && (c.e === null || c.e > f.eMax)) return false;
    if (f.pMin !== null || f.pMax !== null) {
      const p = RB.effectivePrice(c, inv);
      if (p === null) return false;
      if (f.pMin !== null && p < f.pMin) return false;
      if (f.pMax !== null && p > f.pMax) return false;
    }
    return true;
  }
  function locMatches(g) {
    if (!f.locs.size) return true;
    for (const cp of g.copies) {
      if (f.locs.has("home") && cp.loc === "home" && cp.k !== "bor") return true;
      if (f.locs.has("deck") && cp.loc === "deck") return true;
      if (f.locs.has("loan") && cp.loc === "loan") return true;
      if (f.locs.has("late") && isLate(cp)) return true;
      if (f.locs.has("bor") && cp.k === "bor") return true;
    }
    if (f.locs.has("sale") && g.stock > 0) return true;
    return false;
  }
  function langMatches(g) {
    if (!f.langs.size) return true;
    if (g.copies.some((cp) => f.langs.has(lg(cp)))) return true;
    return [...f.langs].some((l) => RB.stock(g.c, inv, l) > 0 && tab === "todo");
  }

  $("clear").addEventListener("click", () => {
    ["locs", "langs", "sets", "doms", "types", "rars", "vars"].forEach((k) => f[k].clear());
    ["eMin", "eMax", "pMin", "pMax"].forEach((k) => { f[k] = null; $(k).value = ""; });
    f.q = "";
    $("q").value = "";
    document.querySelectorAll("#side input[type=checkbox]").forEach((i) => (i.checked = false));
    document.querySelectorAll("#fDoms .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
    renderMain();
  });
  ["eMin", "eMax", "pMin", "pMax"].forEach((k) =>
    $(k).addEventListener("input", (e) => { f[k] = num(e.target.value); renderMain(); })
  );
  let qt;
  $("q").addEventListener("input", (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => {
      f.q = e.target.value.trim();
      if (f.q && (tab === "decks" && !view.deck)) tab = "todo";
      render();
    }, 180);
  });

  // ---------- Pestañas ----------
  function render() {
    document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
    renderAlert();
    renderMain();
  }
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    view.deck = null;
    view.person = null;
    render();
    window.scrollTo({ top: 0 });
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h && h !== tab && ["todo", "mine", "col", "decks", "loans", "tx"].includes(h)) {
      tab = h;
      render();
    }
  });

  function renderAlert() {
    const late = new Map();
    for (const cp of D.copies) if (isLate(cp)) {
      const a = late.get(cp.to) || { n: 0, d: 0 };
      a.n++;
      a.d = Math.max(a.d, daysSince(cp.ls));
      late.set(cp.to, a);
    }
    const total = [...late.values()].reduce((s, a) => s + a.n, 0);
    $("loanBadge").hidden = !total;
    $("loanBadge").textContent = total;
    if (!late.size) { $("alert").hidden = true; return; }
    $("alert").hidden = false;
    $("alert").innerHTML =
      "⚠️ Hace más de un mes que te deben cartas: " +
      [...late].map(([pid, a]) => `<b>${esc(pname(pid))}</b> (${a.n} ${a.n === 1 ? "carta" : "cartas"}, ${a.d} días)`).join(" · ");
  }
  $("alert").addEventListener("click", () => {
    tab = "loans";
    view.person = null;
    render();
  });

  function setLayout(filters) {
    document.querySelector(".layout").classList.toggle("nofilters", !filters);
    $("openFilters").hidden = !filters;
  }

  function renderMain() {
    if (tab === "decks" && !view.deck) return renderDecks();
    if (tab === "decks" && view.deck) return renderDeck();
    if (tab === "loans") return renderLoans();
    if (tab === "tx") return renderTx();
    return renderCards();
  }

  // ---------- Grillas de cartas ----------
  function groups(pred) {
    const m = new Map();
    for (const cp of D.copies) {
      if (!pred(cp)) continue;
      let g = m.get(cp.c);
      if (!g) m.set(cp.c, (g = { c: byId.get(cp.c), id: cp.c, copies: [], stock: stockOf(cp.c) }));
      g.copies.push(cp);
    }
    return m;
  }

  function renderCards() {
    setLayout(true);
    let head = "";
    let m;
    if (tab === "mine") {
      m = groups((cp) => cp.k === "mine");
      head = `<div class="sechead"><h2>Mis cartas</h2><button class="btn" data-act="add" data-dest="mine">＋ Cargar a Mis cartas</button></div>`;
    } else if (tab === "col") {
      m = groups((cp) => cp.k === "col");
      head = `<div class="sechead"><h2>Mi colección</h2><button class="btn" data-act="add" data-dest="col">＋ Cargar a Mi colección</button></div>`;
    } else if (tab === "decks" && view.deck) {
      const d = deck(view.deck);
      if (!d) { view.deck = null; return renderDecks(); }
      m = groups((cp) => cp.loc === "deck" && cp.deck === d.id);
      const n = D.copies.filter((cp) => cp.loc === "deck" && cp.deck === d.id).length;
      head = `<div class="sechead">
        <button class="btn back" data-back>← Mazos</button>
        <h2>🃏 ${esc(d.name)} <span class="note">· ${nc(n)}</span></h2>
        <button class="btn" data-act="add" data-dest="deck" data-deck="${esc(d.id)}">＋ Cargar lista al mazo</button>
        <button class="btn ghost" data-deckren="${esc(d.id)}">Renombrar</button>
        <button class="btn ghost" data-deckdel="${esc(d.id)}">Desarmar mazo</button>
      </div>`;
    } else {
      m = groups(() => true);
      for (const [id, it] of Object.entries(inv.items || {})) {
        if (stockOf(id) > 0 && !m.has(id) && byId.has(id)) m.set(id, { c: byId.get(id), id, copies: [], stock: stockOf(id) });
      }
      head = `<div class="sechead"><h2>📍 Dónde está cada carta</h2></div>`;
    }
    list = [...m.values()].filter((g) => cardMatches(g.c) && locMatches(g) && langMatches(g));
    const byNum = (a, b) => a.c.s.localeCompare(b.c.s) || (a.c.num ?? 0) - (b.c.num ?? 0) || a.c.n.localeCompare(b.c.n);
    const cnt = (g) => g.copies.length + (tab === "todo" ? g.stock : 0);
    const sorters = {
      name: (a, b) => a.c.n.localeCompare(b.c.n) || byNum(a, b),
      num: byNum,
      count: (a, b) => cnt(b) - cnt(a) || a.c.n.localeCompare(b.c.n),
      recent: (a, b) => Math.max(...b.copies.map((x) => x.added || 0), 0) - Math.max(...a.copies.map((x) => x.added || 0), 0),
    };
    list.sort(sorters[sortBy] || sorters.name);
    const units = list.reduce((s, g) => s + cnt(g), 0);
    $("main").innerHTML = `${head}
      <div class="toolbar">
        <span class="count">${list.length.toLocaleString("es-AR")} ${list.length === 1 ? "carta" : "cartas distintas"} · ${units} ${units === 1 ? "copia" : "copias"}</span>
        <select class="field" id="sort" aria-label="Ordenar">
          <option value="name">Nombre (A-Z)</option>
          <option value="num">Número de colección</option>
          <option value="count">Más copias</option>
          <option value="recent">Cargadas hace poco</option>
        </select>
      </div>
      <div class="grid" id="grid"></div>
      <div class="more" id="more"></div>`;
    $("sort").value = sortBy;
    $("sort").onchange = (e) => { sortBy = e.target.value; renderMain(); };
    shown = 0;
    if (!list.length) {
      const empty = m.size
        ? "No hay cartas con esos filtros."
        : tab === "todo" ? "Todavía no cargaste cartas. Tocá «＋ Cargar cartas» para empezar." : "Esta sección está vacía.";
      $("grid").innerHTML = `<div class="empty" style="grid-column:1/-1">${empty}</div>`;
    }
    more();
  }

  function locChips(g, showStock) {
    const m = new Map();
    const add = (key, cls, label) => {
      const x = m.get(key) || { cls, label, n: 0 };
      x.n++;
      m.set(key, x);
    };
    for (const cp of g.copies) {
      const col = (cp.k === "col" ? " · Col." : "") + (cp.f ? " ✨" : "") + (lg(cp) === "cn" ? " · CN" : "");
      if (cp.k === "bor") {
        const where = cp.loc === "deck" ? ` · 🃏 ${dname(cp.deck)}` : "";
        add("b" + cp.from + cp.loc + cp.deck + !!cp.f + lg(cp), "bor", `🫴 De ${pname(cp.from)}${where}${cp.f ? " ✨" : ""}${lg(cp) === "cn" ? " · CN" : ""}`);
      } else if (cp.loc === "home") add("h" + cp.k + !!cp.f + lg(cp), "home", "🏠 En casa" + col);
      else if (cp.loc === "deck") add("d" + cp.deck + cp.k + !!cp.f + lg(cp), "deck", `🃏 ${dname(cp.deck)}${col}`);
      else if (cp.loc === "loan") add("l" + cp.to + isLate(cp) + !!cp.f + lg(cp), isLate(cp) ? "late" : "loan", `${isLate(cp) ? "⚠️" : "🤝"} ${pname(cp.to)}${cp.f ? " ✨" : ""}${lg(cp) === "cn" ? " · CN" : ""}`);
    }
    let html = [...m.values()].map((x) => `<span class="loc ${x.cls}">${esc(x.label)}${x.n > 1 ? " ×" + x.n : ""}</span>`).join("");
    if (showStock && g.stock > 0) {
      const sl = SALE[saleLoc[g.id]];
      const it = inv.items[g.id] || {};
      const split = it.qc ? ` (${it.q ? it.q + " EN · " : ""}${it.qc} CN)` : "";
      html += `<span class="loc sale">🏷️ En venta ×${g.stock}${split}${sl ? " · " + sl.i + " " + sl.l : ""}</span>`;
    }
    return html;
  }

  function tile(g) {
    const c = g.c;
    const land = c.o === "landscape" || c.t === "Battlefield";
    const n = g.copies.length + (tab === "todo" ? g.stock : 0);
    return `<article class="tile">
      <button class="pic ${land ? "land" : ""}" data-open="${esc(c.id)}" aria-label="Ver ${esc(c.n)}">
        <img loading="lazy" src="${esc(c.img)}" alt="${esc(c.n)}" onerror="this.style.visibility='hidden'">
        <span class="qtag">×${n}</span>
      </button>
      <div class="info">
        <div class="name">${esc(c.n)}</div>
        <div class="meta">
          <span class="doms">${RB.dom(c).map((d) => `<i style="background:${RB.DOMAIN_COLORS[d] || "#888"}"></i>`).join("")}</span>
          <span>${esc(c.sl || c.s)}${c.num !== null ? " #" + c.num : ""}</span>
          <span class="rar ${esc(c.r)}">${esc(RB.RARITY_ES[c.r] || c.r)}</span>
        </div>
        <div class="locs">${locChips(g, tab === "todo")}</div>
      </div>
    </article>`;
  }
  function more() {
    const next = list.slice(shown, shown + PAGE);
    $("grid").insertAdjacentHTML("beforeend", next.map(tile).join(""));
    shown += next.length;
    $("more").innerHTML = shown < list.length ? `<button class="btn" id="moreBtn">Ver más (${list.length - shown})</button>` : "";
    if ($("moreBtn")) $("moreBtn").onclick = more;
  }

  // ---------- Mazos ----------
  function renderDecks() {
    setLayout(false);
    const cnt = new Map();
    for (const cp of D.copies) if (cp.loc === "deck") cnt.set(cp.deck, (cnt.get(cp.deck) || 0) + 1);
    const ds = [...D.decks].sort((a, b) => a.name.localeCompare(b.name));
    $("main").innerHTML = `
      <div class="sechead"><h2>Mazos</h2></div>
      <div class="folders">
        ${ds.map((d) => `<button class="folder" data-deck="${esc(d.id)}"><span class="fn">🃏 ${esc(d.name)}</span><span class="fs">${nc(cnt.get(d.id) || 0)}</span></button>`).join("")}
        <button class="folder new" data-act="add" data-dest="deck">＋ Nuevo mazo<br><small>pegá la lista del mazo</small></button>
      </div>
      <p class="note">Cuando cargás un mazo, las cartas que tenés en casa pasan a ese mazo. Si desarmás el mazo, vuelven a casa.</p>`;
  }

  // ---------- Editor de un mazo ----------
  const TYPE_ORDER = ["Legend", "Battlefield", "Rune", "Unit", "Spell", "Gear"];
  function deckRows(d) {
    const m = new Map();
    for (const cp of D.copies) {
      if (cp.loc !== "deck" || cp.deck !== d.id) continue;
      const key = cp.c + "|" + (cp.f ? 1 : 0) + "|" + lg(cp);
      let r = m.get(key);
      if (!r) m.set(key, (r = { c: byId.get(cp.c), id: cp.c, f: !!cp.f, l: lg(cp), copies: [] }));
      r.copies.push(cp);
    }
    return [...m.values()].filter((r) => r.c);
  }
  function renderDeck() {
    setLayout(false);
    const d = deck(view.deck);
    if (!d) { view.deck = null; return renderDecks(); }
    const all = deckRows(d);
    const rows = all.filter((r) => !f.q || cardMatches(r.c));
    const total = all.reduce((s, r) => s + r.copies.length, 0);
    const byType = new Map();
    for (const r of rows) {
      const t = TYPE_ORDER.includes(r.c.t) ? r.c.t : "Otro";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(r);
    }
    const order = [...TYPE_ORDER, "Otro"].filter((t) => byType.has(t));
    $("main").innerHTML = `
      <div class="sechead">
        <button class="btn back" data-back>← Mazos</button>
        <h2>🃏 ${esc(d.name)} <span class="note">· ${nc(total)}</span></h2>
        <button class="btn" data-act="add" data-dest="deck" data-deck="${esc(d.id)}">＋ Cargar lista</button>
        <button class="btn ghost" data-dkcopy>📋 Copiar lista</button>
        <button class="btn ghost" data-deckren="${esc(d.id)}">Renombrar</button>
        <button class="btn ghost" data-deckdel="${esc(d.id)}">Desarmar mazo</button>
      </div>
      <div class="dk-add">
        <div class="ac"><input class="field" id="dkSearch" placeholder="＋ Agregar una carta al mazo…" autocomplete="off"></div>
        <label class="foilck"><input type="checkbox" id="dkFoil"> ✨ Foil</label>
        <label class="foilck"><input type="checkbox" id="dkCn"> 🇨🇳 Chino</label>
      </div>
      ${order.map((t) => `<h3 class="dk-group">${esc(RB.TYPE_ES[t] || (t === "Otro" ? "Otras" : t))} (${byType.get(t).reduce((s, r) => s + r.copies.length, 0)})</h3>
        ${byType.get(t).sort((a, b) => a.c.n.localeCompare(b.c.n) || a.f - b.f || a.l.localeCompare(b.l)).map(deckRowHtml).join("")}`).join("")
      || `<p class="empty">${all.length ? "Ninguna carta del mazo coincide con la búsqueda." : "El mazo está vacío. Agregá cartas con el buscador o cargá una lista."}</p>`}
      <p class="note">Con − la carta vuelve a casa. Con + se toma de casa y, si no hay, se suma a Mis cartas. Para jugar distintas versiones de una carta (por ejemplo 1 foil y 1 normal), usá «Cambiar 1 a otra versión».</p>`;
    attachAC($("dkSearch"), (c) => deckAdd(d, c.id, $("dkFoil").checked, $("dkCn").checked ? "cn" : "en"));
  }
  function deckRowHtml(r) {
    const n = r.copies.length;
    const opts = versionsOf(r.id)
      .flatMap((v) => (foilOnly(v) ? [[v, false]] : [[v, false], [v, true]]))
      .filter(([v, fo]) => !(v.id === r.id && fo === r.f))
      .map(([v, fo]) => `<option value="${esc(v.id)}|${fo ? 1 : 0}">${esc(versionLabel(v))}${fo ? " · ✨ Foil" : ""}</option>`)
      .join("");
    const col = r.copies.filter((cp) => cp.k === "col").length;
    const bor = r.copies.filter((cp) => cp.k === "bor");
    const extra = [];
    if (col) extra.push(`${col} de tu colección`);
    if (bor.length) extra.push(`${bor.length} prestada${bor.length > 1 ? "s" : ""} por ${[...new Set(bor.map((cp) => pname(cp.from)))].join(", ")}`);
    return `<div class="dk-row" data-key="${esc(r.id)}|${r.f ? 1 : 0}|${r.l}">
      <img src="${esc(r.c.img)}" alt="" data-open="${esc(r.id)}">
      <div><div class="n">${esc(r.c.n)} ${r.f ? '<span class="foil">✨ Foil</span>' : ""} ${r.l === "cn" ? '<span class="foil">🇨🇳 Chino</span>' : ""}</div>
        <div class="m">${esc(versionLabel(r.c))}${extra.length ? " · " + esc(extra.join(" · ")) : ""}</div></div>
      <div class="stepper"><button class="btn" data-dk="-" aria-label="Sacar una">−</button><b>${n}</b><button class="btn" data-dk="+" aria-label="Agregar una">+</button></div>
      <select class="field" data-dkver aria-label="Cambiar versión"><option value="">🔁 Cambiar 1 a otra versión…</option>${opts}</select>
      <button class="btn ghost rm" data-dk="lang">${r.l === "cn" ? "Pasar 1 a inglés" : "🇨🇳 Pasar 1 a chino"}</button>
      <button class="btn ghost rm" data-dk="x">Sacar todas</button>
    </div>`;
  }
  function deckAdd(d, id, foil, lang) {
    if (foilOnly(byId.get(id))) foil = false;
    const got = take(id, 1, [
      (cp) => cp.loc === "home" && cp.k === "mine" && !!cp.f === !!foil,
      (cp) => cp.loc === "home" && cp.k === "col" && !!cp.f === !!foil,
      (cp) => cp.loc === "home" && cp.k === "bor" && !!cp.f === !!foil,
    ], foil, lang);
    const nm = (byId.get(id) || {}).n;
    if (got.length) {
      got[0].loc = "deck";
      got[0].deck = d.id;
      toast(`${nm}: la tomé de casa`);
    } else {
      newCopy(id, "mine", { loc: "deck", deck: d.id, f: foil, l: lang });
      toast(`${nm}: no estaba en casa, la sumé a Mis cartas`);
    }
    save();
    renderDeck();
    const s = $("dkSearch");
    if (s) s.focus();
  }
  function deckRowCopies(row) {
    const d = deck(view.deck);
    const [id, fo, l] = row.dataset.key.split("|");
    const list = D.copies.filter((cp) => cp.loc === "deck" && cp.deck === d.id && cp.c === id && !!cp.f === (fo === "1") && lg(cp) === l);
    // Primero las tuyas, al final las prestadas.
    list.sort((a, b) => (a.k === "bor") - (b.k === "bor"));
    return { d, id, foil: fo === "1", lang: l, list };
  }
  $("main").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dk]");
    if (b) {
      const { d, id, foil, lang, list } = deckRowCopies(b.closest(".dk-row"));
      if (b.dataset.dk === "+") return deckAdd(d, id, foil, lang);
      if (b.dataset.dk === "lang") {
        // Si la del otro idioma está en casa, se cambian de lugar; si no, se corrige el idioma de esta copia.
        const other = lang === "cn" ? "en" : "cn";
        const cur = list[0];
        const home = D.copies.find((cp) => cp.c === id && !!cp.f === foil && lg(cp) === other && cp.loc === "home" && cp.k !== "bor");
        if (home) {
          home.loc = "deck"; home.deck = d.id;
          cur.loc = "home"; delete cur.deck;
          toast(`Cambiada: la de ${other === "cn" ? "chino" : "inglés"} vino de casa`);
        } else {
          other === "cn" ? (cur.l = "cn") : delete cur.l;
          toast(`Ahora es en ${other === "cn" ? "chino" : "inglés"}`);
        }
        save();
        return renderDeck();
      }
      const out = b.dataset.dk === "x" ? list : list.slice(-1);
      out.forEach((cp) => { cp.loc = "home"; delete cp.deck; });
      save();
      toast(out.length === 1 ? "Volvió a casa" : `${out.length} cartas volvieron a casa`);
      return renderDeck();
    }
    if (e.target.closest("[data-dkcopy]")) {
      const d = deck(view.deck);
      const txt = deckRows(d)
        .sort((a, b) => TYPE_ORDER.indexOf(a.c.t) - TYPE_ORDER.indexOf(b.c.t) || a.c.n.localeCompare(b.c.n))
        .map((r) => `${r.copies.length} ${r.c.n}${r.c.code ? " (" + r.c.code.toUpperCase() + ")" : ""}${r.f ? " foil" : ""}${r.l === "cn" ? " chino" : ""}`)
        .join("\n");
      navigator.clipboard.writeText(txt).then(() => toast("Lista del mazo copiada"), () => toast("No se pudo copiar"));
    }
  });
  $("main").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-dkver]");
    if (!sel || !sel.value) return;
    const { d, list, lang } = deckRowCopies(sel.closest(".dk-row"));
    const [tid, tf] = sel.value.split("|");
    const foil = tf === "1" && !foilOnly(byId.get(tid));
    const cur = list[0];
    if (!cur) return;
    // Si esa versión está en casa, se cambian de lugar; si no, se corrige la versión de esta copia.
    const home = D.copies.find((cp) => cp.c === tid && !!cp.f === foil && lg(cp) === lang && cp.loc === "home" && cp.k !== "bor") ||
      D.copies.find((cp) => cp.c === tid && !!cp.f === foil && lg(cp) === lang && cp.loc === "home");
    const label = versionLabel(byId.get(tid)) + (foil ? " ✨ Foil" : "");
    if (home) {
      home.loc = "deck";
      home.deck = d.id;
      cur.loc = "home";
      delete cur.deck;
      toast(`Cambiada: la de ${label} vino de casa y la otra volvió a casa`);
    } else {
      cur.c = tid;
      foil ? (cur.f = true) : delete cur.f;
      toast(`Ahora es ${label}`);
    }
    save();
    renderDeck();
  });

  // ---------- Préstamos ----------
  function personStats(pid) {
    const lent = D.copies.filter((cp) => cp.loc === "loan" && cp.to === pid);
    const bor = D.copies.filter((cp) => cp.k === "bor" && cp.from === pid);
    return { lent, bor, late: lent.filter(isLate) };
  }
  function renderLoans() {
    setLayout(false);
    if (view.person) return renderPerson();
    const ps = [...D.people].sort((a, b) => {
      const sa = personStats(a.id), sb = personStats(b.id);
      return sb.late.length - sa.late.length || sb.lent.length - sa.lent.length || a.name.localeCompare(b.name);
    });
    const q = norm(f.q);
    $("main").innerHTML = `
      <div class="sechead"><h2>Préstamos</h2>
        <button class="btn" data-act="add" data-dest="lend">🤝 Presté cartas</button>
        <button class="btn" data-act="add" data-dest="borrow">🫴 Me prestaron cartas</button>
      </div>
      <div class="folders">
        ${ps.filter((p) => !q || norm(p.name).includes(q)).map((p) => {
          const s = personStats(p.id);
          const bits = [];
          if (s.lent.length) bits.push(`Te debe ${s.lent.length}`);
          if (s.bor.length) bits.push(`Le debés ${s.bor.length}`);
          return `<button class="folder ${s.lent.length ? "owes" : ""} ${s.late.length ? "late" : ""}" data-person="${esc(p.id)}">
            <span class="fn">📁 ${esc(p.name)} ${s.late.length ? "⚠️" : ""}</span>
            <span class="fs">${bits.join(" · ") || "Sin préstamos ahora"}</span>
            ${s.late.length ? `<span class="fs" style="color:#ff6b6f">${s.late.length} hace más de un mes</span>` : ""}
          </button>`;
        }).join("")}
        <button class="folder new" data-newperson>＋ Nueva persona</button>
      </div>
      <p class="note">Los nombres en rojo son los que te deben cartas. Las carpetas quedan guardadas aunque estén vacías.</p>`;
  }
  function loanRow(cp, kind) {
    const c = byId.get(cp.c);
    if (!c) return "";
    const late = kind === "lent" && isLate(cp);
    const d = kind === "lent" ? cp.ls : cp.fs;
    const days = daysSince(d);
    const where = kind === "bor" ? (cp.loc === "deck" ? ` · 🃏 en mazo ${esc(dname(cp.deck))}` : " · 🏠 en casa") : cp.k === "col" ? " · de tu colección" : "";
    return `<div class="lr ${late ? "late" : ""}">
      <img src="${esc(c.img)}" alt="" data-open="${esc(c.id)}">
      <div><div class="n">${esc(c.n)}</div>
        <div class="m">${esc(c.sl || c.s)}${c.num !== null ? " #" + c.num : ""} · desde ${fdate(d)} · <span class="${late ? "late-t" : ""}">${days} ${days === 1 ? "día" : "días"}${late ? " ⚠️ más de un mes" : ""}</span>${where}</div></div>
      <div class="acts">${kind === "lent"
        ? `<button class="btn" data-returned="${esc(cp.id)}">✔ Me la devolvió</button>`
        : `<button class="btn" data-gaveback="${esc(cp.id)}">✔ Se la devolví</button>`}</div>
    </div>`;
  }
  function renderPerson() {
    const p = person(view.person);
    if (!p) { view.person = null; return renderLoans(); }
    const s = personStats(p.id);
    const sortD = (k) => (a, b) => (a[k] || "").localeCompare(b[k] || "");
    $("main").innerHTML = `
      <div class="sechead">
        <button class="btn back" data-back>← Préstamos</button>
        <h2 class="${s.lent.length ? "owes" : ""}">📁 ${esc(p.name)}</h2>
        <button class="btn" data-act="add" data-dest="lend" data-person="${esc(p.id)}">🤝 Le presté</button>
        <button class="btn" data-act="add" data-dest="borrow" data-person="${esc(p.id)}">🫴 Me prestó</button>
        <button class="btn ghost" data-perren="${esc(p.id)}">Renombrar</button>
        ${!s.lent.length && !s.bor.length ? `<button class="btn ghost" data-perdel="${esc(p.id)}">Borrar carpeta</button>` : ""}
      </div>
      <h3 class="sub">Le prestaste (${s.lent.length})</h3>
      <div class="lrows">${s.lent.sort(sortD("ls")).map((cp) => loanRow(cp, "lent")).join("") || `<p class="note">No te debe nada.</p>`}</div>
      <h3 class="sub">Te prestó (${s.bor.length})</h3>
      <div class="lrows">${s.bor.sort(sortD("fs")).map((cp) => loanRow(cp, "bor")).join("") || `<p class="note">No le debés nada.</p>`}</div>`;
  }

  // ---------- Compras y ventas ----------
  const DEST = { mine: "→ Mis cartas", col: "→ Colección", sale: "→ Para vender" };
  function renderTx() {
    setLayout(true);
    const years = new Set([new Date().getFullYear(), ...D.tx.map((t) => Number(t.d.slice(0, 4)))]);
    const ofYear = D.tx.filter((t) => Number(t.d.slice(0, 4)) === view.year);
    const rows = ofYear
      .filter((t) => (!view.txType || t.type === view.txType) && cardMatches(byId.get(t.c)))
      .sort((a, b) => b.d.localeCompare(a.d) || (b.at || 0) - (a.at || 0));
    const tot = (arr, type) => arr.filter((t) => t.type === type).reduce((s, t) => s + (t.p || 0) * t.q, 0);
    const qty = (arr, type) => arr.filter((t) => t.type === type).reduce((s, t) => s + t.q, 0);
    const spent = tot(rows, "buy"), sold = tot(rows, "sell"), bal = sold - spent;
    const months = [];
    for (let i = 0; i < 12; i++) {
      const mm = rows.filter((t) => Number(t.d.slice(5, 7)) === i + 1);
      if (mm.length) months.push([MONTHS[i], tot(mm, "buy"), tot(mm, "sell"), qty(mm, "buy"), qty(mm, "sell")]);
    }
    const noPrice = rows.filter((t) => t.p === null || t.p === undefined).length;
    $("main").innerHTML = `
      <div class="sechead"><h2>Compras y ventas</h2>
        <select class="field" id="year" aria-label="Año">${[...years].sort((a, b) => b - a).map((y) => `<option ${y === view.year ? "selected" : ""}>${y}</option>`).join("")}</select>
        <div class="seg" id="txType">
          <button data-v="" aria-pressed="${!view.txType}">Todo</button>
          <button data-v="buy" aria-pressed="${view.txType === "buy"}">Compras</button>
          <button data-v="sell" aria-pressed="${view.txType === "sell"}">Ventas</button>
        </div>
      </div>
      <div class="sum">
        <div><small>Gastado en compras</small><b class="neg">${money(spent)}</b><small>${qty(rows, "buy")} cartas</small></div>
        <div><small>Cobrado en ventas</small><b class="pos">${money(sold)}</b><small>${qty(rows, "sell")} cartas</small></div>
        <div><small>Balance ${view.year}</small><b class="${bal >= 0 ? "pos" : "neg"}">${bal < 0 ? "− " : ""}${money(Math.abs(bal))}</b><small>ventas − compras</small></div>
      </div>
      ${noPrice ? `<p class="note">${noPrice} ${noPrice === 1 ? "movimiento no tiene" : "movimientos no tienen"} precio y no suman al total.</p>` : ""}
      ${months.length ? `<div class="tablewrap"><table class="months"><thead><tr><th>Mes</th><th>Compras</th><th>Ventas</th><th>Balance</th></tr></thead><tbody>
        ${months.map(([m, b, s, qb, qs]) => `<tr><td>${m}</td><td>${money(b)} <span class="note">(${qb})</span></td><td>${money(s)} <span class="note">(${qs})</span></td><td>${s - b < 0 ? "− " : ""}${money(Math.abs(s - b))}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <div class="lrows">${rows.map(txRow).join("") || `<p class="empty">No hay movimientos ${view.txType === "buy" ? "de compra " : view.txType === "sell" ? "de venta " : ""}en ${view.year}.</p>`}</div>`;
    $("year").onchange = (e) => { view.year = Number(e.target.value); renderTx(); };
    $("txType").onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      view.txType = b.dataset.v;
      renderTx();
    };
  }
  function txRow(t) {
    const c = byId.get(t.c) || { n: "Carta desconocida", img: "", s: "", num: null };
    const buy = t.type === "buy";
    const total = t.p === null || t.p === undefined ? null : t.p * t.q;
    const extra = [fdate(t.d)];
    if (lg(t) === "cn") extra.push("chino");
    if (t.who) extra.push((buy ? "se la compraste a " : "se la vendiste a ") + t.who);
    if (buy && DEST[t.dest]) extra.push(DEST[t.dest] + (t.dest === "sale" && SALE[t.sloc] ? " " + SALE[t.sloc].i : ""));
    if (!buy && t.src) extra.push(t.src);
    return `<div class="lr">
      <img src="${esc(c.img)}" alt="" data-open="${esc(t.c)}">
      <div><div class="n">${buy ? "🛍️ Compra" : "💰 Venta"} · ${t.q} × ${esc(c.n)}</div>
        <div class="m">${esc(c.sl || c.s)}${c.num !== null ? " #" + c.num : ""} · ${esc(extra.join(" · "))}</div></div>
      <div class="acts">
        <div class="amt ${buy ? "buy" : "sell"}">${total === null ? "sin precio" : (buy ? "− " : "+ ") + money(total)}${total !== null && t.q > 1 ? `<div class="note">${money(t.p)} c/u</div>` : ""}</div>
        <button class="btn ghost" data-txdel="${esc(t.id)}" aria-label="Borrar movimiento">🗑</button>
      </div>
    </div>`;
  }

  // ---------- Acciones generales ----------
  document.addEventListener("click", (e) => {
    const t = e.target;
    const a = t.closest("[data-act]");
    if (a) {
      close();
      return openLoader(a.dataset.act, { dest: a.dataset.dest, deck: a.dataset.deck, person: a.dataset.person, card: a.dataset.card });
    }
    const o = t.closest("[data-open]");
    if (o && !t.closest("#loader")) return openCard(o.dataset.open);
    const dk = t.closest("[data-deck]");
    if (dk && dk.classList.contains("folder")) { view.deck = dk.dataset.deck; return renderMain(); }
    const pr = t.closest("[data-person]");
    if (pr && pr.classList.contains("folder")) { view.person = pr.dataset.person; return renderMain(); }
    if (t.closest("[data-back]")) { view.deck = null; view.person = null; return renderMain(); }
    if (t.closest("[data-newperson]")) {
      const n = (window.prompt("Nombre de la persona:") || "").trim();
      if (n) { const p = ensurePerson(n); save(); view.person = p.id; renderMain(); }
      return;
    }
    let el;
    if ((el = t.closest("[data-returned]"))) {
      const cp = D.copies.find((x) => x.id === el.dataset.returned);
      if (cp) { cp.loc = "home"; delete cp.to; delete cp.ls; save(); toast("Volvió a casa: " + (byId.get(cp.c) || {}).n); refresh(); }
      return;
    }
    if ((el = t.closest("[data-gaveback]"))) {
      D.copies = D.copies.filter((x) => x.id !== el.dataset.gaveback);
      save(); toast("Listo, se la devolviste"); refresh();
      return;
    }
    if ((el = t.closest("[data-txdel]"))) {
      if (!window.confirm("¿Borrar este movimiento? Solo se borra del registro: no cambia tus cartas ni el stock.")) return;
      D.tx = D.tx.filter((x) => x.id !== el.dataset.txdel);
      save(); renderMain();
      return;
    }
    if ((el = t.closest("[data-deckren]"))) {
      const d = deck(el.dataset.deckren);
      const n = (window.prompt("Nuevo nombre del mazo:", d.name) || "").trim();
      if (n) { d.name = n; save(); renderMain(); }
      return;
    }
    if ((el = t.closest("[data-deckdel]"))) {
      const d = deck(el.dataset.deckdel);
      if (!window.confirm(`¿Desarmar el mazo «${d.name}»? Sus cartas vuelven a casa.`)) return;
      D.copies.forEach((cp) => { if (cp.loc === "deck" && cp.deck === d.id) { cp.loc = "home"; delete cp.deck; } });
      D.decks = D.decks.filter((x) => x.id !== d.id);
      view.deck = null;
      save(); renderMain();
      return;
    }
    if ((el = t.closest("[data-perren]"))) {
      const p = person(el.dataset.perren);
      const n = (window.prompt("Nuevo nombre:", p.name) || "").trim();
      if (n) { p.name = n; save(); renderMain(); renderAlert(); }
      return;
    }
    if ((el = t.closest("[data-perdel]"))) {
      const p = person(el.dataset.perdel);
      if (!window.confirm(`¿Borrar la carpeta de ${p.name}?`)) return;
      D.people = D.people.filter((x) => x.id !== p.id);
      view.person = null;
      save(); renderMain();
    }
  });
  function refresh() {
    renderAlert();
    renderMain();
    if ($("modal").classList.contains("open") && openId) openCard(openId);
  }

  function ensurePerson(name) {
    const n = name.trim();
    let p = D.people.find((x) => norm(x.name) === norm(n));
    if (!p) { p = { id: uid(), name: n, created: today() }; D.people.push(p); }
    return p;
  }
  function ensureDeck(name) {
    const n = name.trim();
    let d = D.decks.find((x) => norm(x.name) === norm(n));
    if (!d) { d = { id: uid(), name: n, created: today() }; D.decks.push(d); }
    return d;
  }
  function newCopy(c, k, extra) {
    const cp = Object.assign({ id: uid(), c, k, loc: "home", added: Date.now() }, extra || {});
    if (!cp.f || foilOnly(byId.get(c))) delete cp.f;
    if (cp.l !== "cn") delete cp.l;
    D.copies.push(cp);
    return cp;
  }

  // ---------- Detalle de una carta ----------
  let openId = null;
  function openCard(id) {
    const c = byId.get(id);
    if (!c) return;
    openId = id;
    const mine = D.copies.filter((cp) => cp.c === id);
    const grp = new Map();
    for (const cp of mine) {
      const key = [cp.k, cp.loc, cp.deck, cp.to, cp.from, cp.f ? 1 : 0, lg(cp)].join("|");
      const g = grp.get(key) || { key, list: [] };
      g.list.push(cp);
      grp.set(key, g);
    }
    const vers = versionsOf(id);
    const deckOpts = D.decks.map((d) => `<option value="deck:${esc(d.id)}">🃏 ${esc(d.name)}</option>`).join("");
    const perOpts = D.people.map((p) => `<option value="loan:${esc(p.id)}">🤝 Prestar a ${esc(p.name)}</option>`).join("");
    const rows = [...grp.values()].map((g) => {
      const cp = g.list[0];
      const n = g.list.length;
      let what, acts = "";
      const kindTxt = (cp.k === "col" ? "Colección" : cp.k === "mine" ? "Mis cartas" : "") + (cp.f ? " · ✨ Foil" : "") + (lg(cp) === "cn" ? " · " + CN : "");
      if (cp.k === "bor") {
        what = `🫴 Te la prestó <b>${esc(pname(cp.from))}</b> el ${fdate(cp.fs)} · ${cp.loc === "deck" ? "🃏 en " + esc(dname(cp.deck)) : "🏠 en casa"}`;
        acts = `${cp.loc === "deck" ? `<button class="btn" data-mv="${esc(cp.id)}" data-to="home">Sacar del mazo</button>` : deckOpts ? `<select class="field" data-mvsel="${esc(cp.id)}"><option value="">Poner en mazo…</option>${deckOpts}</select>` : ""}
          <button class="btn" data-gaveback="${esc(cp.id)}">✔ Se la devolví</button>`;
      } else if (cp.loc === "home") {
        what = `🏠 <b>En casa</b> · ${kindTxt}`;
        acts = `<select class="field" data-mvsel="${esc(cp.id)}"><option value="">Mover 1 a…</option>${deckOpts}${perOpts}<option value="loan:new">🤝 Prestar a otra persona…</option><option value="deck:new">🃏 Otro mazo nuevo…</option></select>`;
      } else if (cp.loc === "deck") {
        what = `🃏 En mazo <b>${esc(dname(cp.deck))}</b> · ${kindTxt}`;
        acts = `<button class="btn" data-mv="${esc(cp.id)}" data-to="home">Volver a casa</button>`;
      } else if (cp.loc === "loan") {
        const late = isLate(cp);
        what = `${late ? "⚠️" : "🤝"} Prestada a <b style="color:#ff6b6f">${esc(pname(cp.to))}</b> desde ${fdate(cp.ls)} <span class="${late ? "late-t" : "note"}">(${daysSince(cp.ls)} días)</span> · ${kindTxt}`;
        acts = `<button class="btn" data-returned="${esc(cp.id)}">✔ Me la devolvió</button>`;
      }
      if (cp.k !== "bor") {
        acts += `<button class="btn ghost" data-kind="${esc(cp.id)}">${cp.k === "mine" ? "Pasar a Colección" : "Pasar a Mis cartas"}</button>
          <button class="btn ghost" data-rm="${esc(cp.id)}" aria-label="Quitar una">🗑</button>`;
      }
      acts += `<button class="btn ghost" data-lang="${esc(cp.id)}">${lg(cp) === "cn" ? "Pasar 1 a inglés" : "🇨🇳 Pasar 1 a chino"}</button>`;
      if (!foilOnly(c)) acts += `<button class="btn ghost" data-foil="${esc(cp.id)}">${cp.f ? "Quitar foil a 1" : "✨ Marcar 1 como foil"}</button>`;
      if (vers.length > 1) {
        acts += `<select class="field" data-ver="${esc(g.list.map((x) => x.id).join(","))}" aria-label="Cambiar versión">
          <option value="">🔁 Cambiar versión…</option>
          ${vers.filter((v) => v.id !== id).map((v) => `<option value="${esc(v.id)}">${esc(versionLabel(v))}</option>`).join("")}
        </select>`;
      }
      return `<div class="cp"><span class="what">${n > 1 ? `<b>×${n}</b> ` : ""}${what}</span>${acts}</div>`;
    }).join("");
    const st = stockOf(id);
    const hist = D.tx.filter((t) => t.c === id).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 6);
    $("modalBody").innerHTML = `
      <div><img src="${esc(c.img)}" alt="${esc(c.n)}"></div>
      <div>
        <h2>${esc(c.n)}</h2>
        <div class="note">Versión: ${esc(versionLabel(c))}</div>
        <h3 class="sub">Dónde están tus copias (${mine.length})</h3>
        <div class="cps">${rows || `<p class="note">No tenés copias cargadas de esta carta.</p>`}</div>
        <div class="mini">
          <button class="btn" data-plus="mine">＋1 Mis cartas</button>
          <button class="btn" data-plus="col">＋1 Colección</button>
          <button class="btn" data-act="buy" data-card="${esc(id)}">🛍️ Compré</button>
          <button class="btn" data-act="sell" data-card="${esc(id)}">💰 Vendí</button>
        </div>
        <h3 class="sub">En venta en la tienda</h3>
        <div class="cp"><span class="what">${st > 0 ? `<b>${st}</b> en stock${(inv.items[id] || {}).qc ? ` (${(inv.items[id] || {}).q || 0} inglés · ${(inv.items[id] || {}).qc} chino)` : ""} · ${money(RB.effectivePrice(c, inv))}` : "Sin stock en la tienda"}</span>
          <select class="field" id="sl" aria-label="Dónde la guardás">
            <option value="">¿Dónde la guardás?</option>
            ${Object.entries(SALE).map(([k, v]) => `<option value="${k}" ${saleLoc[id] === k ? "selected" : ""}>${v.i} ${v.l}</option>`).join("")}
          </select>
        </div>
        ${hist.length ? `<h3 class="sub">Movimientos</h3><div class="note">${hist.map((t) => `${fdate(t.d)} · ${t.type === "buy" ? "Compra" : "Venta"} ${t.q} × ${t.p === null || t.p === undefined ? "sin precio" : money(t.p)}${t.who ? " · " + esc(t.who) : ""}`).join("<br>")}</div>` : ""}
      </div>`;
    $("sl").onchange = (e) => {
      if (e.target.value) saleLoc[id] = e.target.value;
      else delete saleLoc[id];
      saveSaleLoc();
      toast("Ubicación guardada");
      renderMain();
    };
    open("modal");
  }
  $("modalBody").addEventListener("click", (e) => {
    let el;
    if ((el = e.target.closest("[data-plus]"))) {
      newCopy(openId, el.dataset.plus);
      save(); toast("Agregada"); refresh();
    } else if ((el = e.target.closest("[data-mv]"))) {
      const cp = D.copies.find((x) => x.id === el.dataset.mv);
      if (cp) { cp.loc = "home"; delete cp.deck; save(); refresh(); }
    } else if ((el = e.target.closest("[data-lang]"))) {
      const cp = D.copies.find((x) => x.id === el.dataset.lang);
      if (cp) { lg(cp) === "cn" ? delete cp.l : (cp.l = "cn"); save(); refresh(); }
    } else if ((el = e.target.closest("[data-foil]"))) {
      const cp = D.copies.find((x) => x.id === el.dataset.foil);
      if (cp) { cp.f ? delete cp.f : (cp.f = true); save(); refresh(); }
    } else if ((el = e.target.closest("[data-kind]"))) {
      const cp = D.copies.find((x) => x.id === el.dataset.kind);
      if (cp) { cp.k = cp.k === "mine" ? "col" : "mine"; save(); refresh(); }
    } else if ((el = e.target.closest("[data-rm]"))) {
      if (!window.confirm("¿Quitar una copia de esta carta? (Si la vendiste, mejor usá «Vendí» así queda registrada.)")) return;
      D.copies = D.copies.filter((x) => x.id !== el.dataset.rm);
      save(); refresh();
    }
  });
  $("modalBody").addEventListener("change", (e) => {
    const vs = e.target.closest("[data-ver]");
    if (vs && vs.value) {
      const ids = vs.dataset.ver.split(",");
      let n = ids.length;
      if (n > 1) {
        const a = window.prompt(`¿Cuántas de estas ${n} copias son de la versión ${versionLabel(byId.get(vs.value))}?`, String(n));
        if (a === null) { vs.value = ""; return; }
        n = Math.max(0, Math.min(ids.length, parseInt(a, 10) || 0));
      }
      ids.slice(0, n).forEach((cid) => { const cp = D.copies.find((x) => x.id === cid); if (cp) cp.c = vs.value; });
      if (!D.copies.some((x) => x.c === openId)) openId = vs.value;
      save();
      toast(n === 1 ? "Versión cambiada" : `${n} copias cambiadas de versión`);
      refresh();
      return;
    }
    const sel = e.target.closest("[data-mvsel]");
    if (!sel || !sel.value) return;
    const cp = D.copies.find((x) => x.id === sel.dataset.mvsel);
    if (!cp) return;
    const [kind, id] = sel.value.split(":");
    if (kind === "deck") {
      let d = deck(id);
      if (id === "new") {
        const n = (window.prompt("Nombre del mazo:") || "").trim();
        if (!n) return (sel.value = "");
        d = ensureDeck(n);
      }
      cp.loc = "deck"; cp.deck = d.id; delete cp.to; delete cp.ls;
      toast("A mazo " + d.name);
    } else {
      let p = person(id);
      if (id === "new") {
        const n = (window.prompt("¿A quién se la prestaste?") || "").trim();
        if (!n) return (sel.value = "");
        p = ensurePerson(n);
      }
      cp.loc = "loan"; cp.to = p.id; cp.ls = today(); delete cp.deck;
      toast("Prestada a " + p.name);
    }
    save(); refresh();
  });

  // ---------- Leer listas ----------
  function norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[’'`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  let nameIdx = new Map();
  let baseIdx = new Map();
  let codeIdx = new Map();
  // Nombre sin la marca de versión del final: "(Alternate Art)", "(Overnumbered)", "(Metal)", etc.
  const baseName = (n) => String(n || "").replace(/\s*\((alternate art|overnumbered|signature|metal|starter|launch exclusive|ultimate|gg ez|showcase)\)\s*$/i, "");
  // Todas las versiones de una carta (mismo nombre base), la normal primero.
  function versionsOf(id) {
    const c = byId.get(id);
    return c ? baseIdx.get(norm(baseName(c.n))) || [c] : [];
  }
  // Épicas, raras, promos y versiones especiales (alternativo, firma, sobrenumerada, showcase) solo salen en foil.
  function foilOnly(c) {
    return !!c && (["Epic", "Rare", "Promo", "Showcase"].includes(c.r) || c.alt || c.sig || c.ov);
  }
  function versionLabel(c) {
    const v = RB.variantLabel(c);
    if (/\(metal\)/i.test(c.n)) v.push("Metal");
    if (/\(starter\)/i.test(c.n)) v.push("Starter");
    const kind = v.length ? v.join(", ") : c.r === "Showcase" || c.r === "Promo" ? "" : "Normal";
    return `${c.sl || c.s}${c.num !== null ? " #" + c.num : ""} · ${RB.RARITY_ES[c.r] || c.r}${kind ? " · " + kind : ""}${c.code ? " · " + c.code.toUpperCase() : ""}`;
  }
  let codeRe = null;
  const codeKey = (s, pre, n, suf) => `${s.toLowerCase()}-${(pre || "").toLowerCase()}${Number(n)}${(suf || "").toLowerCase()}`;
  function pref(c) {
    const si = SET_PREF.indexOf(c.s);
    return (c.alt || c.sig || c.ov ? 100 : 0) + (c.r === "Promo" ? 50 : 0) + (si === -1 ? 20 : si) + (c.num || 0) / 1000;
  }
  function buildIndex() {
    nameIdx = new Map();
    baseIdx = new Map();
    codeIdx = new Map();
    for (const c of cards) {
      const k = norm(c.n);
      if (!nameIdx.has(k)) nameIdx.set(k, []);
      nameIdx.get(k).push(c);
      const b = norm(baseName(c.n));
      if (!baseIdx.has(b)) baseIdx.set(b, []);
      baseIdx.get(b).push(c);
      const m = /^[a-z]+-([a-z]*?)(\d+)([a-z]?)(?:[-\/]|$)/i.exec(c.code || "");
      if (m) {
        const key = codeKey(c.s, m[1], m[2], m[3]);
        if (!codeIdx.has(key)) codeIdx.set(key, []);
        codeIdx.get(key).push(c);
      }
    }
    for (const arr of nameIdx.values()) arr.sort((a, b) => pref(a) - pref(b));
    for (const arr of baseIdx.values()) arr.sort((a, b) => pref(a) - pref(b));
    const sets = [...new Set(cards.map((c) => c.s))].filter(Boolean).sort((a, b) => b.length - a.length);
    codeRe = new RegExp(`[(\\[]?\\b(${sets.join("|")})\\s*[-–·•#:]?\\s*([a-z]{0,2}?)\\s*0*(\\d{1,3})([a-z]?)\\b(?:\\s*\\/\\s*\\d{1,3})?[)\\]]?`, "i");
  }
  function parsePrice(s) {
    let t = s.replace(/\s/g, "");
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function parseLine(raw, withPrice) {
    let l = raw.replace(/\t/g, " ").replace(/\s+\/\/.*$/, "").trim().replace(/^[-*•·>]+\s*/, "");
    if (!l || /^\/\//.test(l) || /^#/.test(l)) return null;
    if (l.includes(":")) {
      const after = l.slice(l.lastIndexOf(":") + 1).trim();
      if (!after) return null;
      if (!/^\d/.test(l) || /^[^\d]+:/.test(l)) l = after;
    }
    let p = null;
    if (withPrice) {
      const pm = /(?:\s[-–@=,]\s*|\s)\$?\s*([\d][\d.,]*)\s*(?:c\/u|cu)?\s*$/i.exec(l);
      const dm = /\$\s*([\d][\d.,]*)/.exec(l);
      if (dm) { p = parsePrice(dm[1]); l = l.replace(dm[0], " ").trim(); }
      else if (pm && /^\d{1,3}\s*[x×]?\s+\S/.test(l) && /\s[-–@=]\s*[\d]/.test(l)) { p = parsePrice(pm[1]); l = l.slice(0, pm.index).trim(); }
    }
    let q = 1, hadQ = false, m;
    if ((m = /^(\d{1,3})\s*[x×]?\s+(.+)$/i.exec(l))) { q = Number(m[1]); l = m[2]; hadQ = true; }
    else if ((m = /^(.+?)\s*[(\[]?\s*[x×]\s*(\d{1,3})\s*[)\]]?$/i.exec(l))) { q = Number(m[2]); l = m[1]; hadQ = true; }
    else if ((m = /^[x×](\d{1,3})\s+(.+)$/i.exec(l))) { q = Number(m[1]); l = m[2]; hadQ = true; }
    // Pistas de versión escritas en la línea: "alter", "alt", "AA", "overnumbered", "firma", "metal"...
    const hint = /\b(alter|alt|alternate|alternativ[oa]|aa)\b/i.test(l) ? "alt"
      : /\b(overnumbered|sobrenumerada|showcase)\b/i.test(l) ? "ov"
      : /\b(signature|firma|firmada)\b/i.test(l) ? "sig"
      : /\bmetal\b/i.test(l) ? "metal" : "";
    const isFoil = /\b(foil|foileada|brillante)\b/i.test(l);
    const isCn = /(\b(chino|china|chinese|cn|zh)\b|中文)/i.test(l);
    l = l.replace(/[(\[]?(\b(chino|china|chinese|cn|zh|ingl[eé]s|english|en)\b|中文)[)\]]?/gi, " ").replace(/\s+/g, " ").trim();
    l = l.replace(/[(\[]?\b(foil|foileada|brillante|non[- ]?foil|no foil)\b[)\]]?/gi, " ").replace(/\s+/g, " ").trim();
    let cands = [], sure = false;
    const cm = codeRe && codeRe.exec(l);
    if (cm) {
      const hits = codeIdx.get(codeKey(cm[1], cm[2], cm[3], cm[4])) || [];
      if (hits.length) { cands = hits.slice(); sure = true; }
      l = (l.slice(0, cm.index) + " " + l.slice(cm.index + cm[0].length)).trim();
    }
    const full = norm(l.replace(/\[[^\]]*\]/g, ""));
    const name = norm(baseName(l.replace(/\[[^\]]*\]/g, "").trim()).replace(/\((?:alter|alt|aa|alternativ[oa]|firma|firmada|sobrenumerada|showcase)\)\s*$/i, "").replace(/\s+\b(alter|alt|aa)\b\s*$/i, ""));
    if (!cands.length && name) {
      const ex = nameIdx.get(full);
      const all = baseIdx.get(name) || nameIdx.get(name) || baseIdx.get(norm(l.replace(/\((?:[^)]*)\)\s*$/, "")));
      if (ex || all) {
        cands = (ex || []).concat((all || []).filter((c) => !(ex || []).includes(c)));
        sure = true;
      }
    }
    // Siempre ofrecer todas las versiones de la carta para poder elegir.
    if (cands.length) {
      const more = versionsOf(cands[0].id).filter((c) => !cands.includes(c));
      cands = cands.concat(more);
    }
    if (cands.length && hint) {
      const want = (c) => (hint === "alt" ? c.alt : hint === "ov" ? c.ov : hint === "sig" ? c.sig : /\(metal\)/i.test(c.n));
      const i = cands.findIndex(want);
      if (i > 0) cands.unshift(cands.splice(i, 1)[0]);
    }
    if (!cands.length && name.length >= 3) {
      const words = name.split(" ");
      const found = [];
      for (const [k, arr] of nameIdx) {
        if (k.startsWith(name) || (name.startsWith(k) && k.length >= 5) || words.every((w) => k.includes(w))) found.push(...arr);
        if (found.length > 40) break;
      }
      cands = found.slice(0, 40);
    }
    if (!cands.length && !hadQ) return null;
    if (!cands.length) return { orig: raw.trim(), q, cands: [], pick: null, sure: false, p };
    return { orig: raw.trim(), q: Math.max(1, Math.min(999, q)), cands: cands.map((c) => c.id), pick: cands[0].id, sure, p, f: isFoil, l: isCn ? "cn" : undefined };
  }

  // Buscador de cartas con lista desplegable
  function attachAC(input, onPick) {
    const box = document.createElement("div");
    box.className = "ac-list";
    input.parentNode.appendChild(box);
    let items = [];
    let idx = -1;
    const draw = () => {
      box.innerHTML = items.map((c, i) => `<div class="ac-item ${i === idx ? "on" : ""}" data-i="${i}"><img src="${esc(c.img)}" alt=""><div>${esc(c.n)}<small>${esc(cardMeta(c))}</small></div></div>`).join("");
      box.classList.toggle("open", items.length > 0);
    };
    input.addEventListener("input", () => {
      const q = norm(input.value);
      idx = -1;
      if (q.length < 2) { items = []; return draw(); }
      const ws = q.split(" ");
      items = cards.filter((c) => { const h = norm(c.n + " " + c.code); return ws.every((w) => h.includes(w)); })
        .sort((a, b) => (norm(a.n).startsWith(q) ? 0 : 1) - (norm(b.n).startsWith(q) ? 0 : 1) || a.n.localeCompare(b.n) || pref(a) - pref(b))
        .slice(0, 12);
      draw();
    });
    input.addEventListener("keydown", (e) => {
      if (!items.length) return;
      if (e.key === "ArrowDown") { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
      if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      if (e.key === "Enter") { e.preventDefault(); pick(items[Math.max(0, idx)]); }
      if (e.key === "Escape") { items = []; draw(); }
    });
    box.addEventListener("mousedown", (e) => {
      const it = e.target.closest("[data-i]");
      if (it) { e.preventDefault(); pick(items[Number(it.dataset.i)]); }
    });
    input.addEventListener("blur", () => setTimeout(() => { items = []; draw(); }, 150));
    function pick(c) {
      if (!c) return;
      items = [];
      draw();
      input.value = "";
      onPick(c);
    }
  }

  // ---------- Cargador (cargar, comprar, vender) ----------
  let L = null;
  function openLoader(mode, o = {}) {
    L = {
      mode, rows: [], dest: o.dest || "mine", deck: o.deck || (D.decks[0] ? "" : "new"), newDeck: "",
      person: o.person || "", newPerson: "", date: today(), who: "", bdest: "mine", sloc: "carpeta",
      createMissing: true, text: "", done: null,
    };
    if (o.dest === "deck" && !o.deck) L.deck = "new";
    if (o.card && byId.has(o.card)) L.rows.push({ orig: "", q: 1, cands: [o.card], pick: o.card, sure: true, p: null });
    if (mode === "sell") L.rows.forEach((r) => (r.p = RB.effectivePrice(byId.get(r.pick), inv)));
    drawLoader();
    open("loader");
  }

  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;

  function drawLoader() {
    const tx = L.mode === "buy" || L.mode === "sell";
    if (L.done) {
      $("loaderBody").innerHTML = `<h2 id="lTitle">Listo ✓</h2><div class="result">${esc(L.done)}</div>
        <div class="lfoot"><button class="btn" data-again>Cargar más</button><button class="btn primary" data-close>Cerrar</button></div>`;
      return;
    }
    const title = { add: "Cargar cartas", buy: "Registrar compra", sell: "Registrar venta" }[L.mode];
    let fields = "";
    if (L.mode === "add") {
      fields += `<label class="blk">¿Adónde van?${seg("dest", [["mine", "Mis cartas"], ["col", "Mi colección"], ["deck", "🃏 A un mazo"], ["lend", "🤝 Le presté a…"], ["borrow", "🫴 Me prestaron"]], L.dest)}</label>`;
      if (L.dest === "deck") {
        fields += `<div class="lgrid">
          <label>Mazo<select class="field" data-f="deck"><option value="new" ${L.deck === "new" ? "selected" : ""}>＋ Mazo nuevo</option>${D.decks.map((d) => `<option value="${esc(d.id)}" ${L.deck === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
          ${L.deck === "new" ? `<label>Nombre del mazo nuevo<input class="field" data-f="newDeck" value="${esc(L.newDeck)}" placeholder="Ej: Jinx agresivo"></label>` : ""}
        </div>
        <label class="switch"><input type="checkbox" data-f="createMissing" ${L.createMissing ? "checked" : ""}> Si no la tengo cargada en casa, sumarla a Mis cartas</label>`;
      }
      if (L.dest === "lend" || L.dest === "borrow") {
        fields += `<div class="lgrid">
          <label>${L.dest === "lend" ? "¿A quién?" : "¿Quién te las prestó?"}<select class="field" data-f="person"><option value="">＋ Persona nueva</option>${D.people.map((p) => `<option value="${esc(p.id)}" ${L.person === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          ${!L.person ? `<label>Nombre<input class="field" data-f="newPerson" value="${esc(L.newPerson)}" placeholder="Ej: Juan"></label>` : ""}
          <label>Fecha<input class="field" type="date" data-f="date" value="${esc(L.date)}"></label>
        </div>
        ${L.dest === "lend" ? `<label class="switch"><input type="checkbox" data-f="createMissing" ${L.createMissing ? "checked" : ""}> Si no la tengo cargada, sumarla a Mis cartas igual</label>` : ""}`;
      }
    } else {
      fields += `<div class="lgrid">
        <label>Fecha<input class="field" type="date" data-f="date" value="${esc(L.date)}"></label>
        <label>${L.mode === "buy" ? "Se la compré a (opcional)" : "Comprador (opcional)"}<input class="field" data-f="who" value="${esc(L.who)}" placeholder="Nombre o lugar"></label>
      </div>`;
      if (L.mode === "buy") {
        fields += `<label class="blk">¿Para qué la compraste?${seg("bdest", [["mine", "🏠 Para mí"], ["sale", "🏷️ Para vender"], ["col", "⭐ Colección"]], L.bdest)}</label>`;
        if (L.bdest === "sale") fields += `<label class="blk">¿Dónde la guardás?${seg("sloc", Object.entries(SALE).map(([k, v]) => [k, v.i + " " + v.l]), L.sloc)}</label>`;
      } else {
        fields += `<p class="note" style="margin:0">Se descuenta primero del stock de la tienda. Si ahí no está, se saca de Mis cartas (y si tampoco, de tu colección).</p>`;
      }
    }
    const rowsHtml = L.rows.map((r, i) => {
      const c = byId.get(r.pick);
      const opts = r.cands.map((id) => { const x = byId.get(id); return `<option value="${esc(id)}" ${id === r.pick ? "selected" : ""}>${esc(baseName(x.n))} · ${esc(versionLabel(x))}</option>`; }).join("");
      return `<div class="pr ${!c ? "bad" : r.sure ? "" : "unsure"}" data-row="${i}">
        <input class="field pq" type="number" min="1" value="${r.q}" aria-label="Cantidad" data-rq>
        ${c ? `<img src="${esc(c.img)}" alt="">` : `<span></span>`}
        <div class="pn">
          ${c ? `<select class="field" data-rp>${opts}</select>` : `<div class="ac"><input class="field" data-fix placeholder="No la encontré. Buscala…"></div>`}
          ${r.orig ? `<div class="orig">${!c ? "❌ " : !r.sure ? '<span class="warn">¿Es esta? </span>' : ""}«${esc(r.orig)}»</div>` : ""}
        </div>
        ${tx ? `<input class="field pp" type="number" min="0" step="any" placeholder="Precio c/u" value="${r.p ?? ""}" data-rpp aria-label="Precio por unidad">` : ""}
        ${c ? `<select class="field lsel" data-rl aria-label="Idioma"><option value="en">Inglés</option><option value="cn" ${lg(r) === "cn" ? "selected" : ""}>🇨🇳 Chino</option></select>` : ""}
        ${L.mode !== "sell" && c && !foilOnly(c) ? `<label class="foilck" title="Foil"><input type="checkbox" data-rf ${r.f ? "checked" : ""}> ✨ Foil</label>` : ""}
        <button class="x" data-rx aria-label="Quitar">×</button>
      </div>`;
    }).join("");
    const ok = L.rows.filter((r) => r.pick);
    const units = ok.reduce((s, r) => s + r.q, 0);
    const total = tx ? ok.reduce((s, r) => s + (r.p || 0) * r.q, 0) : 0;
    const bad = L.rows.length - ok.length;
    $("loaderBody").innerHTML = `
      <h2 id="lTitle">${title}</h2>
      ${fields}
      <div class="ac"><input class="field" id="lSearch" placeholder="🔎 Agregar una carta por nombre…" autocomplete="off"></div>
      <div><p class="note" style="margin:0 0 6px">O pegá una lista, una carta por línea. Ej: <i>3 Jinx - Rebel (OGN-202)</i>${tx ? ". Podés poner el precio al final: <i>1 Jinx - Rebel $1500</i>" : ""}</p>
        <textarea id="lText" placeholder="3 Jinx - Rebel&#10;2 Fury Rune&#10;1 OGN-202">${esc(L.text)}</textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn" id="lParse">Leer lista</button>
        ${PHOTO_URL ? `<a class="btn ghost" href="${esc(PHOTO_URL)}" target="_blank" rel="noopener">📷 ¿Tenés una foto? Pasala a lista con Claude</a>` : `<span class="note">📷 ¿Tenés una foto? Pasala a lista con el lector de fotos de Claude y pegala acá.</span>`}
      </div>
      ${L.rows.length ? `<div class="prev">${rowsHtml}</div>` : ""}
      <div class="lfoot">
        <span class="note">${ok.length ? `${units} ${units === 1 ? "carta" : "cartas"}${tx ? " · Total " + money(total) : ""}` : "Todavía no agregaste cartas"}${bad ? ` · ${bad} sin reconocer` : ""}</span>
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn primary" id="lGo" ${ok.length ? "" : "disabled"}>Confirmar</button>
      </div>`;
    attachAC($("lSearch"), (c) => {
      const p = L.mode === "sell" ? RB.effectivePrice(c, inv) : null;
      L.rows.push({ orig: "", q: 1, cands: [c.id], pick: c.id, sure: true, p });
      drawLoader();
      $("lSearch").focus();
    });
    $("loaderBody").querySelectorAll("[data-fix]").forEach((inp) => {
      const i = Number(inp.closest("[data-row]").dataset.row);
      attachAC(inp, (c) => {
        Object.assign(L.rows[i], { cands: [c.id], pick: c.id, sure: true });
        if (L.mode === "sell" && L.rows[i].p === null) L.rows[i].p = RB.effectivePrice(c, inv);
        drawLoader();
      });
    });
  }

  $("loaderBody").addEventListener("click", (e) => {
    const t = e.target;
    const sb = t.closest("[data-seg] [data-v]");
    if (sb) {
      L[sb.closest("[data-seg]").dataset.seg] = sb.dataset.v;
      if (L.dest === "deck" && !L.deck) L.deck = D.decks[0] ? D.decks[0].id : "new";
      return drawLoader();
    }
    if (t.id === "lParse") {
      const tx = L.mode !== "add";
      L.text = $("lText").value;
      const lines = L.text.split(/\r?\n/);
      let added = 0;
      for (const line of lines) {
        const r = parseLine(line, tx);
        if (!r) continue;
        if (L.mode === "sell" && r.p === null && r.pick) r.p = RB.effectivePrice(byId.get(r.pick), inv);
        L.rows.push(r);
        added++;
      }
      L.text = "";
      drawLoader();
      if (!added) toast("No encontré cartas en esa lista");
      return;
    }
    if (t.closest("[data-rx]")) {
      L.rows.splice(Number(t.closest("[data-row]").dataset.row), 1);
      return drawLoader();
    }
    if (t.id === "lGo") return confirmLoader();
    if (t.closest("[data-again]")) {
      const keep = { dest: L.dest, deck: L.deck, person: L.person };
      openLoader(L.mode, keep);
    }
  });
  $("loaderBody").addEventListener("change", (e) => {
    const t = e.target;
    const row = t.closest("[data-row]");
    if (row) {
      const r = L.rows[Number(row.dataset.row)];
      if (t.hasAttribute("data-rq")) r.q = Math.max(1, Math.floor(Number(t.value) || 1));
      if (t.hasAttribute("data-rp")) { r.pick = t.value; r.sure = true; }
      if (t.hasAttribute("data-rpp")) r.p = t.value === "" ? null : Number(t.value);
      if (t.hasAttribute("data-rf")) r.f = t.checked;
      if (t.hasAttribute("data-rl")) r.l = t.value === "cn" ? "cn" : undefined;
      return drawLoader();
    }
    const k = t.dataset.f;
    if (!k) return;
    L[k] = t.type === "checkbox" ? t.checked : t.value;
    if (k === "deck" || k === "person") drawLoader();
  });
  $("loaderBody").addEventListener("input", (e) => {
    const k = e.target.dataset.f;
    if (k && e.target.type !== "checkbox" && e.target.tagName === "INPUT") L[k] = e.target.value;
    if (e.target.id === "lText") L.text = e.target.value;
  });

  // Saca copias por orden de preferencia.
  // f === true: solo foil · f falso: primero las no foil y después cualquiera.
  function take(cardId, n, prefs, f, l) {
    if (foilOnly(byId.get(cardId))) f = false;
    const out = [];
    const L0 = l === "cn" ? "cn" : "en";
    prefs = prefs.map((pr) => (cp) => lg(cp) === L0 && pr(cp));
    const all = f ? prefs.map((pr) => (cp) => !!cp.f && pr(cp)) : prefs.map((pr) => (cp) => !cp.f && pr(cp)).concat(prefs);
    for (const pr of all) {
      if (out.length >= n) break;
      for (const cp of D.copies) {
        if (out.length >= n) break;
        if (cp.c === cardId && !out.includes(cp) && pr(cp)) out.push(cp);
      }
    }
    return out;
  }

  async function confirmLoader() {
    const rows = L.rows.filter((r) => r.pick);
    const name = (id) => (byId.get(id) || {}).n;
    const lines = [];
    $("lGo").disabled = true;
    try {
      if (L.mode === "add") {
        if (L.dest === "mine" || L.dest === "col") {
          rows.forEach((r) => { for (let i = 0; i < r.q; i++) newCopy(r.pick, L.dest, { f: r.f, l: r.l }); });
          lines.push(`Agregaste ${nc(rows.reduce((s, r) => s + r.q, 0))} a ${L.dest === "mine" ? "Mis cartas" : "Mi colección"} (🏠 en casa).`);
        } else if (L.dest === "deck") {
          let d = deck(L.deck);
          if (!d) {
            if (!L.newDeck.trim()) { $("lGo").disabled = false; return toast("Poné el nombre del mazo"); }
            d = ensureDeck(L.newDeck);
          }
          let created = 0, missing = [];
          for (const r of rows) {
            const got = take(r.pick, r.q, [
              (cp) => cp.loc === "home" && cp.k === "mine",
              (cp) => cp.loc === "home" && cp.k === "col",
              (cp) => cp.loc === "home" && cp.k === "bor",
            ], r.f, r.l);
            got.forEach((cp) => { cp.loc = "deck"; cp.deck = d.id; });
            const rest = r.q - got.length;
            if (rest > 0) {
              if (L.createMissing) { for (let i = 0; i < rest; i++) newCopy(r.pick, "mine", { loc: "deck", deck: d.id, f: r.f, l: r.l }); created += rest; }
              else missing.push(`${rest} × ${name(r.pick)}`);
            }
          }
          lines.push(`Mazo «${d.name}» cargado con ${nc(rows.reduce((s, r) => s + r.q, 0) - missing.reduce((s, x) => s + parseInt(x), 0))}.`);
          if (created) lines.push(`${nc(created)} no ${created === 1 ? "estaba cargada" : "estaban cargadas"} en casa y se ${created === 1 ? "sumó" : "sumaron"} a Mis cartas.`);
          if (missing.length) lines.push("No las tenés en casa (no se agregaron):\n• " + missing.join("\n• "));
          view.deck = d.id;
        } else {
          let p = person(L.person);
          if (!p) {
            if (!L.newPerson.trim()) { $("lGo").disabled = false; return toast("Poné el nombre de la persona"); }
            p = ensurePerson(L.newPerson);
          }
          const date = L.date || today();
          if (L.dest === "borrow") {
            rows.forEach((r) => { for (let i = 0; i < r.q; i++) newCopy(r.pick, "bor", { from: p.id, fs: date, f: r.f, l: r.l }); });
            lines.push(`Anotado: ${p.name} te prestó ${nc(rows.reduce((s, r) => s + r.q, 0))} el ${fdate(date)}.`);
          } else {
            const fromDecks = [], missing = [];
            let created = 0;
            for (const r of rows) {
              const got = take(r.pick, r.q, [
                (cp) => cp.loc === "home" && cp.k === "mine",
                (cp) => cp.loc === "home" && cp.k === "col",
                (cp) => cp.loc === "deck" && cp.k !== "bor",
              ], r.f, r.l);
              got.forEach((cp) => {
                if (cp.loc === "deck") fromDecks.push(`${name(cp.c)} (salió del mazo ${dname(cp.deck)})`);
                cp.loc = "loan"; cp.to = p.id; cp.ls = date; delete cp.deck;
              });
              const rest = r.q - got.length;
              if (rest > 0) {
                if (L.createMissing) { for (let i = 0; i < rest; i++) newCopy(r.pick, "mine", { loc: "loan", to: p.id, ls: date, f: r.f, l: r.l }); created += rest; }
                else missing.push(`${rest} × ${name(r.pick)}`);
              }
            }
            lines.push(`Anotado: le prestaste ${nc(rows.reduce((s, r) => s + r.q, 0))} a ${p.name} el ${fdate(date)}.`);
            if (fromDecks.length) lines.push("Ojo, estas estaban en un mazo:\n• " + fromDecks.join("\n• "));
            if (created) lines.push(`${nc(created)} no ${created === 1 ? "estaba cargada" : "estaban cargadas"} y se ${created === 1 ? "sumó" : "sumaron"} a Mis cartas.`);
            if (missing.length) lines.push("No las encontré cargadas:\n• " + missing.join("\n• "));
          }
          view.person = p.id;
        }
        save();
      } else if (L.mode === "buy") {
        const date = L.date || today();
        if (L.bdest === "sale") {
          await changeStock((items) => {
            rows.forEach((r) => {
              const it = items[r.pick] || { q: 0, p: null };
              if (lg(r) === "cn") it.qc = (it.qc || 0) + r.q;
              else it.q = (it.q || 0) + r.q;
              items[r.pick] = it;
            });
          });
          rows.forEach((r) => (saleLoc[r.pick] = L.sloc));
          await saveSaleLoc();
          lines.push(`Se sumaron ${nc(rows.reduce((s, r) => s + r.q, 0))} al stock de la tienda · ${SALE[L.sloc].i} ${SALE[L.sloc].l}.`);
        } else {
          rows.forEach((r) => { for (let i = 0; i < r.q; i++) newCopy(r.pick, L.bdest, { f: r.f, l: r.l }); });
          lines.push(`Se sumaron ${nc(rows.reduce((s, r) => s + r.q, 0))} a ${L.bdest === "mine" ? "Mis cartas (🏠 en casa)" : "Mi colección"}.`);
        }
        rows.forEach((r) => D.tx.push({ id: uid(), type: "buy", c: r.pick, q: r.q, p: r.p ?? null, d: date, who: L.who.trim(), dest: L.bdest, sloc: L.bdest === "sale" ? L.sloc : undefined, l: lg(r) === "cn" ? "cn" : undefined, at: Date.now() }));
        const tot = rows.reduce((s, r) => s + (r.p || 0) * r.q, 0);
        lines.push(`Compra registrada: ${money(tot)}.`);
        save();
      } else if (L.mode === "sell") {
        const date = L.date || today();
        const plan = new Map();
        await changeStock((items) => {
          rows.forEach((r) => {
            const it = items[r.pick];
            const k = lg(r) === "cn" ? "qc" : "q";
            const have = it ? it[k] || 0 : 0;
            const fromStore = Math.min(have, r.q - (plan.get(r) || 0));
            if (fromStore > 0) it[k] = have - fromStore;
            plan.set(r, fromStore);
          });
        });
        for (const r of rows) {
          const fromStore = plan.get(r) || 0;
          const rest = r.q - fromStore;
          const got = rest > 0 ? take(r.pick, rest, [
            (cp) => cp.k === "mine" && cp.loc === "home",
            (cp) => cp.k === "mine" && cp.loc === "deck",
            (cp) => cp.k === "col" && cp.loc === "home",
            (cp) => cp.k === "col" && cp.loc === "deck",
          ], false, r.l) : [];
          const parts = [];
          if (fromStore) parts.push(`${fromStore} del stock de la tienda${SALE[saleLoc[r.pick]] ? " (" + SALE[saleLoc[r.pick]].i + " " + SALE[saleLoc[r.pick]].l + ")" : ""}`);
          const inDeck = got.filter((cp) => cp.loc === "deck");
          const mineN = got.filter((cp) => cp.k === "mine").length;
          const colN = got.filter((cp) => cp.k === "col").length;
          if (mineN) parts.push(`${mineN} de Mis cartas`);
          if (colN) parts.push(`${colN} de tu colección`);
          if (inDeck.length) parts.push(`estaba en mazo ${[...new Set(inDeck.map((cp) => dname(cp.deck)))].join(", ")}`);
          const nf = rest - got.length;
          if (nf > 0) parts.push(`${nf} no estaba cargada en ningún lado`);
          D.copies = D.copies.filter((cp) => !got.includes(cp));
          const src = parts.join(" · ");
          lines.push(`• ${r.q} × ${name(r.pick)}${lg(r) === "cn" ? " (chino)" : ""}: ${src}`);
          D.tx.push({ id: uid(), type: "sell", c: r.pick, q: r.q, p: r.p ?? null, d: date, who: L.who.trim(), src, l: lg(r) === "cn" ? "cn" : undefined, at: Date.now() });
        }
        const tot = rows.reduce((s, r) => s + (r.p || 0) * r.q, 0);
        lines.unshift(`Venta registrada: ${money(tot)}. De dónde salió cada carta:`);
        save();
      }
    } catch (err) {
      $("lGo").disabled = false;
      return toast("Error: " + err.message);
    }
    L.done = lines.join("\n");
    drawLoader();
    renderAlert();
    renderMain();
  }

  // ---------- Copia de seguridad ----------
  $("backup").addEventListener("click", () => {
    $("modalBody").innerHTML = `<div style="grid-column:1/-1">
      <h2>💾 Copia de seguridad</h2>
      <p class="note">Descargá un archivo con todo: tus cartas, colección, mazos, préstamos, compras y ventas, el stock y los precios de la tienda, y dónde guardás cada carta en venta. Guardalo en tu PC (por ejemplo en «proyectos de claude»). Si algún día se borra la página, con ese archivo se recupera todo.</p>
      <div class="mini"><button class="btn primary" id="bkDown">⬇️ Descargar copia</button></div>
      <h3 class="sub">Restaurar</h3>
      <p class="note">Reemplaza todo lo que hay ahora por lo que tiene el archivo.</p>
      <input type="file" id="bkFile" accept=".json,application/json">
      <div class="note" id="bkMsg"></div>
    </div>`;
    open("modal");
    $("bkDown").onclick = async () => {
      try {
        const [col, invNow] = await Promise.all([api("GET"), RB.loadInventory()]);
        const out = { app: "mi-carpeta-riftbound", version: 1, fecha: new Date().toISOString(), data: col.data, saleLoc: col.saleLoc, inventory: invNow };
        const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `copia-mi-carpeta-${today()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        $("bkMsg").textContent = "Copia descargada ✓";
      } catch (e) {
        $("bkMsg").textContent = "No se pudo descargar: " + e.message;
      }
    };
    $("bkFile").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const b = JSON.parse(await file.text());
        if (!b || b.app !== "mi-carpeta-riftbound" || !b.data || !Array.isArray(b.data.copies)) throw new Error("ese archivo no es una copia de Mi carpeta");
        if (!window.confirm(`¿Restaurar la copia del ${String(b.fecha || "").slice(0, 10)}? Se reemplaza todo lo que hay ahora.`)) return;
        await api("POST", { data: b.data, saleLoc: b.saleLoc || {} });
        if (b.inventory && b.inventory.items) {
          await RB.getJSON("/api/inventory", {
            method: "POST",
            headers: { "content-type": "application/json", "x-admin-password": pw },
            body: JSON.stringify({ settings: b.inventory.settings, items: b.inventory.items }),
          });
        }
        $("bkMsg").textContent = "Copia restaurada ✓ Recargando…";
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        $("bkMsg").textContent = "No se pudo restaurar: " + err.message;
      }
    };
  });

  // ---------- Ventanas ----------
  function open(id) {
    if (id === "loader") $("modal").classList.remove("open");
    $(id).classList.add("open");
    $("overlay").classList.add("open");
  }
  function close() {
    ["modal", "loader", "side"].forEach((id) => $(id).classList.remove("open"));
    $("overlay").classList.remove("open");
    openId = null;
  }
  $("overlay").addEventListener("click", close);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  $("openFilters").addEventListener("click", () => open("side"));
  let tt;
  function toast(t) {
    $("toast").textContent = t;
    $("toast").classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => $("toast").classList.remove("show"), 2400);
  }

  const saved = getPw();
  if (saved) check(saved).then(() => { pw = saved; start(); }).catch(() => setPw(""));
})();

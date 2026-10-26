(() => {
  const $ = (id) => document.getElementById(id);
  const PAGE = 60;
  let pw = "";
  let cards = [];
  let cardsMeta = {};
  let inv = null;
  let dirty = false;
  let list = [];
  let shown = 0;

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
    const p = $("pw").value;
    try {
      await check(p);
      pw = p;
      setPw(p);
      start();
    } catch (err) {
      $("loginErr").textContent = err.message;
    }
  });
  $("logout").addEventListener("click", () => {
    if (dirty && !confirmLeave()) return;
    setPw("");
    location.reload();
  });
  function confirmLeave() {
    return window.confirm("Tenés cambios sin guardar. ¿Salir igual?");
  }

  async function start() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("bar").hidden = false;
    $("logout").hidden = false;
    $("rows").innerHTML = `<div class="loading">Cargando cartas…</div>`;
    try {
      const [c, i] = await Promise.all([RB.loadCards(), RB.loadInventory()]);
      cards = c.cards || [];
      cardsMeta = c;
      inv = i;
      inv.items = inv.items || {};
      inv.settings = inv.settings || {};
      inv.settings.rarityPrices = inv.settings.rarityPrices || {};
    } catch (e) {
      $("rows").innerHTML = `<div class="empty">No se pudieron cargar los datos: ${RB.esc(e.message)}</div>`;
      return;
    }
    fillSelects();
    fillConfig();
    run();
  }

  // ---------- Stock y precios ----------
  function fillSelects() {
    const setLabels = new Map(cards.map((c) => [c.s, c.sl || c.s]));
    const sets = RB.uniqueSorted(cards, (c) => c.s, (a, b) => setLabels.get(a).localeCompare(setLabels.get(b)));
    $("aSet").insertAdjacentHTML("beforeend", sets.map((s) => `<option value="${RB.esc(s)}">${RB.esc(setLabels.get(s))}</option>`).join(""));
    const rars = RB.uniqueSorted(cards, (c) => c.r, (a, b) => RB.rarityRank(a) - RB.rarityRank(b));
    $("aRar").insertAdjacentHTML("beforeend", rars.map((r) => `<option value="${RB.esc(r)}">${RB.esc(RB.RARITY_ES[r] || r)}</option>`).join(""));
  }

  function stats() {
    let refs = 0, units = 0, value = 0;
    for (const c of cards) {
      const q = RB.stock(c, inv);
      if (q > 0) {
        refs++;
        units += q;
        const p = RB.effectivePrice(c, inv);
        if (p !== null) value += p * q;
      }
    }
    $("stats").innerHTML =
      `<span>Cartas distintas en stock: <b>${refs}</b></span><span>Unidades: <b>${units}</b></span><span>Valor del stock: <b>${RB.money(value, inv)}</b></span>`;
  }

  function run() {
    const q = $("aq").value.trim().toLowerCase();
    const s = $("aSet").value;
    const r = $("aRar").value;
    const only = $("aStock").checked;
    list = cards
      .filter((c) =>
        (!q || q.split(/\s+/).every((w) => (c.n + " " + c.code).toLowerCase().includes(w))) &&
        (!s || c.s === s) && (!r || c.r === r) && (!only || RB.stock(c, inv) > 0)
      )
      .sort((a, b) => a.s.localeCompare(b.s) || (a.num ?? 0) - (b.num ?? 0) || a.n.localeCompare(b.n));
    shown = 0;
    $("rows").innerHTML = list.length ? "" : `<div class="empty">No hay cartas con esos filtros.</div>`;
    more();
    stats();
  }

  function row(c) {
    const it = inv.items[c.id] || {};
    const rp = inv.settings.rarityPrices[c.r];
    const v = RB.variantLabel(c);
    return `<div class="r" data-id="${RB.esc(c.id)}">
      <img loading="lazy" src="${RB.esc(c.img)}" alt="">
      <div>
        <div class="n">${RB.esc(c.n)}</div>
        <div class="m">${RB.esc(c.sl || c.s)}${c.num !== null ? " #" + c.num : ""} · ${RB.esc(RB.RARITY_ES[c.r] || c.r)}${v.length ? " · " + RB.esc(v.join(", ")) : ""}</div>
      </div>
      <div class="ctl">
        <div><label>Cantidad</label>
          <div class="qty"><button data-d="-1" aria-label="Menos">−</button><input class="q" type="number" min="0" value="${it.q || 0}" aria-label="Cantidad"><button data-d="1" aria-label="Más">+</button></div>
        </div>
        <div><label>Precio</label>
          <input class="pinput p" type="number" min="0" step="any" value="${it.p ?? ""}" placeholder="${rp !== undefined ? rp : "Consultar"}" title="Vacío = precio por rareza" aria-label="Precio">
        </div>
      </div>
    </div>`;
  }

  function more() {
    const next = list.slice(shown, shown + PAGE);
    $("rows").insertAdjacentHTML("beforeend", next.map(row).join(""));
    shown += next.length;
    $("aMore").innerHTML = shown < list.length ? `<button class="btn" id="aMoreBtn">Ver más (${list.length - shown} restantes)</button>` : "";
    const b = $("aMoreBtn");
    if (b) b.onclick = more;
  }

  let st;
  function setItem(id, patch) {
    const cur = inv.items[id] || { q: 0, p: null };
    inv.items[id] = { ...cur, ...patch };
    markDirty();
    clearTimeout(st);
    st = setTimeout(stats, 250);
  }

  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    const r = b.closest(".r");
    const inp = r.querySelector(".q");
    inp.value = Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.d));
    setItem(r.dataset.id, { q: Number(inp.value) });
    r.classList.add("dirty");
  });
  $("rows").addEventListener("input", (e) => {
    const r = e.target.closest(".r");
    if (!r) return;
    if (e.target.classList.contains("q")) setItem(r.dataset.id, { q: Math.max(0, Math.floor(Number(e.target.value) || 0)) });
    if (e.target.classList.contains("p")) setItem(r.dataset.id, { p: e.target.value === "" ? null : Number(e.target.value) });
    r.classList.add("dirty");
  });

  let qt;
  $("aq").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(run, 180); });
  ["aSet", "aRar", "aStock"].forEach((k) => $(k).addEventListener("change", run));

  // ---------- Configuración ----------
  function fillConfig() {
    const s = inv.settings;
    $("cName").value = s.storeName || "";
    $("cWa").value = s.whatsapp || "";
    $("cCur").value = s.currency || "$";
    $("cNote").value = s.note || "";
    const rars = RB.uniqueSorted(cards, (c) => c.r, (a, b) => RB.rarityRank(a) - RB.rarityRank(b));
    $("rp").innerHTML = rars
      .map((r) => `<span>${RB.esc(RB.RARITY_ES[r] || r)}</span><input class="field" type="number" min="0" step="any" data-r="${RB.esc(r)}" value="${s.rarityPrices[r] ?? ""}" placeholder="Consultar">`)
      .join("");
    $("cardsInfo").textContent =
      `${cards.length.toLocaleString("es-AR")} cartas cargadas` +
      (cardsMeta.updatedAt ? ` · última actualización: ${new Date(cardsMeta.updatedAt).toLocaleString("es-AR")}` : "");
  }
  ["cName", "cWa", "cCur", "cNote"].forEach((k) =>
    $(k).addEventListener("input", () => {
      inv.settings.storeName = $("cName").value;
      inv.settings.whatsapp = $("cWa").value.replace(/\D/g, "");
      inv.settings.currency = $("cCur").value;
      inv.settings.note = $("cNote").value;
      markDirty();
    })
  );
  $("rp").addEventListener("input", (e) => {
    const r = e.target.dataset.r;
    if (!r) return;
    if (e.target.value === "") delete inv.settings.rarityPrices[r];
    else inv.settings.rarityPrices[r] = Number(e.target.value);
    markDirty();
  });
  $("refreshCards").addEventListener("click", async (e) => {
    const b = e.target;
    b.disabled = true;
    b.textContent = "Actualizando… (puede tardar unos segundos)";
    try {
      const c = await RB.loadCards(true, pw);
      cards = c.cards || [];
      cardsMeta = c;
      fillConfig();
      run();
      toast("Lista actualizada: " + cards.length + " cartas");
    } catch (err) {
      toast("Error: " + err.message);
    }
    b.disabled = false;
    b.textContent = "Actualizar lista de cartas ahora";
  });

  // ---------- Pestañas ----------
  document.querySelectorAll("[data-tab]").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((x) => {
        x.setAttribute("aria-selected", x === t);
        $(x.dataset.tab).hidden = x !== t;
      });
    })
  );

  // ---------- Guardar ----------
  function markDirty() {
    dirty = true;
    $("save").disabled = false;
    $("saveState").textContent = "Tenés cambios sin guardar";
  }
  $("save").addEventListener("click", async () => {
    $("save").disabled = true;
    $("saveState").textContent = "Guardando…";
    try {
      await RB.getJSON("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ settings: inv.settings, items: inv.items }),
      });
      dirty = false;
      document.querySelectorAll(".r.dirty").forEach((r) => r.classList.remove("dirty"));
      $("saveState").textContent = "Guardado ✓ · ya se ve en la tienda";
      stats();
    } catch (e) {
      $("save").disabled = false;
      $("saveState").textContent = "No se pudo guardar: " + e.message;
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  let tt;
  function toast(t) {
    $("toast").textContent = t;
    $("toast").classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => $("toast").classList.remove("show"), 2500);
  }

  // Si ya había entrado en esta pestaña, entra solo.
  const saved = getPw();
  if (saved) {
    check(saved).then(() => { pw = saved; start(); }).catch(() => setPw(""));
  }
})();

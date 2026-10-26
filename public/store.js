(() => {
  const $ = (id) => document.getElementById(id);
  const PAGE = 48;

  let cards = [];
  let byId = new Map();
  let inv = { settings: { currency: "$", rarityPrices: {} }, items: {} };
  let list = [];
  let shown = 0;
  let cart = RB.store.get("rb-cart", []);

  const f = {
    q: "", sets: new Set(), doms: new Set(), types: new Set(), rars: new Set(), vars: new Set(),
    eMin: null, eMax: null, pMin: null, pMax: null, inStock: false, sort: "rel",
  };

  // ---------- Carga ----------
  async function init() {
    try {
      const [c, i] = await Promise.all([RB.loadCards(), RB.loadInventory()]);
      cards = c.cards || [];
      inv = i;
      byId = new Map(cards.map((x) => [x.id, x]));
    } catch (e) {
      $("loading").textContent = "No se pudieron cargar las cartas. Probá recargar la página en un momento. (" + e.message + ")";
      return;
    }
    $("loading").style.display = "none";
    applySettings();
    buildFilters();
    // Si hay stock cargado, arrancamos mostrando solo lo disponible.
    f.inStock = Object.values(inv.items).some((x) => x.q > 0);
    $("inStock").checked = f.inStock;
    cart = cart.filter((x) => byId.has(x.id));
    renderCart();
    run();
  }

  function applySettings() {
    const s = inv.settings;
    const name = s.storeName || "Tienda Riftbound";
    document.title = name;
    const parts = name.split(" ");
    const last = parts.length > 1 ? parts.pop() : "";
    $("brand").innerHTML = RB.esc(parts.join(" ")) + (last ? " <span>" + RB.esc(last) + "</span>" : "");
    $("foot").textContent =
      (s.note ? s.note + " · " : "") + "Imágenes de cartas: Riot Games. Sitio no oficial, no afiliado a Riot Games.";
  }

  // ---------- Filtros ----------
  function checkList(el, values, setRef, labelFn, countFn) {
    el.innerHTML = values
      .map(
        (v) =>
          `<label class="check"><input type="checkbox" value="${RB.esc(v)}"> ${RB.esc(labelFn(v))}<span class="cnt">${countFn(v)}</span></label>`
      )
      .join("");
    el.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("change", () => {
        inp.checked ? setRef.add(inp.value) : setRef.delete(inp.value);
        run();
      })
    );
  }

  function buildFilters() {
    const count = (fn) => {
      const m = new Map();
      cards.forEach((c) => [].concat(fn(c)).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
      return (v) => m.get(v) || 0;
    };

    const setLabels = new Map(cards.map((c) => [c.s, c.sl || c.s]));
    const sets = RB.uniqueSorted(cards, (c) => c.s, (a, b) => setLabels.get(a).localeCompare(setLabels.get(b)));
    checkList($("fSets"), sets, f.sets, (v) => setLabels.get(v), count((c) => c.s));

    const doms = RB.uniqueSorted(cards, (c) => RB.dom(c));
    $("fDoms").innerHTML = doms
      .map(
        (d) =>
          `<button class="chip" aria-pressed="false" data-v="${RB.esc(d)}"><span class="dot" style="background:${RB.DOMAIN_COLORS[d] || "#888"}"></span>${RB.esc(RB.DOMAIN_ES[d] || d)}</button>`
      )
      .join("");
    $("fDoms").querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.v;
        f.doms.has(v) ? f.doms.delete(v) : f.doms.add(v);
        b.setAttribute("aria-pressed", f.doms.has(v));
        run();
      })
    );

    const types = RB.uniqueSorted(cards, (c) => c.t);
    checkList($("fTypes"), types, f.types, (v) => RB.TYPE_ES[v] || v, count((c) => c.t));

    const rars = RB.uniqueSorted(cards, (c) => c.r, (a, b) => RB.rarityRank(a) - RB.rarityRank(b));
    checkList($("fRars"), rars, f.rars, (v) => RB.RARITY_ES[v] || v, count((c) => c.r));

    const vkey = (c) => {
      const k = [];
      if (c.alt) k.push("alt");
      if (c.sig) k.push("sig");
      if (c.ov) k.push("ov");
      return k.length ? k : ["normal"];
    };
    const vlab = { normal: "Normal", alt: "Arte alternativo", sig: "Firma", ov: "Sobrenumerada" };
    const vars = ["normal", "alt", "sig", "ov"].filter((v) => count(vkey)(v) > 0);
    checkList($("fVars"), vars, f.vars, (v) => vlab[v], count(vkey));
  }

  const num = (v) => (v === "" || v === null || isNaN(Number(v)) ? null : Number(v));

  function matches(c) {
    if (f.q) {
      const hay = (c.n + " " + c.txt + " " + c.st + " " + c.code).toLowerCase();
      if (!f.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (f.sets.size && !f.sets.has(c.s)) return false;
    if (f.doms.size && !RB.dom(c).some((d) => f.doms.has(d))) return false;
    if (f.types.size && !f.types.has(c.t)) return false;
    if (f.rars.size && !f.rars.has(c.r)) return false;
    if (f.vars.size) {
      const ok =
        (f.vars.has("normal") && !c.alt && !c.sig && !c.ov) ||
        (f.vars.has("alt") && c.alt) || (f.vars.has("sig") && c.sig) || (f.vars.has("ov") && c.ov);
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
    if (f.inStock && RB.stock(c, inv) <= 0) return false;
    return true;
  }

  function sorter() {
    const price = (c) => RB.effectivePrice(c, inv);
    const byNum = (a, b) => a.s.localeCompare(b.s) || (a.num ?? 0) - (b.num ?? 0) || a.n.localeCompare(b.n);
    switch (f.sort) {
      case "name": return (a, b) => a.n.localeCompare(b.n);
      case "pa": return (a, b) => (price(a) ?? 1e12) - (price(b) ?? 1e12);
      case "pd": return (a, b) => (price(b) ?? -1) - (price(a) ?? -1);
      case "num": return byNum;
      default:
        return (a, b) =>
          (RB.stock(b, inv) > 0) - (RB.stock(a, inv) > 0) ||
          RB.rarityRank(b.r) - RB.rarityRank(a.r) ||
          byNum(a, b);
    }
  }

  function run() {
    list = cards.filter(matches).sort(sorter());
    shown = 0;
    $("grid").innerHTML = "";
    $("count").textContent = list.length.toLocaleString("es-AR") + (list.length === 1 ? " carta" : " cartas");
    if (!list.length) {
      $("grid").innerHTML = `<div class="empty" style="grid-column:1/-1">No hay cartas con esos filtros.</div>`;
    }
    more();
  }

  // ---------- Grilla ----------
  function tile(c) {
    const st = RB.stock(c, inv);
    const p = RB.effectivePrice(c, inv);
    const v = RB.variantLabel(c);
    const land = c.o === "landscape" || c.t === "Battlefield";
    return `<article class="tile ${st > 0 ? "" : "out"}">
      <button class="pic ${land ? "land" : ""}" data-open="${RB.esc(c.id)}" aria-label="Ver ${RB.esc(c.n)}">
        <img loading="lazy" src="${RB.esc(c.img)}" alt="${RB.esc(c.n)}" onerror="this.style.visibility='hidden'">
        ${v.length ? `<span class="flag">${RB.esc(v[0])}</span>` : ""}
      </button>
      <div class="info">
        <div class="name">${RB.esc(c.n)}</div>
        <div class="meta">
          <span class="doms">${RB.dom(c).map((d) => `<i style="background:${RB.DOMAIN_COLORS[d] || "#888"}" title="${RB.esc(RB.DOMAIN_ES[d] || d)}"></i>`).join("")}</span>
          <span>${RB.esc(c.sl || c.s)}${c.num !== null ? " #" + c.num : ""}</span>
          <span class="rar ${RB.esc(c.r)}">${RB.esc(RB.RARITY_ES[c.r] || c.r)}</span>
        </div>
        <div class="row">
          <div>
            <div class="price">${RB.money(p, inv)}</div>
            <div class="stock ${st > 0 ? "" : "no"}">${st > 0 ? "Stock: " + st : "Sin stock"}</div>
          </div>
          <button class="btn primary add" data-add="${RB.esc(c.id)}" ${st > 0 ? "" : "disabled"}>Agregar</button>
        </div>
      </div>
    </article>`;
  }

  function more() {
    const next = list.slice(shown, shown + PAGE);
    $("grid").insertAdjacentHTML("beforeend", next.map(tile).join(""));
    shown += next.length;
    $("more").innerHTML = shown < list.length ? `<button class="btn" id="moreBtn">Ver más cartas</button>` : "";
    const b = $("moreBtn");
    if (b) {
      b.onclick = more;
      io.observe(b);
    }
  }
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (e.isIntersecting) {
        io.unobserve(e.target);
        more();
      }
    });
  }, { rootMargin: "600px" });

  // ---------- Detalle ----------
  function openCard(id) {
    const c = byId.get(id);
    if (!c) return;
    const st = RB.stock(c, inv);
    const p = RB.effectivePrice(c, inv);
    const stats = [];
    if (c.e !== null) stats.push(["Energía", c.e]);
    if (c.p !== null) stats.push(["Poder", c.p]);
    if (c.m !== null) stats.push(["Fuerza", c.m]);
    const rows = [
      ["Expansión", (c.sl || c.s) + (c.num !== null ? " #" + c.num : "")],
      ["Tipo", (RB.TYPE_ES[c.t] || c.t) + (c.st ? " · " + c.st : "")],
      ["Dominio", RB.dom(c).map((d) => RB.DOMAIN_ES[d] || d).join(", ")],
      ["Rareza", RB.RARITY_ES[c.r] || c.r],
      ...stats,
    ];
    const v = RB.variantLabel(c);
    if (v.length) rows.push(["Versión", v.join(", ")]);
    if (c.art) rows.push(["Ilustrador", c.art]);
    $("modalBody").innerHTML = `
      <div><img src="${RB.esc(c.img)}" alt="${RB.esc(c.n)}"></div>
      <div>
        <h2 id="mName">${RB.esc(c.n)}</h2>
        <div class="price" style="font-size:22px">${RB.money(p, inv)}</div>
        <div class="stock ${st > 0 ? "" : "no"}">${st > 0 ? st + " disponibles" : "Sin stock"}</div>
        <dl class="kv">${rows.map(([k, val]) => `<dt>${k}</dt><dd>${RB.esc(val)}</dd>`).join("")}</dl>
        ${c.txt ? `<div class="ctext">${RB.esc(RB.cleanText(c.txt))}</div>` : ""}
        <div style="display:flex;gap:10px;margin-top:16px;align-items:center;flex-wrap:wrap">
          <div class="qty"><button data-step="-1" aria-label="Menos">−</button><input id="mQty" type="number" value="1" min="1" max="${st}" aria-label="Cantidad"><button data-step="1" aria-label="Más">+</button></div>
          <button class="btn primary" id="mAdd" ${st > 0 ? "" : "disabled"}>Agregar al pedido</button>
        </div>
      </div>`;
    const qi = $("mQty");
    $("modalBody").querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        qi.value = Math.max(1, Math.min(st || 1, (Number(qi.value) || 1) + Number(b.dataset.step)));
      })
    );
    $("mAdd").onclick = () => {
      addToCart(c.id, Math.max(1, Number(qi.value) || 1));
      close();
    };
    open("modal");
  }

  // ---------- Carrito ----------
  function inCart(id) {
    const it = cart.find((x) => x.id === id);
    return it ? it.q : 0;
  }
  function addToCart(id, q = 1) {
    const c = byId.get(id);
    const max = RB.stock(c, inv);
    const cur = inCart(id);
    const want = Math.min(max, cur + q);
    if (want <= cur) return toast("No hay más stock de esta carta");
    const it = cart.find((x) => x.id === id);
    it ? (it.q = want) : cart.push({ id, q: want });
    saveCart();
    toast("Agregada: " + c.n);
  }
  function saveCart() {
    RB.store.set("rb-cart", cart);
    renderCart();
  }
  function renderCart() {
    let total = 0;
    let unknown = false;
    cart = cart.filter((x) => x.q > 0);
    $("cartCount").textContent = cart.reduce((a, x) => a + x.q, 0);
    if (!cart.length) {
      $("cartBody").innerHTML = `<p class="empty">Tu pedido está vacío.</p>`;
    } else {
      $("cartBody").innerHTML = cart
        .map((x) => {
          const c = byId.get(x.id);
          const p = RB.effectivePrice(c, inv);
          if (p === null) unknown = true;
          else total += p * x.q;
          return `<div class="citem">
            <img src="${RB.esc(c.img)}" alt="">
            <div><div class="n">${RB.esc(c.n)}</div><div class="s">${RB.esc(c.sl || c.s)} · ${RB.money(p, inv)} c/u</div></div>
            <div class="qty"><button data-cq="${RB.esc(x.id)}" data-d="-1" aria-label="Menos">−</button><input value="${x.q}" readonly aria-label="Cantidad"><button data-cq="${RB.esc(x.id)}" data-d="1" aria-label="Más">+</button></div>
          </div>`;
        })
        .join("");
    }
    $("cartTotal").textContent = RB.money(total, inv) + (unknown ? " + a consultar" : "");
    const wa = inv.settings.whatsapp;
    $("sendWa").disabled = !cart.length || !wa;
    $("cartNote").textContent = wa
      ? "Se abre WhatsApp con tu pedido listo para enviar. El vendedor te confirma stock y forma de pago."
      : "El vendedor todavía no configuró su WhatsApp.";
  }
  $("cartBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cq]");
    if (!b) return;
    const it = cart.find((x) => x.id === b.dataset.cq);
    const max = RB.stock(byId.get(it.id), inv);
    it.q = Math.max(0, Math.min(max, it.q + Number(b.dataset.d)));
    saveCart();
  });
  $("sendWa").addEventListener("click", () => {
    const lines = cart.map((x) => {
      const c = byId.get(x.id);
      const p = RB.effectivePrice(c, inv);
      return `• ${x.q} x ${c.n} (${c.sl || c.s}${c.num !== null ? " #" + c.num : ""}) - ${RB.money(p, inv)} c/u`;
    });
    const name = $("custName").value.trim();
    const msg =
      "¡Hola! Quiero hacer este pedido:\n\n" + lines.join("\n") +
      "\n\nTotal: " + $("cartTotal").textContent + (name ? "\n\nMi nombre: " + name : "");
    window.open("https://wa.me/" + inv.settings.whatsapp + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  });

  // ---------- Ventanas ----------
  function open(id) {
    $(id).classList.add("open");
    $("overlay").classList.add("open");
  }
  function close() {
    ["modal", "cart", "side"].forEach((id) => $(id).classList.remove("open"));
    $("overlay").classList.remove("open");
  }
  let tt;
  function toast(t) {
    $("toast").textContent = t;
    $("toast").classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => $("toast").classList.remove("show"), 1800);
  }

  // ---------- Eventos ----------
  $("grid").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) return openCard(o.dataset.open);
    const a = e.target.closest("[data-add]");
    if (a) addToCart(a.dataset.add);
  });
  $("overlay").addEventListener("click", close);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  $("openCart").addEventListener("click", () => open("cart"));
  $("openFilters").addEventListener("click", () => open("side"));

  let qt;
  $("q").addEventListener("input", (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => {
      f.q = e.target.value.trim().toLowerCase();
      run();
    }, 180);
  });
  ["eMin", "eMax", "pMin", "pMax"].forEach((k) =>
    $(k).addEventListener("input", (e) => {
      f[k] = num(e.target.value);
      run();
    })
  );
  $("inStock").addEventListener("change", (e) => {
    f.inStock = e.target.checked;
    run();
  });
  $("sort").addEventListener("change", (e) => {
    f.sort = e.target.value;
    run();
  });
  $("clear").addEventListener("click", () => {
    ["sets", "doms", "types", "rars", "vars"].forEach((k) => f[k].clear());
    ["eMin", "eMax", "pMin", "pMax"].forEach((k) => { f[k] = null; $(k).value = ""; });
    f.q = "";
    $("q").value = "";
    document.querySelectorAll("#side input[type=checkbox]").forEach((i) => (i.checked = false));
    document.querySelectorAll("#fDoms .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
    run();
  });

  init();
})();

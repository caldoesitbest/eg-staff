/* Staff Hub: the shop's product editor and picture uploads.
   Pictures are shrunk in the browser (a full copy up to 2000px and a small one for grids), then go straight to
   the public shop-media bucket. The database checks every field again when you save; this only makes it easy. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, C } = H;
  const EG = window.EG;
  const BUCKET = "shop-media";
  const MEDIA = String(C.SUPABASE_URL || "").replace(/\/+$/, "") + "/storage/v1/object/public/" + BUCKET + "/";
  const mediaUrl = (path) => (path ? MEDIA + String(path).split("/").map(encodeURIComponent).join("/") : "");
  const SHOP = (H.shop = H.shop || {});
  SHOP.mediaUrl = mediaUrl;

  /* ---------- money in, money out ---------- */
  function toCents(v) {
    const s = String(v === null || v === undefined ? "" : v).replace(/[^0-9.]/g, "");
    if (!s) return null;
    const n = Math.round(parseFloat(s) * 100);
    return isFinite(n) ? n : null;
  }
  const fromCents = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
  let moneyFmt = null;
  function money(c, cur) {
    if (c === null || c === undefined) return "";
    if (!moneyFmt || moneyFmt.cur !== (cur || "USD")) {
      try { moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }); } catch (e) { moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }); }
      moneyFmt.cur = cur || "USD";
    }
    return moneyFmt.format(c / 100);
  }
  const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  SHOP.toCents = toCents; SHOP.fromCents = fromCents; SHOP.money = money; SHOP.slugify = slugify;

  /* ---------- pictures ---------- */
  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch (e) { /* try the old way */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  // WebP where the browser can make it, otherwise JPEG on the shop's dark background
  function encode(src, max) {
    const w0 = src.width, h0 = src.height;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      cv.toBlob((b) => {
        if (b && b.type === "image/webp") { resolve({ blob: b, w: w, h: h }); return; }
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#070a22";
        ctx.fillRect(0, 0, w, h);
        cv.toBlob((j) => (j ? resolve({ blob: j, w: w, h: h }) : reject(new Error("This browser couldn't prepare the picture."))), "image/jpeg", 0.88);
      }, "image/webp", 0.86);
    });
  }
  function put(path, blob, token, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", C.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1/object/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/"));
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.setRequestHeader("apikey", C.SUPABASE_KEY);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("Content-Type", blob.type);
      xhr.setRequestHeader("Cache-Control", "max-age=31536000");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 403 || xhr.status === 401 ? "The upload was refused. You need the shop's edit permission." : "The upload was refused (" + xhr.status + ").")));
      xhr.onerror = () => reject(new Error("The upload stopped. Check your connection."));
      xhr.send(blob);
    });
  }
  /* One file in, one ready media record out: {media_id, path, thumb, w, h, alt}. onStep(text, 0..1) reports progress. */
  async function uploadOne(file, onStep) {
    if (!/^image\//.test(file.type || "") && !/\.(jpe?g|png|webp|gif|avif)$/i.test(file.name)) throw new Error(file.name + " isn't a picture.");
    if (file.size > 40 * 1024 * 1024) throw new Error(file.name + " is over 40 MB. Export a smaller copy.");
    onStep && onStep("Preparing", 0.05);
    let src;
    try { src = await decode(file); } catch (e) { throw new Error("Couldn't read " + file.name + ". Use JPG, PNG or WebP."); }
    const full = await encode(src, 2000);
    const small = await encode(src, 720);
    if (src.close) src.close();
    const { data } = await EG.sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error("Your sign-in ran out. Refresh the page.");
    const begun = await H.rpc("shop_media_begin", { p_mime: full.blob.type, p_size: full.blob.size, p_thumb_size: small.blob.size, p_width: full.w, p_height: full.h });
    const total = full.blob.size + small.blob.size;
    await put(begun.path, full.blob, token, (k) => onStep && onStep("Uploading", 0.1 + 0.85 * (k * full.blob.size) / total));
    if (begun.thumb) await put(begun.thumb, small.blob, token, (k) => onStep && onStep("Uploading", 0.1 + 0.85 * (full.blob.size + k * small.blob.size) / total));
    const done = await H.rpc("shop_media_done", { p_id: begun.id });
    onStep && onStep("Done", 1);
    return { media_id: done.id, path: done.path, thumb: done.thumb, w: done.w, h: done.h, alt: "" };
  }
  /* A drop zone that uploads and hands back each ready picture. */
  function dropZone(opts) {
    const pick = el("input", { type: "file", accept: "image/*", multiple: opts.multiple !== false, hidden: true });
    const rows = el("div", { class: "files" });
    const zone = el("div", { class: "drop ss-drop", role: "button", tabindex: "0", "aria-label": opts.label || "Add pictures" }, [ic("image-plus"),
      el("b", { text: opts.title || "Drop pictures here or tap to choose" }), el("span", { class: "faint", text: opts.hint || "JPG, PNG or WebP. They're resized for the web automatically." })]);
    async function take(list) {
      for (const file of Array.from(list || [])) {
        const bar = el("i", { style: "--p:0%" });
        const what = el("span", { class: "faint", text: "Preparing " + file.name });
        const row = el("div", { class: "upl" }, [what, el("span", { class: "prog" }, bar)]);
        rows.append(row);
        try {
          const m = await uploadOne(file, (step, k) => { what.textContent = step + " " + file.name; bar.style.setProperty("--p", Math.round(k * 100) + "%"); });
          row.remove();
          opts.onReady(m);
        } catch (e) { row.remove(); H.fail(e); }
        if (opts.multiple === false) break;
      }
    }
    zone.addEventListener("click", () => pick.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick.click(); } });
    zone.addEventListener("dragover", (e) => { if (Array.from(e.dataTransfer.types || []).includes("Files")) { e.preventDefault(); zone.classList.add("over"); } });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); zone.classList.remove("over"); take(e.dataTransfer.files); });
    pick.addEventListener("change", () => { take(pick.files); pick.value = ""; });
    return el("div", { class: "ss-dropwrap" }, [zone, pick, rows]);
  }
  /* Pictures nothing uses any more: delete the files, then forget them. Quiet unless it fails. */
  async function clearOrphans(list) {
    list = (list || []).filter((m) => m && m.id);
    if (!list.length) return 0;
    const paths = list.flatMap((m) => [m.path, m.thumb].filter(Boolean));
    const { error } = await EG.sb.storage.from(BUCKET).remove(paths);
    if (error) throw new Error("Couldn't delete unused pictures from storage.");
    const r = await H.rpc("shop_media_forget", { p_ids: list.map((m) => m.id) });
    return (r && r.forgotten) || 0;
  }
  SHOP.uploadOne = uploadOne; SHOP.dropZone = dropZone; SHOP.clearOrphans = clearOrphans;

  /* ---------- small form parts ---------- */
  const field = (label, input, hint, cls) => el("label", { class: "field" + (cls ? " " + cls : "") }, [el("span", { text: label }), input, hint ? el("small", { class: "ss-hint", text: hint }) : null]);
  function moneyInput(value, attrs) {
    const inp = el("input", Object.assign({ class: "inp", inputmode: "decimal", autocomplete: "off", value: value }, attrs || {}));
    return { input: inp, node: el("span", { class: "ss-money" }, [el("span", { text: "$", "aria-hidden": "true" }), inp]) };
  }
  function check(label, on, hint, disabled) {
    const box = el("input", { type: "checkbox", checked: !!on, disabled: !!disabled });
    return { input: box, node: el("label", { class: "ss-check" + (disabled ? " off" : "") }, [box, el("span", null, [el("b", { text: label }), hint ? el("small", { text: hint }) : null])]) };
  }
  function section(title, iconName, open, kids, note) {
    return el("details", { class: "ss-sec", open: open || null }, [
      el("summary", null, [ic(iconName), el("span", { text: title }), note ? el("small", { class: "ss-sum-note", text: note }) : null, ic("chevron-down", "chev")]),
      el("div", { class: "ss-sec-b" }, kids)
    ]);
  }
  SHOP.field = field; SHOP.moneyInput = moneyInput; SHOP.check = check; SHOP.section = section;

  /* ---------- the editor ---------- */
  // every combination of the options' choices, in order: S / Black, S / Bone, M / Black...
  function combos(options) {
    const opts = options.filter((o) => o.name && o.values.length);
    if (!opts.length) return [];
    let out = [{}];
    for (const o of opts) out = out.flatMap((c) => o.values.map((v) => Object.assign({}, c, { [o.name]: v })));
    return out.slice(0, 200).map((c) => ({ opts: c, label: opts.map((o) => c[o.name]).join(" / ") }));
  }

  /* p: the product from shop_admin_product (or null for a new one). ctx: { access, catalog, currency, onSaved } */
  function open(p, ctx) {
    const acc = ctx.access || {};
    const canEdit = !!acc.edit, canPub = !!acc.publish, canInv = !!acc.inventory;
    const isNew = !p;
    p = p || {};
    const f = {
      id: p.id || null, serial: p.serial || null, name: p.name || "", slug: p.slug || "", slugAuto: isNew, kind: p.kind || "physical",
      status: p.status || "draft", category_id: p.category_id || "", collection_id: p.collection_id || "",
      sku: p.sku || "", subtitle: p.subtitle || "", description: p.description || "",
      price: fromCents(p.price_cents), compare: fromCents(p.compare_at_cents),
      featured: !!p.featured, limited: !!p.limited, edition_size: p.edition_size || "",
      track_stock: !!p.track_stock, stock: p.stock === null || p.stock === undefined ? "" : String(p.stock), sold_out: !!p.sold_out, hide_when_sold_out: !!p.hide_when_sold_out,
      options: (p.options || []).map((o) => ({ name: o.name, values: (o.values || []).slice() })),
      variants: new Map((p.variants || []).map((v) => [v.label, { id: v.id, sku: v.sku || "", price: fromCents(v.price_cents), stock: v.stock === null || v.stock === undefined ? "" : String(v.stock), active: v.active !== false }])),
      specs: (p.specs || []).map((s) => ({ label: s.label, value: s.value })),
      tags: (p.tags || []).join(", "), shipping_note: p.shipping_note || "",
      images: (p.images || []).map((m) => ({ media_id: m.media_id, path: m.path, thumb: m.thumb, w: m.w, h: m.h, alt: m.alt || "" }))
    };
    const ro = !canEdit;
    const dis = (x) => (ro || x ? true : null);

    /* basics */
    const name = el("input", { class: "inp", maxlength: 80, value: f.name, placeholder: "e.g. Envoy Snapback", disabled: dis(), required: true });
    const slug = el("input", { class: "inp", maxlength: 60, value: f.slug, placeholder: "made from the name", disabled: dis(), spellcheck: "false" });
    const slugPre = el("span", { class: "ss-pre", text: "/shop/?item=" });
    name.addEventListener("input", () => { f.name = name.value; if (f.slugAuto) { f.slug = slugify(name.value); slug.value = f.slug; } dirty(); });
    slug.addEventListener("input", () => { f.slugAuto = !slug.value.trim(); f.slug = slugify(slug.value); dirty(); });
    slug.addEventListener("blur", () => { slug.value = f.slug; });
    const subtitle = el("input", { class: "inp", maxlength: 160, value: f.subtitle, placeholder: "One line under the name", disabled: dis() });
    subtitle.addEventListener("input", () => { f.subtitle = subtitle.value; dirty(); });
    const desc = el("textarea", { class: "ta", rows: 6, maxlength: 6000, placeholder: "Materials, fit, the story behind it. Leave a blank line between paragraphs.", disabled: dis() });
    desc.value = f.description;
    desc.addEventListener("input", () => { f.description = desc.value; dirty(); });
    const kind = H.seg([{ value: "physical", label: "Physical", icon: "package" }, { value: "digital", label: "Digital", icon: "sparkles" }], f.kind, (v) => { f.kind = v; shipBox.hidden = v === "digital"; dirty(); }, { label: "Kind" });
    if (ro) kind.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    const cat = el("select", { class: "sel", disabled: dis() }, [el("option", { value: "", text: "No category" })].concat((ctx.catalog.categories || []).map((c) =>
      el("option", { value: c.id, text: c.name + (c.active ? "" : " (hidden)"), selected: c.id === f.category_id }))));
    cat.addEventListener("change", () => { f.category_id = cat.value; dirty(); });
    const col = el("select", { class: "sel", disabled: dis() }, [el("option", { value: "", text: "Not in a drop" })].concat((ctx.catalog.collections || []).map((k) =>
      el("option", { value: k.id, text: (k.code ? k.code + " · " : "") + k.name, selected: k.id === f.collection_id }))));
    col.addEventListener("change", () => { f.collection_id = col.value; dirty(); });

    /* pictures */
    const gal = el("div", { class: "ss-gal" });
    function paintGal() {
      gal.replaceChildren(...f.images.map((m, i) => {
        const alt = el("input", { class: "inp ss-alt", maxlength: 200, value: m.alt, placeholder: "Describe it", "aria-label": "Picture " + (i + 1) + " description", disabled: dis() });
        alt.addEventListener("input", () => { m.alt = alt.value; dirty(); });
        const card = el("div", { class: "ss-img", draggable: ro ? null : "true", "data-i": String(i) }, [
          el("span", { class: "ss-img-pic" }, [el("img", { src: mediaUrl(m.thumb || m.path), alt: "", loading: "lazy" }),
            i === 0 ? el("span", { class: "ss-cover", text: "Cover" }) : null]),
          ro ? null : el("span", { class: "ss-img-acts" }, [
            el("button", { type: "button", class: "icon-btn", "aria-label": "Move left", disabled: i === 0, onclick: () => move(i, i - 1) }, ic("chevron-left")),
            i ? el("button", { type: "button", class: "icon-btn", "aria-label": "Make this the cover", onclick: () => move(i, 0) }, ic("star")) : null,
            el("button", { type: "button", class: "icon-btn", "aria-label": "Move right", disabled: i === f.images.length - 1, onclick: () => move(i, i + 1) }, ic("chevron-right")),
            el("button", { type: "button", class: "icon-btn danger", "aria-label": "Remove picture " + (i + 1), onclick: () => { f.images.splice(i, 1); paintGal(); dirty(); } }, ic("x"))]),
          alt
        ]);
        card.addEventListener("dragstart", (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-eg-img", String(i)); card.classList.add("dragging"); });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        card.addEventListener("dragover", (e) => { if (Array.from(e.dataTransfer.types).includes("text/x-eg-img")) { e.preventDefault(); card.classList.add("over"); } });
        card.addEventListener("dragleave", () => card.classList.remove("over"));
        card.addEventListener("drop", (e) => {
          const from = e.dataTransfer.getData("text/x-eg-img");
          card.classList.remove("over");
          if (from === "") return;
          e.preventDefault();
          move(Number(from), i);
        });
        return card;
      }));
      galNote.textContent = f.images.length ? f.images.length + " of 12 · the first one is the cover. Drag to reorder." : "No pictures yet. Products without one show the EG mark.";
      window.egIcons && window.egIcons(gal);
    }
    function move(a, b) {
      if (b < 0 || b >= f.images.length || a === b) return;
      const [m] = f.images.splice(a, 1);
      f.images.splice(b, 0, m);
      paintGal(); dirty();
    }
    const galNote = el("p", { class: "ss-hint" });
    const zone = ro ? null : dropZone({ onReady: (m) => {
      if (f.images.length >= 12) { H.toast("Up to 12 pictures per product.", "bad"); return; }
      f.images.push(m); paintGal(); dirty();
    } });
    paintGal();

    /* price */
    const price = moneyInput(f.price, { placeholder: "30.00", disabled: dis() });
    const compare = moneyInput(f.compare, { placeholder: "Optional", disabled: dis() });
    const sku = el("input", { class: "inp", maxlength: 40, value: f.sku, placeholder: "Optional", disabled: dis(), spellcheck: "false" });
    const saleNote = el("small", { class: "ss-hint" });
    function paintSale() {
      const a = toCents(price.input.value), b = toCents(compare.input.value);
      saleNote.textContent = b && a !== null && b > a ? "Shows as a sale: " + Math.round((1 - a / b) * 100) + "% off" : "Higher than the price? It shows struck through as a sale.";
    }
    price.input.addEventListener("input", () => { f.price = price.input.value; paintSale(); paintVariants(); dirty(); });
    compare.input.addEventListener("input", () => { f.compare = compare.input.value; paintSale(); dirty(); });
    sku.addEventListener("input", () => { f.sku = sku.value; dirty(); });
    paintSale();

    /* options + stock */
    const track = check("Count stock", f.track_stock, "The shop says how many are left and stops selling at zero.", ro || !canInv);
    const stockInp = el("input", { class: "inp", type: "number", min: 0, max: 1000000, step: 1, inputmode: "numeric", value: f.stock, disabled: dis(!canInv), placeholder: "0" });
    const stockField = field("In stock", stockInp, "How many you have right now.");
    const soldOut = check("Mark sold out", f.sold_out, "Stops sales now, whatever the stock says.", ro || !canInv);
    const hide = check("Hide it while it's sold out", f.hide_when_sold_out, "Otherwise it stays on show with a Sold out tag.", ro || !canInv);
    track.input.addEventListener("change", () => { f.track_stock = track.input.checked; paintStock(); paintVariants(); dirty(); });
    stockInp.addEventListener("input", () => { f.stock = stockInp.value; dirty(); });
    soldOut.input.addEventListener("change", () => { f.sold_out = soldOut.input.checked; dirty(); });
    hide.input.addEventListener("change", () => { f.hide_when_sold_out = hide.input.checked; dirty(); });
    const optBox = el("div", { class: "ss-opts" });
    const varBox = el("div", { class: "ss-vars" });
    function paintOptions() {
      optBox.replaceChildren(...f.options.map((o, i) => {
        const n = el("input", { class: "inp", maxlength: 20, value: o.name, placeholder: i === 0 ? "Size" : i === 1 ? "Colour" : "Option", "aria-label": "Option " + (i + 1) + " name", disabled: dis() });
        const vals = el("input", { class: "inp", value: o.values.join(", "), placeholder: i === 0 ? "S, M, L, XL" : "Black, Bone", "aria-label": "Option " + (i + 1) + " choices", disabled: dis() });
        n.addEventListener("input", () => { renameOpt(o, n.value.trim()); dirty(); });
        vals.addEventListener("input", () => { o.values = Array.from(new Set(vals.value.split(",").map((x) => x.trim()).filter(Boolean))).slice(0, 30); paintVariants(); dirty(); });
        return el("div", { class: "ss-opt" }, [field("Option", n), field("Choices (comma between each)", vals),
          ro ? null : el("button", { type: "button", class: "icon-btn danger", "aria-label": "Remove this option", onclick: () => { f.options.splice(i, 1); paintOptions(); paintVariants(); dirty(); } }, ic("trash-2"))]);
      }));
      if (!ro && f.options.length < 3) optBox.append(el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => { f.options.push({ name: "", values: [] }); paintOptions(); paintVariants(); optBox.querySelector(".ss-opt:last-of-type input").focus(); } },
        [ic("plus"), f.options.length ? "Add another option" : "Add options (size, colour…)"]));
      window.egIcons && window.egIcons(optBox);
    }
    // renaming an option keeps every row's stock and price
    function renameOpt(o, to) { o.name = to; paintVariants(); }
    function paintStock() { stockField.hidden = !f.track_stock || combos(f.options).length > 0; }
    function paintVariants() {
      const list = combos(f.options);
      paintStock();
      if (!list.length) { varBox.replaceChildren(); return; }
      const base = toCents(price.input.value);
      const head = el("tr", null, [el("th", { text: "Combination" }), f.track_stock ? el("th", { text: "Stock" }) : null, el("th", { text: "Price" }), el("th", { text: "SKU" }), el("th", { text: "On sale" })]);
      const rows = list.map((c) => {
        let v = f.variants.get(c.label);
        if (!v) { v = { id: null, sku: "", price: "", stock: "", active: true }; f.variants.set(c.label, v); }
        const st = el("input", { class: "inp sm", type: "number", min: 0, step: 1, inputmode: "numeric", value: v.stock, placeholder: "0", "aria-label": c.label + " stock", disabled: dis(!canInv) });
        st.addEventListener("input", () => { v.stock = st.value; dirty(); });
        const pr = el("input", { class: "inp sm", inputmode: "decimal", value: v.price, placeholder: base !== null ? fromCents(base) : "Same", "aria-label": c.label + " price", disabled: dis() });
        pr.addEventListener("input", () => { v.price = pr.value; dirty(); });
        const sk = el("input", { class: "inp sm", maxlength: 40, value: v.sku, placeholder: "—", "aria-label": c.label + " SKU", disabled: dis(), spellcheck: "false" });
        sk.addEventListener("input", () => { v.sku = sk.value; dirty(); });
        const on = el("input", { type: "checkbox", checked: v.active, "aria-label": c.label + " on sale", disabled: dis() });
        on.addEventListener("change", () => { v.active = on.checked; dirty(); });
        return el("tr", { class: v.active ? null : "off" }, [el("td", { text: c.label }), f.track_stock ? el("td", null, st) : null, el("td", null, pr), el("td", null, sk), el("td", null, on)]);
      });
      varBox.replaceChildren(el("p", { class: "ss-hint", text: list.length + (list.length === 1 ? " combination" : " combinations") + ". Leave a price empty to use the main one; untick one you don't make." }),
        el("div", { class: "ss-tablewrap" }, el("table", { class: "ss-vtable" }, [el("thead", null, head), el("tbody", null, rows)])));
    }
    paintOptions(); paintVariants();

    /* edition + spotlight */
    const featured = check("Feature it", f.featured, "First in the shop's Featured sort, and up for the hero spotlight.", ro || !canPub);
    featured.input.addEventListener("change", () => { f.featured = featured.input.checked; dirty(); });
    const limited = check("Limited edition", f.limited, "Gets a Limited tag. With a run size and stock counting, it shows how many are left.", ro);
    const edition = el("input", { class: "inp", type: "number", min: 1, step: 1, inputmode: "numeric", value: f.edition_size, placeholder: "e.g. 50", disabled: dis() });
    const editionField = field("How many were made", edition);
    limited.input.addEventListener("change", () => { f.limited = limited.input.checked; editionField.hidden = !f.limited; dirty(); });
    edition.addEventListener("input", () => { f.edition_size = edition.value; dirty(); });
    editionField.hidden = !f.limited;

    /* details */
    const specBox = el("div", { class: "ss-specs" });
    function paintSpecs() {
      specBox.replaceChildren(...f.specs.map((s, i) => {
        const l = el("input", { class: "inp", maxlength: 40, value: s.label, placeholder: "Material", "aria-label": "Specification " + (i + 1) + " name", disabled: dis() });
        const v = el("input", { class: "inp", maxlength: 200, value: s.value, placeholder: "100% cotton twill", "aria-label": "Specification " + (i + 1) + " value", disabled: dis() });
        l.addEventListener("input", () => { s.label = l.value; dirty(); });
        v.addEventListener("input", () => { s.value = v.value; dirty(); });
        return el("div", { class: "ss-spec" }, [l, v, ro ? null : el("button", { type: "button", class: "icon-btn danger", "aria-label": "Remove this row", onclick: () => { f.specs.splice(i, 1); paintSpecs(); dirty(); } }, ic("x"))]);
      }));
      if (!ro && f.specs.length < 20) specBox.append(el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => { f.specs.push({ label: "", value: "" }); paintSpecs(); specBox.querySelector(".ss-spec:last-of-type input").focus(); } }, [ic("plus"), "Add a row"]));
      window.egIcons && window.egIcons(specBox);
    }
    paintSpecs();
    const tags = el("input", { class: "inp", value: f.tags, placeholder: "embroidered, glow, founders", disabled: dis() });
    tags.addEventListener("input", () => { f.tags = tags.value; dirty(); });
    const ship = el("input", { class: "inp", maxlength: 300, value: f.shipping_note, placeholder: "Leave empty to use the shop's shipping note", disabled: dis() });
    ship.addEventListener("input", () => { f.shipping_note = ship.value; dirty(); });
    const shipBox = field("Shipping note for this product", ship);
    shipBox.hidden = f.kind === "digital";

    /* ---------- saving ---------- */
    function payload(status) {
      const list = combos(f.options);
      return {
        id: f.id, name: f.name.trim(), slug: f.slug, slug_auto: f.slugAuto, kind: f.kind, status: status || f.status,
        category_id: f.category_id || null, collection_id: f.collection_id || null, sku: f.sku, subtitle: f.subtitle, description: f.description,
        price_cents: toCents(f.price), compare_at_cents: toCents(f.compare),
        featured: f.featured, limited: f.limited, edition_size: f.limited && f.edition_size ? Number(f.edition_size) : null,
        track_stock: f.track_stock, stock: f.track_stock && f.stock !== "" ? Number(f.stock) : null, sold_out: f.sold_out, hide_when_sold_out: f.hide_when_sold_out,
        options: f.options.filter((o) => o.name && o.values.length).map((o) => ({ name: o.name, values: o.values })),
        variants: list.map((c) => {
          const v = f.variants.get(c.label) || {};
          return { id: v.id || null, opts: c.opts, sku: v.sku || "", price_cents: toCents(v.price), stock: f.track_stock && v.stock !== "" && v.stock !== undefined ? Number(v.stock) : null, active: v.active !== false };
        }),
        specs: f.specs.filter((s) => s.label.trim() || s.value.trim()),
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        shipping_note: f.kind === "digital" ? "" : f.shipping_note,
        images: f.images.map((m) => ({ media_id: m.media_id, alt: m.alt }))
      };
    }
    let clean = JSON.stringify(payload());
    const isDirty = () => JSON.stringify(payload()) !== clean;
    const dirtyDot = el("span", { class: "ss-dirty", hidden: true, text: "Unsaved changes" });
    function dirty() { dirtyDot.hidden = !isDirty(); }
    function problems(status) {
      const out = [];
      if (!f.name.trim()) out.push([name, "Give it a name."]);
      const c = toCents(f.price);
      if (c === null) out.push([price.input, "Give it a price."]);
      else if (c > 10000000) out.push([price.input, "Prices go up to $100,000."]);
      if (f.options.some((o) => o.values.length && !o.name.trim())) out.push([optBox.querySelector("input"), "Every option needs a name, like Size."]);
      if (f.options.some((o) => o.name.trim() && !o.values.length)) out.push([optBox.querySelector("input"), "Give each option at least one choice."]);
      if (status === "published" && !f.images.length) out.push(null);       // allowed, just warned about
      return out.filter(Boolean);
    }
    async function save(status, btn) {
      const bad = problems(status);
      if (bad.length) { H.toast(bad[0][1], "bad"); if (bad[0][0]) bad[0][0].focus(); return; }
      if (status === "published" && !f.images.length) {
        const ok = await H.confirm({ title: "Publish without a picture?", body: ["It'll show the EG mark in place of a photo until you add one."], ok: "Publish anyway" });
        if (!ok) return;
      }
      btn.disabled = true; btn.classList.add("busy");
      try {
        const r = await H.rpc("shop_admin_save_product", { p: payload(status) });
        f.id = r.id; f.slug = r.slug; f.status = status || f.status;
        H.toast(status === "published" && p.status !== "published" ? "Published. It's live in the shop." : status === "draft" && p.status === "published" ? "Unpublished. It's a draft again." : "Saved.", "ok");
        clearOrphans(r.orphans).catch(() => { /* Settings -> clean up catches leftovers */ });
        const fresh = await H.rpc("shop_admin_product", { p_id: r.id });
        if (ctx.onSaved) ctx.onSaved(fresh);
        open(fresh, ctx);
      } catch (e) { H.fail(e); btn.disabled = false; btn.classList.remove("busy"); }
    }

    /* a look at it in the real shop, before it's saved */
    function preview() {
      const pay = payload();
      const c = (ctx.catalog.categories || []).find((x) => x.id === f.category_id);
      const k = (ctx.catalog.collections || []).find((x) => x.id === f.collection_id);
      const list = combos(f.options);
      const priceC = toCents(f.price) || 0;
      const variants = list.map((x, i) => {
        const v = f.variants.get(x.label) || {};
        const stock = f.track_stock ? Number(v.stock || 0) : null;
        return { id: "v" + i, label: x.label, opts: x.opts, price: toCents(v.price) === null ? priceC : toCents(v.price),
          available: v.active !== false && !f.sold_out && (!f.track_stock || stock > 0), left: f.track_stock && stock <= 5 ? stock : null };
      });
      const left = !f.track_stock ? null : list.length ? variants.reduce((t, v, i) => t + (f.variants.get(list[i].label).active !== false ? Number(f.variants.get(list[i].label).stock || 0) : 0), 0) : Number(f.stock || 0);
      const inStock = !f.sold_out && (list.length ? variants.some((v) => v.available) : (!f.track_stock || left > 0));
      const product = {
        id: f.id || "draft", serial: f.serial || 0, slug: f.slug || "preview", name: pay.name || "Untitled product", kind: f.kind, status: "draft",
        subtitle: f.subtitle, description: f.description, price: priceC, compare_at: pay.compare_at_cents > priceC ? pay.compare_at_cents : null,
        category: c ? c.slug : null, collection: k ? k.slug : null, featured: f.featured, limited: f.limited, edition_size: pay.edition_size,
        in_stock: inStock, left: f.track_stock && (f.limited || left <= 10) ? left : null,
        options: pay.options, specs: pay.specs, tags: pay.tags, shipping_note: pay.shipping_note, published_at: new Date().toISOString(),
        images: f.images.map((m) => ({ path: m.path, thumb: m.thumb, w: m.w, h: m.h, alt: m.alt })), variants: variants,
        _code: "ENV//" + String(k && k.code ? k.code : c ? c.name : "Supply").toUpperCase().replace(/\s+/g, "-")
      };
      try {
        localStorage.setItem("eg-shop-draft", JSON.stringify({ product: product, currency: ctx.currency || "USD", at: Date.now() }));
      } catch (e) { H.toast("Couldn't hand the preview over (this browser blocks storage).", "bad"); return; }
      window.open("/shop/?preview=draft", "eg-shop-preview");
    }

    /* ---------- the drawer ---------- */
    const status = el("span", { class: "pill " + (f.status === "published" ? "p-ok" : f.status === "archived" ? "p-muted" : "p-review"), text: f.status === "published" ? "Live" : f.status === "archived" ? "Archived" : "Draft" });
    const acts = el("div", { class: "ss-bar-acts" });
    const btn = (label, iconName, cls, onclick) => el("button", { type: "button", class: "btn btn-sm " + (cls || ""), onclick: onclick }, [ic(iconName), label]);
    acts.append(btn("Preview", "eye", "btn-ghost", preview));
    if (canEdit) {
      if (f.status === "published") {
        acts.append(btn("Save", "check", "btn-primary", (e) => save("published", e.currentTarget)));
        if (canPub) acts.append(btn("Unpublish", "eye-off", "", (e) => save("draft", e.currentTarget)));
      } else {
        acts.append(btn(f.status === "archived" ? "Save" : "Save draft", "check", canPub ? "" : "btn-primary", (e) => save(f.status, e.currentTarget)));
        if (canPub) acts.append(btn("Publish", "rocket", "btn-primary", (e) => save("published", e.currentTarget)));
      }
    }
    const bar = el("div", { class: "ss-bar" }, [el("div", { class: "ss-bar-st" }, [status, dirtyDot]), acts]);

    const danger = [];
    if (f.id && canPub) {
      danger.push(f.status === "archived"
        ? btn("Restore as a draft", "archive", "", async () => { try { await H.rpc("shop_admin_set_status", { p_id: f.id, p_status: "draft" }); H.toast("Restored as a draft.", "ok"); reopen(); } catch (e) { H.fail(e); } })
        : btn("Archive", "archive", "", async () => {
          const ok = await H.confirm({ title: "Archive \"" + f.name + "\"?", body: ["It leaves the shop but nothing is deleted. You can restore it from Archived."], ok: "Archive" });
          if (!ok) return;
          try { await H.rpc("shop_admin_set_status", { p_id: f.id, p_status: "archived" }); H.toast("Archived.", "ok"); reopen(); } catch (e) { H.fail(e); }
        }));
    }
    if (f.id && canEdit) danger.push(btn("Duplicate", "copy", "", async () => {
      try { const r = await H.rpc("shop_admin_duplicate", { p_id: f.id }); H.toast("Copied as a draft.", "ok"); const d = await H.rpc("shop_admin_product", { p_id: r.id }); if (ctx.onSaved) ctx.onSaved(d); open(d, ctx); } catch (e) { H.fail(e); }
    }));
    if (f.id && acc.delete) danger.push(btn("Delete", "trash-2", "btn-danger", async () => {
      const ok = await H.confirm({ title: "Delete \"" + f.name + "\" for good?", body: ["It's gone from the shop and the hub. Past orders keep their own copy of the name and price. This can't be undone.", "Archiving hides it without deleting."], ok: "Delete", danger: true });
      if (!ok) return;
      try {
        const r = await H.rpc("shop_admin_delete_product", { p_id: f.id });
        clearOrphans(r.orphans).catch(() => { /* leftovers get cleaned from Settings */ });
        H.toast("Deleted.", "ok"); clean = JSON.stringify(payload()); H.drawer.close(); if (ctx.onSaved) ctx.onSaved(null);
      } catch (e) { H.fail(e); }
    }));
    async function reopen() {
      const d = await H.rpc("shop_admin_product", { p_id: f.id });
      if (ctx.onSaved) ctx.onSaved(d);
      open(d, ctx);
    }

    const meta = f.id ? el("p", { class: "ss-meta" }, [el("span", { text: "#" + String(f.serial).padStart(3, "0") }),
      p.updated_at ? el("span", { text: "Edited " + H.ago(p.updated_at) + (p.updated_name ? " by " + p.updated_name : "") }) : null,
      f.status === "published" ? el("a", { href: "/shop/?item=" + encodeURIComponent(f.slug), target: "_blank", rel: "noopener" }, ["View in the shop", ic("arrow-up-right")]) : null]) : null;

    const body = [
      meta,
      ro ? el("p", { class: "ss-ro" }, [ic("lock"), "You can look, but changing products needs the shop's edit permission."]) : null,
      section("The basics", "file-text", true, [
        field("Name", name),
        el("label", { class: "field" }, [el("span", { text: "Link name" }), el("span", { class: "ss-slug" }, [slugPre, slug]),
          el("small", { class: "ss-hint", text: isNew ? "Made from the name. Change it once it's shared and old links stop working." : "Changing this breaks links people already shared." })]),
        field("Short description", subtitle),
        field("Description", desc),
        el("div", { class: "field" }, [el("span", { text: "Kind" }), kind]),
        el("div", { class: "form-row" }, [field("Category", cat), field("Drop", col)])
      ]),
      section("Pictures", "image", true, [galNote, gal, zone]),
      section("Price", "tag", true, [el("div", { class: "form-row" }, [field("Price", price.node), el("label", { class: "field" }, [el("span", { text: "Original price" }), compare.node, saleNote]), field("SKU", sku, "Your own stock code. Optional.")])]),
      section("Options and stock", "package", f.options.length > 0 || f.track_stock, [track.node, stockField, optBox, varBox, el("div", { class: "ss-checks" }, [soldOut.node, hide.node])],
        f.options.length ? combos(f.options).length + " combinations" : f.track_stock ? (f.stock || 0) + " in stock" : null),
      section("Spotlight and edition", "star", f.featured || f.limited, [featured.node, limited.node, editionField]),
      section("Details", "list-checks", f.specs.length > 0 || !!f.tags || !!f.shipping_note, [
        el("div", { class: "field" }, [el("span", { text: "Specifications" }), specBox]),
        field("Tags (comma between each)", tags, "Shown under the description."),
        shipBox
      ]),
      danger.length ? el("div", { class: "ss-danger" }, danger) : null,
      bar
    ];
    H.drawer.open({
      title: isNew ? "New product" : f.name || "Product", wide: true, body: body,
      guard: async () => (!isDirty() || await H.confirm({ title: "Leave without saving?", body: ["Your changes to this product will be lost."], ok: "Leave", danger: true })),
      onClose: () => { unsaved = null; }
    });
    unsaved = isDirty;
    if (isNew) setTimeout(() => name.focus(), 60);
  }

  // closing or reloading the tab mid-edit asks first
  let unsaved = null;
  window.addEventListener("beforeunload", (e) => { if (unsaved && unsaved()) { e.preventDefault(); e.returnValue = ""; } });

  SHOP.openEditor = open;
})();

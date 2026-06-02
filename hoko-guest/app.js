(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -----------------------------------------------------------------------
  // URL params
  // -----------------------------------------------------------------------

  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get("code")?.trim() || null;
  const urlArrival = params.get("s")?.trim() || null;
  const urlDeparture = params.get("e")?.trim() || null;
  const urlGuestCount = (() => {
    const raw = params.get("n");
    if (!raw) return 1;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 1;
  })();

  // -----------------------------------------------------------------------
  // Date helpers — `<input type="date">` uses ISO (YYYY-MM-DD) internally;
  // the URL and the submit payload use the German DD.MM.YYYY format.
  // -----------------------------------------------------------------------

  function germanToIso(s) {
    if (!s) return "";
    const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return "";
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }

  function isoToGerman(s) {
    if (!s) return "";
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  }

  // -----------------------------------------------------------------------
  // Country combobox
  // -----------------------------------------------------------------------

  function isoForCountry(name) {
    const needle = (name || "").trim().toLowerCase();
    if (!needle) return "";
    const exact = window.COUNTRIES.find((c) => c.name.toLowerCase() === needle);
    if (exact) return exact.iso;
    const stripped = window.COUNTRIES.find(
      (c) => c.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim() === needle,
    );
    return stripped ? stripped.iso : "";
  }

  function attachCombobox(root) {
    const input = root.querySelector(".combobox-input");
    const list = root.querySelector(".combobox-list");
    const toggle = root.querySelector(".combobox-toggle");

    let activeIdx = -1;

    function open() {
      filter(input.value);
      list.hidden = false;
      root.classList.add("open");
    }
    function close() {
      list.hidden = true;
      root.classList.remove("open");
      activeIdx = -1;
    }
    function isOpen() {
      return !list.hidden;
    }

    function render(items) {
      list.innerHTML = "";
      const frag = document.createDocumentFragment();
      items.forEach((c, i) => {
        const li = document.createElement("li");
        li.className = "combobox-item";
        li.setAttribute("role", "option");
        li.dataset.idx = String(i);
        li.dataset.name = c.name;
        li.innerHTML = `<span class="country-name">${escapeHtml(c.name)}</span><span class="country-iso">${c.iso}</span>`;
        frag.appendChild(li);
      });
      list.appendChild(frag);
      activeIdx = items.length > 0 ? 0 : -1;
      highlight();
    }

    function filter(query) {
      const q = (query || "").trim().toLowerCase();
      let items;
      if (!q) {
        items = window.COUNTRIES;
      } else {
        const starts = [];
        const contains = [];
        for (const c of window.COUNTRIES) {
          const lc = c.name.toLowerCase();
          if (lc.startsWith(q)) starts.push(c);
          else if (lc.includes(q)) contains.push(c);
          else if (c.iso.toLowerCase() === q) starts.push(c);
        }
        items = [...starts, ...contains];
      }
      render(items.slice(0, 200));
    }

    function highlight() {
      $$(".combobox-item", list).forEach((el, i) => {
        el.classList.toggle("active", i === activeIdx);
        if (i === activeIdx) {
          // keep the active item in view
          const elTop = el.offsetTop;
          const elBot = elTop + el.offsetHeight;
          if (elTop < list.scrollTop) list.scrollTop = elTop;
          else if (elBot > list.scrollTop + list.clientHeight) {
            list.scrollTop = elBot - list.clientHeight;
          }
        }
      });
    }

    function selectActive() {
      const items = $$(".combobox-item", list);
      if (activeIdx < 0 || activeIdx >= items.length) return false;
      input.value = items[activeIdx].dataset.name;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      return true;
    }

    input.addEventListener("focus", open);
    input.addEventListener("input", () => {
      if (!isOpen()) open();
      else filter(input.value);
    });
    input.addEventListener("keydown", (e) => {
      const items = $$(".combobox-item", list);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen()) open();
        if (items.length) {
          activeIdx = Math.min(items.length - 1, activeIdx + 1);
          highlight();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen()) open();
        if (items.length) {
          activeIdx = Math.max(0, activeIdx - 1);
          highlight();
        }
      } else if (e.key === "Enter") {
        if (isOpen() && selectActive()) e.preventDefault();
      } else if (e.key === "Escape") {
        if (isOpen()) {
          close();
          e.preventDefault();
        }
      } else if (e.key === "Tab") {
        // accept the currently-active suggestion on tab-out if user typed something
        if (isOpen() && input.value.trim()) selectActive();
      }
    });

    toggle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (isOpen()) close();
      else {
        input.focus();
        open();
      }
    });

    list.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".combobox-item");
      if (!item) return;
      e.preventDefault(); // keep focus on input until we set the value
      activeIdx = Number(item.dataset.idx);
      selectActive();
    });

    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) close();
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // -----------------------------------------------------------------------
  // Stay / guest rows
  // -----------------------------------------------------------------------

  function applyStayPrefill() {
    if (urlArrival) {
      const el = $("#arrival");
      el.value = germanToIso(urlArrival) || urlArrival; // fallback to raw so guest sees what was meant
      el.readOnly = true;
      el.classList.add("readonly");
    }
    if (urlDeparture) {
      const el = $("#departure");
      el.value = germanToIso(urlDeparture) || urlDeparture;
      el.readOnly = true;
      el.classList.add("readonly");
    }
  }

  function lockDateField(el, germanDate) {
    const iso = germanToIso(germanDate);
    if (!iso) return;
    el.value = iso;
    el.readOnly = true;
    el.classList.add("readonly");
  }

  // When the host shares a URL with just `?code=` (an Airbnb reservation
  // code), ask the worker to look up the stay dates from the Airbnb iCal
  // feed. Silent best-effort — if it fails the guest just enters dates
  // manually.
  async function tryAirbnbPrefill() {
    if (!urlCode || urlArrival || urlDeparture) return;
    try {
      const resp = await fetch(`/api/hoko/airbnb-lookup/${encodeURIComponent(urlCode)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.ankunft) lockDateField($("#arrival"), data.ankunft);
      if (data.abreise) lockDateField($("#departure"), data.abreise);
    } catch {
      /* silent — manual entry still works */
    }
  }

  function renderGuests() {
    const container = $("#guests");
    container.innerHTML = "";
    for (let i = 0; i < urlGuestCount; i++) addGuestRow();
    updateRemoveButtons();
  }

  function addGuestRow() {
    const tpl = $("#guest-row-template");
    const node = tpl.content.firstElementChild.cloneNode(true);
    $("#guests").appendChild(node);
    renumberGuests();
    bindRowEvents(node);
    const combo = node.querySelector("[data-combobox]");
    if (combo) attachCombobox(combo);
    updateRemoveButtons();
  }

  function bindRowEvents(row) {
    row.querySelector(".remove-guest").addEventListener("click", () => {
      if ($$("#guests .guest-row").length <= 1) return;
      row.remove();
      renumberGuests();
      updateRemoveButtons();
    });
  }

  function renumberGuests() {
    $$("#guests .guest-row").forEach((row, idx) => {
      row.querySelector(".guest-num").textContent = String(idx + 1);
    });
  }

  function updateRemoveButtons() {
    const rows = $$("#guests .guest-row");
    rows.forEach((row) => {
      const btn = row.querySelector(".remove-guest");
      btn.disabled = rows.length <= 1;
    });
  }

  function readGuestRow(row) {
    return {
      firstname: row.querySelector(".g-firstname").value.trim(),
      lastname: row.querySelector(".g-lastname").value.trim(),
      country: row.querySelector(".g-country").value.trim(),
      ausweisart: row.querySelector(".g-ausweisart").value,
      ausweisnummer: row.querySelector(".g-ausweis").value.trim(),
    };
  }

  function validate(stay, guests) {
    if (!stay.ankunft) return "Please enter the arrival date.";
    if (!stay.abreise) return "Please enter the departure date.";
    if (guests.length === 0) return "Please add at least one guest.";
    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const tag = guests.length > 1 ? ` (guest ${i + 1})` : "";
      if (!g.firstname) return `Please enter the first name${tag}.`;
      if (!g.lastname) return `Please enter the last name${tag}.`;
      if (!g.country) return `Please enter the nationality${tag}.`;
      if (!g.ausweisart) return `Please select the ID document type${tag}.`;
      if (!g.ausweisnummer) return `Please enter the ID / passport number${tag}.`;
      if (!isoForCountry(g.country)) {
        return `"${g.country}" isn't a recognised country${tag}. Please pick one from the list.`;
      }
    }
    return null;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errBox = $("#error");
    errBox.hidden = true;
    errBox.textContent = "";

    const stay = {
      code: urlCode || undefined,
      ankunft: isoToGerman($("#arrival").value),
      abreise: isoToGerman($("#departure").value),
    };
    const guests = $$("#guests .guest-row").map(readGuestRow).map((g) => ({
      ...g,
      countryIso: isoForCountry(g.country),
    }));

    const err = validate(stay, guests);
    if (err) {
      errBox.textContent = err;
      errBox.hidden = false;
      errBox.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const btn = $("#submit-btn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const resp = await fetch("/api/hoko/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...stay, guests }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Submission failed (HTTP ${resp.status}). ${text}`);
      }
      $("#form-view").hidden = true;
      $("#success-view").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      errBox.textContent = (e && e.message) || "Something went wrong. Please try again.";
      errBox.hidden = false;
      btn.disabled = false;
      btn.textContent = "Submit";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyStayPrefill();
    renderGuests();
    tryAirbnbPrefill();
    $("#add-guest").addEventListener("click", addGuestRow);
    $("#hoko-form").addEventListener("submit", handleSubmit);
  });
})();

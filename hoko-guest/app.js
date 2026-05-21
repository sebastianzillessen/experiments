(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  function populateCountriesDatalist() {
    const dl = $("#countries");
    const frag = document.createDocumentFragment();
    for (const c of window.COUNTRIES) {
      const opt = document.createElement("option");
      opt.value = c.name;
      frag.appendChild(opt);
    }
    dl.appendChild(frag);
  }

  function isoForCountry(name) {
    const needle = (name || "").trim().toLowerCase();
    if (!needle) return "";
    const exact = window.COUNTRIES.find((c) => c.name.toLowerCase() === needle);
    if (exact) return exact.iso;
    // Tolerant fallback: strip parenthetical suffix from country names like
    // "Netherlands (the)" so a guest typing "Netherlands" still matches.
    const stripped = window.COUNTRIES.find((c) => c.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim() === needle);
    return stripped ? stripped.iso : "";
  }

  function applyStayPrefill() {
    if (urlArrival) {
      const el = $("#arrival");
      el.value = urlArrival;
      el.readOnly = true;
      el.classList.add("readonly");
    }
    if (urlDeparture) {
      const el = $("#departure");
      el.value = urlDeparture;
      el.readOnly = true;
      el.classList.add("readonly");
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
      if (!g.ausweisnummer) return `Please enter the passport / ID number${tag}.`;
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
      ankunft: $("#arrival").value.trim(),
      abreise: $("#departure").value.trim(),
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
    populateCountriesDatalist();
    applyStayPrefill();
    renderGuests();
    $("#add-guest").addEventListener("click", addGuestRow);
    $("#hoko-form").addEventListener("submit", handleSubmit);
  });
})();

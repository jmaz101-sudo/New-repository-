(function () {
  "use strict";

  // ── Map setup ────────────────────────────────────────────
  const map = L.map("map", { preferCanvas: true }).setView([20, 0], 2);
  window.addEventListener("load", () => map.invalidateSize());
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);

  // ── UI references ────────────────────────────────────────
  const fileInput   = document.getElementById("file-input");
  const dropLabel   = document.getElementById("drop-label");
  const dropText    = document.getElementById("drop-text");
  const uploadArea  = document.getElementById("upload-area");
  const processBtn  = document.getElementById("process-btn");
  const status      = document.getElementById("status");
  const legend      = document.getElementById("legend");
  const eventList   = document.getElementById("event-list");

  let selectedFile  = null;
  let markerMap     = {};   // location string → Leaflet marker

  // ── File selection ───────────────────────────────────────
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) selectFile(fileInput.files[0]);
  });

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });
  uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  });

  function selectFile(file) {
    selectedFile = file;
    dropText.textContent = file.name;
    processBtn.disabled = false;
  }

  // ── Process ──────────────────────────────────────────────
  processBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    processBtn.disabled = true;
    showStatus("Processing calendar… this may take a moment while geocoding locations.", false);
    legend.classList.add("hidden");
    eventList.innerHTML = "";
    markerLayer.clearLayers();
    markerMap = {};

    const formData = new FormData();
    formData.append("calendar", selectedFile);

    try {
      const resp = await fetch("/process", { method: "POST", body: formData });
      const data = await resp.json();

      if (!resp.ok) {
        showStatus(data.error || "An error occurred.", true);
        processBtn.disabled = false;
        return;
      }

      showStatus(
        `Found ${data.total} event${data.total !== 1 ? "s" : ""} with locations. ` +
        `${data.geocoded} mapped, ${data.failed} not found.`,
        false
      );
      legend.classList.remove("hidden");
      renderEvents(data.events);
    } catch (err) {
      showStatus("Network error – is the server running?", true);
    }

    processBtn.disabled = false;
  });

  // ── Render events & markers ──────────────────────────────
  function renderEvents(events) {
    const bounds = [];

    events.forEach((ev) => {
      const card = document.createElement("div");
      card.className = "event-card" + (ev.geocoded ? "" : " no-geo");

      const title = document.createElement("div");
      title.className = "event-title";
      title.textContent = ev.summary;

      const meta = document.createElement("div");
      meta.className = "event-meta";
      meta.textContent = (ev.date ? ev.date + "  ·  " : "") + ev.location;

      card.appendChild(title);
      card.appendChild(meta);
      eventList.appendChild(card);

      if (!ev.geocoded) return;

      // Create marker
      const icon = L.circleMarker([ev.lat, ev.lon], {
        radius: 8,
        fillColor: "#34c759",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      const popupHtml =
        `<strong>${escHtml(ev.summary)}</strong>` +
        (ev.date ? `<br><span style="color:#6e6e73">${escHtml(ev.date)}</span>` : "") +
        `<br>${escHtml(ev.location)}`;

      icon.bindPopup(popupHtml);
      icon.addTo(markerLayer);
      markerMap[ev.location] = icon;
      bounds.push([ev.lat, ev.lon]);

      card.addEventListener("click", () => {
        map.setView([ev.lat, ev.lon], 14, { animate: true });
        icon.openPopup();
      });
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function showStatus(msg, isError) {
    status.textContent = msg;
    status.classList.remove("hidden", "error");
    if (isError) status.classList.add("error");
  }

  function escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();

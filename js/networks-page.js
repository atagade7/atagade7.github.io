(() => {
  const canvas = document.getElementById("network-canvas");
  const labelLayer = document.getElementById("cluster-label-layer");
  const networkTitleEl = document.getElementById("network-title");
  const citationTitleEl = document.getElementById("citation-title");
  const citationCanvas = document.getElementById("citation-canvas");
  const citationSummaryEl = document.getElementById("citation-summary");
  const citationInsightEl = document.getElementById("citation-insight");
  const citationModeControls = document.getElementById("citation-mode-controls");
  const profileEl = document.getElementById("company-profile");
  const companyDiagnosticsEl = document.getElementById("company-diagnostics");
  const compareSearchInput = document.getElementById("compare-company-search");
  const compareCompanyButton = document.getElementById("load-compare-company");
  const clearCompareButton = document.getElementById("clear-compare-company");
  const comparisonEl = document.getElementById("company-compare");
  const minEdgeSlider = document.getElementById("min-edge");
  const minEdgeValue = document.getElementById("min-edge-value");
  const clusterLegendEl = document.getElementById("cluster-legend");
  const topInventorsEl = document.getElementById("top-inventors");
  const topEmergingInventorsEl = document.getElementById("top-emerging-inventors");
  const inventorViewControls = document.getElementById("inventor-view-controls");
  const analysisViewControls = document.getElementById("analysis-view-controls");
  const searchInput = document.getElementById("company-search");
  const companyList = document.getElementById("company-list");
  const companyForm = document.getElementById("company-form");
  const searchVersionEl = document.getElementById("search-version");
  const randomCompanyButton = document.getElementById("random-company");
  const copyCompanyLinkButton = document.getElementById("copy-company-link");
  const companyPresetsEl = document.getElementById("company-presets");
  const geoHighlightsEl = document.getElementById("geo-highlights");
  const geoHighlightsTitleEl = document.getElementById("geo-highlights-title");
  const geoGuideEl = document.getElementById("geo-map-guide");
  const analysisPanels = Array.from(document.querySelectorAll("[data-analysis-panel]"));
  if (!canvas || !labelLayer || !networkTitleEl || !citationTitleEl || !citationCanvas || !citationSummaryEl || !citationInsightEl || !citationModeControls || !profileEl || !companyDiagnosticsEl || !compareSearchInput || !compareCompanyButton || !clearCompareButton || !comparisonEl || !minEdgeSlider || !minEdgeValue || !clusterLegendEl || !topInventorsEl || !topEmergingInventorsEl || !inventorViewControls || !analysisViewControls || !analysisPanels.length || !searchInput || !companyList || !companyForm || !searchVersionEl || !randomCompanyButton || !copyCompanyLinkButton || !companyPresetsEl || !geoHighlightsEl || !geoHighlightsTitleEl || !geoGuideEl) {
    return;
  }

  const width = 960;
  const height = 620;
  const cWidth = 960;
  const cHeight = 680;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const FIRM_FIGURE_PARTNER_LIMIT = 20;
  const FIRM_DETAIL_PARTNER_LIMIT = 20;
  const ctx = canvas.getContext("2d");
  const cctx = citationCanvas.getContext("2d");
  if (!ctx || !cctx) return;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  citationCanvas.width = Math.floor(cWidth * dpr);
  citationCanvas.height = Math.floor(cHeight * dpr);
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Cohesive muted qualitative palette (consistent mid lightness + moderate
  // chroma so no cluster reads as neon), maroon anchoring the dominant one.
  const palette = [
    "#7a231a", "#a85336", "#9c7a33", "#6d7b3a", "#3f7a54",
    "#2f7a70", "#3a6d88", "#4b5691", "#6a4f8a", "#894f7c",
    "#a3536a", "#8a5a3e", "#7d6a38", "#557040", "#357a6e",
    "#41648a", "#585290", "#7a5286", "#96566a", "#6a6a6a",
  ];

  let currentData = null;
  let companyCatalog = [];
  let catalogByCanonical = new Map();
  let catalogBySlug = new Map();
  let catalogByOrg = new Map();
  let currentCitationArtifact = null;
  let currentInventorArtifact = null;
  let currentCompany = null;
  let currentGeoArtifact = null;
  let currentCompanyBundle = null;
  let currentComparisonCompany = null;
  let currentComparisonBundle = null;
  let currentCitationMode = "firm";
  let currentInventorView = "core";
  let currentAnalysisView = "map";
  let currentCitationScene = null;
  let citationHoverFocus = null;
  let citationPinnedFocus = null;
  let pendingUrlState = null;
  let copyLinkResetTimer = 0;
  let companyLoadToken = 0;
  let comparisonLoadToken = 0;
  let cpcAuditByCanonical = new Map();
  const citationModeButtons = Array.from(citationModeControls.querySelectorAll("[data-citation-mode]"));
  const inventorViewButtons = Array.from(inventorViewControls.querySelectorAll("[data-inventor-view]"));
  const analysisViewButtons = Array.from(analysisViewControls.querySelectorAll("[data-analysis-view]"));
  const presetCompanyNames = [
    "APPLE",
    "MICROSOFT",
    "NVIDIA",
    "IBM",
    "META PLATFORMS",
    "PFIZER",
    "TESLA",
    "UNITED TECHNOLOGIES",
  ];
  const canonicalMergeMap = new Map([
    ["apple computer", "apple"],
    ["goldman sachs and", "goldman sachs"],
    ["goldman sachs &", "goldman sachs"],
    ["facebook", "meta platforms"],
    ["facebook technologies", "meta platforms"],
    ["meta platforms technologies", "meta platforms"],
    ["meta platform technologies", "meta platforms"],
    ["at&t bell labs", "at&t"],
    ["at&t bls intellectual property", "at&t"],
    ["at&t delaware intellectual property", "at&t"],
    ["at&t global information solutions", "at&t"],
    ["at&t information systems", "at&t"],
    ["at&t ipm", "at&t"],
    ["at&t knowledge ventures", "at&t"],
    ["at&t labs", "at&t"],
    ["at&t mobility", "at&t"],
    ["at&t technical services", "at&t"],
    ["at&t technologies", "at&t"],
    ["at&t wireless", "at&t"],
    ["at&t wireless services", "at&t"],
    ["sbc knowledge ventures", "at&t"],
    ["sbc properties", "at&t"],
    ["sbc technology resources", "at&t"],
    ["southwestern bell", "at&t"],
  ]);
  let animationFrame = 0;
  let ambientFrame = 0;
  const lastPositions = new Map();

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function hash01(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000000) / 1000000;
  }

  function slugify(text) {
    return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  }

  function normalizeQuery(text) {
    return (text || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseBooleanParam(value) {
    if (value == null || value === "") return null;
    return !(value === "0" || value === "false" || value === "no");
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const edge = Number(params.get("edge"));
    const citation = String(params.get("citation") || "").trim();
    const inventor = String(params.get("inventor") || "").trim();
    const panel = String(params.get("panel") || "").trim();
    const geoScope = String(params.get("geoScope") || "").trim();
    const geoRegion = String(params.get("geoRegion") || "").trim();
    const geoLevel = String(params.get("geoLevel") || "").trim();
    const geoMetric = String(params.get("geoMetric") || params.get("geoSize") || "").trim();
    return {
      company: String(params.get("company") || "").trim(),
      compare: String(params.get("compare") || "").trim(),
      edge: Number.isFinite(edge) && edge > 0 ? Math.round(edge) : null,
      citation: ["firm", "primary_cpc", "all_cpc"].includes(citation) ? citation : null,
      inventor: ["core", "rising"].includes(inventor) ? inventor : null,
      panel: ["map", "network", "citation", "technology", "inventors"].includes(panel) ? panel : null,
      geoScope: ["inventor", "assignee"].includes(geoScope) ? geoScope : null,
      geoRegion: ["us", "world"].includes(geoRegion) ? geoRegion : null,
      geoLevel: geoLevel || null,
      geoSize: ["patent_count", "inventor_count", "location_count"].includes(geoMetric) ? geoMetric : null,
      background: parseBooleanParam(params.get("bg")),
    };
  }

  function currentMapViewState() {
    if (!window.CompanyGeoMap || typeof window.CompanyGeoMap.getViewState !== "function") return null;
    return window.CompanyGeoMap.getViewState();
  }

  function buildDeepLinkUrl() {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const companyName = currentCompany?.canonical_name || "";
    if (companyName) params.set("company", companyName);
    else params.delete("company");
    if (currentComparisonCompany?.canonical_name) params.set("compare", currentComparisonCompany.canonical_name);
    else params.delete("compare");

    if (currentData) {
      params.set("edge", String(minEdgeSlider.value));
      params.set("citation", currentCitationMode);
      params.set("inventor", currentInventorView);
      params.set("panel", currentAnalysisView);
    } else {
      params.delete("edge");
      params.delete("citation");
      params.delete("inventor");
      params.delete("panel");
    }

    const geoState = currentMapViewState();
    if (geoState) {
      params.set("geoScope", geoState.scope);
      params.set("geoRegion", geoState.region);
      params.set("geoLevel", geoState.level);
      if (geoState.sizeMetric) params.set("geoMetric", geoState.sizeMetric);
      else params.delete("geoMetric");
      params.delete("geoSize");
      params.set("bg", geoState.background ? "1" : "0");
    } else {
      params.delete("geoScope");
      params.delete("geoRegion");
      params.delete("geoLevel");
      params.delete("geoMetric");
      params.delete("geoSize");
      params.delete("bg");
    }

    return `${url.origin}${url.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function clearInitialUrlState() {
    if (!window.location.search) return;
    const next = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", next);
  }

  function geoLevelLabel(level, region) {
    if (level === "country") return "countries";
    if (level === "city") return "cities";
    if (level === "state") return "states";
    if (level === "county") return "counties";
    if (level === "commuting_zone") return "commuting zones";
    return region === "world" ? "exact locations worldwide" : "exact US locations";
  }

  function formatGeoHighlightMeta(row, payload) {
    const patents = Number(row.patent_count || 0);
    const metricField = payload?.metricField || "patent_count";
    const totalMetric = Number(payload?.totalMetric || 0);
    const shareBase = metricField === "patent_count" ? Number(payload?.totalPatents || 0) : totalMetric;
    const metricValue = metricField === "inventor_count"
      ? Number(row.inventor_count || 0)
      : metricField === "location_count"
        ? Number(row.location_count || 0)
        : patents;
    const share = shareBase > 0 ? 100 * metricValue / shareBase : 0;
    if (metricField === "inventor_count") {
      return `${countFmt(patents)} patents • ${countFmt(row.inventor_count || 0)} inventors • ${share.toFixed(1)}% of current view inventors`;
    }
    if (metricField === "location_count") {
      return `${countFmt(patents)} patents • ${countFmt(row.location_count || 0)} assignee offices • ${share.toFixed(1)}% of current view offices`;
    }
    return `${countFmt(patents)} patents • ${share.toFixed(1)}% of current view patents`;
  }

  function geoHighlightMetricValue(row, payload) {
    const metricField = payload?.metricField || "patent_count";
    if (metricField === "inventor_count") return Number(row.inventor_count || 0);
    if (metricField === "location_count") return Number(row.location_count || 0);
    return Number(row.patent_count || 0);
  }

  function renderGeoGuide(payload) {
    if (!payload || !payload.available || !payload.company) {
      geoGuideEl.innerHTML =
        `<strong>Map reading guide.</strong> Load a company to see what the background, overlay color, circle size, and place totals mean in the current view.`;
      return;
    }

    const modeLabel = payload.scope === "inventor"
      ? (payload.metricField === "inventor_count" ? "distinct inventors" : "inventor-linked patents")
      : (payload.metricField === "location_count" ? "assignee offices" : "assignee-linked patents");
    const levelLabel = geoLevelLabel(payload.level, payload.region);
    const isPointView = payload.level === "locations" || payload.level === "city";
    const overlaySentence = isPointView
      ? `The overlay shows <strong>${modeLabel}</strong> for ${levelLabel}. Darker color means more ${String(payload.metricLabel || "patents").toLowerCase()}, and larger circles reflect the same metric.`
      : `The overlay shows <strong>${modeLabel}</strong> for ${levelLabel}. Darker color means more ${String(payload.metricLabel || "patents").toLowerCase()} in that area.`;
    const backgroundSentence = payload.background
      ? `The background density layer now follows the current <strong>Show</strong> mode, so it reflects <strong>${modeLabel}</strong> across full PatentsView rather than just the loaded company.`
      : `The overall background density layer is currently hidden; boundaries remain for geographic context.`;
    const duplicationSentence = payload.scope === "inventor"
      ? `A patent can appear in multiple places when inventors are listed in different locations on the same patent record.`
      : `A patent can appear in multiple places when assignee offices are listed in different locations on the same patent record.`;
    const assigneeCoverage = currentGeoArtifact?.coverage?.assignee;
    const inventorCoverage = currentGeoArtifact?.coverage?.inventor;
    const assigneeGap = payload.scope === "assignee"
      && Number(assigneeCoverage?.patent_count || 0) > 0
      && Number(inventorCoverage?.patent_count || 0) > 0
      && (Number(assigneeCoverage?.patent_count || 0) / Number(inventorCoverage?.patent_count || 0)) < 0.5;
    const coverageSentence = assigneeGap
      ? `This company’s assignee layer is materially narrower than its inventor layer in the current artifact, so office-based views should be read as partial coverage.`
      : "";

    geoGuideEl.innerHTML = [
      `<strong>Map reading guide.</strong>`,
      overlaySentence,
      backgroundSentence,
      duplicationSentence,
      coverageSentence,
    ].filter(Boolean).join(" ");
  }

  function renderGeoHighlights(payload) {
    if (!payload || !payload.available || !payload.company) {
      geoHighlightsTitleEl.textContent = "Top places in the current map view.";
      geoHighlightsEl.innerHTML = `<div class="geo-highlights-empty">Load a company to inspect the geography in more detail.</div>`;
      return;
    }

    const label = geoLevelLabel(payload.level, payload.region);
    geoHighlightsTitleEl.textContent = `Top ${label} for the current ${payload.scope === "inventor" ? "inventor" : "assignee office"} layer, ranked by ${String(payload.metricLabel || "Patents").toLowerCase()}.`;
    const ranked = (payload.rows || [])
      .slice()
      .sort((a, b) =>
        (payload.metricField === "inventor_count"
          ? Number(b.inventor_count || 0) - Number(a.inventor_count || 0)
          : payload.metricField === "location_count"
            ? Number(b.location_count || 0) - Number(a.location_count || 0)
            : Number(b.patent_count || 0) - Number(a.patent_count || 0)) ||
        Number(b.patent_count || 0) - Number(a.patent_count || 0) ||
        String(a.label || "").localeCompare(String(b.label || ""))
      )
      .slice(0, 8);
    if (!ranked.length) {
      geoHighlightsEl.innerHTML = `<div class="geo-highlights-empty">No geography rows are available for this combination of company, layer, and map detail.</div>`;
      return;
    }
    const metricHeader = payload.metricField === "inventor_count"
      ? "Inventors"
      : payload.metricField === "location_count"
        ? "Offices"
        : "Patents";
    geoHighlightsEl.innerHTML =
      `<div class="geo-highlights-table-head">` +
        `<div>#</div>` +
        `<div>Place</div>` +
        `<div>${metricHeader}</div>` +
        `<div>Patents</div>` +
        `<div>Share</div>` +
      `</div>` +
      ranked.map((row, idx) => {
        const patents = Number(row.patent_count || 0);
        const metricValue = geoHighlightMetricValue(row, payload);
        const shareBase = payload.metricField === "patent_count"
          ? Number(payload.totalPatents || 0)
          : Number(payload.totalMetric || 0);
        const share = shareBase > 0 ? 100 * metricValue / shareBase : 0;
        return (
          `<div class="geo-highlight-row ${idx === 0 ? "geo-highlight-row-first" : ""}">` +
            `<div class="geo-highlight-rank">${idx + 1}</div>` +
            `<div class="geo-highlight-col">` +
              `<div class="geo-highlight-name">${row.label || "Unknown place"}</div>` +
              `<div class="geo-highlight-meta">${formatGeoHighlightMeta(row, payload)}</div>` +
            `</div>` +
            `<div class="geo-highlight-col"><div class="geo-highlight-value">${countFmt(metricValue)}</div><div class="geo-highlight-sub">${String(payload.metricLabel || metricHeader).toLowerCase()}</div></div>` +
            `<div class="geo-highlight-col"><div class="geo-highlight-value">${countFmt(patents)}</div><div class="geo-highlight-sub">patents</div></div>` +
            `<div class="geo-highlight-col"><div class="geo-highlight-value">${share.toFixed(1)}%</div><div class="geo-highlight-sub">current view</div></div>` +
          `</div>`
        );
      }).join("");
  }

  function setAnalysisView(view) {
    const next = ["map", "network", "citation", "technology", "inventors"].includes(view) ? view : "map";
    currentAnalysisView = next;
    analysisViewButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.analysisView === next);
    });
    analysisPanels.forEach((panel) => {
      panel.hidden = panel.dataset.analysisPanel !== next;
    });
  }

  function renderCompanyPresets() {
    const picks = presetCompanyNames
      .map((name) => lookupCompany(name))
      .filter((row, idx, arr) => row && row.available && arr.findIndex((other) => other.slug === row.slug) === idx)
      .slice(0, 6);
    companyPresetsEl.innerHTML = picks.map((row) =>
      `<button type="button" class="company-preset" data-company-preset="${row.canonical_name}">${row.canonical_name}</button>`
    ).join("");
  }

  function syncPresetButtons() {
    companyPresetsEl.querySelectorAll("[data-company-preset]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.companyPreset === (currentCompany?.canonical_name || ""));
    });
  }

  function pickRandomCompany() {
    const available = companyCatalog.filter((c) => c.available);
    if (!available.length) return null;
    const pool = currentCompany
      ? available.filter((c) => c.slug !== currentCompany.slug)
      : available;
    const choices = pool.length ? pool : available;
    return choices[Math.floor(Math.random() * choices.length)] || null;
  }

  function flashCopyLinkButton(label) {
    copyCompanyLinkButton.textContent = label;
    if (copyLinkResetTimer) window.clearTimeout(copyLinkResetTimer);
    copyLinkResetTimer = window.setTimeout(() => {
      copyCompanyLinkButton.textContent = "Copy deep link";
    }, 1400);
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, width, height);
  }

  function clearLabels() {
    labelLayer.innerHTML = "";
  }

  function clearCitationCanvas() {
    cctx.clearRect(0, 0, cWidth, cHeight);
  }

  function pct(v) {
    return `${Number(v || 0).toFixed(1)}%`;
  }

  function fmtMedian(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 2) / 2;
    return Number.isInteger(rounded) ? String(rounded.toFixed(0)) : rounded.toFixed(1);
  }

  function fmtPeerRank(percentile) {
    const p = clamp(Number(percentile || 0), 0, 100);
    if (p >= 50) {
      return `Top ${Math.max(1, Math.round(100 - p))}%`;
    }
    return `Bottom ${Math.max(1, Math.round(p))}%`;
  }

  function drawArrow(x1, y1, x2, y2, color, width) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = 6 + width * 0.8;
    const hx = x2 - ux * head;
    const hy = y2 - uy * head;
    cctx.save();
    cctx.strokeStyle = color;
    cctx.fillStyle = color;
    cctx.lineWidth = width;
    cctx.beginPath();
    cctx.moveTo(x1, y1);
    cctx.lineTo(hx, hy);
    cctx.stroke();
    cctx.beginPath();
    cctx.moveTo(x2, y2);
    cctx.lineTo(hx - uy * (head * 0.45), hy + ux * (head * 0.45));
    cctx.lineTo(hx + uy * (head * 0.45), hy - ux * (head * 0.45));
    cctx.closePath();
    cctx.fill();
    cctx.restore();
  }

  function roundedRect(ctx2d, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx2d.beginPath();
    ctx2d.moveTo(x + rr, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, rr);
    ctx2d.arcTo(x + w, y + h, x, y + h, rr);
    ctx2d.arcTo(x, y + h, x, y, rr);
    ctx2d.arcTo(x, y, x + w, y, rr);
    ctx2d.closePath();
  }

  function ellipsize(text, maxLen) {
    const s = String(text || "");
    if (s.length <= maxLen) return s;
    return `${s.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
  }

  function countFmt(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n - Math.round(n)) < 0.001) return Math.round(n).toLocaleString();
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function displayCountryName(name, alpha2 = "") {
    const code = String(alpha2 || "").trim().toUpperCase();
    const raw = String(name || "").trim();
    if (code === "TW" || /^Taiwan\b/i.test(raw)) return "Taiwan";
    return raw || code || "Unknown";
  }

  function summarizeAssigneeOfficeFootprint(geoArtifact) {
    const points = Array.isArray(geoArtifact?.assignee_points) ? geoArtifact.assignee_points : [];
    if (!points.length) {
      return {
        primaryCountryText: "N/A",
        totalOfficesText: "N/A",
        totalOffices: 0,
        usOffices: 0,
        internationalOffices: 0,
        countryCount: 0,
        assigneeCountries: [],
      };
    }

    const locationMap = new Map();
    for (const row of points) {
      const locationId = String(row.location_id || "").trim();
      if (!locationId) continue;
      const countryAlpha2 = String(row.country_alpha2 || "").trim().toUpperCase();
      const countryName = displayCountryName(row.country_name, countryAlpha2);
      const patentCount = Number(row.patent_count || 0);
      const existing = locationMap.get(locationId);
      if (!existing || patentCount > existing.patentCount) {
        locationMap.set(locationId, { countryName, countryAlpha2, patentCount });
      }
    }

    if (!locationMap.size) {
      return {
        primaryCountryText: "N/A",
        totalOfficesText: "N/A",
        totalOffices: 0,
        usOffices: 0,
        internationalOffices: 0,
        countryCount: 0,
        assigneeCountries: [],
      };
    }

    const countryStats = new Map();
    for (const location of locationMap.values()) {
      const key = `${location.countryAlpha2}||${location.countryName}`;
      if (!countryStats.has(key)) {
        countryStats.set(key, {
          countryName: location.countryName,
          countryAlpha2: location.countryAlpha2,
          officeCount: 0,
          patentCount: 0,
        });
      }
      const stat = countryStats.get(key);
      stat.officeCount += 1;
      stat.patentCount += location.patentCount;
    }

    const rankedCountries = Array.from(countryStats.values()).sort((a, b) =>
      Number(b.officeCount || 0) - Number(a.officeCount || 0) ||
      Number(b.patentCount || 0) - Number(a.patentCount || 0) ||
      String(a.countryName || "").localeCompare(String(b.countryName || ""))
    );
    const primary = rankedCountries[0];
    const totalOffices = locationMap.size;
    const usOffices = rankedCountries
      .filter((row) => row.countryAlpha2 === "US")
      .reduce((sum, row) => sum + Number(row.officeCount || 0), 0);
    const internationalOffices = Math.max(0, totalOffices - usOffices);
    const otherCountries = rankedCountries
      .filter((row) => !(row.countryAlpha2 === primary.countryAlpha2 && row.countryName === primary.countryName))
      .slice(0, 5)
      .map((row) => `${row.countryName} ${countFmt(row.officeCount)}`);

    let totalOfficesText = `${countFmt(totalOffices)} total (${countFmt(usOffices)} US, ${countFmt(internationalOffices)} international)`;
    if (otherCountries.length) {
      totalOfficesText += `. Other countries: ${otherCountries.join("; ")}.`;
    }

    return {
      primaryCountryText: `${primary.countryName} (${countFmt(primary.officeCount)} offices)`,
      totalOfficesText,
      totalOffices,
      usOffices,
      internationalOffices,
      countryCount: rankedCountries.length,
      assigneeCountries: rankedCountries,
    };
  }

  function renderCompanyDiagnostics(meta, geoArtifact, citationProfile, officeFootprint) {
    const inventorCoverage = Number(geoArtifact?.coverage?.inventor?.resolved_patent_share_pct || 0);
    const assigneeCoverage = Number(geoArtifact?.coverage?.assignee?.resolved_patent_share_pct || 0);
    const inventorResolvedPatents = Number(geoArtifact?.coverage?.inventor?.resolved_patent_count || 0);
    const inventorTotalPatents = Number(geoArtifact?.coverage?.inventor?.patent_count || 0);
    const assigneeResolvedPatents = Number(geoArtifact?.coverage?.assignee?.resolved_patent_count || 0);
    const assigneeTotalPatents = Number(geoArtifact?.coverage?.assignee?.patent_count || 0);
    const assigneeEntities = Number(geoArtifact?.coverage?.assignee?.assignee_name_count || 0);
    const cpcAudit = companyAuditRow(meta?.canonical_name || meta?.company || currentCompany?.canonical_name || "");
    const hasCpcAudit = !!cpcAudit;
    const cpcPct = Number(cpcAudit?.patents_with_cpc_pct || 0);
    const cpcPatents = Number(cpcAudit?.patents_with_cpc || 0);
    const cpcTotal = Number(cpcAudit?.patents_total || 0);
    const citationScope = citationProfile ? "Granted-only" : "N/A";

    companyDiagnosticsEl.innerHTML =
      `<div class="diagnostics-title">Coverage & diagnostics</div>` +
      `<div class="diagnostics-grid">` +
        `<div class="diagnostic-stat"><div class="diagnostic-stat-label">Inventor location coverage</div><div class="diagnostic-stat-value">${pct(inventorCoverage)}</div><div class="diagnostic-stat-note">${countFmt(inventorResolvedPatents)} of ${countFmt(inventorTotalPatents)} inventor-linked patents resolve to a location.</div></div>` +
        `<div class="diagnostic-stat"><div class="diagnostic-stat-label">Assignee office coverage</div><div class="diagnostic-stat-value">${pct(assigneeCoverage)}</div><div class="diagnostic-stat-note">${countFmt(assigneeResolvedPatents)} of ${countFmt(assigneeTotalPatents)} assignee-linked patents resolve to an office location. This layer can be much narrower than the inventor-linked patent footprint when assignee IDs are incomplete.</div></div>` +
        `<div class="diagnostic-stat"><div class="diagnostic-stat-label">Technology tagging coverage</div><div class="diagnostic-stat-value">${hasCpcAudit ? pct(cpcPct) : "N/A"}</div><div class="diagnostic-stat-note">${hasCpcAudit ? `${countFmt(cpcPatents)} of ${countFmt(cpcTotal)} patents in the CPC audit carry technology labels.` : "No CPC completeness audit row is available for this company."}</div></div>` +
        `<div class="diagnostic-stat"><div class="diagnostic-stat-label">Named assignee entities</div><div class="diagnostic-stat-value">${countFmt(assigneeEntities)}</div><div class="diagnostic-stat-note">Distinct legal assignee names currently feeding this company page.</div></div>` +
        `<div class="diagnostic-stat"><div class="diagnostic-stat-label">Citation basis</div><div class="diagnostic-stat-value">${citationScope}</div><div class="diagnostic-stat-note">Citation flows use granted patents; the inventor graph and filing window combine granted and pregrant records after PatentsView deduplication.</div></div>` +
      `</div>`;
  }

  function renderDiagnosticsPlaceholder(message) {
    companyDiagnosticsEl.innerHTML =
      `<div class="diagnostics-title">Coverage & diagnostics</div>` +
      `<div class="diagnostic-empty">${message}</div>`;
  }

  function renderComparisonPlaceholder(message, visible = false) {
    comparisonEl.hidden = !visible;
    clearCompareButton.hidden = !visible;
    if (!visible) {
      comparisonEl.innerHTML = "";
      return;
    }
    comparisonEl.innerHTML =
      `<div class="comparison-title">Comparison</div>` +
      `<div class="comparison-subtitle">${message}</div>`;
  }

  function companyAuditRow(companyOrName) {
    const key = normalizeQuery(
      typeof companyOrName === "string"
        ? companyOrName
        : (companyOrName?.canonical_name || companyOrName?.company || "")
    );
    return key ? (cpcAuditByCanonical.get(key) || null) : null;
  }

  function formatPatentBreakdown(meta) {
    return `${countFmt(meta?.total_patents_used || 0)} total (${countFmt(meta?.granted_patents_used || 0)} granted, ${countFmt(meta?.pregrant_patents_used || 0)} pregrant)`;
  }

  function coverageLine(geoArtifact, scope) {
    const block = geoArtifact?.coverage?.[scope];
    if (!block) return "N/A";
    return `${pct(block.resolved_patent_share_pct || 0)} (${countFmt(block.resolved_patent_count || 0)} of ${countFmt(block.patent_count || 0)} patents)`;
  }

  function topTechnologyLine(meta) {
    const items = (meta?.top_cpc4 || []).slice(0, 3);
    if (!items.length) return "N/A";
    return items.map((item) => item.cpc4).join(" • ");
  }

  function exactMeanTeamSize(graph, meta) {
    const totalPatents = Number(meta?.total_patents_used || 0);
    if (!(totalPatents > 0)) return null;
    const inventorPatentAssignments = (graph?.nodes || []).reduce(
      (sum, node) => sum + Number(node.patent_count || 0),
      0,
    );
    if (!(inventorPatentAssignments > 0)) return null;
    return inventorPatentAssignments / totalPatents;
  }

  function filingWindowText(meta) {
    const firstObserved = Number(meta?.first_observed_year || 0);
    const lastObserved = Number(meta?.last_observed_year || 0);
    const ageYears = Number(meta?.company_age_years);
    if (!(firstObserved > 0) || !(lastObserved > 0)) return "N/A";
    const spanText = Number.isFinite(ageYears) && ageYears >= 0 ? `${Math.round(ageYears)} years` : "N/A";
    return `${firstObserved} - ${lastObserved} (${spanText})`;
  }

  function technologyFootprintHtml(meta) {
    const items = (meta?.top_cpc4 || []).slice(0, 3);
    if (!items.length) return "N/A";
    return items.map((item) =>
      `<div class="profile-subvalue-line"><span class="profile-subvalue-code">${item.cpc4}</span> ${pct(item.patent_share_pct || 0)} of patents; ${pct(item.inventor_share_pct || 0)} of inventors; mean team size ${Number(item.mean_team_size || 0).toFixed(1)}</div>`
    ).join("");
  }

  function comparisonValueHtml(companyName, text, isCurrent = false) {
    return `<div class="comparison-value${isCurrent ? " is-current" : ""}" data-company-label="${companyName}">${text}</div>`;
  }

  function renderComparisonCard(primaryBundle, comparisonBundle) {
    if (!primaryBundle || !comparisonBundle) {
      renderComparisonPlaceholder("Add a second company to compare patents, coverage, geography, and technology.", false);
      return;
    }
    const primaryMeta = primaryBundle.metaMerged || {};
    const comparisonMeta = comparisonBundle.metaMerged || {};
    const primaryCitation = primaryBundle.citationProfile || {};
    const comparisonCitation = comparisonBundle.citationProfile || {};
    const primaryAudit = primaryBundle.cpcAudit || {};
    const comparisonAudit = comparisonBundle.cpcAudit || {};

    const rows = [
      {
        label: "Primary country",
        primary: primaryBundle.officeFootprint.primaryCountryText,
        comparison: comparisonBundle.officeFootprint.primaryCountryText,
      },
      {
        label: "Patents in data",
        primary: formatPatentBreakdown(primaryMeta),
        comparison: formatPatentBreakdown(comparisonMeta),
      },
      {
        label: "Inventors in graph",
        primary: countFmt((primaryBundle.graph?.nodes || []).length),
        comparison: countFmt((comparisonBundle.graph?.nodes || []).length),
      },
      {
        label: "Citations received",
        primary: countFmt(primaryCitation.citations_received_total || 0),
        comparison: countFmt(comparisonCitation.citations_received_total || 0),
      },
      {
        label: "Inventor coverage",
        primary: coverageLine(primaryBundle.geoArtifact, "inventor"),
        comparison: coverageLine(comparisonBundle.geoArtifact, "inventor"),
      },
      {
        label: "Assignee coverage",
        primary: coverageLine(primaryBundle.geoArtifact, "assignee"),
        comparison: coverageLine(comparisonBundle.geoArtifact, "assignee"),
      },
      {
        label: "Total offices",
        primary: primaryBundle.officeFootprint.totalOfficesText,
        comparison: comparisonBundle.officeFootprint.totalOfficesText,
      },
      {
        label: "Top technologies",
        primary: topTechnologyLine(primaryMeta),
        comparison: topTechnologyLine(comparisonMeta),
      },
      {
        label: "CPC coverage",
        primary: primaryAudit && Object.keys(primaryAudit).length
          ? `${pct(primaryAudit.patents_with_cpc_pct || 0)} (${countFmt(primaryAudit.patents_with_cpc || 0)} of ${countFmt(primaryAudit.patents_total || 0)})`
          : "N/A",
        comparison: comparisonAudit && Object.keys(comparisonAudit).length
          ? `${pct(comparisonAudit.patents_with_cpc_pct || 0)} (${countFmt(comparisonAudit.patents_with_cpc || 0)} of ${countFmt(comparisonAudit.patents_total || 0)})`
          : "N/A",
      },
    ];

    comparisonEl.hidden = false;
    clearCompareButton.hidden = false;
    comparisonEl.innerHTML =
      `<div class="comparison-title">Comparison</div>` +
      `<div class="comparison-subtitle">${primaryBundle.company.canonical_name} against ${comparisonBundle.company.canonical_name} on the precomputed portfolio, geography, and citation artifacts.</div>` +
      `<div class="comparison-grid">` +
        rows.map((row) =>
          `<div class="comparison-row">` +
            `<div class="comparison-label">${row.label}</div>` +
            comparisonValueHtml(primaryBundle.company.canonical_name, row.primary, true) +
            comparisonValueHtml(comparisonBundle.company.canonical_name, row.comparison, false) +
          `</div>`
        ).join("") +
      `</div>` +
      `<div class="comparison-note">The comparison card uses full precomputed totals rather than the current graph threshold, so its patent and inventor counts can exceed what is visible in the filtered inventor graph.</div>`;
  }

  function companyColor(name, alpha = 1, saturation = 58, lightness = 42) {
    const hue = Math.floor(hash01(`company-color-${normalizeQuery(name || "")}`) * 360);
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
  }

  function drawCompanyIdentityDot(x, y, companyName, radius = 4) {
    cctx.save();
    cctx.fillStyle = companyName === "__focal__"
      ? "rgba(122,35,26,0.95)"
      : companyName === "__neutral__"
        ? "rgba(96,96,96,0.88)"
        : companyColor(companyName, 0.95, 56, 42);
    cctx.beginPath();
    cctx.arc(x, y, radius, 0, Math.PI * 2);
    cctx.fill();
    cctx.restore();
  }

  function rankCitationPartners(items, selfItem, limit = 20) {
    const rows = (items || []).map((item) => ({ ...item, is_self: false }));
    if (selfItem && Number(selfItem.citations || 0) > 0) {
      rows.push({ ...selfItem, is_self: true });
    }
    return rows
      .sort((a, b) =>
        Number(b.citations || 0) - Number(a.citations || 0) ||
        String(a.company || "").localeCompare(String(b.company || ""))
      )
      .slice(0, limit);
  }

  function cpcSummaryText(cpc4, title) {
    if (!cpc4) return "Unknown CPC";
    if (!title) return cpc4;
    return `${cpc4} - ${title}`;
  }

  function trimCitationNodes(nodes, mainLimit) {
    const ranked = (nodes || []).slice().sort((a, b) => Number(b.patent_count || 0) - Number(a.patent_count || 0));
    const other = ranked.find((node) => String(node.cpc4) === "OTHER");
    const main = ranked.filter((node) => String(node.cpc4) !== "OTHER").slice(0, mainLimit);
    return other ? [...main, other] : main;
  }

  function citationFocusKey(focus) {
    if (!focus) return "";
    return [
      focus.type || "",
      focus.side || "",
      focus.company || "",
      focus.cpc4 || "",
    ].join("|");
  }

  function citationFocusEquals(a, b) {
    return citationFocusKey(a) === citationFocusKey(b);
  }

  function citationNodeKey(side, company, cpc4) {
    return [side || "", company || "", cpc4 || ""].join("|");
  }

  function citationCanvasPoint(evt) {
    const rect = citationCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: ((evt.clientX - rect.left) / rect.width) * cWidth,
      y: ((evt.clientY - rect.top) / rect.height) * cHeight,
    };
  }

  function edgeMatchesCitationFocus(edge, group, focus) {
    if (!focus) return true;
    if (focus.type === "group") {
      return focus.side === group.side && focus.company === group.company;
    }
    if (focus.type !== "node") return true;
    if (focus.side === "focal") {
      if (group.side === "upstream") return edge.source_cpc4 === focus.cpc4;
      if (group.side === "downstream") return edge.target_cpc4 === focus.cpc4;
      return false;
    }
    if (focus.side !== group.side || focus.company !== group.company) return false;
    if (group.side === "upstream") return edge.target_cpc4 === focus.cpc4;
    if (group.side === "downstream") return edge.source_cpc4 === focus.cpc4;
    return false;
  }

  function citationPartnerShareLabel(side) {
    return side === "upstream" ? "of all upstream partner citations" : "of all downstream partner citations";
  }

  function renderCitationInsight(scene, focus) {
    if (!scene) {
      citationInsightEl.innerHTML = "";
      return;
    }
    const { company, modeLabel, leftGroups, rightGroups } = scene;
    const pinned = citationPinnedFocus && focus && citationFocusEquals(citationPinnedFocus, focus);
    const allGroups = [...leftGroups, ...rightGroups];
    const allEdges = allGroups.flatMap((group) =>
      filterCitationEdges(group.edges).map((edge) => ({ group, edge })),
    );
    const strongestOverall = allEdges
      .slice()
      .sort((a, b) => Number(b.edge.citations || 0) - Number(a.edge.citations || 0))[0];

    if (!focus) {
      const strongestUpstream = leftGroups.slice().sort((a, b) => Number(b.citations || 0) - Number(a.citations || 0))[0];
      const strongestDownstream = rightGroups.slice().sort((a, b) => Number(b.citations || 0) - Number(a.citations || 0))[0];
      const partnerList = (groups, label) => {
        const rows = groups
          .slice(0, 3)
          .map((group) =>
            `<li class="citation-insight-item"><div class="citation-insight-main">${group.company}</div><div class="citation-insight-note">${countFmt(group.citations)} citations, ${pct(group.share_pct)} ${citationPartnerShareLabel(label.toLowerCase())}.</div></li>`,
          )
          .join("");
        return `<div class="citation-insight-block"><div class="citation-insight-heading">${label} partners</div><ul class="citation-insight-list">${rows}</ul></div>`;
      };
      citationInsightEl.innerHTML =
        `<div class="citation-insight-title">What Stands Out</div>` +
        `<div class="citation-insight-subtitle">${modeLabel} view. Each shell is a partner firm; each dot is a CPC bucket sized by patent count.</div>` +
        `<div class="citation-insight-meta">Hover a shell or CPC dot to isolate its strongest channels. Click to pin a selection.</div>` +
        `<div class="citation-insight-block">` +
          `<div class="citation-insight-heading">Biggest relationships</div>` +
          `<ul class="citation-insight-list">` +
            (strongestUpstream
              ? `<li class="citation-insight-item"><div class="citation-insight-kicker">Strongest upstream partner</div><div class="citation-insight-main">${company} leans most on ${strongestUpstream.company}.</div><div class="citation-insight-note">${countFmt(strongestUpstream.citations)} citations, ${pct(strongestUpstream.share_pct)} ${citationPartnerShareLabel("upstream")}.</div></li>`
              : "") +
            (strongestDownstream
              ? `<li class="citation-insight-item"><div class="citation-insight-kicker">Strongest downstream partner</div><div class="citation-insight-main">${strongestDownstream.company} draws most heavily on ${company}.</div><div class="citation-insight-note">${countFmt(strongestDownstream.citations)} citations, ${pct(strongestDownstream.share_pct)} ${citationPartnerShareLabel("downstream")}.</div></li>`
              : "") +
            (strongestOverall
              ? `<li class="citation-insight-item"><div class="citation-insight-kicker">Strongest visible technology lane</div><div class="citation-insight-main">${strongestOverall.group.company}: ${strongestOverall.edge.source_cpc4} to ${strongestOverall.edge.target_cpc4}.</div><div class="citation-insight-note">${countFmt(strongestOverall.edge.citations)} citations within the firms shown here.</div></li>`
              : "") +
          `</ul>` +
        `</div>` +
        `${partnerList(leftGroups, "Upstream")}${partnerList(rightGroups, "Downstream")}`;
      return;
    }

    if (focus.type === "group") {
      const group = allGroups.find((item) => item.side === focus.side && item.company === focus.company);
      if (!group) {
        renderCitationInsight(scene, null);
        return;
      }
      const topEdges = filterCitationEdges(group.edges).slice(0, 5);
      const topNodes = trimCitationNodes(group.nodes || [], 4);
      citationInsightEl.innerHTML =
        `<div class="citation-insight-title">${group.company}</div>` +
        `<div class="citation-insight-subtitle">${group.side === "upstream" ? "Upstream partner cited by the focal firm" : "Downstream partner citing the focal firm"}${pinned ? " · pinned" : ""}</div>` +
        `<div class="citation-insight-meta">${countFmt(group.citations)} citations, ${pct(group.share_pct)} ${citationPartnerShareLabel(group.side)}.</div>` +
        `<div class="citation-insight-block"><div class="citation-insight-heading">Main technology buckets</div><div class="citation-insight-chips">${topNodes.map((node) => `<span class="citation-insight-chip">${node.cpc4} ${pct(node.patent_share_pct)}</span>`).join("")}</div></div>` +
        `<div class="citation-insight-block">` +
          `<div class="citation-insight-heading">Strongest technology lanes</div>` +
          `<ul class="citation-insight-list">` +
            topEdges.map((edge) => `<li class="citation-insight-item"><div class="citation-insight-main">${edge.source_cpc4} to ${edge.target_cpc4}</div><div class="citation-insight-note">${countFmt(edge.citations)} citations, ${pct(edge.share_pct_of_pair)} of this visible partner pair.</div></li>`).join("") +
          `</ul>` +
        `</div>`;
      return;
    }

    if (focus.type === "node") {
      const matching = allGroups.flatMap((group) =>
        filterCitationEdges(group.edges)
          .filter((edge) => edgeMatchesCitationFocus(edge, group, focus))
          .map((edge) => ({ group, edge })),
      ).sort((a, b) => Number(b.edge.citations || 0) - Number(a.edge.citations || 0)).slice(0, 6);

      citationInsightEl.innerHTML =
        `<div class="citation-insight-title">${focus.company}</div>` +
        `<div class="citation-insight-subtitle">${cpcSummaryText(focus.cpc4, focus.title)}${pinned ? " · pinned" : ""}</div>` +
        `<div class="citation-insight-meta">${focus.side === "focal" ? "Focal-firm technology bucket." : `${focus.side === "upstream" ? "Upstream" : "Downstream"} partner technology bucket.`}</div>` +
        `<div class="citation-insight-block">` +
          `<div class="citation-insight-heading">Visible channels</div>` +
          `<ul class="citation-insight-list">` +
            (matching.length
              ? matching.map(({ group, edge }) => `<li class="citation-insight-item"><div class="citation-insight-kicker">${group.company}</div><div class="citation-insight-main">${edge.source_cpc4} to ${edge.target_cpc4}</div><div class="citation-insight-note">${countFmt(edge.citations)} citations, ${pct(edge.share_pct_of_pair)} of the visible pair.</div></li>`).join("")
              : `<li class="citation-insight-item"><div class="citation-insight-main">No visible filtered CPC channel for this bucket.</div></li>`) +
          `</ul>` +
        `</div>`;
    }
  }

  async function fetchJsonWithFallback(paths) {
    let lastErr = null;
    for (const path of paths) {
      try {
        const r = await fetch(path, { cache: "no-store" });
        if (!r.ok) {
          lastErr = new Error(`HTTP ${r.status} for ${path}`);
          continue;
        }
        return await r.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Load failed");
  }

  async function fetchJsonOptional(paths) {
    try {
      return await fetchJsonWithFallback(paths);
    } catch (err) {
      return null;
    }
  }

  async function fetchTextWithFallback(paths) {
    let lastErr = null;
    for (const path of paths) {
      try {
        const r = await fetch(path, { cache: "no-store" });
        if (!r.ok) {
          lastErr = new Error(`HTTP ${r.status} for ${path}`);
          continue;
        }
        return await r.text();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Load failed");
  }

  async function loadCpcAudit() {
    try {
      const text = await fetchTextWithFallback([
        "../data/networks/audits/cpc_completeness.csv",
        "/data/networks/audits/cpc_completeness.csv",
      ]);
      const rows = window.d3 && typeof window.d3.csvParse === "function"
        ? window.d3.csvParse(text)
        : [];
      cpcAuditByCanonical = new Map(
        rows
          .filter((row) => row && row.canonical_name)
          .map((row) => [normalizeQuery(row.canonical_name), row]),
      );
    } catch (err) {
      cpcAuditByCanonical = new Map();
    }
  }

  async function fetchCompanyBundle(company) {
    const slug = company.slug || slugify(company.canonical_name);
    const [graph, inventorArtifact, citationArtifact, geoArtifact] = await Promise.all([
      fetchJsonWithFallback([
        `../data/networks/companies/${slug}.json`,
        `/data/networks/companies/${slug}.json`,
      ]),
      fetchJsonOptional([
        `../data/networks/artifacts/inventor_metrics/${slug}.json`,
        `/data/networks/artifacts/inventor_metrics/${slug}.json`,
      ]),
      fetchJsonOptional([
        `../data/networks/artifacts/citation_views/${slug}.json`,
        `/data/networks/artifacts/citation_views/${slug}.json`,
      ]),
      fetchJsonOptional([
        `../data/networks/artifacts/geo/companies/${slug}.json`,
        `/data/networks/artifacts/geo/companies/${slug}.json`,
      ]),
    ]);
    const baseMeta = graph.meta || {};
    const metaMerged = mergeInventorArtifacts(baseMeta, inventorArtifact);
    const citationProfile = (citationArtifact && citationArtifact.modes && citationArtifact.modes.firm && citationArtifact.modes.firm.profile)
      || baseMeta.citation_profile
      || {};
    return {
      company,
      slug,
      graph,
      inventorArtifact,
      citationArtifact,
      geoArtifact,
      metaMerged,
      citationProfile,
      citationRankProfile: baseMeta.citation_profile || citationProfile || {},
      officeFootprint: summarizeAssigneeOfficeFootprint(geoArtifact),
      cpcAudit: companyAuditRow(company),
    };
  }

  function mergeInventorArtifacts(meta, inventorArtifact) {
    if (!inventorArtifact || !inventorArtifact.inventors) return meta || {};
    const merged = { ...(meta || {}) };
    for (const block of ["top_inventors", "top_emerging_inventors"]) {
      const rows = (merged[block] || []).map((inv) => {
        const extra = inventorArtifact.inventors[String(inv.id || "").trim()];
        if (!extra) return inv;
        const mergedInv = { ...inv, ...extra };
        if (inv.citations_per_patent !== undefined && inv.citations_per_patent !== null) {
          mergedInv.citations_per_patent = inv.citations_per_patent;
        }
        if (inv.median_team_size !== undefined && inv.median_team_size !== null) {
          mergedInv.median_team_size = inv.median_team_size;
        }
        return mergedInv;
      });
      merged[block] = rows;
    }
    return merged;
  }

  function setCitationMode(mode) {
    currentCitationMode = mode;
    citationModeButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.citationMode === mode);
    });
  }

  function setInventorView(mode) {
    currentInventorView = mode;
    inventorViewButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.inventorView === mode);
    });
    topInventorsEl.hidden = mode !== "core";
    topEmergingInventorsEl.hidden = mode !== "rising";
  }

  function recommendMinWeight(graph) {
    const links = graph.links || [];
    if (!links.length) return 1;
    const target = 7000;
    if (links.length <= target) return 1;
    const weights = links.map((l) => Number(l.weight || 1)).sort((a, b) => b - a);
    const idx = Math.min(weights.length - 1, target - 1);
    return Math.max(1, Math.floor(weights[idx]));
  }

  function buildFilteredGraph(graph, minWeight) {
    let links = (graph.links || []).filter((l) => (l.weight || 1) >= minWeight);
    if (links.length > 8000) {
      links = links
        .slice()
        .sort((a, b) => (Number(b.weight || 0) - Number(a.weight || 0)))
        .slice(0, 8000);
    }
    const allNodes = (graph.nodes || []).map((n) => ({ ...n }));
    const allNodeById = new Map(allNodes.map((n) => [n.id, n]));
    const activeIds = new Set();
    for (const link of links) {
      activeIds.add(link.source);
      activeIds.add(link.target);
    }
    const isolated = allNodes
      .filter((n) => !activeIds.has(n.id))
      .sort((a, b) => Number(b.patent_count || 0) - Number(a.patent_count || 0))
      .slice(0, 2500);
    let nodes = [];
    for (const id of activeIds) {
      const node = allNodeById.get(id);
      if (node) nodes.push(node);
    }
    nodes.push(...isolated);
    const preNodeById = new Map(nodes.map((n) => [n.id, n]));
    const preDegree = new Map(nodes.map((n) => [n.id, 0]));
    for (const link of links) {
      if (!preNodeById.has(link.source) || !preNodeById.has(link.target)) continue;
      preDegree.set(link.source, (preDegree.get(link.source) || 0) + 1);
      preDegree.set(link.target, (preDegree.get(link.target) || 0) + 1);
    }
    if (nodes.length > 6000) {
      nodes = nodes
        .slice()
        .sort((a, b) => {
          const da = preDegree.get(a.id) || 0;
          const db = preDegree.get(b.id) || 0;
          if (db !== da) return db - da;
          return Number(b.patent_count || 0) - Number(a.patent_count || 0);
        })
        .slice(0, 6000);
      const keep = new Set(nodes.map((n) => n.id));
      links = links.filter((l) => keep.has(l.source) && keep.has(l.target));
      if (links.length > 5000) {
        links = links
          .slice()
          .sort((a, b) => (Number(b.weight || 0) - Number(a.weight || 0)))
          .slice(0, 5000);
      }
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const degree = new Map(nodes.map((n) => [n.id, 0]));
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    }
    return { nodes, links, nodeById, degree };
  }

  function buildCpcBuckets(graph, nodes) {
    const top = ((graph.meta || {}).top_cpc4 || []).slice(0, 20);
    const topCodes = top.map((x) => x.cpc4);
    const topSet = new Set(topCodes);
    const buckets = new Map();
    for (const code of topCodes) buckets.set(code, []);
    buckets.set("OTHER", []);
    const nodeBucket = new Map();

    for (const node of nodes) {
      const cpc4 = (node.cpc4 || "").toUpperCase();
      const key = topSet.has(cpc4) ? cpc4 : "OTHER";
      buckets.get(key).push(node);
      nodeBucket.set(node.id, key);
    }

    const bucketOrder = [...topCodes];
    if ((buckets.get("OTHER") || []).length > 0) bucketOrder.push("OTHER");
    const topByCode = new Map(top.map((x) => [x.cpc4, x]));
    return { top, topByCode, buckets, nodeBucket, bucketOrder };
  }

  function layoutByBuckets(degree, buckets, bucketOrder) {
    const centers = new Map();
    const topOnly = bucketOrder.filter((b) => b !== "OTHER");
    const n = Math.max(topOnly.length, 1);
    const cx = width / 2;
    const cy = height / 2;
    const ringR = Math.min(width, height) * 0.34;

    for (let i = 0; i < topOnly.length; i += 1) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      centers.set(topOnly[i], { x: cx + Math.cos(angle) * ringR, y: cy + Math.sin(angle) * ringR });
    }
    if (bucketOrder.includes("OTHER")) centers.set("OTHER", { x: cx, y: cy });

    for (const key of bucketOrder) {
      const center = centers.get(key);
      const group = (buckets.get(key) || []).slice().sort((a, b) => {
        const da = degree.get(a.id) || 0;
        const db = degree.get(b.id) || 0;
        if (db !== da) return db - da;
        return b.patent_count - a.patent_count;
      });
      const m = Math.max(group.length, 1);
      const base = key === "OTHER" ? 3.2 : 5.4;
      const scale = clamp(Math.sqrt(group.length) * (key === "OTHER" ? 1.08 : 1.3), 8, 72);
      for (let i = 0; i < group.length; i += 1) {
        const node = group[i];
        const t = i / m;
        const localR = base + scale * Math.sqrt(t);
        const localA = i * 2.399963229728653 + (hash01(`a-${node.id}`) - 0.5) * 0.1;
        node.x = center.x + Math.cos(localA) * localR;
        node.y = center.y + Math.sin(localA) * localR;
      }
    }
    return centers;
  }

  function drawNetworkNote(lines) {
    if (!lines || !lines.length) return;
    const paddingX = 10;
    const paddingY = 8;
    const lineH = 14;
    const boxW = 290;
    const boxH = paddingY * 2 + lines.length * lineH;
    const x = 12;
    const y = height - boxH - 12;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    roundedRect(ctx, x, y, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5a5a5a";
    ctx.font = "600 10.5px Source Sans 3, sans-serif";
    ctx.textAlign = "left";
    lines.forEach((line, idx) => {
      ctx.fillText(line, x + paddingX, y + paddingY + 11 + idx * lineH);
    });
    ctx.restore();
  }

  function drawFrame(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, timeSec, motionScale = 1, noteLines = []) {
    clearCanvas();
    ctx.save();
    for (const link of links) {
      const s0 = nodeById.get(link.source);
      const t0 = nodeById.get(link.target);
      if (!s0 || !t0) continue;

      const sx = s0.x + Math.sin(timeSec * 0.8 + hash01(`sx-${s0.id}`) * 6.28) * 0.45 * motionScale;
      const sy = s0.y + Math.cos(timeSec * 0.9 + hash01(`sy-${s0.id}`) * 6.28) * 0.45 * motionScale;
      const tx = t0.x + Math.sin(timeSec * 0.8 + hash01(`sx-${t0.id}`) * 6.28) * 0.45 * motionScale;
      const ty = t0.y + Math.cos(timeSec * 0.9 + hash01(`sy-${t0.id}`) * 6.28) * 0.45 * motionScale;

      const sb = nodeBucket.get(s0.id) || "OTHER";
      const tb = nodeBucket.get(t0.id) || "OTHER";
      const cross = sb !== tb;
      ctx.strokeStyle = cross ? "rgba(95,95,95,0.10)" : "rgba(122,35,26,0.22)";
      ctx.lineWidth = cross ? 0.24 : 0.3 + Math.min(link.weight || 1, 16) * 0.09;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    for (const node of nodes) {
      const nx = node.x + Math.sin(timeSec * 0.8 + hash01(`sx-${node.id}`) * 6.28) * 0.45 * motionScale;
      const ny = node.y + Math.cos(timeSec * 0.9 + hash01(`sy-${node.id}`) * 6.28) * 0.45 * motionScale;
      const deg = degree.get(node.id) || 0;
      const base = 0.8 + (node.node_size || 0) * 0.95;
      const radius = clamp(base + Math.min(deg, 12) * 0.05, 0.7, 8.5);
      const key = nodeBucket.get(node.id) || "OTHER";
      ctx.fillStyle = colorByCpc ? (bucketColor.get(key) || "#555555") : "#7a231a";
      ctx.globalAlpha = deg > 0 ? 0.9 : 0.23;
      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawNetworkNote(noteLines);
  }

  function renderLegend(top, buckets, colorByCpc, bucketColor) {
    if (!colorByCpc) {
      clusterLegendEl.textContent = "CPC4 coloring is off.";
      return;
    }
    if (!top.length) {
      clusterLegendEl.textContent = "No CPC4 metadata is available for this graph.";
      return;
    }
    const lines = [];
    for (let i = 0; i < top.length; i += 1) {
      const item = top[i];
      const inventorsInBucket = (buckets.get(item.cpc4) || []).length;
      const barColor = `hsl(6, 60%, ${Math.round(30 + Math.min(i, 9) * 3.4)}%)`;
      lines.push(
        `<div class="cpc-footprint-row">` +
          `<div class="cpc-footprint-head"><span class="cpc-footprint-rank">${i + 1}.</span><span class="cpc-footprint-code">${item.cpc4}</span></div>` +
          `<div class="cpc-footprint-title">${item.title || "No title"}</div>` +
          `<div class="cpc-footprint-bar"><span style="width:${Math.max(2, Number(item.patent_share_pct || 0))}%; background:${barColor};"></span></div>` +
          `<div class="cpc-footprint-meta">patents ${item.patent_count} (${pct(item.patent_share_pct)}), inventors ${inventorsInBucket} (${pct(item.inventor_share_pct)}), patents per inventor ${Number(item.patents_per_inventor || 0).toFixed(1)}, median team size ${fmtMedian(item.median_team_size || 0)}</div>` +
        `</div>`
      );
    }
    clusterLegendEl.innerHTML = `<div class="cpc-footprint-list">${lines.join("")}</div>`;
  }

  function renderClusterLabels(bucketOrder, centers, topByCode, buckets, bucketColor) {
    clearLabels();
    for (const key of bucketOrder) {
      const center = centers.get(key);
      if (!center) continue;
      const item = topByCode.get(key);
      const div = document.createElement("div");
      div.className = "cluster-label";
      div.style.left = `${(center.x / width) * 100}%`;
      div.style.top = `${(center.y / height) * 100}%`;
      div.style.color = bucketColor.get(key) || "#555555";
      div.textContent = key === "OTHER" ? "OTHER" : key;

      if (item) {
        div.title =
          `${item.cpc4} - ${item.title || "No title"}\n` +
          `Patents: ${item.patent_count} (${pct(item.patent_share_pct)})\n` +
          `Inventors: ${item.inventor_count} (${pct(item.inventor_share_pct)})\n` +
          `Patents per Inventor: ${Number(item.patents_per_inventor || 0).toFixed(1)}\n` +
          `Mean Team Size: ${Number(item.mean_team_size || 0).toFixed(1)}\n` +
          `Median Team Size: ${fmtMedian(item.median_team_size || 0)}`;
      } else {
        const cnt = (buckets.get("OTHER") || []).length;
        div.title = `OTHER - dominant CPC4 outside top 20\nInventors: ${cnt}`;
      }
      labelLayer.appendChild(div);
    }
  }

  function renderInventorRow(inv, idx) {
    const classes = (inv.top_cpc4 || [])
      .slice(0, 5)
      .map((c) => `${c.cpc4} ${c.title ? `(${c.title})` : ""} [${pct(c.share_pct_of_inventor_patents)}]`)
      .join(", ");
    const classesText = classes || "UNKN (No CPC4 assignment in source) [100.0%]";
    const solo = Number(inv.solo_patent_count || 0);
    const citationsPerPatent = Number(inv.citations_per_patent);
    const impactPct = Number(inv.impact_peer_percentile);
    const medianTeam = Number(inv.median_team_size);
    const selfMadeTotal = Number(inv.self_citations_made_total || 0);
    const selfMadePct = Number(inv.self_citation_share_outgoing_pct || 0);
    const selfReceivedTotal = Number(inv.self_citations_received_total || 0);
    const selfReceivedPct = Number(inv.self_citation_share_incoming_pct || 0);
    const cppText = Number.isFinite(citationsPerPatent) ? citationsPerPatent.toFixed(1) : "N/A";
    const impactText = Number.isFinite(impactPct)
      ? `${fmtPeerRank(impactPct)} among inventors with similar number of patents`
      : "impact rank pending saved percentile";
    const medianTeamText = Number.isFinite(medianTeam) && medianTeam > 0 ? fmtMedian(medianTeam) : "N/A";
    return (
      `<div class="inventor-item">` +
        `<div class="inventor-name">${idx + 1}. ${inv.name}</div>` +
        `<div class="inventor-summary-line">` +
          `<span>${inv.patent_count} patents · ${solo} solo · ${inv.unique_coauthors || 0} coauthors · ${pct(inv.patent_share_pct)} of firm patents</span> ` +
          `<details class="inventor-details inventor-details-inline"><summary>Technologies</summary>` +
            `<div class="inventor-classes">${classesText}</div>` +
          `</details>` +
        `</div>` +
        `<div class="inventor-metrics">` +
          `<div class="inventor-metric-row">Impact: ${cppText} citations per patent; ${impactText}.</div>` +
          `<div class="inventor-metric-row">Median team size: ${medianTeamText} inventors.</div>` +
          `<div class="inventor-metric-row">Self-citation: made ${pct(selfMadePct)} (${selfMadeTotal}), received ${pct(selfReceivedPct)} (${selfReceivedTotal}).</div>` +
        `</div>` +
      `</div>`
    );
  }

  function renderTopInventors(meta) {
    const topInventors = (meta.top_inventors || []).slice(0, 10);
    if (!topInventors.length) {
      topInventorsEl.innerHTML = "";
      return;
    }
    const rows = topInventors.map(renderInventorRow);
    const unionPct = Number(meta.top10_union_patent_share_pct);
    const coverageText = Number.isFinite(unionPct)
      ? `Top 10 account for ${pct(unionPct)} of firm patents`
      : "Top 10 by patent presence";
    topInventorsEl.innerHTML =
      `<div class="inventor-section-head"><div class="inventor-section-meta">${coverageText}</div></div>` +
      rows.join("");
  }

  function renderEmergingInventors(meta) {
    const topEmerging = (meta.top_emerging_inventors || []).slice(0, 10);
    if (!topEmerging.length) {
      topEmergingInventorsEl.innerHTML = "";
      return;
    }
    const rows = topEmerging.map(renderInventorRow);
    const unionPct = Number(meta.top10_emerging_union_patent_share_pct);
    const coverageText = Number.isFinite(unionPct)
      ? `Top 10 account for ${pct(unionPct)} of firm patents`
      : "Top 10 by recent patent presence";
    topEmergingInventorsEl.innerHTML =
      `<div class="inventor-section-head"><div class="inventor-section-meta">${coverageText}</div></div>` +
      rows.join("");
  }

  function renderFirmCitationFlow(company, citationProfile) {
    clearCitationCanvas();
    citationCanvas.style.cursor = "default";
    citationTitleEl.textContent = `Citation Behavior: ${company}`;
    if (!citationProfile) {
      citationSummaryEl.textContent = "";
      cctx.save();
      cctx.fillStyle = "#666";
      cctx.font = "14px Source Sans 3, sans-serif";
      cctx.textAlign = "center";
      cctx.fillText("Citation profile not built yet for this company.", cWidth / 2, cHeight / 2);
      cctx.restore();
      return;
    }

    const selfCitations = Number(citationProfile.self_citations || 0);
    const selfItem = {
      company,
      citations: selfCitations,
      partner_patent_count: Number(citationProfile.patent_count || 0),
    };
    const upstream = rankCitationPartners(citationProfile.upstream_top || [], selfItem, FIRM_FIGURE_PARTNER_LIMIT);
    const downstream = rankCitationPartners(citationProfile.downstream_top || [], selfItem, FIRM_FIGURE_PARTNER_LIMIT);
    const upstreamTotalNonSelf = Number(citationProfile.upstream_total_edges || 0);
    const downstreamTotalNonSelf = Number(citationProfile.downstream_total_edges || 0);
    const upstreamTotalAll = upstreamTotalNonSelf + selfCitations;
    const downstreamTotalAll = downstreamTotalNonSelf + selfCitations;
    const upstreamTopSum = upstream.reduce((s, x) => s + Number(x.citations || 0), 0);
    const downstreamTopSum = downstream.reduce((s, x) => s + Number(x.citations || 0), 0);
    const inSelfPct = `${Math.round(Number(citationProfile.self_citation_share_incoming_pct || citationProfile.self_citation_share_pct || 0))}%`;
    const outSelfPct = `${Math.round(Number(citationProfile.self_citation_share_outgoing_pct || citationProfile.self_citation_share_pct || 0))}%`;
    const inPeerPct = fmtPeerRank(Number(citationProfile.self_citation_incoming_peer_percentile || 0));
    const outPeerPct = fmtPeerRank(Number(citationProfile.self_citation_outgoing_peer_percentile || 0));
    const beyondFirmPct = `${Math.max(0, 100 - Math.round(Number(citationProfile.self_citation_share_incoming_pct || citationProfile.self_citation_share_pct || 0)))}%`;
    const beyondFirmPeerPct = fmtPeerRank(100 - Number(citationProfile.self_citation_incoming_peer_percentile || 0));
    const upCoverage = `${Math.round((100 * upstreamTopSum) / Math.max(1, upstreamTotalAll))}%`;
    const downCoverage = `${Math.round((100 * downstreamTopSum) / Math.max(1, downstreamTotalAll))}%`;
    citationSummaryEl.innerHTML =
      `<div class="citation-card-title">At A Glance</div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Relies on its own prior art</span><span class="citation-stat-value">${outSelfPct} (${outPeerPct} among comparable firms)</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Influence beyond the firm</span><span class="citation-stat-value">${beyondFirmPct} (${beyondFirmPeerPct} among comparable firms)</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Upstream partner coverage</span><span class="citation-stat-value">${upCoverage} of all citations made by ${company}.</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Downstream partner coverage</span><span class="citation-stat-value">${downCoverage} of all citations received by ${company}.</span></div>`;
    const centerX = cWidth / 2;
    const centerY = cHeight / 2;
    const leftX = Math.round(cWidth * 0.27);
    const rightX = Math.round(cWidth * 0.73);
    const tNow = performance.now() / 1000;
    const focalPatentCount = Number(citationProfile.patent_count || 0);
    const maxPatent = Math.max(
      1,
      focalPatentCount,
      ...upstream.map((x) => Number(x.partner_patent_count || 0)),
      ...downstream.map((x) => Number(x.partner_patent_count || 0)),
    );
    const focalPatentRel = Math.log1p(Math.max(1, focalPatentCount)) / Math.log1p(maxPatent);
    const centerR = clamp(7 + focalPatentRel * 16, 8, 22);
    const maxCites = Math.max(
      1,
      ...upstream.map((x) => Number(x.citations || 0)),
      ...downstream.map((x) => Number(x.citations || 0)),
    );

    cctx.save();
    cctx.fillStyle = "#fbfbfb";
    cctx.fillRect(0, 0, cWidth, cHeight);
    cctx.fillStyle = "#5f5f5f";
    cctx.font = "600 11px Source Sans 3, sans-serif";
    cctx.textAlign = "left";
    cctx.fillText("Upstream: cited by focal firm", 14, 18);
    cctx.textAlign = "center";
    cctx.fillText("Focal firm", centerX, 18);
    cctx.textAlign = "right";
    cctx.fillText("Downstream: citing focal firm", cWidth - 14, 18);
    cctx.restore();

    function layoutColumn(items, xPos) {
      const pts = [];
      const n = Math.max(items.length, 1);
      const topPad = 38;
      const bottomPad = 36;
      const span = Math.max(1, cHeight - topPad - bottomPad);
      for (let i = 0; i < items.length; i += 1) {
        const y = topPad + ((i + 0.5) * span) / n;
        const jitter = (hash01(`cit-j-${i}-${items[i].company}`) - 0.5) * 4;
        pts.push({ x: xPos + jitter, y, item: items[i], rank: i + 1 });
      }
      return pts;
    }

    const leftPts = layoutColumn(upstream, leftX);
    const rightPts = layoutColumn(downstream, rightX);

    function edgeStyle(p) {
      const w = Number(p.item.citations || 0);
      const rel = Math.sqrt(w / maxCites);
      const alpha = clamp(0.2 + rel * 0.6, 0.2, 0.85);
      return {
        width: 0.8 + rel * 2.5,
        color: p.item.is_self
          ? `rgba(122,35,26,${alpha.toFixed(3)})`
          : `rgba(85,85,85,${Math.min(0.72, alpha).toFixed(3)})`,
      };
    }

    cctx.save();
    for (const p of leftPts) {
      const s = edgeStyle(p);
      const wiggle = Math.sin(tNow * 1.1 + p.rank * 0.6) * 1.1;
      drawArrow(centerX - centerR, centerY, p.x + 10, p.y + wiggle, s.color, s.width);
    }
    for (const p of rightPts) {
      const s = edgeStyle(p);
      const wiggle = Math.sin(tNow * 1.1 + p.rank * 0.6 + 0.8) * 1.1;
      drawArrow(p.x - 10, p.y + wiggle, centerX + centerR, centerY, s.color, s.width);
    }
    cctx.restore();

    cctx.save();
    cctx.fillStyle = "rgba(122,35,26,0.18)";
    cctx.strokeStyle = "rgba(122,35,26,0.78)";
    cctx.lineWidth = 1.4;
    cctx.beginPath();
    cctx.arc(centerX, centerY, centerR, 0, Math.PI * 2);
    cctx.fill();
    cctx.stroke();
    cctx.fillStyle = "#222";
    cctx.font = "700 12px Source Sans 3, sans-serif";
    cctx.textAlign = "center";
    cctx.fillText(company, centerX, centerY + centerR + 18);
    cctx.restore();

    function drawBlob(p, side) {
      const patentCount = Number(p.item.partner_patent_count || 0);
      const patentRel = Math.log1p(Math.max(1, patentCount)) / Math.log1p(maxPatent);
      const r = clamp(7 + patentRel * 16, 8, 22);
      const bubbleFill = p.item.is_self ? "rgba(122,35,26,0.18)" : "rgba(116,116,116,0.15)";
      const bubbleStroke = p.item.is_self ? "rgba(122,35,26,0.72)" : "rgba(92,92,92,0.35)";
      const share = p.item.is_self
        ? (side === "left" ? outSelfPct : inSelfPct)
        : pct(Number(p.item.share_pct || 0));
      const label = `${p.rank}. ${ellipsize(p.item.company, 22)} (${share})`;
      const labelW = Math.min(228, 20 + label.length * 6.2);
      const labelH = 16;
      const labelY = p.y - 8;
      const labelLeft = side === "left" ? 10 : cWidth - 10 - labelW;

      cctx.save();
      cctx.fillStyle = bubbleFill;
      cctx.strokeStyle = bubbleStroke;
      cctx.lineWidth = 1.1;
      cctx.beginPath();
      cctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      cctx.fill();
      cctx.stroke();

      cctx.fillStyle = "rgba(255,255,255,0.88)";
      cctx.strokeStyle = "rgba(0,0,0,0.08)";
      cctx.lineWidth = 1;
      roundedRect(cctx, labelLeft, labelY, labelW, labelH, 7);
      cctx.fill();
      cctx.stroke();

      cctx.fillStyle = "#2f2f2f";
      cctx.font = "600 10.5px Source Sans 3, sans-serif";
      cctx.textAlign = side === "left" ? "left" : "right";
      if (side === "left") {
        drawCompanyIdentityDot(labelLeft + 8, labelY + labelH / 2, p.item.is_self ? "__focal__" : "__neutral__", 3.5);
        cctx.fillText(label, labelLeft + 15, labelY + 11.5);
      } else {
        drawCompanyIdentityDot(labelLeft + labelW - 8, labelY + labelH / 2, p.item.is_self ? "__focal__" : "__neutral__", 3.5);
        cctx.fillText(label, labelLeft + labelW - 15, labelY + 11.5);
      }
      cctx.restore();
    }

    leftPts.forEach((p) => drawBlob(p, "left"));
    rightPts.forEach((p) => drawBlob(p, "right"));
  }

  function colorForCode(code) {
    const idx = Math.floor(hash01(`cpc-color-${code}`) * palette.length) % palette.length;
    return palette[Math.max(0, idx)];
  }

  function layoutCitationCluster(centerX, centerY, nodes, seed, emphasize = false) {
    const ranked = (nodes || []).slice().sort((a, b) => Number(b.patent_count || 0) - Number(a.patent_count || 0));
    if (!ranked.length) {
      return { nodes: [], shellRadius: 0 };
    }
    const maxCount = Math.max(1, ...ranked.map((node) => Number(node.patent_count || 0)));
    const minRadius = emphasize ? 4.8 : 4.1;
    const maxRadius = emphasize ? 11.8 : 8.8;
    const gap = emphasize ? 2.4 : 1.9;
    const orbitStep = emphasize ? maxRadius * 1.6 + gap * 1.2 : maxRadius * 1.45 + gap;
    const placed = [];
    const angleOffset = hash01(`${seed}-offset`) * Math.PI * 2;
    ranked.forEach((node, idx) => {
      const patentCount = Number(node.patent_count || 0);
      const rel = clamp(patentCount / maxCount, 0, 1);
      const radius = clamp(minRadius + rel * (maxRadius - minRadius), minRadius, maxRadius);
      if (idx === 0) {
        placed.push({ ...node, x: centerX, y: centerY, radius });
        return;
      }
      const ring = Math.floor((Math.sqrt(12 * idx + 9) - 3) / 6) + 1;
      const slotBase = 1 + 3 * ring * (ring - 1);
      const slot = idx - slotBase;
      const slots = Math.max(6, ring * 6);
      const angle = angleOffset + ((Math.PI * 2) / slots) * slot;
      const orbit = ring * orbitStep;
      placed.push({
        ...node,
        x: centerX + Math.cos(angle) * orbit,
        y: centerY + Math.sin(angle) * orbit,
        radius,
      });
    });
    const shellRadius = placed.reduce(
      (maxR, node) => Math.max(maxR, Math.hypot(node.x - centerX, node.y - centerY) + node.radius),
      0,
    ) + gap + (emphasize ? 6 : 4.5);
    return { nodes: placed, shellRadius };
  }

  function drawCitationClusterShell(centerX, centerY, shellRadius, emphasize, companyName) {
    if (!shellRadius) return;
    cctx.save();
    const inner = Math.max(8, shellRadius * 0.18);
    const gradient = cctx.createRadialGradient(centerX, centerY, inner, centerX, centerY, shellRadius);
    if (emphasize) {
      gradient.addColorStop(0, "rgba(234,224,212,0.72)");
      gradient.addColorStop(1, "rgba(234,224,212,0.16)");
    } else {
      gradient.addColorStop(0, "rgba(244,240,236,0.82)");
      gradient.addColorStop(1, "rgba(244,240,236,0.24)");
    }
    cctx.fillStyle = gradient;
    cctx.strokeStyle = emphasize ? "rgba(126,92,62,0.32)" : "rgba(126,92,62,0.18)";
    cctx.lineWidth = emphasize ? 1.5 : 1;
    cctx.beginPath();
    cctx.arc(centerX, centerY, shellRadius, 0, Math.PI * 2);
    cctx.fill();
    cctx.stroke();
    cctx.restore();
  }

  function filterCitationEdges(edges) {
    return (edges || [])
      .slice()
      .sort((a, b) => Number(b.citations || 0) - Number(a.citations || 0))
      .filter((edge, idx) => idx < 8 || Number(edge.share_pct_of_pair || 0) >= 14);
  }

  function drawCitationNote(lines) {
    if (!lines.length) return;
    const lineH = 14;
    const boxW = 270;
    const boxH = 12 + lines.length * lineH;
    const x = 14;
    const y = cHeight - boxH - 14;
    cctx.save();
    cctx.fillStyle = "rgba(255,255,255,0.9)";
    cctx.strokeStyle = "rgba(0,0,0,0.08)";
    cctx.lineWidth = 1;
    roundedRect(cctx, x, y, boxW, boxH, 8);
    cctx.fill();
    cctx.stroke();
    cctx.fillStyle = "#555";
    cctx.font = "600 10.5px Source Sans 3, sans-serif";
    cctx.textAlign = "left";
    lines.forEach((line, idx) => {
      cctx.fillText(line, x + 10, y + 15 + idx * lineH);
    });
    cctx.restore();
  }

  function renderCpcCitationFlow(company, modeKey, modePayload, summaryProfile) {
    clearCitationCanvas();
    citationCanvas.style.cursor = "default";
    citationTitleEl.textContent = `Citation Behavior: ${company}`;
    if (!modePayload) {
      citationSummaryEl.textContent = "";
      citationInsightEl.innerHTML = "";
      currentCitationScene = null;
      cctx.save();
      cctx.fillStyle = "#666";
      cctx.font = "14px Source Sans 3, sans-serif";
      cctx.textAlign = "center";
      cctx.fillText("Precomputed CPC citation view not built yet for this company.", cWidth / 2, cHeight / 2);
      cctx.restore();
      return;
    }

    const modeLabel = modeKey === "primary_cpc" ? "Primary CPC" : "All CPC";
    const upstream = (modePayload.upstream || []).slice(0, 6).map((row) => ({
      ...row,
      nodes: trimCitationNodes(row.nodes || [], 4),
    }));
    const downstream = (modePayload.downstream || []).slice(0, 6).map((row) => ({
      ...row,
      nodes: trimCitationNodes(row.nodes || [], 4),
    }));
    const focalNodes = trimCitationNodes(modePayload.focal_nodes || [], 5);
    const selfOut = Number(summaryProfile?.self_citation_share_outgoing_pct || 0);
    const selfIn = Number(summaryProfile?.self_citation_share_incoming_pct || 0);
    const beyondFirmPct = `${Math.max(0, 100 - Math.round(selfIn))}%`;
    citationSummaryEl.innerHTML =
      `<div class="citation-card-title">At A Glance</div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">View mode</span><span class="citation-stat-value">${modeLabel} citation flows</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Relies on its own prior art</span><span class="citation-stat-value">${pct(selfOut)}</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Influence beyond the firm</span><span class="citation-stat-value">${beyondFirmPct}</span></div>` +
      `<div class="citation-stat-row"><span class="citation-stat-label">Firms shown</span><span class="citation-stat-value">${upstream.length} upstream, ${downstream.length} downstream; strongest technology channels only.</span></div>`;

    cctx.save();
    cctx.fillStyle = "#fbfbfb";
    cctx.fillRect(0, 0, cWidth, cHeight);
    cctx.fillStyle = "#5f5f5f";
    cctx.font = "600 11px Source Sans 3, sans-serif";
    cctx.textAlign = "left";
    cctx.fillText("Upstream: cited by focal firm", 14, 18);
    cctx.textAlign = "center";
    cctx.fillText(modeKey === "primary_cpc" ? "Primary technology clusters" : "All-CPC technology clusters", cWidth / 2, 18);
    cctx.textAlign = "right";
    cctx.fillText("Downstream: citing focal firm", cWidth - 14, 18);
    cctx.restore();

    const centerX = cWidth / 2;
    const centerY = cHeight / 2;
    const leftX = Math.round(cWidth * 0.245);
    const rightX = Math.round(cWidth * 0.755);
    const topPad = 60;
    const bottomPad = 52;
    const leftSpan = Math.max(1, cHeight - topPad - bottomPad);
    const rightSpan = Math.max(1, cHeight - topPad - bottomPad);
    const focalCluster = layoutCitationCluster(centerX, centerY, focalNodes, `focal-${company}-${modeKey}`, true);
    const focalPos = new Map(focalCluster.nodes.map((node) => [node.cpc4, node]));

    function layoutPartnerGroups(rows, xPos, span, side) {
      const gapY = 12;
      const groups = rows.map((row) => {
        const cluster = layoutCitationCluster(xPos, 0, row.nodes || [], `${side}-${row.company}-${modeKey}`, false);
        return { ...row, side, centerX: xPos, centerY: 0, cluster };
      });
      const totalHeight = groups.reduce((sum, group) => sum + group.cluster.shellRadius * 2, 0) + Math.max(0, groups.length - 1) * gapY;
      let cursor = topPad + Math.max(0, (span - totalHeight) / 2);
      groups.forEach((group) => {
        cursor += group.cluster.shellRadius;
        group.centerY = cursor;
        group.cluster = {
          ...group.cluster,
          nodes: group.cluster.nodes.map((node) => ({
            ...node,
            y: node.y + cursor,
          })),
        };
        cursor += group.cluster.shellRadius + gapY;
      });
      return groups;
    }

    const leftGroups = layoutPartnerGroups(upstream, leftX, leftSpan, "upstream");
    const rightGroups = layoutPartnerGroups(downstream, rightX, rightSpan, "downstream");
    const maxEdgeWeight = Math.max(
      1,
      ...leftGroups.flatMap((group) => (group.edges || []).map((edge) => Number(edge.citations || 0))),
      ...rightGroups.flatMap((group) => (group.edges || []).map((edge) => Number(edge.citations || 0))),
    );
    const scene = {
      company,
      modeKey,
      modeLabel,
      focalCluster,
      leftGroups,
      rightGroups,
      summaryProfile,
    };
    currentCitationScene = scene;
    const focus = citationPinnedFocus || citationHoverFocus || null;
    renderCitationInsight(scene, focus);
    const activeNodeKeys = new Set();
    if (focus) {
      [...leftGroups, ...rightGroups].forEach((group) => {
        filterCitationEdges(group.edges).forEach((edge) => {
          if (!edgeMatchesCitationFocus(edge, group, focus)) return;
          activeNodeKeys.add(citationNodeKey("focal", company, group.side === "upstream" ? edge.source_cpc4 : edge.target_cpc4));
          activeNodeKeys.add(citationNodeKey(group.side, group.company, group.side === "upstream" ? edge.target_cpc4 : edge.source_cpc4));
        });
      });
    }

    function drawClusterLabel(x, y, label, align, companyName) {
      cctx.save();
      cctx.fillStyle = "rgba(255,255,255,0.92)";
      cctx.strokeStyle = "rgba(0,0,0,0.08)";
      cctx.lineWidth = 1;
      const text = ellipsize(label, 20);
      const w = Math.min(182, 20 + text.length * 6.6);
      const h = 18;
      const targetX = align === "outer-left"
        ? 10
        : align === "outer-right"
          ? cWidth - w - 10
          : align === "left"
            ? x - w + 10
            : align === "right"
              ? x - 10
              : x - w / 2;
      const lx = clamp(targetX, 8, cWidth - w - 8);
      const ly = clamp(y, 24, cHeight - h - 8);
      roundedRect(cctx, lx, ly, w, h, 8);
      cctx.fill();
      cctx.stroke();
      drawCompanyIdentityDot(lx + 8, ly + h / 2, companyName, 3.5);
      cctx.fillStyle = "#2f2f2f";
      cctx.font = "700 10.5px Source Sans 3, sans-serif";
      cctx.textAlign = "left";
      cctx.fillText(text, lx + 15, ly + 12.2);
      cctx.restore();
    }

    function drawClusterNodes(layout, emphasize, side, groupCompany) {
      layout.forEach((node) => {
        const nodeKey = citationNodeKey(side, groupCompany, node.cpc4);
        const highlighted = !focus || activeNodeKeys.has(nodeKey) || (focus.type === "group" && side === "focal");
        const faded = !!focus && !highlighted;
        const fill = node.cpc4 === "OTHER" ? "#d3ccc7" : colorForCode(node.cpc4);
        cctx.save();
        cctx.globalAlpha = faded ? 0.22 : 1;
        cctx.fillStyle = fill;
        cctx.strokeStyle = emphasize ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.1)";
        cctx.lineWidth = highlighted && emphasize ? 1.35 : (highlighted ? 1.1 : 0.9);
        cctx.beginPath();
        cctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        cctx.fill();
        cctx.stroke();
        if ((emphasize || highlighted) && !faded && node.radius >= 8.8) {
          cctx.fillStyle = "#1f1f1f";
          cctx.font = "700 8.5px Source Sans 3, sans-serif";
          cctx.textAlign = "center";
          cctx.fillText(node.cpc4, node.x, node.y + 3);
        }
        cctx.restore();
      });
    }

    function drawEdges(groups) {
      groups.forEach((group) => {
        const partnerPos = new Map(group.cluster.nodes.map((node) => [node.cpc4, node]));
        const filteredEdges = filterCitationEdges(group.edges).filter((edge) => edgeMatchesCitationFocus(edge, group, focus));
        filteredEdges.slice().reverse().forEach((edge) => {
          const sourceNode = group.side === "upstream"
            ? focalPos.get(edge.source_cpc4)
            : partnerPos.get(edge.source_cpc4);
          const targetNode = group.side === "upstream"
            ? partnerPos.get(edge.target_cpc4)
            : focalPos.get(edge.target_cpc4);
          if (!sourceNode || !targetNode) return;
          const weight = Number(edge.citations || 0);
          const rel = Math.sqrt(weight / maxEdgeWeight);
          const width = 0.55 + rel * 2.1;
          const alpha = focus ? clamp(0.22 + rel * 0.5, 0.22, 0.72) : clamp(0.08 + rel * 0.42, 0.08, 0.56);
          const color = `rgba(122,35,26,${alpha.toFixed(3)})`;
          drawArrow(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, color, width);
        });
      });
    }

    leftGroups.forEach((group) => {
      const active = !focus || focus.side === group.side && focus.company === group.company || (focus.side === "focal" && focus.type === "node");
      cctx.save();
      cctx.globalAlpha = active ? 1 : 0.18;
      drawCitationClusterShell(group.centerX, group.centerY, group.cluster.shellRadius, false, group.company);
      cctx.restore();
    });
    rightGroups.forEach((group) => {
      const active = !focus || focus.side === group.side && focus.company === group.company || (focus.side === "focal" && focus.type === "node");
      cctx.save();
      cctx.globalAlpha = active ? 1 : 0.18;
      drawCitationClusterShell(group.centerX, group.centerY, group.cluster.shellRadius, false, group.company);
      cctx.restore();
    });
    drawCitationClusterShell(centerX, centerY, focalCluster.shellRadius, true, company);
    drawEdges(leftGroups);
    drawEdges(rightGroups);
    drawClusterNodes(focalCluster.nodes, true, "focal", company);
    drawClusterLabel(centerX, 28, company, "center", company);

    leftGroups.forEach((group) => {
      drawClusterNodes(group.cluster.nodes, false, group.side, group.company);
      drawClusterLabel(
        10,
        group.centerY - 9,
        group.company,
        "outer-left",
        group.company,
      );
    });
    rightGroups.forEach((group) => {
      drawClusterNodes(group.cluster.nodes, false, group.side, group.company);
      drawClusterLabel(
        cWidth - 10,
        group.centerY - 9,
        group.company,
        "outer-right",
        group.company,
      );
    });

    drawCitationNote([
      `Mode = ${modeLabel}`,
      "Node size = CPC patent count within firm",
      focus ? "Pinned/hovered selection shows only its strongest visible channels" : "Hover a shell or CPC dot; click to pin",
    ]);
  }

  function renderFirmCitationInsight(company, citationProfile) {
    const upstream = (citationProfile?.upstream_top || []).slice(0, FIRM_DETAIL_PARTNER_LIMIT);
    const downstream = (citationProfile?.downstream_top || []).slice(0, FIRM_DETAIL_PARTNER_LIMIT);
    const strongestUpstream = upstream[0];
    const strongestDownstream = downstream[0];
    citationInsightEl.innerHTML =
      `<div class="citation-insight-title">What Stands Out</div>` +
      `<div class="citation-insight-subtitle">Firm view keeps each partner as one node. Switch to the technology views to see which CPC buckets carry the relationship.</div>` +
      `<div class="citation-insight-meta">The figure shows the top ${FIRM_FIGURE_PARTNER_LIMIT} partners on each side; the lists below keep the top ${FIRM_DETAIL_PARTNER_LIMIT}.</div>` +
      `<div class="citation-insight-block"><div class="citation-insight-heading">What Stands Out</div><ul class="citation-insight-list">` +
        (strongestUpstream ? `<li class="citation-insight-item"><div class="citation-insight-kicker">Largest upstream pull</div><div class="citation-insight-main">${company} cites ${strongestUpstream.company} more than any other partner.</div><div class="citation-insight-note">${countFmt(strongestUpstream.citations)} citations, ${pct(strongestUpstream.share_pct)} ${citationPartnerShareLabel("upstream")}.</div></li>` : ``) +
        (strongestDownstream ? `<li class="citation-insight-item"><div class="citation-insight-kicker">Largest downstream pull</div><div class="citation-insight-main">${strongestDownstream.company} cites ${company} more than any other partner.</div><div class="citation-insight-note">${countFmt(strongestDownstream.citations)} citations, ${pct(strongestDownstream.share_pct)} ${citationPartnerShareLabel("downstream")}.</div></li>` : ``) +
      `</ul></div>` +
      `<div class="citation-partner-columns">` +
        `<div class="citation-insight-block citation-partner-column"><div class="citation-insight-heading">Top ${FIRM_DETAIL_PARTNER_LIMIT} upstream firms</div><ul class="citation-insight-list">` +
          upstream.map((row, idx) => `<li class="citation-insight-item"><div class="citation-insight-main">${idx + 1}. ${row.company}</div><div class="citation-insight-note">${countFmt(row.citations)} citations, ${pct(row.share_pct)} ${citationPartnerShareLabel("upstream")}.</div></li>`).join("") +
        `</ul></div>` +
        `<div class="citation-insight-block citation-partner-column"><div class="citation-insight-heading">Top ${FIRM_DETAIL_PARTNER_LIMIT} downstream firms</div><ul class="citation-insight-list">` +
          downstream.map((row, idx) => `<li class="citation-insight-item"><div class="citation-insight-main">${idx + 1}. ${row.company}</div><div class="citation-insight-note">${countFmt(row.citations)} citations, ${pct(row.share_pct)} ${citationPartnerShareLabel("downstream")}.</div></li>`).join("") +
        `</ul></div>` +
      `</div>`;
  }

  function renderCitationPanel(company, citationArtifact, fallbackProfile) {
    const artifactModes = citationArtifact && citationArtifact.modes ? citationArtifact.modes : null;
    const modeKey = artifactModes && artifactModes[currentCitationMode] ? currentCitationMode : "firm";
    setCitationMode(modeKey);
    if (modeKey === "firm") {
      currentCitationScene = null;
      const firmProfile = artifactModes?.firm?.profile || fallbackProfile || null;
      renderFirmCitationInsight(company, firmProfile);
      renderFirmCitationFlow(company, firmProfile);
      return;
    }
    renderCpcCitationFlow(company, modeKey, artifactModes ? artifactModes[modeKey] : null, artifactModes?.firm?.profile || fallbackProfile || null);
  }

  function detectCitationFocus(point) {
    if (!currentCitationScene) return null;
    const { company, focalCluster, leftGroups, rightGroups } = currentCitationScene;
    const nodeHits = [];
    focalCluster.nodes.forEach((node) => {
      const dx = point.x - node.x;
      const dy = point.y - node.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= node.radius + 2) {
        nodeHits.push({
          score: dist / Math.max(1, node.radius),
          focus: { type: "node", side: "focal", company, cpc4: node.cpc4, title: node.title || "" },
        });
      }
    });
    [...leftGroups, ...rightGroups].forEach((group) => {
      group.cluster.nodes.forEach((node) => {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= node.radius + 2) {
          nodeHits.push({
            score: dist / Math.max(1, node.radius),
            focus: { type: "node", side: group.side, company: group.company, cpc4: node.cpc4, title: node.title || "" },
          });
        }
      });
    });
    if (nodeHits.length) {
      nodeHits.sort((a, b) => a.score - b.score);
      return nodeHits[0].focus;
    }
    for (const group of [...leftGroups, ...rightGroups]) {
      if (Math.hypot(point.x - group.centerX, point.y - group.centerY) <= group.cluster.shellRadius) {
        return { type: "group", side: group.side, company: group.company };
      }
    }
    return null;
  }

  function rerenderCitationFromState() {
    if (!currentData) return;
    renderCitationPanel(
      currentData.company,
      currentCitationArtifact,
      ((currentCitationArtifact && currentCitationArtifact.modes && currentCitationArtifact.modes.firm && currentCitationArtifact.modes.firm.profile)
        || ((currentData.meta || {}).citation_profile)
        || null),
    );
  }

  function stopAnimations() {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (ambientFrame) {
      window.cancelAnimationFrame(ambientFrame);
      ambientFrame = 0;
    }
  }

  function startAmbient(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, noteLines) {
    const tick = (ts) => {
      drawFrame(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, ts / 1000, 1, noteLines);
      ambientFrame = window.requestAnimationFrame(tick);
    };
    ambientFrame = window.requestAnimationFrame(tick);
  }

  function drawGraph(graph, minWeight) {
    if (!graph) return;
    stopAnimations();
    const { nodes, links, nodeById, degree } = buildFilteredGraph(graph, minWeight);
    const { top, topByCode, buckets, nodeBucket, bucketOrder } = buildCpcBuckets(graph, nodes);
    const centers = layoutByBuckets(degree, buckets, bucketOrder);
    const colorByCpc = true;
    const bucketColor = new Map(bucketOrder.map((k, i) => [k, palette[i % palette.length]]));
    const heavyGraph = links.length > 7000 || nodes.length > 3500;
    const noteLines = [
      "Node size = log(1 + inventor patent count)",
      `Clustering by top ${Math.max(0, top.length)} CPC4 classes`,
    ];

    renderLegend(top, buckets, colorByCpc, bucketColor);
    renderClusterLabels(bucketOrder, centers, topByCode, buckets, bucketColor);

    const start = performance.now();
    const duration = heavyGraph ? 0 : 800;
    const fromPos = new Map();
    const cx = width / 2;
    const cy = height / 2;
    for (const n of nodes) {
      const p = lastPositions.get(n.id);
      fromPos.set(n.id, p ? { x: p.x, y: p.y } : { x: cx + (hash01(`x-${n.id}`) - 0.5) * 16, y: cy + (hash01(`y-${n.id}`) - 0.5) * 16 });
    }
    const target = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    const step = (ts) => {
      const t = clamp((ts - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      for (const n of nodes) {
        const a = fromPos.get(n.id);
        const b = target.get(n.id);
        n.x = a.x + (b.x - a.x) * e;
        n.y = a.y + (b.y - a.y) * e;
      }
      drawFrame(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, ts / 1000, heavyGraph ? 0 : 1, noteLines);
      if (t < 1) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        animationFrame = 0;
        for (const n of nodes) lastPositions.set(n.id, { x: n.x, y: n.y });
        if (!heavyGraph) {
          startAmbient(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, noteLines);
        }
      }
    };
    if (duration === 0) {
      for (const n of nodes) {
        const b = target.get(n.id);
        n.x = b.x;
        n.y = b.y;
      }
      drawFrame(nodes, links, nodeById, degree, nodeBucket, bucketColor, colorByCpc, performance.now() / 1000, 0, noteLines);
      for (const n of nodes) lastPositions.set(n.id, { x: n.x, y: n.y });
    } else {
      animationFrame = window.requestAnimationFrame(step);
    }

    const connected = nodes.filter((n) => (degree.get(n.id) || 0) > 0).length;
    const isolated = nodes.length - connected;
    return { connected, isolated, links: links.length, clusters: bucketOrder.length, inventors: nodes.length };
  }

  async function loadCatalog() {
    const [catalog] = await Promise.all([
      fetchJsonWithFallback([
        "../data/networks/company_catalog.json",
        "/data/networks/company_catalog.json",
      ]),
      loadCpcAudit(),
    ]);
    const dedup = new Map();
    for (const row of (catalog.companies || [])) {
      if (!row || !row.canonical_name) continue;
      const c0 = normalizeQuery(row.canonical_name);
      const merged = canonicalMergeMap.get(c0) || c0;
      const prev = dedup.get(merged);
      if (!prev || (!!row.available && !prev.available)) {
        dedup.set(merged, {
          ...row,
          canonical_name: merged.toUpperCase(),
          slug: merged.replace(/[^a-z0-9]+/g, "-"),
        });
      }
    }
    companyCatalog = Array.from(dedup.values());
    catalogByCanonical = new Map();
    catalogBySlug = new Map();
    catalogByOrg = new Map();
    for (const c of companyCatalog) {
      const cKey = normalizeQuery(c.canonical_name);
      const sKey = normalizeQuery(c.slug || "");
      const oKey = normalizeQuery(c.organization || "");
      if (cKey) catalogByCanonical.set(cKey, c);
      if (sKey) catalogBySlug.set(sKey, c);
      if (oKey && !catalogByOrg.has(oKey)) catalogByOrg.set(oKey, c);
    }
    refreshCompanyDatalist("");
    renderCompanyPresets();
    searchVersionEl.textContent = `${companyCatalog.length.toLocaleString()} precomputed company networks available. Use Copy deep link to snapshot the current view or compare two firms side by side.`;
  }

  function refreshCompanyDatalist(query) {
    const q = normalizeQuery(query);
    const picks = [];
    for (const c of companyCatalog) {
      const cKey = normalizeQuery(c.canonical_name);
      const oKey = normalizeQuery(c.organization || "");
      let score = 0;
      if (!q) score = 1;
      else if (cKey === q || oKey === q) score = 100;
      else if (cKey.startsWith(q) || oKey.startsWith(q)) score = 80;
      else if (cKey.includes(q) || oKey.includes(q)) score = 60;
      if (score > 0) picks.push({ c, score, cKey });
    }
    picks.sort((a, b) => (b.score - a.score) || a.cKey.localeCompare(b.cKey));
    companyList.innerHTML = "";
    for (const row of picks.slice(0, 60)) {
      const opt = document.createElement("option");
      opt.value = row.c.canonical_name;
      companyList.appendChild(opt);
    }
  }

  function lookupCompany(query) {
    const q0 = normalizeQuery(query);
    const q = canonicalMergeMap.get(q0) || q0;
    if (!q) return null;
    const exactCanonical = catalogByCanonical.get(q);
    if (exactCanonical) return exactCanonical;
    const exactOrg = catalogByOrg.get(q);
    if (exactOrg) return exactOrg;
    const bySlug = catalogBySlug.get(q);
    if (bySlug) return bySlug;
    const scored = [];
    for (const c of companyCatalog) {
      const canonical = normalizeQuery(c.canonical_name);
      const org = normalizeQuery(c.organization || "");
      let score = 0;
      if (canonical === q || org === q) score = 100;
      else if (canonical.startsWith(q) || org.startsWith(q)) score = 80;
      else if (canonical.includes(q) || org.includes(q)) score = 60;
      else if (q.split(" ").every((tok) => canonical.includes(tok) || org.includes(tok))) score = 40;
      if (score > 0) scored.push({ c, score, canonical });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => (b.score - a.score) || a.canonical.localeCompare(b.canonical));
    return scored[0].c;
  }

  function renderCompanyProfile(bundle, summary) {
    const m = bundle.metaMerged || {};
    const cp = bundle.citationProfile || {};
    const cpRanks = bundle.citationRankProfile || cp;
    const patentText = formatPatentBreakdown(m);
    const distinctInventors = countFmt((bundle.graph?.nodes || []).length);
    const meanTeamSize = exactMeanTeamSize(bundle.graph, m);
    const meanTeamSizeText = meanTeamSize != null ? `${meanTeamSize.toFixed(2)} inventors per patent` : "N/A";
    const citsToFirm = Number(cp.citations_received_total || 0);
    const citsToFirmRank = fmtPeerRank(Number(cpRanks.citations_received_peer_percentile || 0));
    const outPeerPct = fmtPeerRank(Number(cpRanks.self_citation_outgoing_peer_percentile || 0));
    const beyondFirmPct = `${Math.max(0, 100 - Math.round(Number(cp.self_citation_share_incoming_pct || cp.self_citation_share_pct || 0)))}%`;
    const beyondFirmPeerPct = fmtPeerRank(100 - Number(cpRanks.self_citation_incoming_peer_percentile || 0));
    profileEl.innerHTML =
      `<div class="profile-snapshot-title">Company snapshot</div>` +
      `<div class="profile-snapshot-grid">` +
        `<div class="profile-column">` +
          `<div class="profile-row"><span class="profile-label">Primary country</span><span class="profile-value">${bundle.officeFootprint.primaryCountryText}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Filing window</span><span class="profile-value">${filingWindowText(m)}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Distinct inventors</span><span class="profile-value">${distinctInventors}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Top technologies</span><span class="profile-value profile-value-stacked">${technologyFootprintHtml(m)}</span></div>` +
        `</div>` +
        `<div class="profile-column">` +
          `<div class="profile-row"><span class="profile-label">Total offices</span><span class="profile-value">${bundle.officeFootprint.totalOfficesText}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Patents in data</span><span class="profile-value">${patentText}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Average team size</span><span class="profile-value">${meanTeamSizeText}</span></div>` +
          `<div class="profile-row"><span class="profile-label">Citation reach</span><span class="profile-value">${countFmt(citsToFirm)} received (${citsToFirmRank}); ${beyondFirmPct} from outside the firm (${beyondFirmPeerPct})</span></div>` +
          `<div class="profile-row"><span class="profile-label">Own prior art usage</span><span class="profile-value">${pct(cp.self_citation_share_outgoing_pct || cp.self_citation_share_pct || 0)} (${countFmt(cp.self_citations || 0)}; ${outPeerPct})</span></div>` +
        `</div>` +
      `</div>`;
  }

  function clearComparisonState(options = {}) {
    currentComparisonCompany = null;
    currentComparisonBundle = null;
    comparisonLoadToken += 1;
    if (!options.keepInput) compareSearchInput.value = "";
    renderComparisonPlaceholder("Add a second company to compare patents, coverage, geography, and technology.", false);
  }

  async function loadComparisonCompany(company, options = {}) {
    if (!currentCompanyBundle) {
      renderComparisonPlaceholder("Load a focal company first, then add a comparison firm.", true);
      return;
    }
    if (!company) {
      clearComparisonState();
      return;
    }
    if (currentCompany && company.slug === currentCompany.slug) {
      currentComparisonCompany = null;
      currentComparisonBundle = null;
      compareSearchInput.value = company.canonical_name;
      renderComparisonPlaceholder("Choose a different company from the focal firm to compare side by side.", true);
      return;
    }
    if (!company.available) {
      currentComparisonCompany = null;
      currentComparisonBundle = null;
      compareSearchInput.value = company.canonical_name;
      renderComparisonPlaceholder(`No precomputed company page is available yet for ${company.canonical_name}.`, true);
      return;
    }
    const loadToken = ++comparisonLoadToken;
    currentComparisonCompany = company;
    compareSearchInput.value = company.canonical_name;
    renderComparisonPlaceholder(`Loading comparison against ${company.canonical_name}...`, true);
    try {
      const bundle = await fetchCompanyBundle(company);
      if (loadToken !== comparisonLoadToken) return;
      currentComparisonBundle = bundle;
      currentComparisonCompany = company;
      renderComparisonCard(currentCompanyBundle, currentComparisonBundle);
    } catch (err) {
      if (loadToken !== comparisonLoadToken) return;
      currentComparisonCompany = null;
      currentComparisonBundle = null;
      renderComparisonPlaceholder(`Could not load comparison company. ${err.message || "Load failed"}`, true);
    }
  }

  async function loadCompanyGraph(company) {
    const loadToken = ++companyLoadToken;
    if (!company.available) {
      currentCompany = company;
      profileEl.textContent = `No precomputed graph file yet for ${company.canonical_name}. Build it with scripts/build_company_patent_networks.py --canonical \"${company.canonical_name}\".`;
      renderDiagnosticsPlaceholder("Coverage diagnostics appear once a precomputed company page is available.");
      clearComparisonState();
      clusterLegendEl.textContent = "";
      topInventorsEl.innerHTML = "";
      topEmergingInventorsEl.innerHTML = "";
      citationInsightEl.innerHTML = "";
      citationSummaryEl.innerHTML = "";
      clearCanvas();
      clearCitationCanvas();
      clearLabels();
      currentData = null;
      currentCitationArtifact = null;
      currentInventorArtifact = null;
      currentGeoArtifact = null;
      currentCompanyBundle = null;
      currentCitationScene = null;
      citationHoverFocus = null;
      citationPinnedFocus = null;
      setCitationMode("firm");
      setInventorView("core");
      setAnalysisView("map");
      stopAnimations();
      syncPresetButtons();
      return;
    }
    currentCitationScene = null;
    citationHoverFocus = null;
    citationPinnedFocus = null;
    const pendingState = pendingUrlState;
    const bundle = await fetchCompanyBundle(company);
    if (loadToken !== companyLoadToken) return;
    currentCompany = company;
    currentCompanyBundle = bundle;
    currentData = bundle.graph;
    currentInventorArtifact = bundle.inventorArtifact;
    currentCitationArtifact = bundle.citationArtifact;
    currentGeoArtifact = bundle.geoArtifact;
    let maxWeight = 1;
    for (const l of (bundle.graph.links || [])) {
      const w = Number(l.weight || 1);
      if (w > maxWeight) maxWeight = w;
    }
    minEdgeSlider.max = String(Math.min(maxWeight, 25));
    const recommended = clamp(recommendMinWeight(bundle.graph), 1, Number(minEdgeSlider.max));
    const requestedEdge = pendingState && Number.isFinite(pendingState.edge)
      ? clamp(pendingState.edge, 1, Number(minEdgeSlider.max))
      : recommended;
    minEdgeSlider.value = String(requestedEdge);
    minEdgeValue.textContent = String(requestedEdge);
    networkTitleEl.textContent = `Inventor Collaboration: ${bundle.graph.company}`;
    renderTopInventors(bundle.metaMerged);
    renderEmergingInventors(bundle.metaMerged);
    const summary = drawGraph(currentData, Number(minEdgeSlider.value));
    renderCitationPanel(bundle.graph.company, bundle.citationArtifact, bundle.citationProfile || null);
    renderCompanyProfile(bundle, summary);
    renderCompanyDiagnostics(bundle.metaMerged, bundle.geoArtifact, bundle.citationProfile || null, bundle.officeFootprint);
    setAnalysisView(pendingState?.panel || currentAnalysisView || "map");
    if (window.CompanyGeoMap && typeof window.CompanyGeoMap.renderForCompany === "function") {
      await window.CompanyGeoMap.renderForCompany(bundle.graph.company, bundle.slug);
      if (pendingState && typeof window.CompanyGeoMap.setView === "function") {
        window.CompanyGeoMap.setView({
          scope: pendingState.geoScope,
          region: pendingState.geoRegion,
          level: pendingState.geoLevel,
          sizeMetric: pendingState.geoSize,
          background: pendingState.background,
        });
      }
    }
    const requestedComparison = pendingState?.compare ? lookupCompany(pendingState.compare) : null;
    if (requestedComparison && requestedComparison.slug !== company.slug) {
      await loadComparisonCompany(requestedComparison, { source: "pending" });
    } else if (currentComparisonCompany && currentComparisonBundle && currentComparisonCompany.slug !== company.slug) {
      compareSearchInput.value = currentComparisonCompany.canonical_name;
      renderComparisonCard(currentCompanyBundle, currentComparisonBundle);
    } else {
      clearComparisonState();
    }
    syncPresetButtons();
    pendingUrlState = null;
  }

  async function onLoadClick() {
    if (!companyCatalog.length) {
      profileEl.textContent = "Company list is empty. Reload /networks/ from a local server (not file://).";
      renderDiagnosticsPlaceholder("Coverage diagnostics are unavailable until the company catalog loads.");
      return;
    }
    const company = lookupCompany(searchInput.value);
    if (!company) {
      const q = normalizeQuery(searchInput.value);
      if (!q) {
        profileEl.textContent = "Type a company name to search.";
        renderDiagnosticsPlaceholder("Load a company to inspect data coverage and geography diagnostics.");
        return;
      }
      const suggestions = companyCatalog
        .filter((c) => normalizeQuery(c.canonical_name).includes(q))
        .slice(0, 5)
        .map((c) => c.canonical_name);
      profileEl.textContent = suggestions.length ? `Company not found exactly. Try: ${suggestions.join(", ")}` : "Company name not found in canonical list.";
      renderDiagnosticsPlaceholder("Coverage diagnostics appear after loading a company page.");
      return;
    }
    searchInput.value = company.canonical_name;
    profileEl.textContent = `Loading ${company.canonical_name}...`;
    renderDiagnosticsPlaceholder(`Loading diagnostics for ${company.canonical_name}...`);
    try {
      await loadCompanyGraph(company);
    } catch (err) {
      profileEl.textContent = `Could not load company network. ${err.message || "Load failed"}`;
      renderDiagnosticsPlaceholder("Coverage diagnostics could not be loaded for this company.");
      clearComparisonState({ keepInput: true });
    }
  }

  minEdgeSlider.addEventListener("input", () => {
    minEdgeValue.textContent = minEdgeSlider.value;
    if (currentData) {
      const summary = drawGraph(currentData, Number(minEdgeSlider.value));
      if (currentCompanyBundle) {
        renderCompanyProfile(currentCompanyBundle, summary);
      }
    }
  });
  citationModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.citationMode || "firm";
      citationHoverFocus = null;
      citationPinnedFocus = null;
      setCitationMode(mode);
      if (currentData) {
        rerenderCitationFromState();
      }
    });
  });
  inventorViewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.inventorView || "core";
      setInventorView(mode);
    });
  });
  analysisViewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setAnalysisView(btn.dataset.analysisView || "map");
    });
  });
  citationCanvas.addEventListener("mousemove", (evt) => {
    const focus = detectCitationFocus(citationCanvasPoint(evt));
    citationCanvas.style.cursor = focus ? "pointer" : "default";
    if (!citationFocusEquals(focus, citationHoverFocus)) {
      citationHoverFocus = focus;
      if (!citationPinnedFocus || !focus || !citationFocusEquals(citationPinnedFocus, focus)) {
        rerenderCitationFromState();
      }
    }
  });
  citationCanvas.addEventListener("mouseleave", () => {
    citationCanvas.style.cursor = "default";
    if (citationHoverFocus) {
      citationHoverFocus = null;
      if (!citationPinnedFocus) rerenderCitationFromState();
    }
  });
  citationCanvas.addEventListener("click", (evt) => {
    const focus = detectCitationFocus(citationCanvasPoint(evt));
    if (citationPinnedFocus && citationFocusEquals(citationPinnedFocus, focus)) {
      citationPinnedFocus = null;
    } else {
      citationPinnedFocus = focus;
    }
    rerenderCitationFromState();
  });
  companyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    onLoadClick();
  });
  searchInput.addEventListener("input", () => {
    refreshCompanyDatalist(searchInput.value);
  });
  searchInput.addEventListener("focus", () => {
    refreshCompanyDatalist(searchInput.value);
  });
  compareSearchInput.addEventListener("input", () => {
    refreshCompanyDatalist(compareSearchInput.value);
  });
  compareSearchInput.addEventListener("focus", () => {
    refreshCompanyDatalist(compareSearchInput.value);
  });
  compareSearchInput.addEventListener("keydown", (evt) => {
    if (evt.key !== "Enter") return;
    evt.preventDefault();
    compareCompanyButton.click();
  });
  companyPresetsEl.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-company-preset]");
    if (!btn) return;
    searchInput.value = btn.dataset.companyPreset || "";
    onLoadClick();
  });
  randomCompanyButton.addEventListener("click", () => {
    const pick = pickRandomCompany();
    if (!pick) return;
    searchInput.value = pick.canonical_name;
    onLoadClick();
  });
  copyCompanyLinkButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildDeepLinkUrl());
      flashCopyLinkButton("Link copied");
    } catch (err) {
      console.error(err);
      flashCopyLinkButton("Copy failed");
    }
  });
  compareCompanyButton.addEventListener("click", async () => {
    if (!currentCompanyBundle) {
      renderComparisonPlaceholder("Load a focal company first, then compare it with a second firm.", true);
      return;
    }
    const company = lookupCompany(compareSearchInput.value);
    if (!company) {
      renderComparisonPlaceholder("Comparison company not found in the canonical list.", true);
      return;
    }
    await loadComparisonCompany(company);
  });
  clearCompareButton.addEventListener("click", () => {
    clearComparisonState();
  });
  if (window.CompanyGeoMap && typeof window.CompanyGeoMap.subscribe === "function") {
    window.CompanyGeoMap.subscribe((payload) => {
      renderGeoGuide(payload);
      renderGeoHighlights(payload);
    });
  } else {
    renderGeoGuide(null);
  }

  pendingUrlState = readUrlState();
  clearInitialUrlState();
  setAnalysisView(pendingUrlState?.panel || "map");
  Promise.resolve()
    .then(loadCatalog)
    .then(() => {
      setCitationMode(pendingUrlState?.citation || "firm");
      setInventorView(pendingUrlState?.inventor || "core");
      const available = companyCatalog.filter((c) => c.available);
      if (available.length > 0) {
        const requestedCompany = pendingUrlState?.company ? lookupCompany(pendingUrlState.company) : null;
        const pick = requestedCompany || available[Math.floor(Math.random() * available.length)];
        searchInput.value = pick.canonical_name;
        profileEl.textContent = `${available.length.toLocaleString()} precomputed company networks available.`;
        renderDiagnosticsPlaceholder("Loading company diagnostics...");
        return onLoadClick();
      }
      profileEl.textContent = "No precomputed company networks are available yet.";
      renderDiagnosticsPlaceholder("Coverage diagnostics are unavailable because no company pages are loaded.");
      clearCanvas();
      clearCitationCanvas();
      clearLabels();
      return null;
    })
    .catch((err) => {
      profileEl.textContent = `Could not load company catalog. ${err.message || "Load failed"}`;
      renderDiagnosticsPlaceholder("Coverage diagnostics could not load because the catalog request failed.");
    });
})();

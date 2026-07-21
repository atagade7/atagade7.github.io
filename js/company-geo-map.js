(() => {
  const svgEl = document.getElementById("geo-map");
  const showControls = document.getElementById("geo-show-controls");
  const regionControls = document.getElementById("geo-region-controls");
  const usLevelControls = document.getElementById("geo-us-level-controls");
  const detailLabelEl = document.getElementById("geo-detail-label");
  const backgroundToggle = document.getElementById("geo-background-toggle");
  const alertEl = document.getElementById("geo-map-alert");
  const summaryEl = document.getElementById("geo-map-summary");
  const legendEl = document.getElementById("geo-map-legend");
  const scaleEl = document.getElementById("geo-map-scale");
  const tooltipEl = document.getElementById("geo-map-tooltip");
  const statusEl = document.getElementById("geo-map-status");
  if (!svgEl || !showControls || !regionControls || !usLevelControls || !detailLabelEl || !backgroundToggle || !alertEl || !summaryEl || !legendEl || !scaleEl || !tooltipEl || !statusEl) {
    return;
  }
  const tooltipShellEl = tooltipEl.parentElement || svgEl;
  if (!window.d3) {
    statusEl.textContent = "Map libraries failed to load.";
    return;
  }

  const d3 = window.d3;
  const width = 960;
  const height = 560;
  const margin = 18;

  const state = {
    scope: "inventor",
    region: "us",
    usLevel: "locations",
    worldLevel: "locations",
    sizeMetric: "patent_count",
    background: true,
    company: "",
    slug: "",
    companyGeo: null,
  };

  const cache = {
    companyGeo: new Map(),
    overall: {
      inventor: null,
      assignee: null,
      legacy: null,
    },
    backgroundMetricRows: new Map(),
    usStatesGeo: null,
    usCountiesGeo: null,
    worldCountriesGeo: null,
    czGeo: null,
    czLabelById: null,
    usFeatures: null,
    worldFeatures: null,
  };
  const changeListeners = new Set();
  let lastPayload = null;
  let resourceLoadToken = 0;
  const showModeMap = {
    inventor_patents: { scope: "inventor", sizeMetric: "patent_count" },
    inventor_count: { scope: "inventor", sizeMetric: "inventor_count" },
    assignee_patents: { scope: "assignee", sizeMetric: "patent_count" },
    assignee_offices: { scope: "assignee", sizeMetric: "location_count" },
  };

  function fetchJsonWithFallback(paths) {
    return (async () => {
      let lastErr = null;
      for (const path of paths) {
        try {
          const r = await fetch(path);
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
    })();
  }

  function slugPaths(slug) {
    return [`../data/networks/artifacts/geo/companies/${slug}.json`, `/data/networks/artifacts/geo/companies/${slug}.json`];
  }

  function showStatus(message) {
    statusEl.textContent = message;
  }

  function hideTooltip() {
    tooltipEl.style.opacity = "0";
    tooltipEl.setAttribute("aria-hidden", "true");
  }

  function showTooltip(evt, html) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.opacity = "1";
    tooltipEl.setAttribute("aria-hidden", "false");
    const shellRect = tooltipShellEl.getBoundingClientRect();
    const pointerX = evt.clientX - shellRect.left;
    const pointerY = evt.clientY - shellRect.top;
    const offset = 14;
    const padding = 10;
    const tooltipWidth = tooltipEl.offsetWidth;
    const tooltipHeight = tooltipEl.offsetHeight;
    const maxLeft = Math.max(padding, shellRect.width - tooltipWidth - padding);
    const maxTop = Math.max(padding, shellRect.height - tooltipHeight - padding);
    let left = pointerX + offset;
    let top = pointerY + offset;
    if (left > maxLeft) {
      left = pointerX - tooltipWidth - offset;
    }
    if (top > maxTop) {
      top = pointerY - tooltipHeight - offset;
    }
    left = Math.min(Math.max(left, padding), maxLeft);
    top = Math.min(Math.max(top, padding), maxTop);
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function metricLabel(scope) {
    return scope === "inventor"
      ? "patents with at least one inventor in the selected places"
      : "patents with at least one assignee office in the selected places";
  }

  function scopeLabel(scope) {
    return scope === "inventor" ? "inventor addresses" : "assignee office locations";
  }

  function activeShowMode() {
    if (state.scope === "assignee") {
      return state.sizeMetric === "location_count" ? "assignee_offices" : "assignee_patents";
    }
    return state.sizeMetric === "inventor_count" ? "inventor_count" : "inventor_patents";
  }

  function applyShowMode(mode) {
    const next = showModeMap[String(mode || "").trim()];
    if (!next) return false;
    state.scope = next.scope;
    state.sizeMetric = next.sizeMetric;
    return true;
  }

  function overlayPatentLabel() {
    return "Patents";
  }

  function overallPatentLabel() {
    return state.scope === "assignee" ? "Overall assignee-linked patents" : "Overall inventor-linked patents";
  }

  function overallInventorLabel() {
    return state.scope === "assignee" ? "Overall assignee offices" : "Overall distinct inventors";
  }

  function overallSecondaryValue(row) {
    return state.scope === "assignee"
      ? assigneeOfficeCount(row)
      : Number(row?.inventor_count || 0);
  }

  function assigneeOfficeCount(row) {
    const locationCount = Number(row?.location_count || 0);
    if (locationCount > 0) return locationCount;
    return row?.location_id ? 1 : 0;
  }

  function metricFieldAllowed(metricField, scope = state.scope) {
    if (metricField === "patent_count") return true;
    if (metricField === "inventor_count") return scope === "inventor";
    if (metricField === "location_count") return scope === "assignee";
    return false;
  }

  function activeMetricField() {
    return metricFieldAllowed(state.sizeMetric) ? state.sizeMetric : "patent_count";
  }

  function metricFieldLabel(metricField = activeMetricField(), titleCase = false) {
    if (metricField === "inventor_count") return titleCase ? "Distinct inventors" : "distinct inventors";
    if (metricField === "location_count") return titleCase ? "Assignee offices" : "assignee offices";
    return titleCase ? "Patents" : "patents";
  }

  function metricValue(row, metricField = activeMetricField()) {
    if (metricField === "location_count") return assigneeOfficeCount(row);
    return Number(row?.[metricField] || 0);
  }

  function backgroundMetricValue(row, metricField = activeMetricField()) {
    if (metricField === "inventor_count") {
      const value = Number(row?.inventor_count || 0);
      if (value > 0 || Object.prototype.hasOwnProperty.call(row || {}, "inventor_count")) return value;
      return Number(row?.patent_count || 0);
    }
    if (metricField === "location_count") {
      if (Object.prototype.hasOwnProperty.call(row || {}, "location_count")) {
        return Number(row?.location_count || 0);
      }
      return row?.location_id ? 1 : Number(row?.patent_count || 0);
    }
    return Number(row?.patent_count || 0);
  }

  function backgroundMetricLabel(metricField = activeMetricField()) {
    if (metricField === "inventor_count") return "Overall distinct inventors";
    if (metricField === "location_count") return "Overall assignee offices";
    return overallPatentLabel();
  }

  function backgroundRowsForMetric(rows, metricField = activeMetricField()) {
    const cacheKey = `${state.scope}|${state.region}|${activeLevel()}|${metricField}`;
    if (cache.backgroundMetricRows.has(cacheKey)) {
      return cache.backgroundMetricRows.get(cacheKey);
    }
    const decorated = (rows || []).map((row) => ({
      ...row,
      _background_metric: backgroundMetricValue(row, metricField),
    }));
    cache.backgroundMetricRows.set(cacheKey, decorated);
    return decorated;
  }

  function backgroundLegendText(levelLabel, metricField = activeMetricField()) {
    return `Background: ${backgroundMetricLabel(metricField)} by ${levelLabel} across full PatentsView.`;
  }

  function overlaySecondaryHtml(row) {
    if (state.scope === "inventor") {
      return `<div class="geo-tooltip-row"><span>Distinct inventors</span><span>${formatNumber(row.inventor_count)}</span></div>`;
    }
    const officeCount = assigneeOfficeCount(row);
    if (officeCount > 0) {
      return `<div class="geo-tooltip-row"><span>Assignee offices</span><span>${formatNumber(officeCount)}</span></div>`;
    }
    return "";
  }

  function companyTooltipNote() {
    return state.company ? `<div class="geo-tooltip-note">Company: ${state.company}</div>` : "";
  }

  function assigneeSparsityNote() {
    if (state.scope !== "assignee" || !state.companyGeo) return "";
    const assigneePatents = Number(state.companyGeo?.coverage?.assignee?.patent_count || 0);
    const inventorPatents = Number(state.companyGeo?.coverage?.inventor?.patent_count || 0);
    if (!(assigneePatents > 0) || !(inventorPatents > 0)) return "";
    if ((assigneePatents / inventorPatents) >= 0.5) return "";
    return `<div class="geo-tooltip-note">Office layer is partial in the current artifact: ${formatNumber(assigneePatents)} assignee-linked patents versus ${formatNumber(inventorPatents)} inventor-linked patents.</div>`;
  }

  function assigneeCoverageAlertText() {
    if (state.scope !== "assignee" || !state.companyGeo) return "";
    const assigneePatents = Number(state.companyGeo?.coverage?.assignee?.patent_count || 0);
    const inventorPatents = Number(state.companyGeo?.coverage?.inventor?.patent_count || 0);
    if (!(assigneePatents > 0) || !(inventorPatents > 0)) return "";
    if ((assigneePatents / inventorPatents) >= 0.5) return "";
    return `Assignee view is partial in the current artifact: ${formatNumber(assigneePatents)} assignee-linked patents versus ${formatNumber(inventorPatents)} inventor-linked patents. This usually indicates incomplete assignee-ID mapping upstream, not a missing hover label or map rendering issue.`;
  }

  function overlayTooltipBody(row, extraNotes = "") {
    return (
      `<div class="geo-tooltip-row"><span>${overlayPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
      overlaySecondaryHtml(row) +
      extraNotes +
      assigneeSparsityNote() +
      companyTooltipNote()
    );
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatPct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "N/A";
    if (num > 0 && num < 1) return `${num.toFixed(2)}%`;
    return `${num.toFixed(1)}%`;
  }

  function clamp(value, lower, upper) {
    return Math.min(upper, Math.max(lower, value));
  }

  const scopePalettes = {
    inventor: {
      ramp: ["#fffaf8", "#f8ddd3", "#ee9d82", "#c44a30", "#7a231a"],
      stroke: "#7a231a",
      pointStroke: "#5e170f",
    },
    assignee: {
      ramp: ["#fffaf8", "#f8ddd3", "#ee9d82", "#c44a30", "#7a231a"],
      stroke: "#7a231a",
      pointStroke: "#5e170f",
    },
  };

  // Approximate q999 cutoffs across all current company geo artifacts.
  const pointRadiusConfig = {
    inventor: {
      locations: {
        patent_count: { max: 1022, exponent: 2.7 },
        inventor_count: { max: 438, exponent: 2.5 },
      },
      city: {
        patent_count: { max: 899, exponent: 2.55 },
        inventor_count: { max: 264, exponent: 2.35 },
      },
    },
    assignee: {
      locations: {
        patent_count: { max: 14904, exponent: 1.92 },
        location_count: { max: 20, exponent: 1.2 },
      },
      city: {
        patent_count: { max: 11268, exponent: 1.82 },
        location_count: { max: 20, exponent: 1.25 },
      },
    },
  };

  function pointMetricField() {
    return activeMetricField();
  }

  function pointMetricLabel(metricField = pointMetricField()) {
    return metricFieldLabel(metricField, false);
  }

  function paletteForScope(scope) {
    return scopePalettes[scope] || scopePalettes.inventor;
  }

  function colorRange(scope) {
    return paletteForScope(scope).ramp;
  }

  function overlayStrokeColor(scope) {
    return paletteForScope(scope).stroke;
  }

  function pointStrokeColor(scope) {
    return paletteForScope(scope).pointStroke;
  }

  function patentDensityTransform(value) {
    return Math.log1p(Math.max(0, Number(value || 0)));
  }

  function drawWorldOcean(svg) {
    svg.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#f6fafc");
  }

  function normalizeWorldId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^\d+$/.test(raw) ? raw.padStart(3, "0") : raw;
  }

  function displayCountryName(name, alpha2 = "") {
    const code = normalizedCountryAlpha2(alpha2);
    const raw = String(name || "").trim();
    if (code === "TW" || /^Taiwan\b/i.test(raw)) return "Taiwan";
    return raw || code || "Country";
  }

  function layerCountsMap(rows, keyField, normalizeKey = null) {
    const out = new Map();
    for (const row of rows || []) {
      const key = normalizeKey
        ? normalizeKey(row[keyField])
        : String(row[keyField] || "").trim();
      if (!key) continue;
      out.set(key, row);
    }
    return out;
  }

  function toFeatureCollection(features) {
    return { type: "FeatureCollection", features };
  }

  function normalizedCountryAlpha2(value) {
    return String(value || "").trim().toUpperCase();
  }

  function worldLayerCountsMap(rows) {
    const out = new Map();
    for (const row of rows || []) {
      const worldId = normalizeWorldId(row?.world_id);
      const alpha2 = normalizedCountryAlpha2(row?.country_alpha2);
      if (worldId && !out.has(worldId)) out.set(worldId, row);
      if (alpha2 && !out.has(alpha2)) out.set(alpha2, row);
    }
    return out;
  }

  function worldFeatureKeys(feature) {
    const properties = feature?.properties || {};
    const keys = [];
    const alpha2 = normalizedCountryAlpha2(properties.country_alpha2 || properties.iso2cd);
    const worldId = normalizeWorldId(feature?.id || properties.world_id || properties.source_m49_code);
    if (alpha2) keys.push(alpha2);
    if (worldId) keys.push(worldId);
    return keys;
  }

  function worldFeatureRow(rowMap, feature) {
    for (const key of worldFeatureKeys(feature)) {
      if (rowMap.has(key)) return rowMap.get(key);
    }
    return null;
  }

  function overallScopePaths(scope) {
    const scopeName = scope === "assignee" ? "assignee" : "inventor";
    return [
      `../data/networks/artifacts/geo/overall/overall_${scopeName}_geo.json`,
      `/data/networks/artifacts/geo/overall/overall_${scopeName}_geo.json`,
    ];
  }

  function legacyOverallScopePayload(scope) {
    if (!cache.overall.legacy) return null;
    if (cache.overall.legacy[scope]) return cache.overall.legacy[scope];
    if (scope === "inventor" && cache.overall.legacy.world && cache.overall.legacy.us) {
      return {
        metric: cache.overall.legacy.metric,
        background_universe: cache.overall.legacy.background_universe,
        site_universe: cache.overall.legacy.site_universe,
        coverage_summary: cache.overall.legacy.coverage_summary,
        world: cache.overall.legacy.world,
        us: cache.overall.legacy.us,
      };
    }
    return null;
  }

  async function ensureOverallScope(scope = state.scope) {
    const normalizedScope = scope === "assignee" ? "assignee" : "inventor";
    if (cache.overall[normalizedScope]) return cache.overall[normalizedScope];
    try {
      cache.overall[normalizedScope] = await fetchJsonWithFallback(overallScopePaths(normalizedScope));
    } catch (scopeErr) {
      if (!cache.overall.legacy) {
        cache.overall.legacy = await fetchJsonWithFallback([
          "../data/networks/artifacts/geo/overall/overall_geo.json",
          "/data/networks/artifacts/geo/overall/overall_geo.json",
        ]);
      }
      const legacyPayload = legacyOverallScopePayload(normalizedScope);
      if (!legacyPayload) throw scopeErr;
      cache.overall[normalizedScope] = legacyPayload;
    }
    cache.backgroundMetricRows.clear();
    return cache.overall[normalizedScope];
  }

  function updateUsFeatureCache() {
    if (!cache.usStatesGeo) return;
    cache.usFeatures = {
      nation: toFeatureCollection(cache.usStatesGeo.features || []),
      states: cache.usStatesGeo.features || [],
      counties: cache.usCountiesGeo?.features || [],
    };
  }

  async function ensureUsStateResources() {
    if (!cache.usStatesGeo) {
      cache.usStatesGeo = await fetchJsonWithFallback([
        "../data/geo/us_states.geojson",
        "/data/geo/us_states.geojson",
      ]);
    }
    updateUsFeatureCache();
  }

  async function ensureUsCountyResources() {
    await ensureUsStateResources();
    if (!cache.usCountiesGeo) {
      cache.usCountiesGeo = await fetchJsonWithFallback([
        "../data/geo/us_counties.geojson",
        "/data/geo/us_counties.geojson",
      ]);
    }
    updateUsFeatureCache();
  }

  async function ensureWorldResources() {
    if (!cache.worldCountriesGeo) {
      cache.worldCountriesGeo = await fetchJsonWithFallback([
        "../data/geo/world_countries.geojson",
        "/data/geo/world_countries.geojson",
      ]);
    }
    if (!cache.worldFeatures) {
      cache.worldFeatures = {
        countries: cache.worldCountriesGeo.features || [],
        land: toFeatureCollection(cache.worldCountriesGeo.features || []),
      };
    }
  }

  async function ensureCzResources() {
    if (!cache.czGeo) {
      cache.czGeo = await fetchJsonWithFallback([
        "../data/geo/us_commuting_zones.geojson",
        "/data/geo/us_commuting_zones.geojson",
      ]);
    }
    if (!cache.czLabelById) {
      cache.czLabelById = new Map(
        (cache.czGeo.features || []).map((feature) => {
          const key = String(feature?.id || feature?.properties?.cz_id || "").trim();
          const label = String(feature?.properties?.label || feature?.properties?.name || "").trim();
          return [key, label];
        }).filter(([key, label]) => key && label),
      );
    }
  }

  function resourcesReadyForCurrentView() {
    const overallReady = !!(cache.overall[state.scope] || legacyOverallScopePayload(state.scope));
    if (!overallReady) return false;
    if (state.region === "world") {
      return !!cache.worldFeatures?.countries?.length;
    }
    if (!cache.usFeatures?.states?.length) return false;
    if (state.usLevel === "commuting_zone") return !!cache.czGeo?.features?.length;
    if (state.usLevel === "county") return !!cache.usFeatures?.counties?.length;
    if (state.usLevel === "locations" && state.background) return !!cache.usFeatures?.counties?.length;
    return true;
  }

  async function ensureResourcesForCurrentView() {
    const tasks = [ensureOverallScope(state.scope)];
    if (state.region === "world") {
      tasks.push(ensureWorldResources());
    } else {
      tasks.push(ensureUsStateResources());
      if (state.usLevel === "county" || (state.usLevel === "locations" && state.background)) {
        tasks.push(ensureUsCountyResources());
      }
      if (state.usLevel === "commuting_zone") {
        tasks.push(ensureCzResources());
      }
    }
    await Promise.all(tasks);
  }

  async function loadCompanyGeo(slug) {
    if (cache.companyGeo.has(slug)) return cache.companyGeo.get(slug);
    const payload = await fetchJsonWithFallback(slugPaths(slug));
    cache.companyGeo.set(slug, payload);
    return payload;
  }

  function companyDerivedCache(companyGeo = state.companyGeo) {
    if (!companyGeo) return null;
    if (!companyGeo.__mapDerived) {
      Object.defineProperty(companyGeo, "__mapDerived", {
        value: {},
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
    return companyGeo.__mapDerived;
  }

  function inventorLayerCache(companyGeo = state.companyGeo) {
    const derived = companyDerivedCache(companyGeo);
    if (!derived) return { points: [], rollups: {}, worldPoints: [], usPoints: [], worldCityRows: [] };
    if (!derived.inventor) {
      const points = companyGeo?.inventor_points || [];
      derived.inventor = {
        points,
        rollups: companyGeo?.inventor_rollups || {},
        worldPoints: null,
        usPoints: null,
        worldCityRows: null,
      };
    }
    return derived.inventor;
  }

  function assigneeLayerCache(companyGeo = state.companyGeo) {
    const derived = companyDerivedCache(companyGeo);
    if (!derived) return { points: [], rollups: {}, worldPoints: [], usPoints: [], worldCityRows: [] };
    if (!derived.assignee) {
      const points = normalizeAssigneePoints(companyGeo?.assignee_points || []);
      derived.assignee = {
        points,
        rollups: enrichAssigneeRollups(points, companyGeo?.assignee_rollups || {}),
        worldPoints: null,
        usPoints: null,
        worldCityRows: null,
      };
    }
    return derived.assignee;
  }

  function layerWorldPoints(layer) {
    if (!layer.worldPoints) {
      layer.worldPoints = (layer.points || []).filter((row) => row.latitude != null && row.longitude != null);
    }
    return layer.worldPoints;
  }

  function layerUsPoints(layer) {
    if (!layer.usPoints) {
      layer.usPoints = (layer.points || []).filter((row) => row.country_alpha2 === "US" && row.latitude != null && row.longitude != null);
    }
    return layer.usPoints;
  }

  function layerWorldCityRows(layer) {
    if (!layer.worldCityRows) {
      layer.worldCityRows = aggregatePointsByCity(layer.points || []);
    }
    return layer.worldCityRows;
  }

  function backgroundCountsForView() {
    const overallScope = cache.overall[state.scope] || legacyOverallScopePayload(state.scope);
    if (!overallScope) return [];
    if (state.region === "world") return overallScope.world?.country || [];
    if (state.usLevel === "state") return overallScope.us?.state || [];
    if (state.usLevel === "county" || state.usLevel === "locations") return overallScope.us?.county || [];
    if (state.usLevel === "commuting_zone") return overallScope.us?.commuting_zone || [];
    if (state.usLevel === "city") return overallScope.us?.city || [];
    return overallScope.us?.county || [];
  }

  function activeLevel() {
    return state.region === "world" ? state.worldLevel : state.usLevel;
  }

  function currentViewState() {
    return {
      company: state.company,
      slug: state.slug,
      showMode: activeShowMode(),
      scope: state.scope,
      region: state.region,
      level: activeLevel(),
      worldLevel: state.worldLevel,
      usLevel: state.usLevel,
      sizeMetric: state.sizeMetric,
      background: state.background,
    };
  }

  function locationCountMaps(points) {
    const maps = {
      country: new Map(),
      state: new Map(),
      county: new Map(),
      commuting_zone: new Map(),
      city: new Map(),
    };
    for (const row of points || []) {
      const locationId = String(row.location_id || "").trim();
      if (!locationId) continue;
      const countryKey = normalizeWorldId(row.world_id) || String(row.country_alpha2 || "").trim();
      if (countryKey) maps.country.set(countryKey, (maps.country.get(countryKey) || 0) + 1);
      const stateKey = String(row.state_fips || "").trim();
      if (stateKey) maps.state.set(stateKey, (maps.state.get(stateKey) || 0) + 1);
      const countyKey = String(row.county_fips || "").trim();
      if (countyKey) maps.county.set(countyKey, (maps.county.get(countyKey) || 0) + 1);
      const czKey = String(row.cz_id || "").trim();
      if (czKey) maps.commuting_zone.set(czKey, (maps.commuting_zone.get(czKey) || 0) + 1);
      const cityKey = [
        String(row.country_alpha2 || "").trim(),
        String(row.state || "").trim(),
        String(row.city || "").trim(),
      ].join("|");
      if (String(row.city || "").trim()) maps.city.set(cityKey, (maps.city.get(cityKey) || 0) + 1);
    }
    return maps;
  }

  function normalizeAssigneePoints(points) {
    return (points || []).map((row) => ({
      ...row,
      location_count: assigneeOfficeCount(row),
    }));
  }

  function enrichAssigneeRollups(points, rollups) {
    const counts = locationCountMaps(points);
    const withCounts = {};
    const addCounts = (rows, level, keyFn) => (rows || []).map((row) => ({
      ...row,
      location_count: counts[level].get(keyFn(row)) || 0,
    }));
    withCounts.country = addCounts(rollups.country || [], "country", (row) => normalizeWorldId(row.world_id) || String(row.country_alpha2 || "").trim());
    withCounts.state = addCounts(rollups.state || [], "state", (row) => String(row.state_fips || "").trim());
    withCounts.county = addCounts(rollups.county || [], "county", (row) => String(row.county_fips || "").trim());
    withCounts.commuting_zone = addCounts(rollups.commuting_zone || [], "commuting_zone", (row) => String(row.cz_id || "").trim());
    withCounts.city = addCounts(rollups.city || [], "city", (row) => [
      String(row.country_alpha2 || "").trim(),
      String(row.state || "").trim(),
      String(row.city || "").trim(),
    ].join("|"));
    return withCounts;
  }

  function companyLayerRows() {
    if (!state.companyGeo) return { points: [], rollups: {} };
    return state.scope === "inventor" ? inventorLayerCache() : assigneeLayerCache();
  }

  function highlightRowLabel(row, level, region) {
    if (level === "country") return displayCountryName(row.country_name, row.country_alpha2);
    if (level === "state") return row.state || row.state_fips || "State";
    if (level === "county") return [row.county || "County", row.state || ""].filter(Boolean).join(", ");
    if (level === "commuting_zone") return commutingZoneLabel(row);
    if (row.city) {
      return region === "world"
        ? [row.city, row.state || row.country_alpha2].filter(Boolean).join(", ")
        : [row.city, row.state].filter(Boolean).join(", ");
    }
    if (region === "world") return displayCountryName(row.country_name, row.country_alpha2);
    return [row.county || row.state || "Location", row.county ? row.state : ""].filter(Boolean).join(", ");
  }

  function currentViewRows() {
    const layer = companyLayerRows();
    const { points, rollups } = layer;
    if (state.region === "world") {
      if (state.worldLevel === "country") return { level: "country", rows: rollups.country || [] };
      if (state.worldLevel === "city") return { level: "city", rows: layerWorldCityRows(layer) };
      return {
        level: "locations",
        rows: layerWorldPoints(layer),
      };
    }
    if (state.usLevel === "locations") {
      return {
        level: "locations",
        rows: layerUsPoints(layer),
      };
    }
    if (state.usLevel === "city") return { level: "city", rows: rollups.city || [] };
    if (state.usLevel === "state") return { level: "state", rows: rollups.state || [] };
    if (state.usLevel === "county") return { level: "county", rows: rollups.county || [] };
    if (state.usLevel === "commuting_zone") return { level: "commuting_zone", rows: rollups.commuting_zone || [] };
    return { level: activeLevel(), rows: [] };
  }

  function scheduleRenderForCurrentView() {
    const loadToken = ++resourceLoadToken;
    if (!state.companyGeo) {
      updateControls();
      emitChange();
      return;
    }
    if (resourcesReadyForCurrentView()) {
      render();
      return;
    }
    showStatus("Loading geography...");
    ensureResourcesForCurrentView()
      .then(() => {
        if (loadToken !== resourceLoadToken || !state.companyGeo) return;
        render();
      })
      .catch((err) => {
        if (loadToken !== resourceLoadToken) return;
        console.error(err);
        showStatus("Geography background assets are not available yet.");
        updateControls();
        emitChange();
      });
  }

  function emitChange() {
    const view = currentViewRows();
    const metricField = activeMetricField();
    const totalPatents = d3.sum(view.rows || [], (row) => Number(row.patent_count || 0));
    const totalMetric = d3.sum(view.rows || [], (row) => metricValue(row, metricField));
    const rows = (view.rows || [])
      .slice()
      .sort((a, b) =>
        metricValue(b, metricField) - metricValue(a, metricField) ||
        Number(b.patent_count || 0) - Number(a.patent_count || 0) ||
        String(highlightRowLabel(a, view.level, state.region)).localeCompare(String(highlightRowLabel(b, view.level, state.region)))
      )
      .slice(0, 12)
      .map((row) => ({
      ...row,
      label: highlightRowLabel(row, view.level, state.region),
      }));
    const payload = {
      ...currentViewState(),
      available: !!state.companyGeo,
      rows,
      rowCount: (view.rows || []).length,
      totalPatents,
      totalMetric,
      metricField,
      metricLabel: metricFieldLabel(metricField, true),
    };
    lastPayload = payload;
    changeListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    changeListeners.add(listener);
    if (lastPayload) {
      listener(lastPayload);
    } else {
      listener({
        ...currentViewState(),
        available: !!state.companyGeo,
        rows: [],
        totalPatents: 0,
        totalMetric: 0,
        metricField: activeMetricField(),
        metricLabel: metricFieldLabel(activeMetricField(), true),
      });
    }
    return () => {
      changeListeners.delete(listener);
    };
  }

  function setView(next = {}) {
    if (typeof next.showMode === "string") {
      applyShowMode(next.showMode);
    }
    if (typeof next.scope === "string" && ["inventor", "assignee"].includes(next.scope)) {
      state.scope = next.scope;
    }
    if (typeof next.region === "string" && ["us", "world"].includes(next.region)) {
      state.region = next.region;
    }
    if (Object.prototype.hasOwnProperty.call(next, "background")) {
      const raw = next.background;
      if (raw !== null && raw !== undefined && raw !== "") {
        state.background = !(raw === false || raw === "0" || raw === "false");
      }
    }
    const level = String(next.level || "").trim();
    if (level) {
      if (state.region === "world" && ["locations", "city", "country"].includes(level)) {
        state.worldLevel = level;
      } else if (state.region === "us" && ["locations", "city", "state", "county", "commuting_zone"].includes(level)) {
        state.usLevel = level;
      }
    }
    if (typeof next.sizeMetric === "string" && ["patent_count", "inventor_count", "location_count"].includes(next.sizeMetric)) {
      state.sizeMetric = next.sizeMetric;
    }
    if (state.region === "world" && !["locations", "city", "country"].includes(state.worldLevel)) {
      state.worldLevel = "locations";
    }
    if (state.region === "us" && !["locations", "city", "state", "county", "commuting_zone"].includes(state.usLevel)) {
      state.usLevel = "locations";
    }
    if (!metricFieldAllowed(state.sizeMetric, state.scope)) {
      state.sizeMetric = "patent_count";
    }
    if (state.companyGeo) {
      scheduleRenderForCurrentView();
    } else {
      updateControls();
      emitChange();
    }
    return currentViewState();
  }

  function scaleForRows(rows, field, range) {
    const max = d3.max(rows || [], (d) => Number(d[field] || 0)) || 1;
    return d3.scaleSqrt().domain([0, max]).range(range);
  }

  function pointRadiusScale(radiusRange, radiusMode, metricField = pointMetricField()) {
    const mode = radiusMode === "city" ? "city" : "locations";
    const config = pointRadiusConfig[state.scope]?.[mode]?.[metricField]
      || pointRadiusConfig[state.scope]?.[mode]?.patent_count
      || { max: 1, exponent: 1 };
    const maxLog = Math.log1p(config.max || 1);
    const [lower, upper] = radiusRange;
    return (value) => {
      const ratio = maxLog > 0
        ? clamp(Math.log1p(Math.max(0, Number(value || 0))) / maxLog, 0, 1)
        : 0;
      return lower + ((upper - lower) * Math.pow(ratio, config.exponent || 1));
    };
  }

  function interpolatePalette(colors, t) {
    const clamped = clamp(Number(t || 0), 0, 1);
    if (!Array.isArray(colors) || colors.length < 2) return String(colors?.[0] || "#000000");
    if (colors.length === 2) return d3.interpolateRgb(colors[0], colors[1])(clamped);
    return d3.interpolateRgbBasis(colors)(clamped);
  }

  function colorScale(rows, field, colors) {
    const max = d3.max(rows || [], (d) => Number(d[field] || 0)) || 1;
    const scale = d3.scaleSqrt().domain([0, max]).range([0, 1]).clamp(true);
    return (value) => interpolatePalette(colors, scale(Math.max(0, Number(value || 0))));
  }

  function overlayColorScale(rows, field, colors, options = {}) {
    return focusedTransformedColorScale(rows, field, colors, {
      transformFn: options.transformFn || patentDensityTransform,
      upperQuantile: options.upperQuantile ?? 0.9,
      easing: options.easing ?? 0.92,
      minTint: options.minTint ?? 0.04,
    });
  }

  function focusedTransformedColorScale(rows, field, colors, options = {}) {
    const transform = options.transformFn || ((value) => value);
    const upperQuantile = options.upperQuantile ?? 0.95;
    const easing = options.easing ?? 0.72;
    const minTint = options.minTint ?? 0.1;
    const transformed = (rows || [])
      .map((row) => transform(Math.max(0, Number(row[field] || 0))))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    const upperIndex = transformed.length
      ? Math.max(0, Math.min(transformed.length - 1, Math.floor(upperQuantile * (transformed.length - 1))))
      : 0;
    const upperBound = transformed.length ? Math.max(transformed[upperIndex], transformed[transformed.length - 1] * 0.08, 1e-9) : 1;
    return (value) => {
      const transformedValue = transform(Math.max(0, Number(value || 0)));
      if (!(transformedValue > 0)) return colors[0];
      const ratio = Math.min(1, transformedValue / upperBound);
      const eased = Math.pow(ratio, easing);
      const tint = minTint + ((1 - minTint) * eased);
      return interpolatePalette(colors, tint);
    };
  }

  function steppedValueColorScale(rows, field, colors, options = {}) {
    const zeroColor = options.zeroColor || "#ffffff";
    const transform = options.transformFn || ((value) => value);
    const easing = options.easing ?? 1.55;
    const steps = Math.max(3, Number(options.steps || 16));
    const positiveValues = (rows || [])
      .map((row) => Math.max(0, Number(row?.[field] || 0)))
      .filter((value) => value > 0)
      .map((value) => transform(value))
      .filter((value) => Number.isFinite(value));
    const maxValue = d3.max(positiveValues) || 1;
    return (value) => {
      const rawValue = Math.max(0, Number(value || 0));
      if (!(rawValue > 0)) return zeroColor;
      const transformedValue = transform(rawValue);
      const ratio = Math.min(1, Math.max(0, transformedValue / maxValue));
      const eased = Math.pow(ratio, easing);
      const stepped = steps <= 1 ? eased : Math.round(eased * (steps - 1)) / (steps - 1);
      return interpolatePalette(colors, stepped);
    };
  }

  function overlayPointStyler(rows, colors, radiusRange, radiusMode = "locations", metricField = pointMetricField()) {
    const radiusScale = pointRadiusScale(radiusRange, radiusMode, metricField);
    const radius = (value) => radiusScale(Number(value || 0));
    const [minRadius, maxRadius] = radiusRange;
    const fillScale = overlayColorScale(rows, metricField, colors, {
      upperQuantile: state.scope === "inventor" ? 0.996 : 1,
      easing: state.scope === "inventor" ? 1.78 : 1.08,
      minTint: state.scope === "inventor" ? 0.002 : 0.02,
    });

    function sizeWeight(value) {
      if (maxRadius <= minRadius) return 1;
      return (radius(value) - minRadius) / (maxRadius - minRadius);
    }

    return {
      radius(value) {
        return radius(value);
      },
      fill(value) {
        return fillScale(value);
      },
      opacity(value) {
        return 0.66 + (0.16 * sizeWeight(value));
      },
      stroke(value) {
        return d3.interpolateRgb(fillScale(value), pointStrokeColor(state.scope))(0.72);
      },
      strokeWidth(value) {
        return 0.45 + (0.35 * Math.pow(sizeWeight(value), 0.75));
      },
    };
  }

  function isGenericCzLabel(value) {
    return /^CZ\s+\d+$/i.test(String(value || "").trim());
  }

  function commutingZoneLabel(row, feature = null) {
    const rowLabel = String(row?.label || row?.cz_label || "").trim();
    if (rowLabel && !isGenericCzLabel(rowLabel)) return rowLabel;
    const featureLabel = String(feature?.properties?.label || feature?.properties?.name || "").trim();
    if (featureLabel) return featureLabel;
    const czId = String(row?.cz_id || feature?.id || feature?.properties?.cz_id || "").trim();
    const cachedLabel = String(cache.czLabelById?.get(czId) || "").trim();
    if (cachedLabel) return cachedLabel;
    return `CZ ${czId}`.trim();
  }

  function polygonLabel(feature, row, labelField) {
    if (labelField === "cz_label") {
      return commutingZoneLabel(row, feature);
    }
    const rowLabel = String(row?.[labelField] || "").trim();
    const featureLabel = String(feature?.properties?.label || feature?.properties?.name || "").trim();
    return rowLabel || featureLabel || "Area";
  }

  function aggregatePointsByCity(points) {
    const grouped = new Map();
    for (const row of points || []) {
      const city = String(row.city || "").trim();
      const countryAlpha2 = String(row.country_alpha2 || "").trim();
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      if (!city || !countryAlpha2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const state = String(row.state || "").trim();
      const key = [countryAlpha2, state, city].join("|");
      const patentCount = Number(row.patent_count || 0);
      const assignmentCount = Number(row.assignment_count || 0);
      const inventorCount = Number(row.inventor_count || 0);
      const weight = Math.max(1, patentCount);
      if (!grouped.has(key)) {
        grouped.set(key, {
          city,
          state: state || null,
          country_alpha2: countryAlpha2,
          country_name: displayCountryName(row.country_name, countryAlpha2),
          world_id: row.world_id || null,
          patent_count: 0,
          assignment_count: 0,
          inventor_count: 0,
          location_count: 0,
          latitude_sum: 0,
          longitude_sum: 0,
          weight_sum: 0,
        });
      }
      const bucket = grouped.get(key);
      bucket.patent_count += patentCount;
      bucket.assignment_count += assignmentCount;
      bucket.inventor_count += inventorCount;
      bucket.location_count += 1;
      bucket.latitude_sum += latitude * weight;
      bucket.longitude_sum += longitude * weight;
      bucket.weight_sum += weight;
    }
    return Array.from(grouped.values())
      .map((row) => ({
        city: row.city,
        state: row.state,
        country_alpha2: row.country_alpha2,
        country_name: row.country_name,
        world_id: row.world_id,
        patent_count: row.patent_count,
        assignment_count: row.assignment_count,
        inventor_count: row.inventor_count,
        location_count: row.location_count,
        latitude: row.latitude_sum / row.weight_sum,
        longitude: row.longitude_sum / row.weight_sum,
      }))
      .sort((a, b) => Number(b.patent_count || 0) - Number(a.patent_count || 0) || String(a.city || "").localeCompare(String(b.city || "")));
  }

  function buildSummary(rows, label) {
    const totalPatents = d3.sum(rows || [], (d) => Number(d.patent_count || 0));
    const metricField = activeMetricField();
    const totalMetric = d3.sum(rows || [], (row) => metricValue(row, metricField));
    const metricText = metricField === "patent_count"
      ? `${formatNumber(totalPatents)} ${metricLabel(state.scope)}.`
      : `${formatNumber(totalMetric)} ${metricFieldLabel(metricField)}; ${formatNumber(totalPatents)} patents.`;
    const bits = [`${rows.length.toLocaleString()} ${label}; ${metricText}`];
    const companyCoverage = state.companyGeo?.coverage?.[state.scope];
    if (companyCoverage && state.scope === "assignee") {
      bits.push(
        `Assignee office locations come from the assignee address on the patent record and are resolved for ${formatPct(companyCoverage.resolved_patent_share_pct)} of patents in the current assignee-ID evidence linked to this company.`,
      );
      bits.push("A patent can appear in multiple places when multiple assignee offices are listed.");
    } else if (companyCoverage && state.scope === "inventor") {
      bits.push(
        `Inventor locations come from inventor addresses on the patent record and are resolved for ${formatPct(companyCoverage.resolved_patent_share_pct)} of inventor-linked patents in this company layer.`,
      );
      bits.push("A patent can appear in multiple places when inventors are listed in different locations.");
    }
    if (state.scope === "assignee") {
      const assigneePatents = Number(state.companyGeo?.coverage?.assignee?.patent_count || 0);
      const inventorPatents = Number(state.companyGeo?.coverage?.inventor?.patent_count || 0);
      if (assigneePatents > 0 && inventorPatents > 0 && (assigneePatents / inventorPatents) < 0.5) {
        bits.push(
          `Assignee office geography is sparse in the current artifact (${formatNumber(assigneePatents)} assignee-linked patents versus ${formatNumber(inventorPatents)} inventor-linked patents), so office counts can understate the firm's full patent footprint.`,
        );
      }
    }
    return bits.join(" ");
  }

  function renderLegend(backgroundText, overlayText) {
    const backgroundLabel = state.background
      ? backgroundText
      : "Background density hidden. Geographic boundaries remain visible for context.";
    legendEl.innerHTML =
      `<span class="geo-legend-chip geo-legend-chip-bg"></span>${backgroundLabel}` +
      `<span class="geo-legend-chip geo-legend-chip-fg geo-legend-chip-${state.scope}"></span>${overlayText}`;
  }

  function sizeLegendValues(metricField = pointMetricField(), radiusMode = "locations") {
    if (metricField === "location_count") {
      return radiusMode === "city" ? [1, 3, 8] : [1];
    }
    if (metricField === "inventor_count") {
      return radiusMode === "city" ? [1, 10, 80] : [1, 12, 100];
    }
    if (state.scope === "assignee") {
      return radiusMode === "city" ? [1, 100, 2000] : [1, 120, 2500];
    }
    return radiusMode === "city" ? [1, 20, 200] : [1, 25, 250];
  }

  function renderScale(options = {}) {
    const metricField = options.metricField || pointMetricField();
    const metric = pointMetricLabel(metricField);
    const overlayLabel = state.scope === "inventor" ? "inventor layer" : "assignee office layer";
    const level = activeLevel();
    const isPointView = !!options.isPointView;
    const colorNote = `Color intensity = ${metric}. Darker ${state.scope === "inventor" ? "red" : "blue"} means more ${metric} in the selected ${overlayLabel}.`;
    const worldBackgroundNote = state.region === "world"
      ? ` White countries mean no ${backgroundMetricLabel(metricField).toLowerCase()}; positive countries use stepped gray bins based on log density.`
      : "";

    if (!isPointView) {
      scaleEl.innerHTML =
        `<div class="geo-scale-row">` +
          `<div class="geo-scale-note">${colorNote} Polygon color is comparable across firms within the same geography level.${worldBackgroundNote}</div>` +
        `</div>`;
      return;
    }

    const radiusMode = options.radiusMode === "city" ? "city" : "locations";
    const radiusRange = options.radiusRange || [0.2, 14];
    const radiusScale = pointRadiusScale(radiusRange, radiusMode, metricField);
    const sizeSteps = sizeLegendValues(metricField, radiusMode)
      .map((value) =>
        `<div class="geo-size-step">` +
          `<span class="geo-size-dot geo-size-dot-${state.scope}" style="width:${(radiusScale(value) * 2).toFixed(2)}px; height:${(radiusScale(value) * 2).toFixed(2)}px;"></span>` +
          `<span class="geo-size-label">${formatNumber(value)}</span>` +
        `</div>`
      ).join("");
    const sizeNote = (metricField === "location_count" && radiusMode === "locations")
      ? `Color intensity = ${metric}. Exact office-location views use one office per point, so circle size stays uniform.${worldBackgroundNote}`
      : `${colorNote} Circle size = ${metric}. Circle radii are comparable across firms within ${level === "city" ? "city" : "exact-location"} views.${worldBackgroundNote}`;

    scaleEl.innerHTML =
      `<div class="geo-scale-row">` +
        `<div class="geo-scale-note">${sizeNote}</div>` +
      `</div>` +
      (sizeSteps ? `<div class="geo-size-legend">${sizeSteps}</div>` : "");
  }

  function assigneeContributorNote(row) {
    if (state.scope !== "assignee") return "";
    const contributors = row.top_assignees || [];
    if (!contributors.length) return "";
    const label = contributors
      .slice(0, 3)
      .map((entry) => `${entry.assignee_name || entry.curated_organization || entry.assignee_id} (${formatNumber(entry.patent_count)})`)
      .join("; ");
    return `<div class="geo-tooltip-note">Assignee names at this location: ${label}</div>`;
  }

  function drawWorldCountries(svg, features, backgroundRows, companyRows) {
    drawWorldOcean(svg);
    const projection = d3.geoNaturalEarth1().fitExtent([[margin, margin], [width - margin, height - margin]], cache.worldFeatures.land || toFeatureCollection(features));
    const path = d3.geoPath(projection);
    const metricField = activeMetricField();
    const backgroundMetricRows = backgroundRowsForMetric(backgroundRows, metricField);
    const backgroundById = worldLayerCountsMap(backgroundMetricRows);
    const companyById = worldLayerCountsMap(companyRows);
    const countryOverlayUpperQuantile = companyRows.length <= 12 ? 1 : 0.985;
    const overlayColors = state.scope === "inventor"
      ? ["#fffaf8", "#f7d6cc", "#eca282", "#c44a30", "#7a231a"]
      : colorRange(state.scope);
    const backgroundFill = steppedValueColorScale(
      backgroundMetricRows,
      "_background_metric",
      ["#ededed", "#2f2f2f"],
      {
        zeroColor: "#ffffff",
        transformFn: (value) => Math.log1p(value),
        easing: 1.85,
        steps: 18,
      },
    );
    const overlayFill = overlayColorScale(companyRows, metricField, overlayColors, {
      transformFn: (value) => Math.log1p(value),
      upperQuantile: state.scope === "inventor" ? 1 : countryOverlayUpperQuantile,
      easing: state.scope === "inventor" ? (metricField === "inventor_count" ? 1.55 : 1.72) : (metricField === "location_count" ? 1.08 : 0.96),
      minTint: state.scope === "inventor" ? 0.015 : (metricField === "location_count" ? 0.03 : 0.08),
    });

    const backgroundAreas = svg.append("g")
      .selectAll("path")
      .data(features)
      .join("path")
      .attr("d", path)
      .attr("fill", (feature) => {
        if (!state.background) return "#ffffff";
        const row = worldFeatureRow(backgroundById, feature);
        return row ? backgroundFill(row._background_metric) : "#ffffff";
      })
      .attr("stroke", state.background ? "#d5d5d5" : "#d0d0d0")
      .attr("stroke-width", state.background ? 0.6 : 0.7);

    if (state.background) {
      backgroundAreas
        .on("mousemove", (evt, feature) => {
          const row = worldFeatureRow(backgroundById, feature);
          const name = feature.properties?.label || feature.properties?.name || "Country";
          if (!row) {
            showTooltip(evt, `<div class="geo-tooltip-title">${name}</div><div class="geo-tooltip-note">No overall density in full PatentsView.</div>`);
            return;
          }
          showTooltip(
            evt,
            `<div class="geo-tooltip-title">${displayCountryName(row.country_name, row.country_alpha2) || name}</div>` +
              `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
              `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
          );
        })
        .on("mouseleave", hideTooltip);
    } else {
      backgroundAreas.attr("pointer-events", "none");
    }

    svg.append("g")
      .selectAll("path")
      .data(features.filter((feature) => !!worldFeatureRow(companyById, feature)))
      .join("path")
      .attr("class", "geo-overlay-area")
      .attr("d", path)
      .attr("fill", (feature) => {
        const row = worldFeatureRow(companyById, feature);
        return overlayFill(metricValue(row, metricField));
      })
      .attr("fill-opacity", 0.86)
      .attr("stroke", overlayStrokeColor(state.scope))
      .attr("stroke-width", 0.8)
      .on("mousemove", (evt, feature) => {
        const row = worldFeatureRow(companyById, feature);
        const name = displayCountryName(row?.country_name || feature.properties?.label || feature.properties?.name, row?.country_alpha2 || feature.properties?.country_alpha2);
        if (!row) return;
        showTooltip(
          evt,
          `<div class="geo-tooltip-title">${name}</div>` +
            overlayTooltipBody(row)
        );
      })
      .on("mouseleave", hideTooltip);

    summaryEl.textContent = buildSummary(companyRows, "countries");
    renderLegend(
      backgroundLegendText("country", metricField),
      `Overlay: selected company's ${scopeLabel(state.scope)} aggregated to countries and shaded by ${metricFieldLabel(metricField)}.`,
    );
    renderScale({ isPointView: false, metricField });
  }

  function drawWorldCities(svg, points, backgroundRows) {
    drawWorldOcean(svg);
    const { countries, land } = cache.worldFeatures;
    const projection = d3.geoNaturalEarth1().fitExtent([[margin, margin], [width - margin, height - margin]], land || toFeatureCollection(countries));
    const path = d3.geoPath(projection);
    const metricField = pointMetricField();
    const backgroundMetricRows = backgroundRowsForMetric(backgroundRows, metricField);
    const backgroundById = worldLayerCountsMap(backgroundMetricRows);
    const backgroundFill = steppedValueColorScale(
      backgroundMetricRows,
      "_background_metric",
      ["#ededed", "#2f2f2f"],
      {
        zeroColor: "#ffffff",
        transformFn: (value) => Math.log1p(value),
        easing: 1.85,
        steps: 18,
      },
    );
    const plotted = points;
    const radiusRange = state.scope === "assignee" ? [0.75, 16] : [0.18, 15.2];
    const pointStyle = overlayPointStyler(
      plotted,
      colorRange(state.scope),
      radiusRange,
      "city",
      metricField,
    );

    const backgroundAreas = svg.append("g")
      .selectAll("path")
      .data(countries)
      .join("path")
      .attr("class", "geo-bg-country")
      .attr("d", path)
      .attr("fill", (feature) => {
        if (!state.background) return "#ffffff";
        const row = worldFeatureRow(backgroundById, feature);
        return row ? backgroundFill(row._background_metric) : "#ffffff";
      })
      .attr("stroke", state.background ? "#d5d5d5" : "#d0d0d0")
      .attr("stroke-width", state.background ? 0.6 : 0.7);

    if (state.background) {
      backgroundAreas
        .on("mousemove", (evt, feature) => {
          const row = worldFeatureRow(backgroundById, feature);
          const name = feature.properties?.label || feature.properties?.name || "Country";
          if (!row) {
            showTooltip(evt, `<div class="geo-tooltip-title">${name}</div><div class="geo-tooltip-note">No overall density in full PatentsView.</div>`);
            return;
          }
          showTooltip(
            evt,
            `<div class="geo-tooltip-title">${displayCountryName(row.country_name, row.country_alpha2) || name}</div>` +
              `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
              `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
          );
        })
        .on("mouseleave", hideTooltip);
    } else {
      backgroundAreas.attr("pointer-events", "none");
    }

    svg.append("g")
      .selectAll("circle")
      .data(plotted)
      .join("circle")
      .attr("class", "geo-overlay-point")
      .attr("cx", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[0] ?? -999)
      .attr("cy", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[1] ?? -999)
      .attr("r", (row) => pointStyle.radius(metricValue(row, metricField)))
      .attr("fill", (row) => pointStyle.fill(metricValue(row, metricField)))
      .attr("fill-opacity", (row) => pointStyle.opacity(metricValue(row, metricField)))
      .attr("stroke", (row) => pointStyle.stroke(metricValue(row, metricField)))
      .attr("stroke-width", (row) => pointStyle.strokeWidth(metricValue(row, metricField)))
      .on("mousemove", (evt, row) => {
        const title = `${row.city}${row.state ? `, ${row.state}` : ""}, ${row.country_alpha2}`;
        showTooltip(
          evt,
          `<div class="geo-tooltip-title">${title}</div>` +
            overlayTooltipBody(
              row,
              `<div class="geo-tooltip-note">Aggregates ${formatNumber(row.location_count)} exact location${Number(row.location_count) === 1 ? "" : "s"}.</div>`
            )
        );
      })
      .on("mouseleave", hideTooltip);

    summaryEl.textContent = buildSummary(plotted, "cities");
    renderLegend(
      backgroundLegendText("country", metricField),
      `Overlay: selected company's ${scopeLabel(state.scope)} aggregated to cities, with color and circle size driven by ${metricFieldLabel(metricField)}.`,
    );
    renderScale({ isPointView: true, metricField, radiusMode: "city", radiusRange });
  }

  function renderWorld(svg) {
    const { countries, land } = cache.worldFeatures;
    const layer = companyLayerRows();
    const { points, rollups } = layer;
    const backgroundRows = backgroundCountsForView();
    if (state.worldLevel === "country") {
      drawWorldCountries(svg, countries, backgroundRows, rollups.country || []);
      return;
    }
    if (state.worldLevel === "city") {
      drawWorldCities(svg, layerWorldCityRows(layer), backgroundRows);
      return;
    }
    drawWorldOcean(svg);
    const projection = d3.geoNaturalEarth1().fitExtent([[margin, margin], [width - margin, height - margin]], land || toFeatureCollection(countries));
    const path = d3.geoPath(projection);
    const metricField = pointMetricField();
    const backgroundMetricRows = backgroundRowsForMetric(backgroundRows, metricField);
    const backgroundById = worldLayerCountsMap(backgroundMetricRows);
    const backgroundFill = steppedValueColorScale(
      backgroundMetricRows,
      "_background_metric",
      ["#ededed", "#2f2f2f"],
      {
        zeroColor: "#ffffff",
        transformFn: (value) => Math.log1p(value),
        easing: 1.85,
        steps: 18,
      },
    );
    const overlayPoints = layerWorldPoints(layer);
    const radiusRange = state.scope === "assignee" ? [0.7, 17] : [0.12, 15.6];
    const pointStyle = overlayPointStyler(
      overlayPoints,
      colorRange(state.scope),
      radiusRange,
      "locations",
      metricField,
    );

    const backgroundAreas = svg.append("g")
      .selectAll("path")
      .data(countries)
      .join("path")
      .attr("class", "geo-bg-country")
      .attr("d", path)
      .attr("fill", (feature) => {
        if (!state.background) return "#ffffff";
        const row = worldFeatureRow(backgroundById, feature);
        return row ? backgroundFill(row._background_metric) : "#ffffff";
      })
      .attr("stroke", state.background ? "#d5d5d5" : "#d0d0d0")
      .attr("stroke-width", state.background ? 0.6 : 0.7);

    if (state.background) {
      backgroundAreas
        .on("mousemove", (evt, feature) => {
          const row = worldFeatureRow(backgroundById, feature);
          if (!row) {
            showTooltip(evt, `<div class="geo-tooltip-title">${feature.properties?.label || feature.properties?.name || "Country"}</div><div class="geo-tooltip-note">No overall density in full PatentsView.</div>`);
            return;
          }
          showTooltip(
            evt,
            `<div class="geo-tooltip-title">${displayCountryName(row.country_name, row.country_alpha2)}</div>` +
              `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
              `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
          );
        })
        .on("mouseleave", hideTooltip);
    } else {
      backgroundAreas.attr("pointer-events", "none");
    }

    svg.append("g")
      .selectAll("circle")
      .data(overlayPoints)
      .join("circle")
      .attr("class", "geo-overlay-point")
      .attr("cx", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[0] ?? -999)
      .attr("cy", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[1] ?? -999)
      .attr("r", (row) => pointStyle.radius(metricValue(row, metricField)))
      .attr("fill", (row) => pointStyle.fill(metricValue(row, metricField)))
      .attr("fill-opacity", (row) => pointStyle.opacity(metricValue(row, metricField)))
      .attr("stroke", (row) => pointStyle.stroke(metricValue(row, metricField)))
      .attr("stroke-width", (row) => pointStyle.strokeWidth(metricValue(row, metricField)))
      .on("mousemove", (evt, row) => {
        showTooltip(
          evt,
          `<div class="geo-tooltip-title">${row.city ? `${row.city}, ${row.state ? `${row.state}, ` : ""}${row.country_alpha2}` : displayCountryName(row.country_name, row.country_alpha2)}</div>` +
            overlayTooltipBody(row, assigneeContributorNote(row))
        );
      })
      .on("mouseleave", hideTooltip);

    summaryEl.textContent = buildSummary(overlayPoints, "exact locations");
    renderLegend(
      backgroundLegendText("country", metricField),
      `Overlay: selected company's ${scopeLabel(state.scope)} exact locations, with color and circle size driven by ${metricFieldLabel(metricField)}.`,
    );
    renderScale({ isPointView: true, metricField, radiusMode: "locations", radiusRange });
  }

  function usProjection(featureCollection) {
    return d3.geoAlbersUsa().fitExtent([[margin, margin], [width - margin, height - margin]], featureCollection);
  }

  function drawUsStateContext(svg, path) {
    svg.append("path")
      .datum(cache.usFeatures.nation)
      .attr("d", path)
      .attr("fill", "#fafafa")
      .attr("stroke", "#d8d8d8")
      .attr("stroke-width", 0.7);
    svg.append("g")
      .selectAll("path")
      .data(cache.usFeatures.states)
      .join("path")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#d0d0d0")
      .attr("stroke-width", 0.65)
      .attr("pointer-events", "none");
  }

  function drawUsStateLabels(svg, path) {
    const excludedTerritories = new Set(["60", "66", "69", "72", "78"]);
    const labelFeatures = (cache.usFeatures.states || []).filter((feature) => {
      const stateFips = String(feature?.id || feature?.properties?.state_fips || "").trim();
      const abbr = String(feature?.properties?.abbr || "").trim().toUpperCase();
      return abbr && !excludedTerritories.has(stateFips);
    });

    svg.append("g")
      .attr("class", "geo-state-label-layer")
      .attr("pointer-events", "none")
      .selectAll("text")
      .data(labelFeatures)
      .join("text")
      .attr("class", "geo-state-label")
      .attr("x", (feature) => path.centroid(feature)?.[0] ?? -999)
      .attr("y", (feature) => path.centroid(feature)?.[1] ?? -999)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 9.5)
      .attr("font-weight", 600)
      .attr("letter-spacing", "0.08em")
      .attr("fill", "rgba(60, 56, 51, 0.68)")
      .attr("stroke", "rgba(255, 255, 255, 0.92)")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text((feature) => String(feature?.properties?.abbr || "").trim().toUpperCase());
  }

  function drawUsPolygons(svg, features, backgroundRows, keyField, companyRows, labelField) {
    const projection = usProjection(toFeatureCollection(features));
    const path = d3.geoPath(projection);
    const metricField = activeMetricField();
    const backgroundMetricRows = backgroundRowsForMetric(backgroundRows, metricField);
    const backgroundById = layerCountsMap(backgroundMetricRows, keyField);
    const companyById = layerCountsMap(companyRows, keyField);
    const backgroundFill = colorScale(backgroundMetricRows, "_background_metric", ["#f4f4f4", "#6f6f6f"]);
    const overlayColors = state.scope === "inventor"
      ? ["#fffaf8", "#f7d6cc", "#eca282", "#c44a30", "#7a231a"]
      : colorRange(state.scope);
    const inventorPolygonScale = keyField === "county_fips"
      ? { upperQuantile: 0.992, easing: 1.92, minTint: 0.004 }
      : keyField === "cz_id"
        ? { upperQuantile: 0.996, easing: 1.7, minTint: 0.008 }
        : { upperQuantile: 0.998, easing: 1.5, minTint: 0.01 };
    const defaultPolygonScale = keyField === "state_fips"
      ? { upperQuantile: 1, easing: 1.18, minTint: 0.015 }
      : { upperQuantile: 1, easing: 1.36, minTint: 0.015 };
    const polygonScale = state.scope === "inventor" ? inventorPolygonScale : defaultPolygonScale;
    const overlayFill = overlayColorScale(companyRows, metricField, overlayColors, {
      transformFn: (value) => Math.log1p(value),
      upperQuantile: polygonScale.upperQuantile,
      easing: state.scope === "inventor" && metricField === "inventor_count" ? Math.max(1.28, polygonScale.easing - 0.18) : (metricField === "location_count" ? 1.08 : polygonScale.easing),
      minTint: metricField === "location_count" ? 0.03 : polygonScale.minTint,
    });
    const overlayOpacity = scaleForRows(companyRows, metricField, [0.76, 0.96]);
    const overlayStrokeWidth = scaleForRows(companyRows, metricField, [0.55, 1.08]);

    const backgroundAreas = svg.append("g")
      .selectAll("path")
      .data(features)
      .join("path")
      .attr("d", path)
      .attr("fill", (feature) => {
        if (!state.background) return "#fafafa";
        const row = backgroundById.get(String(feature.id || feature.properties?.cz_id || ""));
        return row ? backgroundFill(Number(row._background_metric || 0)) : "#f8f8f8";
      })
      .attr("stroke", state.background ? "#d6d6d6" : "#d0d0d0")
      .attr("stroke-width", state.background ? 0.5 : 0.7);

    if (state.background) {
      backgroundAreas
        .on("mousemove", (evt, feature) => {
          const key = String(feature.id || feature.properties?.cz_id || "");
          const row = backgroundById.get(key);
          const name = polygonLabel(feature, row, labelField) || `Area ${key}`;
          if (!row) {
            showTooltip(evt, `<div class="geo-tooltip-title">${name}</div><div class="geo-tooltip-note">No overall density in full PatentsView.</div>`);
            return;
          }
          showTooltip(
            evt,
            `<div class="geo-tooltip-title">${name}</div>` +
              `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
              `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
          );
        })
        .on("mouseleave", hideTooltip);
    } else {
      backgroundAreas.attr("pointer-events", "none");
    }

    svg.append("g")
      .selectAll("path")
      .data(features.filter((feature) => companyById.has(String(feature.id || feature.properties?.cz_id || ""))))
      .join("path")
      .attr("class", "geo-overlay-area")
      .attr("d", path)
      .attr("fill", (feature) => {
        const row = companyById.get(String(feature.id || feature.properties?.cz_id || ""));
        return overlayFill(metricValue(row, metricField));
      })
      .attr("fill-opacity", (feature) => {
        const row = companyById.get(String(feature.id || feature.properties?.cz_id || ""));
        return overlayOpacity(metricValue(row, metricField));
      })
      .attr("stroke", overlayStrokeColor(state.scope))
      .attr("stroke-width", (feature) => {
        const row = companyById.get(String(feature.id || feature.properties?.cz_id || ""));
        return overlayStrokeWidth(metricValue(row, metricField));
      })
      .on("mousemove", (evt, feature) => {
        const row = companyById.get(String(feature.id || feature.properties?.cz_id || ""));
        const name = polygonLabel(feature, row, labelField);
        if (!row) return;
        showTooltip(
          evt,
          `<div class="geo-tooltip-title">${name}</div>` +
            overlayTooltipBody(row)
        );
      })
      .on("mouseleave", hideTooltip);

    drawUsStateLabels(svg, path);

    summaryEl.textContent = buildSummary(companyRows, state.usLevel.replace("_", " "));
    renderLegend(
      backgroundLegendText(state.usLevel.replace("_", " "), metricField),
      `Overlay: selected company's ${scopeLabel(state.scope)} aggregated to ${state.usLevel.replace("_", " ")} and shaded by ${metricFieldLabel(metricField)}.`,
    );
    renderScale({ isPointView: false, metricField });
  }

  function drawUsPoints(svg, points, backgroundRows, useCityRollup) {
    const projection = usProjection(cache.usFeatures.nation);
    const path = d3.geoPath(projection);
    const counties = cache.usFeatures.counties;
    const metricField = pointMetricField();
    const backgroundMetricRows = backgroundRowsForMetric(backgroundRows, metricField);

    if (state.background) {
      if (useCityRollup) {
        const bgPoints = (backgroundMetricRows || []).filter((row) => row.latitude != null && row.longitude != null);
        const bgRadius = scaleForRows(bgPoints, "_background_metric", [1.4, 10]);
        const bgFill = colorScale(bgPoints, "_background_metric", ["#efefef", "#707070"]);
        svg.append("path")
          .datum(cache.usFeatures.nation)
          .attr("d", path)
          .attr("fill", "#fafafa")
          .attr("stroke", "#dedede")
          .attr("stroke-width", 0.7);
        svg.append("g")
          .selectAll("circle")
          .data(bgPoints)
          .join("circle")
          .attr("cx", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[0] ?? -999)
          .attr("cy", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[1] ?? -999)
          .attr("r", (row) => bgRadius(Number(row._background_metric || 0)))
          .attr("fill", (row) => bgFill(Number(row._background_metric || 0)))
          .attr("fill-opacity", 0.38)
          .attr("stroke", "none")
          .on("mousemove", (evt, row) => {
            showTooltip(
              evt,
              `<div class="geo-tooltip-title">${row.city}, ${row.state || ""}</div>` +
                `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
                `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
            );
          })
          .on("mouseleave", hideTooltip);
      } else {
        const backgroundById = layerCountsMap(backgroundMetricRows, "county_fips");
        const backgroundFill = colorScale(backgroundMetricRows, "_background_metric", ["#f4f4f4", "#747474"]);
        svg.append("g")
          .selectAll("path")
          .data(counties)
          .join("path")
          .attr("d", path)
          .attr("fill", (feature) => {
            const row = backgroundById.get(String(feature.id || ""));
            return row ? backgroundFill(Number(row._background_metric || 0)) : "#f8f8f8";
          })
          .attr("stroke", "#dedede")
          .attr("stroke-width", 0.35)
          .on("mousemove", (evt, feature) => {
            const row = backgroundById.get(String(feature.id || ""));
            const name = feature.properties?.name || "County";
            if (!row) {
              showTooltip(evt, `<div class="geo-tooltip-title">${name}</div><div class="geo-tooltip-note">No overall density in full PatentsView.</div>`);
              return;
            }
            showTooltip(
              evt,
              `<div class="geo-tooltip-title">${row.county || name}, ${row.state || ""}</div>` +
                `<div class="geo-tooltip-row"><span>${overallPatentLabel()}</span><span>${formatNumber(row.patent_count)}</span></div>` +
                `<div class="geo-tooltip-row"><span>${overallInventorLabel()}</span><span>${formatNumber(overallSecondaryValue(row))}</span></div>`
            );
          })
          .on("mouseleave", hideTooltip);
      }
    } else {
      drawUsStateContext(svg, path);
    }

    const plotted = (points || []).filter((row) => row.latitude != null && row.longitude != null);
    const radiusRange = useCityRollup
      ? (state.scope === "assignee" ? [1.9, 17] : [0.18, 15.2])
      : (state.scope === "assignee" ? [1.7, 15] : [0.14, 14.2]);
    const pointStyle = overlayPointStyler(
      plotted,
      colorRange(state.scope),
      radiusRange,
      useCityRollup ? "city" : "locations",
      metricField,
    );

    svg.append("g")
      .selectAll("circle")
      .data(plotted)
      .join("circle")
      .attr("cx", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[0] ?? -999)
      .attr("cy", (row) => projection([Number(row.longitude), Number(row.latitude)])?.[1] ?? -999)
      .attr("r", (row) => pointStyle.radius(metricValue(row, metricField)))
      .attr("fill", (row) => pointStyle.fill(metricValue(row, metricField)))
      .attr("fill-opacity", (row) => pointStyle.opacity(metricValue(row, metricField)))
      .attr("stroke", (row) => pointStyle.stroke(metricValue(row, metricField)))
      .attr("stroke-width", (row) => pointStyle.strokeWidth(metricValue(row, metricField)))
      .on("mousemove", (evt, row) => {
        const title = row.city ? `${row.city}, ${row.state || ""}` : `${row.county || "Location"}, ${row.state || ""}`;
        showTooltip(
          evt,
          `<div class="geo-tooltip-title">${title}</div>` +
            overlayTooltipBody(row, assigneeContributorNote(row))
        );
      })
      .on("mouseleave", hideTooltip);

    drawUsStateLabels(svg, path);

    summaryEl.textContent = buildSummary(plotted, useCityRollup ? "cities" : "exact US locations");
    renderLegend(
      useCityRollup
        ? backgroundLegendText("city", metricField)
        : backgroundLegendText("county", metricField),
      useCityRollup
        ? `Overlay: selected company's ${scopeLabel(state.scope)} aggregated to cities, with color and circle size driven by ${metricFieldLabel(metricField)}.`
        : `Overlay: selected company's ${scopeLabel(state.scope)} exact locations, with color and circle size driven by ${metricFieldLabel(metricField)}.`,
    );
    renderScale({ isPointView: true, metricField, radiusMode: useCityRollup ? "city" : "locations", radiusRange });
  }

  function renderUs(svg) {
    const layer = companyLayerRows();
    const { points, rollups } = layer;
    const backgroundRows = backgroundCountsForView();
    if (state.usLevel === "locations") {
      drawUsPoints(svg, layerUsPoints(layer), backgroundRows, false);
      return;
    }
    if (state.usLevel === "city") {
      drawUsPoints(svg, (rollups.city || []), backgroundRows, true);
      return;
    }
    if (state.usLevel === "state") {
      drawUsPolygons(svg, cache.usFeatures.states, backgroundRows, "state_fips", rollups.state || [], "state");
      return;
    }
    if (state.usLevel === "county") {
      drawUsPolygons(svg, cache.usFeatures.counties, backgroundRows, "county_fips", rollups.county || [], "county");
      return;
    }
    if (state.usLevel === "commuting_zone") {
      drawUsPolygons(svg, cache.czGeo.features || [], backgroundRows, "cz_id", rollups.commuting_zone || [], "cz_label");
      return;
    }
  }

  function updateAlert() {
    const message = assigneeCoverageAlertText();
    alertEl.hidden = !message;
    alertEl.textContent = message;
  }

  function updateControls() {
    const worldLevels = new Set(["locations", "city", "country"]);
    const usLevels = new Set(["locations", "city", "state", "county", "commuting_zone"]);
    const currentLevel = activeLevel();
    showControls.querySelectorAll("[data-geo-show]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.geoShow === activeShowMode());
    });
    regionControls.querySelectorAll("[data-geo-region]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.geoRegion === state.region);
    });
    usLevelControls.querySelectorAll("[data-geo-level]").forEach((btn) => {
      const level = btn.dataset.geoLevel;
      const enabled = state.region === "world" ? worldLevels.has(level) : usLevels.has(level);
      btn.classList.toggle("is-active", enabled && level === currentLevel);
      btn.disabled = !enabled;
      btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
    usLevelControls.classList.remove("is-disabled");
    detailLabelEl.textContent = state.region === "world" ? "World detail" : "US detail";
    backgroundToggle.checked = state.background;
    updateAlert();
  }

  function clearSvg() {
    d3.select(svgEl).selectAll("*").remove();
  }

  function render() {
    updateControls();
    clearSvg();
    hideTooltip();
    const svg = d3.select(svgEl)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("isolation", "isolate")
      .style("background", "#ffffff");

    if (!state.companyGeo) {
      showStatus("Load a company to view geography.");
      summaryEl.textContent = "";
      legendEl.textContent = "";
      scaleEl.textContent = "";
      emitChange();
      return;
    }

    showStatus("");
    if (state.region === "world") {
      renderWorld(svg);
      emitChange();
      return;
    }
    renderUs(svg);
    emitChange();
  }

  async function renderForCompany(company, slug) {
    const loadToken = ++resourceLoadToken;
    state.company = company;
    state.slug = slug;
    showStatus("Loading geography...");
    try {
      const [companyGeo] = await Promise.all([
        loadCompanyGeo(slug),
        ensureResourcesForCurrentView(),
      ]);
      if (loadToken !== resourceLoadToken) return;
      state.companyGeo = companyGeo;
      render();
    } catch (err) {
      if (loadToken !== resourceLoadToken) return;
      console.error(err);
      state.companyGeo = null;
      showStatus("Geography artifacts are not available yet for this company.");
      summaryEl.textContent = "";
      legendEl.textContent = "";
      scaleEl.textContent = "";
      clearSvg();
      emitChange();
    }
  }

  showControls.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-geo-show]");
    if (!btn) return;
    setView({ showMode: btn.dataset.geoShow });
  });

  regionControls.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-geo-region]");
    if (!btn) return;
    setView({ region: btn.dataset.geoRegion });
  });

  usLevelControls.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-geo-level]");
    if (!btn || btn.disabled) return;
    setView({ level: btn.dataset.geoLevel });
  });

  backgroundToggle.addEventListener("change", () => {
    setView({ background: backgroundToggle.checked });
  });
  svgEl.addEventListener("mouseleave", hideTooltip);
  updateControls();
  showStatus("Load a company to view geography.");
  scaleEl.textContent = "";
  emitChange();
  window.CompanyGeoMap = { renderForCompany, subscribe, setView, getViewState: currentViewState };
})();

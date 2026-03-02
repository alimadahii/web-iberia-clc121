require([
  "esri/WebMap",
  "esri/views/MapView",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Search",
  "esri/widgets/BasemapToggle"
], function (
  WebMap, MapView,
  LayerList, Legend, Search, BasemapToggle
) {

  const WEBMAP_ID = window.__WEBMAP_ID__;

  // --- UI refs
  const dvFilterEl = document.getElementById("dvFilter");
  const nameSearchEl = document.getElementById("nameSearch");
  const d121MinEl = document.getElementById("d121Min");
  const d121MaxEl = document.getElementById("d121Max");
  const btnApply = document.getElementById("btnApply");
  const btnClear = document.getElementById("btnClear");

  const tableMeta = document.getElementById("tableMeta");
  const attrBody = document.getElementById("attrBody");

  const widgetsDiv = document.getElementById("widgetsDiv");

  // ✅ Your requested table fields (in this exact order)
  const TABLE_FIELDS = [
    "NAME_6",
    "NAME_3",
    "ElavationM",
    "Slope",
    "River_Near",
    "CoastLine",
    "PortDist_K",
    "AirportNea",
    "PoP05",
    "HighwayDis",
    "RailD2010_",
    "Insularity",
    "Capital",
    "MeanPrec",
    "MeanTemp",
    "Border",
    "FreeSoil_3",
    "LU_121_201",
    "AGRI_2006",
    "FOREST_201",
    "WATER_2006",
    "Dist_Close",
    "DV121",
    "D121PCT"
  ];

  // --- Load WebMap
  const webmap = new WebMap({
    portalItem: { id: WEBMAP_ID }
  });

  const view = new MapView({
    container: "viewDiv",
    map: webmap
  });

  let layerAllData = null;

  // -------------------------
  // Helpers
  // -------------------------
  function flattenLayers(layerCollection) {
    const out = [];
    layerCollection.forEach((lyr) => {
      out.push(lyr);
      if (lyr.layers && lyr.layers.length) out.push(...flattenLayers(lyr.layers));
    });
    return out;
  }

  function sqlQuote(s) {
    return String(s).replace(/'/g, "''");
  }

  function getFieldNameSet(layer) {
    const set = new Set();
    (layer?.fields || []).forEach(f => set.add(f.name));
    return set;
  }

  // Only keep existing fields to avoid query failures
  function filterExistingFields(layer, fields) {
    const nameSet = getFieldNameSet(layer);
    const existing = fields.filter(f => nameSet.has(f));
    const missing = fields.filter(f => !nameSet.has(f));
    return { existing, missing };
  }

  function buildWhere() {
    const clauses = [];

    const dvVal = dvFilterEl.value;
    if (dvVal === "0" || dvVal === "1") clauses.push(`DV121 = ${dvVal}`);

    const nameTxt = nameSearchEl.value.trim();
    if (nameTxt) {
      // Since you requested NAME_6, we filter on NAME_6 only
      clauses.push(`UPPER(NAME_6) LIKE '%${sqlQuote(nameTxt.toUpperCase())}%'`);
    }

    const minVal = d121MinEl.value !== "" ? Number(d121MinEl.value) : null;
    const maxVal = d121MaxEl.value !== "" ? Number(d121MaxEl.value) : null;

    if (minVal !== null && !Number.isNaN(minVal)) clauses.push(`D121KM2 >= ${minVal}`);
    if (maxVal !== null && !Number.isNaN(maxVal)) clauses.push(`D121KM2 <= ${maxVal}`);

    return clauses.length ? clauses.join(" AND ") : "1=1";
  }

  function setLoading(msg) {
    tableMeta.textContent = msg || "Loading...";
    attrBody.innerHTML = "";
  }

  function setError(msg) {
    tableMeta.innerHTML = `<div style="color:#b91c1c;font-weight:700;">${msg}</div>`;
  }

  // -------------------------
  // ✅ Build table header dynamically from TABLE_FIELDS
  // -------------------------
  function rebuildTableHeader(existingFields) {
    const theadRow = document.querySelector("#attrTable thead tr");
    if (!theadRow) return;

    theadRow.innerHTML = existingFields.map(f => `<th>${f}</th>`).join("");
  }

  // -------------------------
  // Table logic
  // -------------------------
  async function refreshTableSample() {
    if (!layerAllData) {
      setError("Layer 'Iberian_Peninsula_AllData' not found in WebMap (check title).");
      return;
    }

    await layerAllData.load();

    const { existing, missing } = filterExistingFields(layerAllData, TABLE_FIELDS);

    if (!existing.length) {
      setError("None of the requested fields exist on this layer. Check field names.");
      return;
    }

    // rebuild header based on existing fields only
    rebuildTableHeader(existing);

    setLoading("Loading...");

    try {
      const q = layerAllData.createQuery();
      q.where = layerAllData.definitionExpression || "1=1";
      q.outFields = existing;        // ✅ only your fields (that exist)
      q.returnGeometry = true;
      q.num = 200;

      // extent filter off for stability; can enable later
      // q.geometry = view.extent;
      // q.spatialRelationship = "intersects";

      const res = await layerAllData.queryFeatures(q);

      const missTxt = missing.length ? ` | Missing fields: ${missing.join(", ")}` : "";
      tableMeta.textContent = `Showing ${res.features.length} features (sample)${missTxt}`;

      if (!res.features.length) {
        attrBody.innerHTML = `
          <tr><td colspan="${existing.length}" style="padding:10px;color:#6b7280;">
            No rows returned. (Try Clear filters)
          </td></tr>
        `;
        return;
      }

      attrBody.innerHTML = "";
      res.features.forEach((f) => {
        const a = f.attributes || {};
        const tr = document.createElement("tr");

        tr.innerHTML = existing.map(fn => `<td>${a[fn] ?? ""}</td>`).join("");

        tr.addEventListener("click", async () => {
          if (f.geometry) await view.goTo({ target: f.geometry, scale: 200000 });
          view.openPopup({ features: [f], location: f.geometry?.extent?.center || view.center });
        });

        attrBody.appendChild(tr);
      });

    } catch (err) {
      console.error(err);
      setError(`Query failed: ${err?.message || err}`);
    }
  }

  function applyFilters() {
    if (!layerAllData) return;
    layerAllData.definitionExpression = buildWhere();
    refreshTableSample();
  }

  function clearFilters() {
    dvFilterEl.value = "all";
    nameSearchEl.value = "";
    d121MinEl.value = "";
    d121MaxEl.value = "";
    if (layerAllData) layerAllData.definitionExpression = "1=1";
    refreshTableSample();
  }

  btnApply.addEventListener("click", applyFilters);
  btnClear.addEventListener("click", clearFilters);

  // -------------------------
  // Init
  // -------------------------
  view.when(async () => {
    await webmap.when();

    const all = flattenLayers(webmap.layers);

    // robust find
    layerAllData = all.find(l => (l.title || "").toLowerCase().includes("iberian_peninsula_alldata"));
    if (!layerAllData) layerAllData = all.find(l => l.type === "feature");

    // Widgets in panel
    const search = new Search({ view });
    const layerList = new LayerList({ view });
    const legend = new Legend({ view });
    const basemapToggle = new BasemapToggle({ view, nextBasemap: "hybrid" });

    widgetsDiv.innerHTML = "";
    const addWidgetBlock = (title, widget) => {
      const block = document.createElement("div");
      block.className = "widgetBlock";
      block.innerHTML = `<div class="widgetTitle">${title}</div>`;
      const content = document.createElement("div");
      content.className = "widgetContent";
      block.appendChild(content);
      widgetsDiv.appendChild(block);
      widget.container = content;
    };

    addWidgetBlock("Search", search);
    addWidgetBlock("Layer List", layerList);
    addWidgetBlock("Legend", legend);
    addWidgetBlock("Basemap", basemapToggle);

    // initial load
    await refreshTableSample();
  });

});
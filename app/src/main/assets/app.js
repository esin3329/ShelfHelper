(function (root) {
  const SAMPLE_SHELVES = [
    ["8B", "1층 꿈뜨락-아동-8B", "아동", "아동 219.2-2020-1-1", "아동 219.2-2020-1-9", "현장 조사 필요", 1, "아동 219.2-2020-1-1", "아동 219.2-2020-1-9", 12.5, 34.5, 11, 11],
  ].map(([shelf_id, label, category, start_call_number, end_call_number, direction, slot_no, slot_start_call_number, slot_end_call_number, map_x, map_y, map_width, map_height]) => ({
    shelf_id,
    label,
    category,
    start_call_number,
    end_call_number,
    direction,
    slot_no,
    slot_start_call_number,
    slot_end_call_number,
    map_x,
    map_y,
    map_width,
    map_height,
  }));

  const SAMPLE_LABELS = [
    { image_id: "label-001", expected_call_number: "아동 219.2-2020-1-9", ocr_call_number: "아동 219.2-2020-1-9", confirmed_call_number: "아동 219.2-2020-1-9", needs_manual_fix: "false" },
    { image_id: "label-002", expected_call_number: "아동 101.0-2020-1", ocr_call_number: "아동 101.0-2020-I", confirmed_call_number: "아동 101.0-2020-1", needs_manual_fix: "true" },
  ];

  const ROUTE_NODES = {
    entrance: { x: 6, y: 94 },
    lowerAisle: { x: 18, y: 94 },
    aisle8B: { x: 18, y: 48 },
    "8B": { x: 18, y: 40 },
  };
  const ROUTE_EDGES = [["entrance", "lowerAisle"], ["lowerAisle", "aisle8B"], ["aisle8B", "8B"]];
  const DEFAULT_GRAPH = { nodes: ROUTE_NODES, edges: ROUTE_EDGES };

  function normalizeText(text) {
    return String(text || "")
      .trim()
      .replace(/[–—−]/g, "-")
      .replace(/[Oo]/g, "0")
      .replace(/[Il|]/g, "1")
      .replace(/등/g, "동")
      .replace(/\s+/g, " ");
  }

  function parseCallNumber(text) {
    const normalized = normalizeText(text);
    const match = normalized.match(/^([가-힣A-Za-z]+)\s+([0-9]+(?:\.[0-9]+)?)(?:\s*-\s*|\s+)([0-9]{4})(?:\s*-\s*|\s+)([0-9]+(?:\s*(?:-|\s)\s*[0-9]+)*)$/);
    if (!match) return null;
    const category = match[1];
    const classText = match[2];
    const classNumber = Number(classText);
    const year = Number(match[3]);
    const copy = match[4].trim().replace(/\s*(?:-|\s)\s*/g, "-");
    const raw = `${category} ${classText}-${year}-${copy}`;
    return {
      category,
      classNumber,
      year,
      copy,
      raw,
      sortKey: [category, classNumber.toFixed(3).padStart(10, "0"), year, ...copy.split("-").map((part) => part.padStart(6, "0"))].join("|"),
    };
  }

  function extractCallNumber(text) {
    const normalized = normalizeText(text);
    const match = normalized.match(/([가-힣A-Za-z]+\s+[0-9]+(?:\.[0-9]+)?(?:\s*-\s*|\s+)[0-9]{4}(?:\s*-\s*|\s+)[0-9]+(?:\s*(?:-|\s)\s*[0-9]+)*)/);
    return match ? parseCallNumber(match[1])?.raw || "" : "";
  }

  function callNumberFromOcr(text) {
    return extractCallNumber(text) || String(text || "").trim();
  }

  function ocrSupportMessage(env = root) {
    return canUseDeviceOcr(env) ? "기기 OCR 지원됨. 촬영하면 자동 입력합니다." : "기기 OCR 미지원. 촬영 후 직접 입력으로 진행합니다.";
  }

  function canUseDeviceOcr(env = root) {
    return "TextDetector" in env && env.isSecureContext !== false;
  }

  function ocrResultMessage(text) {
    if (!String(text || "").trim()) return "OCR 결과가 없습니다. 청구기호를 직접 입력해 주세요.";
    return parseCallNumber(text) ? "OCR 결과를 청구기호 입력칸에 넣었습니다." : "OCR 결과를 확인해 주세요.";
  }

  function inputStatusMessage(text) {
    return parseCallNumber(text) ? "청구기호 확인됨. 목적지와 경로를 확인하세요." : "청구기호를 확인해 주세요.";
  }

  function dataStatusMessage(sources) {
    const shelfText = sources.shelves === "csv" ? "서가 CSV 반영됨" : "서가 기본값 사용";
    const routeText = sources.graph === "csv" ? "경로 CSV 반영됨" : "경로 기본값 사용";
    const labelText = sources.labels === "csv" ? "OCR CSV 반영됨" : "OCR 기본값 사용";
    return `${shelfText} · ${routeText} · ${labelText}`;
  }

  function findShelf(parsed, shelves) {
    if (!parsed) return { status: "none", candidates: [] };
    const candidates = shelves.filter((shelf) => {
      const start = parseCallNumber(shelf.slot_start_call_number || shelf.start_call_number);
      const end = parseCallNumber(shelf.slot_end_call_number || shelf.end_call_number);
      return start && end && shelf.category === parsed.category && parsed.sortKey >= start.sortKey && parsed.sortKey <= end.sortKey;
    });
    if (candidates.length === 1) return { status: "one", shelf: candidates[0], candidates };
    return { status: candidates.length ? "candidates" : "none", candidates };
  }

  function resolveSelectedShelf(match, shelfId) {
    return match.shelf || match.candidates.find((shelf) => shelf.shelf_id === shelfId) || null;
  }

  function shelfMapClass(shelf, activeShelfId) {
    return `shelf${shelf?.shelf_id === activeShelfId ? " active" : ""}`;
  }

  function mapShelves(shelves) {
    return shelves.filter((shelf, index) => shelves.findIndex((item) => item.shelf_id === shelf.shelf_id) === index);
  }

  function shelfGuide(shelf) {
    if (!shelf) return "";
    const slot = Number(shelf.slot_no);
    const slotText = Number.isFinite(slot) && slot > 0 ? ` · 위에서 ${slot}번째 칸` : "";
    const rangeStart = shelf.slot_start_call_number || shelf.start_call_number;
    const rangeEnd = shelf.slot_end_call_number || shelf.end_call_number;
    return `${shelf.label}${slotText} · ${rangeStart} ~ ${rangeEnd} · ${shelf.direction}`;
  }

  function sortBooks(books, shelves) {
    return books
      .map((book, index) => {
        const parsed = parseCallNumber(book.callNumber || book.confirmed_call_number);
        const match = findShelf(parsed, shelves);
        const shelf = match.shelf || match.candidates[0] || null;
        return { ...book, index, parsed, shelf, status: match.status };
      })
      .sort((a, b) => {
        if (!a.shelf && b.shelf) return 1;
        if (a.shelf && !b.shelf) return -1;
        if (a.shelf && b.shelf) {
          const shelfOrder = a.shelf.map_y - b.shelf.map_y || a.shelf.map_x - b.shelf.map_x;
          if (shelfOrder) return shelfOrder;
        }
        return String(a.parsed?.sortKey || "zz").localeCompare(String(b.parsed?.sortKey || "zz")) || a.index - b.index;
      });
  }

  function calculateRoute(shelf, graph = { nodes: ROUTE_NODES, edges: ROUTE_EDGES }) {
    if (!shelf) return null;
    if (!isPoint(graph.nodes.entrance)) return null;
    const end = graph.nodes[shelf.shelf_id] || {
      x: Math.round(shelf.map_x + shelf.map_width / 2),
      y: Math.round(shelf.map_y + shelf.map_height / 2),
    };
    if (!isPoint(end)) return null;
    const nodePath = shortestPath("entrance", shelf.shelf_id, graph);
    if (!nodePath.length) {
      const start = graph.nodes.entrance;
      const distance = Math.round(Math.hypot(end.x - start.x, end.y - start.y));
      const points = [start, end];
      return { points, label: `입구에서 ${shelf.shelf_id}까지 직선 기준 약 ${distance}칸`, steps: routeSteps(points) };
    }
    const points = nodePath.map((node) => graph.nodes[node]);
    const distance = Math.round(routeDistance(points));
    return { points, label: `입구에서 ${shelf.shelf_id}까지 통로 기준 약 ${distance}칸`, steps: routeSteps(points) };
  }

  function shortestPath(start, end, graph) {
    const nodes = Object.keys(graph.nodes);
    const dist = Object.fromEntries(nodes.map((node) => [node, Infinity]));
    const prev = {};
    const queue = new Set(nodes);
    dist[start] = 0;
    while (queue.size) {
      // ponytail: linear scan is enough for a floor-map graph this small; use a heap if nodes grow.
      const current = [...queue].sort((a, b) => dist[a] - dist[b])[0];
      queue.delete(current);
      if (current === end || dist[current] === Infinity) break;
      for (const [a, b] of graph.edges) {
        if (a !== current && b !== current) continue;
        const next = a === current ? b : a;
        if (!graph.nodes[next]) continue;
        const alt = dist[current] + routeDistance([graph.nodes[current], graph.nodes[next]]);
        if (alt < dist[next]) {
          dist[next] = alt;
          prev[next] = current;
        }
      }
    }
    if (dist[end] === Infinity) return [];
    const path = [];
    for (let at = end; at; at = prev[at]) path.unshift(at);
    return path[0] === start ? path : [];
  }

  function routeDistance(points) {
    return points.slice(1).reduce((sum, point, index) => {
      const prev = points[index];
      return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
    }, 0);
  }

  function routeSteps(points) {
    return points.slice(1).map((point, index) => {
      const prev = points[index];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      return [
        dx && `${dx > 0 ? "오른쪽" : "왼쪽"} ${formatStepDistance(dx)}칸`,
        dy && `${dy > 0 ? "아래쪽" : "위쪽"} ${formatStepDistance(dy)}칸`,
      ].filter(Boolean).join(", ");
    }).filter(Boolean);
  }

  function formatStepDistance(value) {
    return String(Math.round(Math.abs(value) * 10) / 10);
  }

  function routeMarkers(route) {
    if (!route?.points?.length) return null;
    return { start: route.points[0], end: route.points[route.points.length - 1] };
  }

  function routeText(route) {
    if (!route) return "목적지를 찾으면 경로가 표시됩니다";
    return route.steps.length ? `${route.label}: ${route.steps.join(" → ")}` : route.label;
  }

  function isPoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function calculateOcrStats(rows) {
    const total = rows.length;
    const autoConfirmed = rows.filter((row) => compactCallNumber(row.expected_call_number) === compactCallNumber(row.ocr_call_number)).length;
    return { total, autoConfirmed, rate: total ? Math.round((autoConfirmed / total) * 100) : 0 };
  }

  function compactCallNumber(text) {
    return String(text || "").trim().replace(/[–—−]/g, "-").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-");
  }

  function parseRouteGraph(csvText) {
    const lines = String(csvText || "").trim().split(/\r?\n/).filter(Boolean);
    const nodes = {};
    const edges = [];
    for (const line of lines.slice(1)) {
      const [node_id, x, y, links = ""] = line.split(",");
      nodes[node_id] = { x: Number(x), y: Number(y) };
      for (const link of links.split(";").filter(Boolean)) {
        edges.push([node_id, link]);
      }
    }
    return { nodes, edges };
  }

  function usableRouteGraph(graph, shelves) {
    const nodeIds = new Set(Object.keys(graph.nodes));
    return Boolean(
      graph.nodes.entrance &&
      Object.values(graph.nodes).every(isPoint) &&
      graph.edges.every(([from, to]) => nodeIds.has(from) && nodeIds.has(to)) &&
      shelves.every((shelf) => graph.nodes[shelf.shelf_id] && shortestPath("entrance", shelf.shelf_id, graph).length),
    );
  }

  function parseShelvesCsv(csvText) {
    return String(csvText || "").trim().split(/\r?\n/).filter(Boolean).slice(1).map((line) => {
      const parts = line.split(",");
      const hasSlot = parts.length >= 13;
      const [shelf_id, label, category, start_call_number, end_call_number, direction] = parts;
      const [slot_no, slot_start_call_number, slot_end_call_number, map_x, map_y, map_width, map_height] = hasSlot
        ? parts.slice(6)
        : ["1", start_call_number, end_call_number, ...parts.slice(6)];
      return {
        shelf_id,
        label,
        category,
        start_call_number,
        end_call_number,
        direction,
        slot_no: Number(slot_no),
        slot_start_call_number,
        slot_end_call_number,
        map_x: Number(map_x),
        map_y: Number(map_y),
        map_width: Number(map_width),
        map_height: Number(map_height),
      };
    });
  }

  function parseLabelsCsv(csvText) {
    return String(csvText || "").trim().split(/\r?\n/).filter(Boolean).slice(1).map((line) => {
      const [image_id, expected_call_number, ocr_call_number, confirmed_call_number, needs_manual_fix] = line.split(",");
      return { image_id, expected_call_number, ocr_call_number, confirmed_call_number, needs_manual_fix };
    });
  }

  function usableShelves(shelves) {
    return shelves.length > 0 && shelves.every((shelf) => {
      const start = parseCallNumber(shelf.start_call_number);
      const end = parseCallNumber(shelf.end_call_number);
      const slotStart = parseCallNumber(shelf.slot_start_call_number || shelf.start_call_number);
      const slotEnd = parseCallNumber(shelf.slot_end_call_number || shelf.end_call_number);
      return start && end && slotStart && slotEnd && start.sortKey <= end.sortKey && slotStart.sortKey <= slotEnd.sortKey && fitsMap(shelf);
    });
  }

  function fitsMap(shelf) {
    return [shelf.map_x, shelf.map_y, shelf.map_width, shelf.map_height].every(Number.isFinite) &&
      shelf.map_width > 0 &&
      shelf.map_height > 0 &&
      shelf.map_x >= 0 &&
      shelf.map_y >= 0 &&
      shelf.map_x + shelf.map_width <= 100 &&
      shelf.map_y + shelf.map_height <= 100;
  }

  function initApp() {
    const state = { shelves: SAMPLE_SHELVES, books: [], graph: DEFAULT_GRAPH, sources: { shelves: "fallback", graph: "fallback", labels: "fallback" }, selectedShelfId: "", photoSeq: 0, previewUrl: "" };
    const $ = (selector) => document.querySelector(selector);
    const callInput = $("#callInput");
    const titleInput = $("#titleInput");
    const status = $("#status");
    const preview = $("#preview");
    status.textContent = ocrSupportMessage(window);

    function selectedShelf() {
      const match = findShelf(parseCallNumber(callInput.value), state.shelves);
      return { ...match, shelf: resolveSelectedShelf(match, state.selectedShelfId) };
    }

    function render() {
      const parsed = parseCallNumber(callInput.value);
      const match = selectedShelf();
      $("#parsed").textContent = parsed ? `${parsed.category} / ${parsed.classNumber} / ${parsed.year} / ${parsed.copy}` : "청구기호를 확인해 주세요";
      $("#result").textContent = match.shelf ? shelfGuide(match.shelf) : match.status === "candidates" ? "후보 서가를 선택해 주세요" : "현장 범위 데이터 필요";
      $("#candidates").innerHTML = match.status === "candidates" ? match.candidates.map((shelf) => `<button type="button" data-shelf-choice="${escapeHtml(shelf.shelf_id)}" class="${match.shelf?.shelf_id === shelf.shelf_id ? "selected" : ""}">${escapeHtml(shelf.shelf_id)}</button>`).join("") : "";
      const route = calculateRoute(match.shelf, state.graph);
      $("#route").textContent = routeText(route);
      const routeLine = $("#routeLine");
      const markers = routeMarkers(route);
      routeLine.setAttribute("points", route ? route.points.map((point) => `${point.x},${point.y}`).join(" ") : "");
      setRouteMarker($("#routeStart"), markers?.start);
      setRouteMarker($("#routeEnd"), markers?.end);
      document.querySelectorAll(".shelf").forEach((node) => {
        node.className = shelfMapClass({ shelf_id: node.dataset.shelf }, match.shelf?.shelf_id);
      });
      const sorted = sortBooks(state.books, state.shelves);
      $("#bookList").innerHTML = sorted.map((book, i) => `
        <li class="${book.shelf ? "" : "warn"}">
          <strong>${i + 1}. ${escapeHtml(book.title || "제목 없음")}</strong>
        <span>${escapeHtml(book.parsed?.raw || book.callNumber)} · ${escapeHtml(book.shelf ? `${book.shelf.shelf_id} ${book.shelf.slot_no || ""}칸` : "확인 필요")}</span>
        </li>
      `).join("") || "<li class=\"empty\">아직 추가한 도서가 없습니다.</li>";
      $("#dataStatus").textContent = dataStatusMessage(state.sources);
    }

    async function tryDeviceOcr(file) {
      if (!canUseDeviceOcr(window)) return null;
      const detector = new window.TextDetector();
      const bitmap = await createImageBitmap(file);
      try {
        const lines = await detector.detect(bitmap);
        return lines.map((line) => line.rawValue).join(" ");
      } finally {
        bitmap.close?.();
      }
    }

    $("#photoInput").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const photoSeq = ++state.photoSeq;
      state.selectedShelfId = "";
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(file);
      preview.src = state.previewUrl;
      preview.hidden = false;
      status.textContent = "이미지는 이 기기에서만 미리보기합니다.";
      try {
        const text = await tryDeviceOcr(file);
        if (photoSeq !== state.photoSeq) return;
        if (text === null) {
          callInput.value = "";
          status.textContent = "기기 OCR을 사용할 수 없어 직접 입력으로 진행합니다.";
          event.target.value = "";
          render();
          return;
        }
        const callNumber = callNumberFromOcr(text);
        callInput.value = callNumber;
        status.textContent = ocrResultMessage(callNumber);
      } catch {
        if (photoSeq !== state.photoSeq) return;
        callInput.value = "";
        status.textContent = "기기 OCR을 사용할 수 없어 직접 입력으로 진행합니다.";
      }
      event.target.value = "";
      render();
    });

    $("#addBook").addEventListener("click", () => {
      const parsed = parseCallNumber(callInput.value);
      if (!parsed) {
        status.textContent = "청구기호 형식을 먼저 확인해 주세요.";
        return;
      }
      state.books.push({ title: titleInput.value.trim() || `도서 ${state.books.length + 1}`, callNumber: parsed.raw });
      titleInput.value = "";
      status.textContent = "도서를 정리 목록에 추가했습니다.";
      render();
    });

    $("#clearBooks").addEventListener("click", () => {
      state.books = [];
      render();
    });

    $("#sampleBook").addEventListener("click", () => {
      state.photoSeq++;
      callInput.value = "아동 219.2-2020-1-9";
      titleInput.value = "그리스 로마 신화";
      state.selectedShelfId = "";
      render();
    });

    callInput.addEventListener("input", () => {
      state.photoSeq++;
      state.selectedShelfId = "";
      status.textContent = inputStatusMessage(callInput.value);
      render();
    });
    $("#candidates").addEventListener("click", (event) => {
      const shelfId = event.target.dataset.shelfChoice;
      if (!shelfId) return;
      state.selectedShelfId = shelfId;
      status.textContent = "후보 서가를 선택했습니다.";
      render();
    });
    renderShelves(state.shelves);
    $("#ocrStats").textContent = `샘플 OCR ${calculateOcrStats(SAMPLE_LABELS).rate}% (${SAMPLE_LABELS.length}건)`;
    loadShelves().then(async (shelves) => {
      state.shelves = shelves.rows;
      state.sources.shelves = shelves.source;
      renderShelves(state.shelves);
      render();
      const graph = await loadRouteGraph(state.shelves);
      state.graph = graph.data;
      state.sources.graph = graph.source;
      render();
    });
    loadLabels().then((labels) => {
      state.sources.labels = labels.source;
      $("#ocrStats").textContent = `샘플 OCR ${calculateOcrStats(labels.rows).rate}% (${labels.rows.length}건)`;
      render();
    });
    render();
  }

  async function loadRouteGraph(shelves = SAMPLE_SHELVES) {
    if (typeof fetch !== "function") return { data: DEFAULT_GRAPH, source: "fallback" };
    try {
      const response = await fetch("routes.csv", { cache: "no-store" });
      if (!response.ok) return { data: DEFAULT_GRAPH, source: "fallback" };
      const graph = parseRouteGraph(await response.text());
      return usableRouteGraph(graph, shelves) ? { data: graph, source: "csv" } : { data: DEFAULT_GRAPH, source: "fallback" };
    } catch {
      return { data: DEFAULT_GRAPH, source: "fallback" };
    }
  }

  async function loadShelves() {
    if (typeof fetch !== "function") return { rows: SAMPLE_SHELVES, source: "fallback" };
    try {
      const response = await fetch("shelves.csv", { cache: "no-store" });
      if (!response.ok) return { rows: SAMPLE_SHELVES, source: "fallback" };
      const shelves = parseShelvesCsv(await response.text());
      return usableShelves(shelves) ? { rows: shelves, source: "csv" } : { rows: SAMPLE_SHELVES, source: "fallback" };
    } catch {
      return { rows: SAMPLE_SHELVES, source: "fallback" };
    }
  }

  async function loadLabels() {
    if (typeof fetch !== "function") return { rows: SAMPLE_LABELS, source: "fallback" };
    try {
      const response = await fetch("test_labels.csv", { cache: "no-store" });
      if (!response.ok) return { rows: SAMPLE_LABELS, source: "fallback" };
      const labels = parseLabelsCsv(await response.text());
      return labels.length ? { rows: labels, source: "csv" } : { rows: SAMPLE_LABELS, source: "fallback" };
    } catch {
      return { rows: SAMPLE_LABELS, source: "fallback" };
    }
  }

  function renderShelves(shelves) {
    document.querySelector("#shelfMap").innerHTML = `
      <svg class="routeLayer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline id="routeLine" points="" />
        <circle id="routeStart" class="routeMarker routeStart" r="2.2" hidden />
        <circle id="routeEnd" class="routeMarker routeEnd" r="2.8" hidden />
      </svg>
    ` + mapShelves(shelves).map((shelf) => `
      <button class="${shelfMapClass(shelf, "")}" data-shelf="${escapeHtml(shelf.shelf_id)}" aria-label="${escapeHtml(shelf.label)}" style="left:${shelf.map_x}%;top:${shelf.map_y}%;width:${shelf.map_width}%;height:${shelf.map_height}%">
        ${escapeHtml(shelf.shelf_id)}
      </button>
    `).join("");
  }

  function setRouteMarker(node, point) {
    node.toggleAttribute("hidden", !point);
    if (!point) return;
    node.setAttribute("cx", point.x);
    node.setAttribute("cy", point.y);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
  }

  const api = { SAMPLE_SHELVES, SAMPLE_LABELS, parseCallNumber, extractCallNumber, callNumberFromOcr, ocrSupportMessage, ocrResultMessage, inputStatusMessage, dataStatusMessage, findShelf, resolveSelectedShelf, shelfMapClass, mapShelves, shelfGuide, sortBooks, calculateRoute, routeText, routeMarkers, parseRouteGraph, usableRouteGraph, parseShelvesCsv, usableShelves, parseLabelsCsv, calculateOcrStats, initApp };
  if (typeof module !== "undefined") module.exports = api;
  root.LibraryShelfHelper = api;
})(typeof window !== "undefined" ? window : globalThis);

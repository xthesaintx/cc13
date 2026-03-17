(async () => {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can run this macro.");

  const { DialogV2 } = foundry.applications.api;
  const DEFAULT_GRID_SIZE = 100;
  const DEFAULT_SCALE = 2;
  const DEFAULT_SAMPLE_STEP = 10;
  const DEFAULT_MIN_SEGMENT = 2;
  const DEFAULT_MIN_STROKE_WIDTH = 3;
  const DEFAULT_MIN_POLYLINE_LENGTH = 80;
  const DEFAULT_WEBP_QUALITY = 0.92;
  const COMPLEX_PATH_MIN_COMMANDS = 30;
  const SHAPE_SELECTOR = "path,line,polyline,polygon,rect,circle,ellipse";
  const WALL_TAG_RE = /\b(wall|walls|lineofsight|los)\b/i;

  function getBaseName(filename) {
    return String(filename || "").replace(/\.[^/.]+$/, "");
  }

  function sanitizeFilename(name) {
    return String(name || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "map";
  }

  function buildTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  async function ensureUploadsFolder() {
    try {
      await foundry.applications.apps.FilePicker.implementation.browse("data", "uploads");
      return;
    } catch (_err) {}

    try {
      await foundry.applications.apps.FilePicker.implementation.createDirectory("data", "uploads");
    } catch (_err) {}

    await foundry.applications.apps.FilePicker.implementation.browse("data", "uploads");
  }

  function parseNumber(value) {
    const n = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(n) ? n : null;
  }

  function parsePositiveNumber(value, fallback) {
    const n = parseNumber(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function parsePointsAttribute(value) {
    const nums = String(value || "").match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number.parseFloat(nums[i]);
      const y = Number.parseFloat(nums[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x, y });
    }
    return out;
  }

  function dedupeSequentialPoints(points, minDistance = 0.001) {
    if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? points.slice() : [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = out[out.length - 1];
      const b = points[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) >= minDistance) out.push(b);
    }
    return out;
  }

  function simplifyPolyline(points) {
    const deduped = dedupeSequentialPoints(points);
    if (deduped.length <= 2) return deduped;

    const out = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
      const a = out[out.length - 1];
      const b = deduped[i];
      const c = deduped[i + 1];

      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = c.x - b.x;
      const bcy = c.y - b.y;

      const lab = Math.hypot(abx, aby);
      const lbc = Math.hypot(bcx, bcy);
      if (lab < 0.001 || lbc < 0.001) continue;

      const cross = Math.abs((abx * bcy) - (aby * bcx));
      const dot = (abx * bcx) + (aby * bcy);
      const denom = lab * lbc;
      const sinTheta = cross / denom;
      const cosTheta = dot / denom;

      if (sinTheta < 0.002 && cosTheta > 0.999) continue;
      out.push(b);
    }
    out.push(deduped[deduped.length - 1]);
    return out;
  }

  function canonicalSegmentKey(seg, precision = 100) {
    const [x1, y1, x2, y2] = seg;
    const ax = Math.round(x1 * precision) / precision;
    const ay = Math.round(y1 * precision) / precision;
    const bx = Math.round(x2 * precision) / precision;
    const by = Math.round(y2 * precision) / precision;

    if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
    return `${bx},${by}|${ax},${ay}`;
  }

  function shouldSkipElementByParent(element) {
    return !!element.closest("defs,clipPath,mask,pattern,symbol,marker");
  }

  function isWallTaggedElement(element) {
    let node = element;
    while (node && node instanceof Element) {
      const tags = [
        node.id || "",
        node.getAttribute("class") || "",
        node.getAttribute("inkscape:label") || "",
        node.getAttribute("label") || "",
        node.getAttribute("data-name") || "",
        node.getAttribute("name") || ""
      ].join(" ");
      if (WALL_TAG_RE.test(tags)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function isElementVisible(element) {
    const attrDisplay = String(element.getAttribute("display") || "").trim().toLowerCase();
    if (attrDisplay === "none") return false;
    const attrVisibility = String(element.getAttribute("visibility") || "").trim().toLowerCase();
    if (attrVisibility === "hidden") return false;

    const inline = String(element.getAttribute("style") || "").toLowerCase();
    if (/display\s*:\s*none/.test(inline)) return false;
    if (/visibility\s*:\s*hidden/.test(inline)) return false;

    try {
      const cs = window.getComputedStyle(element);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const opacity = Number.parseFloat(cs.opacity);
      if (Number.isFinite(opacity) && opacity <= 0) return false;
    } catch (_err) {}

    return true;
  }

  function isNoneLikeStroke(value) {
    const s = String(value || "").trim().toLowerCase();
    if (!s) return true;
    if (s === "none" || s === "transparent") return true;
    if (s.startsWith("rgba(") && /,\s*0(?:\.0+)?\s*\)$/.test(s)) return true;
    return false;
  }

  function isVisibleStrokedShape(element) {
    if (!isElementVisible(element)) return false;
    const attrStroke = element.getAttribute("stroke");
    const inlineStroke = element.style?.stroke;
    let computedStroke = "";
    let computedWidth = "";
    let computedOpacity = "";
    try {
      const cs = window.getComputedStyle(element);
      computedStroke = cs.stroke;
      computedWidth = cs.strokeWidth;
      computedOpacity = cs.strokeOpacity;
    } catch (_err) {}

    const stroke = String(attrStroke || inlineStroke || computedStroke || "").trim();
    if (isNoneLikeStroke(stroke)) return false;

    const strokeWidth = parseNumber(
      element.getAttribute("stroke-width") ?? element.style?.strokeWidth ?? computedWidth ?? "1"
    );
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return false;

    const strokeOpacity = parseNumber(
      element.getAttribute("stroke-opacity") ?? element.style?.strokeOpacity ?? computedOpacity ?? "1"
    );
    if (Number.isFinite(strokeOpacity) && strokeOpacity <= 0) return false;

    return true;
  }

  function getElementStrokeWidth(element) {
    const attr = element.getAttribute("stroke-width");
    const inline = element.style?.strokeWidth;
    let computed = "";
    try {
      computed = window.getComputedStyle(element).strokeWidth;
    } catch (_err) {}
    return parseNumber(attr ?? inline ?? computed ?? "0") ?? 0;
  }

  function isShapeElement(element) {
    if (!(element instanceof Element)) return false;
    return ["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"].includes(element.tagName.toLowerCase());
  }

  function expandSelectionToShapes(elements) {
    const out = [];
    const seen = new Set();

    for (const el of elements) {
      if (!(el instanceof Element)) continue;
      if (isShapeElement(el)) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
        continue;
      }

      const shapes = el.querySelectorAll(SHAPE_SELECTOR);
      for (const s of shapes) {
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
      }
    }

    return out;
  }

  function collectWallElements(svgRoot, wallMode, wallSelector, minStrokeWidth = 0) {
    const allShapes = Array.from(svgRoot.querySelectorAll(SHAPE_SELECTOR))
      .filter((el) => !shouldSkipElementByParent(el));
    const tagged = allShapes.filter((el) => isWallTaggedElement(el) && isElementVisible(el));
    const stroked = allShapes
      .filter((el) => isVisibleStrokedShape(el))
      .filter((el) => getElementStrokeWidth(el) >= minStrokeWidth);
    const strokedPaths = stroked.filter((el) => el.tagName.toLowerCase() === "path");

    const selectLastComplexPath = (paths) => {
      if (!paths.length) return [];

      const data = paths.map((path, index) => {
        const d = String(path.getAttribute("d") || "");
        const commands = (d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
        let totalLength = 0;
        try {
          totalLength = Number(path.getTotalLength()) || 0;
        } catch (_err) {}
        return { path, index, commands, totalLength };
      });

      const maxCommands = data.reduce((m, p) => Math.max(m, p.commands), 0);
      const maxLength = data.reduce((m, p) => Math.max(m, p.totalLength), 0);
      const commandFloor = Math.max(COMPLEX_PATH_MIN_COMMANDS, Math.floor(maxCommands * 0.25));
      const lengthFloor = Math.max(200, maxLength * 0.25);

      const complex = data.filter((p) => p.commands >= commandFloor || p.totalLength >= lengthFloor);
      const picked = (complex.length ? complex : data)[(complex.length ? complex.length : data.length) - 1];
      return picked ? [picked.path] : [];
    };

    if (wallMode === "tagged") return tagged;
    if (wallMode === "stroked") return stroked;
    if (wallMode === "lastComplexPath") return selectLastComplexPath(strokedPaths);
    if (wallMode === "selector") {
      const selector = String(wallSelector || "").trim();
      if (!selector) throw new Error("Custom selector mode requires a CSS selector.");
      let selected;
      try {
        selected = Array.from(svgRoot.querySelectorAll(selector));
      } catch (err) {
        throw new Error(`Invalid CSS selector: ${err.message}`);
      }
      return expandSelectionToShapes(selected).filter((el) => !shouldSkipElementByParent(el) && isElementVisible(el));
    }

    if (tagged.length) return tagged;
    const complexPath = selectLastComplexPath(strokedPaths);
    if (complexPath.length) return complexPath;
    return stroked;
  }

  function transformPointsWithMatrix(points, matrix) {
    if (!matrix) return [];
    const out = [];
    for (const p of points) {
      const x = (matrix.a * p.x) + (matrix.c * p.y) + matrix.e;
      const y = (matrix.b * p.x) + (matrix.d * p.y) + matrix.f;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x, y });
    }
    return out;
  }

  function splitByJumps(points, jumpLimit) {
    if (points.length < 2) return [];
    const out = [];
    let current = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > jumpLimit && current.length > 1) {
        out.push(current);
        current = [b];
        continue;
      }
      current.push(b);
    }

    if (current.length > 1) out.push(current);
    return out;
  }

  function samplePathElement(pathElement, sampleStep) {
    let total = 0;
    try {
      total = pathElement.getTotalLength();
    } catch (_err) {
      return [];
    }

    if (!Number.isFinite(total) || total <= 0) return [];
    const step = Math.max(1, sampleStep);
    const steps = Math.max(2, Math.ceil(total / step));
    const sampled = [];

    for (let i = 0; i <= steps; i++) {
      const d = (total * i) / steps;
      const p = pathElement.getPointAtLength(d);
      sampled.push({ x: p.x, y: p.y });
    }

    return splitByJumps(sampled, step * 4);
  }

  function linePoints(element) {
    const x1 = parseNumber(element.getAttribute("x1")) ?? 0;
    const y1 = parseNumber(element.getAttribute("y1")) ?? 0;
    const x2 = parseNumber(element.getAttribute("x2")) ?? 0;
    const y2 = parseNumber(element.getAttribute("y2")) ?? 0;
    return [[{ x: x1, y: y1 }, { x: x2, y: y2 }]];
  }

  function polylinePoints(element, closePath = false) {
    const points = parsePointsAttribute(element.getAttribute("points"));
    if (points.length < 2) return [];
    const list = points.slice();
    if (closePath && points.length > 2) list.push({ ...points[0] });
    return [list];
  }

  function rectPoints(element) {
    const x = parseNumber(element.getAttribute("x")) ?? 0;
    const y = parseNumber(element.getAttribute("y")) ?? 0;
    const w = parseNumber(element.getAttribute("width")) ?? 0;
    const h = parseNumber(element.getAttribute("height")) ?? 0;
    if (w <= 0 || h <= 0) return [];
    return [[
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y }
    ]];
  }

  function ellipseCircumference(rx, ry) {
    const a = Math.max(rx, ry);
    const b = Math.min(rx, ry);
    const h = ((a - b) ** 2) / ((a + b) ** 2 || 1);
    return Math.PI * (a + b) * (1 + ((3 * h) / (10 + Math.sqrt(Math.max(0, 4 - (3 * h))))));
  }

  function circleLikePoints(element, sampleStep, ellipse = false) {
    const cx = parseNumber(element.getAttribute("cx")) ?? 0;
    const cy = parseNumber(element.getAttribute("cy")) ?? 0;
    const rx = ellipse ? (parseNumber(element.getAttribute("rx")) ?? 0) : (parseNumber(element.getAttribute("r")) ?? 0);
    const ry = ellipse ? (parseNumber(element.getAttribute("ry")) ?? 0) : rx;
    if (rx <= 0 || ry <= 0) return [];

    const circumference = ellipse ? ellipseCircumference(rx, ry) : (2 * Math.PI * rx);
    const sides = Math.max(16, Math.ceil(circumference / Math.max(1, sampleStep)));
    const points = [];
    for (let i = 0; i <= sides; i++) {
      const t = (Math.PI * 2 * i) / sides;
      points.push({
        x: cx + (Math.cos(t) * rx),
        y: cy + (Math.sin(t) * ry)
      });
    }
    return [points];
  }

  function pointsFromShapeElement(element, sampleStep) {
    const tag = element.tagName.toLowerCase();
    if (tag === "path") return samplePathElement(element, sampleStep);
    if (tag === "line") return linePoints(element);
    if (tag === "polyline") return polylinePoints(element, false);
    if (tag === "polygon") return polylinePoints(element, true);
    if (tag === "rect") return rectPoints(element);
    if (tag === "circle") return circleLikePoints(element, sampleStep, false);
    if (tag === "ellipse") return circleLikePoints(element, sampleStep, true);
    return [];
  }

  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
  }

  function buildSegmentsFromPolylines(polylines, matrix, minSegmentLength, minPolylineLength = 0) {
    const segments = [];
    for (const polyline of polylines) {
      const transformed = transformPointsWithMatrix(polyline, matrix);
      if (polylineLength(transformed) < minPolylineLength) continue;
      const points = simplifyPolyline(transformed);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!Number.isFinite(len) || len < minSegmentLength) continue;
        segments.push([a.x, a.y, b.x, b.y]);
      }
    }
    return segments;
  }

  function dedupeSegments(segments) {
    const out = [];
    const seen = new Set();
    for (const seg of segments) {
      const key = canonicalSegmentKey(seg, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(seg);
    }
    return out;
  }

  function endpointKey(x, y, precision = 100) {
    return `${Math.round(x * precision)},${Math.round(y * precision)}`;
  }

  function closeTinyGaps(segments, maxGap = 16, minSegmentLength = 2) {
    if (!Array.isArray(segments) || segments.length < 2) return Array.isArray(segments) ? segments.slice() : [];

    const endpointMap = new Map();
    const addEndpoint = (x, y) => {
      const key = endpointKey(x, y, 100);
      const entry = endpointMap.get(key) || { x, y, degree: 0 };
      entry.degree += 1;
      endpointMap.set(key, entry);
    };

    for (const seg of segments) {
      addEndpoint(seg[0], seg[1]);
      addEndpoint(seg[2], seg[3]);
    }

    const dangles = [];
    for (const entry of endpointMap.values()) {
      if (entry.degree === 1) dangles.push(entry);
    }

    if (dangles.length < 2) return segments.slice();

    const out = segments.slice();
    const used = new Set();

    for (let i = 0; i < dangles.length; i++) {
      if (used.has(i)) continue;
      const a = dangles[i];
      let bestJ = -1;
      let bestDist = Infinity;

      for (let j = i + 1; j < dangles.length; j++) {
        if (used.has(j)) continue;
        const b = dangles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < minSegmentLength || dist > maxGap) continue;
        if (dist < bestDist) {
          bestDist = dist;
          bestJ = j;
        }
      }

      if (bestJ === -1) continue;
      used.add(i);
      used.add(bestJ);
      const b = dangles[bestJ];
      out.push([a.x, a.y, b.x, b.y]);
    }

    return out;
  }

  async function readSvgImage(svgText) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const width = Number(img.naturalWidth || img.width);
        const height = Number(img.naturalHeight || img.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          URL.revokeObjectURL(url);
          return reject(new Error("Failed to determine SVG dimensions."));
        }
        resolve({ img, url, width, height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("SVG decode failed. Ensure the SVG is valid and self-contained."));
      };

      img.src = url;
    });
  }

  async function convertSvgToWebPFile(svgText, sourceName, scale, quality) {
    const base = sanitizeFilename(getBaseName(sourceName || "")) || "map";
    const stamp = buildTimestamp();
    const webpName = `${base}_${stamp}.webp`;

    const { img, url, width: nativeWidth, height: nativeHeight } = await readSvgImage(svgText);
    const renderWidth = Math.max(1, Math.round(nativeWidth * scale));
    const renderHeight = Math.max(1, Math.round(nativeHeight * scale));

    try {
      const canvas = document.createElement("canvas");
      canvas.width = renderWidth;
      canvas.height = renderHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context.");
      ctx.drawImage(img, 0, 0, renderWidth, renderHeight);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) return reject(new Error("WebP conversion returned empty blob."));
          resolve(b);
        }, "image/webp", quality);
      });

      return {
        file: new File([blob], webpName, { type: "image/webp", lastModified: Date.now() }),
        nativeWidth,
        nativeHeight,
        renderWidth,
        renderHeight
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function extractSvgRoot(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const parseErr = doc.querySelector("parsererror");
    if (parseErr) {
      throw new Error("SVG parse failed.");
    }

    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") {
      throw new Error("No <svg> root element found.");
    }

    return root;
  }

  function mountSvgForGeometry(svgRoot, width, height) {
    const mounted = document.importNode(svgRoot, true);
    mounted.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    mounted.setAttribute("width", String(width));
    mounted.setAttribute("height", String(height));
    if (!mounted.hasAttribute("viewBox")) {
      mounted.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    const holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-100000px";
    holder.style.top = "-100000px";
    holder.style.width = "0";
    holder.style.height = "0";
    holder.style.opacity = "0";
    holder.style.pointerEvents = "none";
    holder.style.overflow = "hidden";
    holder.appendChild(mounted);
    document.body.appendChild(holder);

    return { mounted, holder };
  }

  function extractWallSegmentsFromSvg(svgText, options) {
    const {
      wallMode,
      wallSelector,
      sampleStep,
      minSegmentLength,
      minStrokeWidth,
      minPolylineLength,
      scale,
      nativeWidth,
      nativeHeight
    } = options;
    const svgRoot = extractSvgRoot(svgText);
    const { mounted, holder } = mountSvgForGeometry(svgRoot, nativeWidth, nativeHeight);

    try {
      const wallElements = collectWallElements(mounted, wallMode, wallSelector, minStrokeWidth);
      if (!wallElements.length) {
        return { segments: [], wallElements: 0 };
      }

      const allSegments = [];
      for (const element of wallElements) {
        const matrix = element.getCTM();
        if (!matrix) continue;
        const polylines = pointsFromShapeElement(element, sampleStep);
        if (!polylines.length) continue;
        const segs = buildSegmentsFromPolylines(polylines, matrix, minSegmentLength, minPolylineLength);
        allSegments.push(...segs);
      }

      const closeGap = Math.max(10, sampleStep * 1.8, minStrokeWidth * 3);
      const deduped = dedupeSegments(closeTinyGaps(dedupeSegments(allSegments), closeGap, minSegmentLength))
        .map((seg) => seg.map((n) => Math.round(n * scale * 100) / 100));

      return { segments: deduped, wallElements: wallElements.length };
    } finally {
      holder.remove();
    }
  }

  function buildWallDocuments(segments) {
    return segments.map((c) => ({ c, door: 0, ds: 0 }));
  }

  async function createWallsInBatches(scene, wallDocs, batchSize = 500) {
    for (let i = 0; i < wallDocs.length; i += batchSize) {
      const chunk = wallDocs.slice(i, i + batchSize);
      await scene.createEmbeddedDocuments("Wall", chunk);
    }
  }

  function promptForFiles() {
    const content = `
      <form autocomplete="off">
        <div class="form-group">
          <label><b>Scene Name</b></label>
          <input type="text" name="sceneName" placeholder="Leave blank to use SVG filename" />
        </div>
        <div class="form-group">
          <label><b>SVG File</b></label>
          <input type="file" name="svgFile" accept=".svg,image/svg+xml" />
        </div>
        <div class="form-group">
          <label><b>Render Scale</b> (1.0 = native SVG size)</label>
          <input type="number" name="renderScale" value="${DEFAULT_SCALE}" min="0.1" step="0.1" />
        </div>
        <div class="form-group">
          <label><b>Grid Size (px)</b></label>
          <input type="number" name="gridSize" value="${DEFAULT_GRID_SIZE}" min="1" step="1" />
        </div>
        <div class="form-group">
          <label><b>Wall Detection</b></label>
          <select name="wallMode">
            <option value="auto" selected>Auto (tagged, then last complex path, then all stroked)</option>
            <option value="selector">Custom CSS selector</option>
          </select>
        </div>
        <div class="form-group">
          <label><b>Custom Wall Selector</b></label>
          <input type="text" name="wallSelector" placeholder='Example: g#walls path, .wall' />
        </div>
        <div class="form-group">
          <label><b>Path Sample Step</b> (SVG px)</label>
          <input type="number" name="sampleStep" value="${DEFAULT_SAMPLE_STEP}" min="1" step="1" />
        </div>
        <div class="form-group">
          <label><b>Minimum Stroke Width</b> (SVG px)</label>
          <input type="number" name="minStrokeWidth" value="${DEFAULT_MIN_STROKE_WIDTH}" min="0" step="0.1" />
        </div>
        <div class="form-group">
          <label><b>Minimum Subpath Length</b> (SVG px)</label>
          <input type="number" name="minPolylineLength" value="${DEFAULT_MIN_POLYLINE_LENGTH}" min="0" step="1" />
        </div>
        <div class="form-group">
          <label><b>Minimum Wall Length</b> (SVG px)</label>
          <input type="number" name="minSegmentLength" value="${DEFAULT_MIN_SEGMENT}" min="0.1" step="0.1" />
        </div>
      </form>
    `;

    return DialogV2.wait({
      window: { title: "SVG Walls -> Foundry Scene" },
      content,
      buttons: [
        {
          action: "import",
          label: "Create Scene",
          icon: "<i class='fas fa-map'></i>",
          default: true,
          callback: (_event, button) => {
            const fd = new FormData(button.form);
            const sceneName = String(fd.get("sceneName") || "").trim();
            const svgFile = fd.get("svgFile");
            const renderScale = parsePositiveNumber(fd.get("renderScale"), DEFAULT_SCALE);
            const gridSize = Math.max(1, Number.parseInt(fd.get("gridSize"), 10) || DEFAULT_GRID_SIZE);
            const wallMode = String(fd.get("wallMode") || "auto");
            const wallSelector = String(fd.get("wallSelector") || "").trim();
            const sampleStep = parsePositiveNumber(fd.get("sampleStep"), DEFAULT_SAMPLE_STEP);
            const minStrokeWidth = Math.max(0, parseNumber(fd.get("minStrokeWidth")) ?? DEFAULT_MIN_STROKE_WIDTH);
            const minPolylineLength = Math.max(0, parseNumber(fd.get("minPolylineLength")) ?? DEFAULT_MIN_POLYLINE_LENGTH);
            const minSegmentLength = parsePositiveNumber(fd.get("minSegmentLength"), DEFAULT_MIN_SEGMENT);

            return {
              sceneName,
              svgFile: svgFile instanceof File && svgFile.size > 0 ? svgFile : null,
              renderScale,
              gridSize,
              wallMode,
              wallSelector,
              sampleStep,
              minStrokeWidth,
              minPolylineLength,
              minSegmentLength
            };
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "<i class='fas fa-times'></i>",
          callback: () => null
        }
      ],
      rejectClose: true
    }).catch(() => null);
  }

  const input = await promptForFiles();
  if (!input) return;

  const {
    sceneName,
    svgFile,
    renderScale,
    gridSize,
    wallMode,
    wallSelector,
    sampleStep,
    minStrokeWidth,
    minPolylineLength,
    minSegmentLength
  } = input;

  if (!svgFile) return ui.notifications.warn("Please select an SVG file.");

  try {
    ui.notifications.info("Reading SVG...");
    const svgText = await svgFile.text();
    if (!svgText.trim()) throw new Error("SVG file appears to be empty.");

    ui.notifications.info("Rasterizing SVG to WebP...");
    const raster = await convertSvgToWebPFile(svgText, svgFile.name, renderScale, DEFAULT_WEBP_QUALITY);

    ui.notifications.info("Extracting wall segments from SVG...");
    const extracted = extractWallSegmentsFromSvg(svgText, {
      wallMode,
      wallSelector,
      sampleStep,
      minSegmentLength,
      minStrokeWidth,
      minPolylineLength,
      scale: renderScale,
      nativeWidth: raster.nativeWidth,
      nativeHeight: raster.nativeHeight
    });

    if (!extracted.segments.length) {
      throw new Error("No wall segments were found. Try a different Wall Detection mode or selector.");
    }

    const wallDocs = buildWallDocuments(extracted.segments);

    await ensureUploadsFolder();
    ui.notifications.info("Uploading WebP map image...");
    const safeName = sanitizeFilename(raster.file.name);
    const uploadResult = await foundry.applications.apps.FilePicker.implementation.upload("data", "uploads", raster.file, {}, { notify: false });
    const imagePath = uploadResult?.path || `uploads/${safeName}`;

    const finalSceneName = sceneName || getBaseName(svgFile.name) || "SVG Import";

    ui.notifications.info("Creating scene...");
    const scene = await Scene.create({
      name: finalSceneName,
      width: raster.renderWidth,
      height: raster.renderHeight,
      padding: 0,
      grid: {
        size: gridSize,
        type: CONST.GRID_TYPES.SQUARE,
        distance: 5,
        units: "ft"
      },
      background: { src: imagePath },
      img: imagePath
    });

    ui.notifications.info("Creating walls...");
    await createWallsInBatches(scene, wallDocs, 500);

    await scene.activate();
    ui.notifications.info(
      `Scene "${finalSceneName}" created (${raster.renderWidth}x${raster.renderHeight}, scale ${renderScale}x) with ${wallDocs.length} walls from ${extracted.wallElements} SVG elements.`
    );
  } catch (err) {
    console.error(err);
    ui.notifications.error(`Import failed: ${err.message}`);
  }
})();

(async () => {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can run this macro.");

  const { DialogV2 } = foundry.applications.api;
  const GRID_SIZE = 100;
  let CELL_OFFSET = 0;
  let ROOM_OFFSET = 0;
  let MARK_OFFSET = 0;
  let SCENE_COLS = 0;
  let SCENE_ROWS = 0;

  function getBaseName(filename) {
    return String(filename || "").replace(/\.[^/.]+$/, "");
  }

  function sanitizeFilename(name) {
    return String(name || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "map";
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toMarker(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
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

  async function ensureDonjonImportJournalFolder() {
    const folderName = "DonJon Import";
    const existing = game.folders.find((f) => f.type === "JournalEntry" && f.name === folderName);
    if (existing) return existing.id;

    const created = await Folder.create({
      name: folderName,
      type: "JournalEntry",
      color: "#6f7b8a",
      sorting: "a"
    });
    return created?.id || null;
  }

  async function readTextFile(file) {
    return file.text();
  }

  async function getImagePixelData(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return reject(new Error("Canvas context unavailable for image analysis."));
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({ width: canvas.width, height: canvas.height, data: data.data });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error(`Failed to load image for analysis: ${src}`));
      img.src = src;
    });
  }

  function sampleLuma(imageData, x, y) {
    const ix = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
    const i = (iy * imageData.width + ix) * 4;
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  function hasImageWallSupport(wall, imageData, sceneWidth, sceneHeight, keepPoints = [], keepRadius = 0) {
    if ((wall.door || 0) > 0) return true;

    const [sx1, sy1, sx2, sy2] = wall.c;
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return false;

    const scaleX = imageData.width / Math.max(1, sceneWidth);
    const scaleY = imageData.height / Math.max(1, sceneHeight);

    const ix1 = sx1 * scaleX;
    const iy1 = sy1 * scaleY;
    const ix2 = sx2 * scaleX;
    const iy2 = sy2 * scaleY;
    const idx = ix2 - ix1;
    const idy = iy2 - iy1;
    const ilen = Math.hypot(idx, idy);
    if (ilen < 0.5) return false;

    if (keepPoints.length && keepRadius > 0) {
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      for (const p of keepPoints) {
        if (Math.hypot(mx - p.x, my - p.y) <= keepRadius) return true;
        if (Math.hypot(sx1 - p.x, sy1 - p.y) <= keepRadius) return true;
        if (Math.hypot(sx2 - p.x, sy2 - p.y) <= keepRadius) return true;
      }
    }

    const nx = -idy / ilen;
    const ny = idx / ilen;
    const offset = 1.6; 

    const samples = Math.max(6, Math.min(36, Math.round(ilen / 6)));
    let darkHits = 0;
    let edgeHits = 0;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = ix1 + idx * t;
      const y = iy1 + idy * t;

      const c = sampleLuma(imageData, x, y);
      const a = sampleLuma(imageData, x + nx * offset, y + ny * offset);
      const b = sampleLuma(imageData, x - nx * offset, y - ny * offset);
      const contrast = Math.abs(a - b);

      if (c <= 95) darkHits++;
      if (contrast >= 28) edgeHits++;
    }

    const total = samples + 1;
    const darkRatio = darkHits / total;
    const edgeRatio = edgeHits / total;
    return darkRatio >= 0.24 || edgeRatio >= 0.34;
  }

  function filterWallsByImageSupport(walls, imageData, sceneWidth, sceneHeight, keepPoints = [], keepRadius = 0) {
    return walls.filter((w) => hasImageWallSupport(w, imageData, sceneWidth, sceneHeight, keepPoints, keepRadius));
  }

  function getDanglingEndpoints(walls) {
    const degree = buildEndpointDegree(walls);
    const out = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if ((w.door || 0) > 0) continue;
      const p1 = { x: Math.round(w.c[0]), y: Math.round(w.c[1]) };
      const p2 = { x: Math.round(w.c[2]), y: Math.round(w.c[3]) };
      if ((degree.get(`${p1.x},${p1.y}`) || 0) === 1) out.push({ wallIndex: i, ...p1 });
      if ((degree.get(`${p2.x},${p2.y}`) || 0) === 1) out.push({ wallIndex: i, ...p2 });
    }
    return out;
  }

  function buildImageSupportedGapBridges(walls, imageData, sceneWidth, sceneHeight, maxDistance = 70) {
    const dangles = getDanglingEndpoints(walls);
    if (dangles.length < 2) return [];

    const bridges = [];
    const used = new Set();

    for (let i = 0; i < dangles.length; i++) {
      const a = dangles[i];
      let best = null;
      let bestDist = Infinity;

      for (let j = 0; j < dangles.length; j++) {
        if (i === j) continue;
        const b = dangles[j];
        if (a.wallIndex === b.wallIndex) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 3 || dist > maxDistance) continue;
        if (dist < bestDist) {
          bestDist = dist;
          best = b;
        }
      }

      if (!best) continue;
      const keyA = `${a.x},${a.y}`;
      const keyB = `${best.x},${best.y}`;
      const edgeKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
      if (used.has(edgeKey)) continue;

      const candidate = { c: [a.x, a.y, best.x, best.y], door: 0, ds: 0 };
      const supported = hasImageWallSupport(candidate, imageData, sceneWidth, sceneHeight, [], 0);
      if (!supported) continue;

      used.add(edgeKey);
      bridges.push(candidate);
    }

    return bridges;
  }

  function buildTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function getSafeExtension(filename) {
    const ext = String(filename || "").split(".").pop() || "img";
    return sanitizeFilename(ext).toLowerCase() || "img";
  }

  async function convertImageToUploadFile(file, quality = 0.92) {
    const base = sanitizeFilename(getBaseName(file?.name || "")) || "map";
    const stamp = buildTimestamp();
    const webpName = `${base}_${stamp}.webp`;

    try {
      const blob = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get canvas context.");
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => {
              URL.revokeObjectURL(url);
              if (!b) return reject(new Error("WebP conversion returned empty blob."));
              resolve(b);
            }, "image/webp", quality);
          } catch (err) {
            URL.revokeObjectURL(url);
            reject(err);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Image decode failed."));
        };

        img.src = url;
      });

      return new File([blob], webpName, { type: "image/webp", lastModified: Date.now() });
    } catch (err) {
      console.warn("WebP conversion failed, uploading original format instead:", err);
      const fallbackName = `${base}_${stamp}.${getSafeExtension(file?.name)}`;
      return new File([file], fallbackName, {
        type: file?.type || "application/octet-stream",
        lastModified: Date.now()
      });
    }
  }

  function isWalkableCell(v) {
    return ((v & 2) !== 0) || ((v & 4) !== 0);
  }

  function toSceneCell(n, offset = ROOM_OFFSET) {
    return Number(n) - offset;
  }

  function sceneBoundaryFromMapCell(n, offset = ROOM_OFFSET) {
    return Math.round(toSceneCell(n, offset) * GRID_SIZE);
  }

  function sceneCenterFromMapCell(n, offset = ROOM_OFFSET) {
    return Math.round((toSceneCell(n, offset) + 0.5) * GRID_SIZE);
  }

  function detectFeatureOffset(mapData, cellOffset, sceneCols, sceneRows) {
    const coords = [];
    const rooms = Array.isArray(mapData?.rooms) ? mapData.rooms.filter(Boolean) : [];
    for (const r of rooms) {
      for (const v of [r.west, r.east, r.north, r.south]) {
        if (Number.isFinite(v)) coords.push(v);
      }
      const doors = r?.doors || {};
      for (const dir of ["north", "east", "south", "west"]) {
        const list = Array.isArray(doors[dir]) ? doors[dir] : [];
        for (const d of list) {
          if (Number.isFinite(d?.col)) coords.push(d.col);
          if (Number.isFinite(d?.row)) coords.push(d.row);
        }
      }
    }

    if (!coords.length) return cellOffset;

    const minCoord = Math.min(...coords);
    const maxCoord = Math.max(...coords);
    const playableMax = Math.max(sceneCols - 1, sceneRows - 1);
    const looksPlayableSpace = minCoord >= 0 && maxCoord <= playableMax;
    return looksPlayableSpace ? 0 : cellOffset;
  }

  function detectMarkOffset(mapData, cellOffset, sceneCols, sceneRows) {
    const marks = [];
    const rows = Array.isArray(mapData?.cells) ? mapData.cells.length : 0;
    const cols = rows ? mapData.cells[0].length : 0;
    const sceneCellOffset = CELL_OFFSET;
    for (const feat of Object.values(mapData?.corridor_features || {})) {
      const list = Array.isArray(feat?.marks) ? feat.marks : [];
      for (const m of list) {
        if (Number.isFinite(m?.col) && Number.isFinite(m?.row)) marks.push({ col: m.col, row: m.row });
      }
    }

    if (!marks.length) return 0;

    const isWalkableCell = (v) => ((v & 2) !== 0) || ((v & 4) !== 0);
    const scoreOffset = (offset) => {
      let inBounds = 0;
      let walkable = 0;
      for (const m of marks) {
        const sx = m.col - offset;
        const sy = m.row - offset;
        if (sx < 0 || sx >= sceneCols || sy < 0 || sy >= sceneRows) continue;
        inBounds++;

        const mx = sx + sceneCellOffset;
        const my = sy + sceneCellOffset;
        if (mx < 0 || mx >= cols || my < 0 || my >= rows) continue;
        const cell = Number(mapData.cells?.[my]?.[mx] ?? 0);
        if (isWalkableCell(cell)) walkable++;
      }
      return { offset, inBounds, walkable };
    };

    const zeroScore = scoreOffset(0);
    const bleedScore = scoreOffset(cellOffset);

    if (bleedScore.walkable > zeroScore.walkable) return cellOffset;
    if (zeroScore.walkable > bleedScore.walkable) return 0;
    if (bleedScore.inBounds > zeroScore.inBounds) return cellOffset;
    if (zeroScore.inBounds > bleedScore.inBounds) return 0;
    return cellOffset;
  }

  function resolveMarkOffset(col, row) {
    const inBoundsFor = (offset) => {
      const sx = toSceneCell(col, offset);
      const sy = toSceneCell(row, offset);
      return sx >= 0 && sx < SCENE_COLS && sy >= 0 && sy < SCENE_ROWS;
    };

    if (inBoundsFor(MARK_OFFSET)) return MARK_OFFSET;
    if (inBoundsFor(CELL_OFFSET)) return CELL_OFFSET;
    if (inBoundsFor(ROOM_OFFSET)) return ROOM_OFFSET;
    if (inBoundsFor(0)) return 0;

    return MARK_OFFSET;
  }

  function computeMaskShift(mask) {
    let shift = 0;
    let m = mask >>> 0;
    while (m && (m & 1) === 0) {
      m >>>= 1;
      shift++;
    }
    return shift;
  }

  function optimizeAxisWalls(walls) {
    const h = walls
      .filter((w) => Math.round(w.y1) === Math.round(w.y2))
      .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

    const v = walls
      .filter((w) => Math.round(w.x1) === Math.round(w.x2))
      .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

    const merge = (list, horizontal) => {
      if (!list.length) return [];
      const out = [];
      let cur = { ...list[0] };

      for (let i = 1; i < list.length; i++) {
        const n = list[i];
        const touch = horizontal
          ? Math.round(cur.y1) === Math.round(n.y1) && Math.round(cur.x2) === Math.round(n.x1)
          : Math.round(cur.x1) === Math.round(n.x1) && Math.round(cur.y2) === Math.round(n.y1);

        if (touch) {
          if (horizontal) cur.x2 = n.x2;
          else cur.y2 = n.y2;
        } else {
          out.push(cur);
          cur = { ...n };
        }
      }

      out.push(cur);
      return out;
    };

    return [...merge(h, true), ...merge(v, false)];
  }

  function collapseAxisOverlaps(walls) {
    const doors = walls.filter((w) => (w.door || 0) > 0).map((w) => ({ ...w, c: w.c.map((n) => Math.round(n)) }));
    const others = walls.filter((w) => (w.door || 0) === 0);
    const vertical = new Map();
    const horizontal = new Map();
    const nonAxis = [];

    for (const w of others) {
      const [x1, y1, x2, y2] = w.c.map((n) => Math.round(n));
      if (x1 === x2) {
        const key = String(x1);
        if (!vertical.has(key)) vertical.set(key, []);
        vertical.get(key).push([Math.min(y1, y2), Math.max(y1, y2)]);
      } else if (y1 === y2) {
        const key = String(y1);
        if (!horizontal.has(key)) horizontal.set(key, []);
        horizontal.get(key).push([Math.min(x1, x2), Math.max(x1, x2)]);
      } else {
        nonAxis.push({ ...w, c: [x1, y1, x2, y2] });
      }
    }

    const mergeIntervals = (intervals) => {
      if (!intervals.length) return [];
      const sorted = intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const out = [sorted[0].slice()];
      for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i];
        const last = out[out.length - 1];
        if (cur[0] <= (last[1] + 1)) last[1] = Math.max(last[1], cur[1]);
        else out.push(cur.slice());
      }
      return out;
    };

    const merged = [...nonAxis];

    for (const [xKey, ranges] of vertical.entries()) {
      const x = Number(xKey);
      for (const [y0, y1] of mergeIntervals(ranges)) {
        if (y0 === y1) continue;
        merged.push({ c: [x, y0, x, y1], door: 0, ds: 0 });
      }
    }

    for (const [yKey, ranges] of horizontal.entries()) {
      const y = Number(yKey);
      for (const [x0, x1] of mergeIntervals(ranges)) {
        if (x0 === x1) continue;
        merged.push({ c: [x0, y, x1, y], door: 0, ds: 0 });
      }
    }

    return [...merged, ...doors];
  }

  function pointInEllipse(px, py, cx, cy, rx, ry) {
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return (dx * dx + dy * dy) <= 1;
  }

  function pointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      const intersect =
        (yi > py) !== (yj > py) &&
        px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function polygonVertices(cx, cy, rx, ry, sides, rotation = -Math.PI / 2) {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = rotation + (Math.PI * 2 * i) / sides;
      out.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
    }
    return out;
  }

  function wallsFromVertices(vertices) {
    const walls = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      walls.push({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0 });
    }
    return walls;
  }

  function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-9) return { t: 0, x: x1, y: y1, distance: Math.hypot(px - x1, py - y1) };
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const x = x1 + t * dx;
    const y = y1 + t * dy;
    return { t, x, y, distance: Math.hypot(px - x, py - y) };
  }

  function orientation(ax, ay, bx, by, cx, cy) {
    const v = ((by - ay) * (cx - bx)) - ((bx - ax) * (cy - by));
    if (Math.abs(v) < 1e-9) return 0;
    return v > 0 ? 1 : 2;
  }

  function onSegment(ax, ay, bx, by, cx, cy) {
    return (
      bx <= Math.max(ax, cx) + 1e-9 &&
      bx + 1e-9 >= Math.min(ax, cx) &&
      by <= Math.max(ay, cy) + 1e-9 &&
      by + 1e-9 >= Math.min(ay, cy)
    );
  }

  function segmentsIntersect(a1, a2, b1, b2) {
    const o1 = orientation(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
    const o2 = orientation(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
    const o3 = orientation(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
    const o4 = orientation(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a1.x, a1.y, b1.x, b1.y, a2.x, a2.y)) return true;
    if (o2 === 0 && onSegment(a1.x, a1.y, b2.x, b2.y, a2.x, a2.y)) return true;
    if (o3 === 0 && onSegment(b1.x, b1.y, a1.x, a1.y, b2.x, b2.y)) return true;
    if (o4 === 0 && onSegment(b1.x, b1.y, a2.x, a2.y, b2.x, b2.y)) return true;
    return false;
  }

  function splitSegmentByPoints(wall, points, radius) {
    const [x1, y1, x2, y2] = wall.c;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];

    const cuts = [];
    for (const p of points) {
      const proj = projectPointToSegment(p.x, p.y, x1, y1, x2, y2);
      if (proj.distance > radius) continue;
      const dt = Math.sqrt(Math.max(0, radius * radius - proj.distance * proj.distance)) / len;
      cuts.push([Math.max(0, proj.t - dt), Math.min(1, proj.t + dt)]);
    }

    if (!cuts.length) return [wall];

    cuts.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const c of cuts) {
      const last = merged[merged.length - 1];
      if (!last || c[0] > last[1]) merged.push(c);
      else last[1] = Math.max(last[1], c[1]);
    }

    const keep = [];
    let s = 0;
    for (const [cs, ce] of merged) {
      if (cs > s) keep.push([s, cs]);
      s = Math.max(s, ce);
    }
    if (s < 1) keep.push([s, 1]);

    return keep
      .filter(([a, b]) => (b - a) > 0.01)
      .map(([a, b]) => ({
        c: [
          Math.round(x1 + dx * a),
          Math.round(y1 + dy * a),
          Math.round(x1 + dx * b),
          Math.round(y1 + dy * b)
        ],
        door: 0,
        ds: 0
      }));
  }

  function splitSegmentByOpenings(wall, openings) {
    const [x1, y1, x2, y2] = wall.c;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];

    const cuts = [];
    for (const o of openings) {
      const r = Math.max(0, Number(o.r) || 0);
      if (r <= 0) continue;
      const proj = projectPointToSegment(o.x, o.y, x1, y1, x2, y2);
      if (proj.distance > r) continue;
      const dt = Math.sqrt(Math.max(0, r * r - proj.distance * proj.distance)) / len;
      cuts.push([Math.max(0, proj.t - dt), Math.min(1, proj.t + dt)]);
    }
    if (!cuts.length) return [wall];

    cuts.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const c of cuts) {
      const last = merged[merged.length - 1];
      if (!last || c[0] > last[1]) merged.push(c);
      else last[1] = Math.max(last[1], c[1]);
    }

    const keep = [];
    let s = 0;
    for (const [cs, ce] of merged) {
      if (cs > s) keep.push([s, cs]);
      s = Math.max(s, ce);
    }
    if (s < 1) keep.push([s, 1]);

    return keep
      .filter(([a, b]) => (b - a) > 0.01)
      .map(([a, b]) => ({
        c: [
          Math.round(x1 + dx * a),
          Math.round(y1 + dy * a),
          Math.round(x1 + dx * b),
          Math.round(y1 + dy * b)
        ],
        door: 0,
        ds: 0
      }));
  }

  function cutWallsByOpenings(walls, openings) {
    if (!openings.length) return walls;
    const out = [];
    for (const w of walls) out.push(...splitSegmentByOpenings(w, openings));
    return out;
  }

  function cutWallsForDoors(walls, doorPoints, radius, forceNearest = false) {
    if (!doorPoints.length) return walls;

    const nearest = new Map();
    if (forceNearest) {
      for (const p of doorPoints) {
        let bestIdx = -1;
        let best = null;
        for (let i = 0; i < walls.length; i++) {
          const [x1, y1, x2, y2] = walls[i].c;
          const proj = projectPointToSegment(p.x, p.y, x1, y1, x2, y2);
          if (!best || proj.distance < best.distance) {
            best = proj;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0 && best) {
          if (!nearest.has(bestIdx)) nearest.set(bestIdx, []);
          nearest.get(bestIdx).push({ x: best.x, y: best.y });
        }
      }
    }

    const out = [];
    for (let i = 0; i < walls.length; i++) {
      const extras = nearest.get(i) || [];
      const points = forceNearest ? extras : [...doorPoints, ...extras];
      out.push(...splitSegmentByPoints(walls[i], points, radius));
    }
    return out;
  }

  function getSegmentLength(w) {
    const [x1, y1, x2, y2] = w.c;
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function removeDoorStubs(walls, doorPoints, radius, maxStubLen) {
    return walls.filter((w) => {
      if (w.portalExt) return true;
      if ((w.door || 0) > 0) return true;
      const len = getSegmentLength(w);
      if (len > maxStubLen) return true;

      const [x1, y1, x2, y2] = w.c;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;

      for (const p of doorPoints) {
        const midDist = Math.hypot(mx - p.x, my - p.y);
        if (midDist <= radius) return false;

        const d1 = Math.hypot(x1 - p.x, y1 - p.y);
        const d2 = Math.hypot(x2 - p.x, y2 - p.y);
        if (d1 <= radius && d2 <= radius) return false;
      }

      return true;
    });
  }

  function pruneDanglingNearDoors(walls, doorPoints, nearRadius, maxLen, maxPasses = 3) {
    let list = [...walls];
    for (let pass = 0; pass < maxPasses; pass++) {
      const degree = new Map();
      for (const w of list) {
        const [x1, y1, x2, y2] = w.c.map((n) => Math.round(n));
        const a = `${x1},${y1}`;
        const b = `${x2},${y2}`;
        degree.set(a, (degree.get(a) || 0) + 1);
        degree.set(b, (degree.get(b) || 0) + 1);
      }

      let removed = 0;
      const next = [];
      for (const w of list) {
        if (w.portalExt) {
          next.push(w);
          continue;
        }
        if ((w.door || 0) > 0) {
          next.push(w);
          continue;
        }

        const [x1, y1, x2, y2] = w.c;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > maxLen) {
          next.push(w);
          continue;
        }

        const a = `${Math.round(x1)},${Math.round(y1)}`;
        const b = `${Math.round(x2)},${Math.round(y2)}`;
        const dangling = (degree.get(a) || 0) <= 1 || (degree.get(b) || 0) <= 1;
        if (!dangling) {
          next.push(w);
          continue;
        }

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        let nearDoor = false;
        for (const p of doorPoints) {
          const dm = Math.hypot(mx - p.x, my - p.y);
          const d1 = Math.hypot(x1 - p.x, y1 - p.y);
          const d2 = Math.hypot(x2 - p.x, y2 - p.y);
          if (dm <= nearRadius || d1 <= nearRadius || d2 <= nearRadius) {
            nearDoor = true;
            break;
          }
        }

        if (nearDoor) removed++;
        else next.push(w);
      }

      list = next;
      if (!removed) break;
    }
    return list;
  }

  function dedupeWalls(walls) {
    const seen = new Set();
    const out = [];

    for (const w of walls) {
      const [x1, y1, x2, y2] = w.c.map((n) => Math.round(n));
      const a = `${x1},${y1}`;
      const b = `${x2},${y2}`;
      const key = a < b
        ? `${a}|${b}|${w.door || 0}|${w.ds || 0}`
        : `${b}|${a}|${w.door || 0}|${w.ds || 0}`;

      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...w, c: [x1, y1, x2, y2] });
    }

    return out;
  }

  function dedupeDoorWalls(walls) {
    const bySegment = new Map();
    const segmentKey = (w) => {
      const [x1, y1, x2, y2] = w.c.map((n) => Math.round(n));
      const a = `${x1},${y1}`;
      const b = `${x2},${y2}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    const doorScore = (w) => {
      const door = Number(w.door || 0);
      const ds = Number(w.ds || 0);
      return (door * 10) + ds;
    };

    for (const w of walls) {
      const key = segmentKey(w);
      const prev = bySegment.get(key);
      if (!prev) {
        bySegment.set(key, w);
        continue;
      }

      const prevDoor = Number(prev.door || 0) > 0;
      const curDoor = Number(w.door || 0) > 0;

      if (!prevDoor && curDoor) {
        bySegment.set(key, w);
        continue;
      }
      if (prevDoor && curDoor && doorScore(w) > doorScore(prev)) {
        bySegment.set(key, w);
      }
    }

    return Array.from(bySegment.values());
  }

  function snapAndWeldWalls(walls, snapDist = 10) {
    if (!walls.length) return walls;
    const pts = [];
    for (const w of walls) {
      pts.push({ x: w.c[0], y: w.c[1] });
      pts.push({ x: w.c[2], y: w.c[3] });
    }

    const clusters = [];
    for (const p of pts) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0 && bestD <= snapDist) {
        const c = clusters[best];
        c.x = (c.x * c.n + p.x) / (c.n + 1);
        c.y = (c.y * c.n + p.y) / (c.n + 1);
        c.n++;
      } else {
        clusters.push({ x: p.x, y: p.y, n: 1 });
      }
    }

    const snapPoint = (x, y) => {
      let best = null;
      let bestD = Infinity;
      for (const c of clusters) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best && bestD <= snapDist) return [Math.round(best.x), Math.round(best.y)];
      return [Math.round(x), Math.round(y)];
    };

    return walls
      .map((w) => {
        const [sx, sy] = snapPoint(w.c[0], w.c[1]);
        const [ex, ey] = snapPoint(w.c[2], w.c[3]);
        return { ...w, c: [sx, sy, ex, ey] };
      })
      .filter((w) => !(w.c[0] === w.c[2] && w.c[1] === w.c[3]));
  }

  function getRoomDoorRecords(room) {
    const out = [];
    const doors = room?.doors || {};

    for (const dir of ["north", "east", "south", "west"]) {
      const list = Array.isArray(doors[dir]) ? doors[dir] : [];
      for (const d of list) {
        if (!Number.isFinite(d?.col) || !Number.isFinite(d?.row)) continue;
        out.push({
          dir,
          col: d.col,
          row: d.row,
          type: String(d.type || "door").toLowerCase(),
          desc: String(d.desc || "")
        });
      }
    }

    return out;
  }

  function dedupeDoorRecords(doorRecords) {
    const order = ["arch", "door", "locked", "portcullis", "secret"];
    const rank = (t) => {
      const i = order.indexOf(String(t || "").toLowerCase());
      return i < 0 ? 1 : i;
    };

    const byPos = new Map();
    for (const d of doorRecords) {
      const c = doorCenterPoint(d);
      const vertical = d.dir === "east" || d.dir === "west";
      const key = `${vertical ? "v" : "h"}|${c.x}|${c.y}`;
      const prev = byPos.get(key);
      if (!prev || rank(d.type) > rank(prev.type)) byPos.set(key, d);
    }
    return Array.from(byPos.values());
  }

  function doorTypeToFoundry(type) {
    const DT = CONST.WALL_DOOR_TYPES;
    const DS = CONST.WALL_DOOR_STATES;

    if (type === "arch") return null;

    const secret = type === "secret";
    const locked = type === "locked" || type === "portcullis";

    return {
      door: secret ? DT.SECRET : DT.DOOR,
      ds: locked ? DS.LOCKED : DS.CLOSED
    };
  }

  function buildDoorSegments(doorRecords) {
    const out = [];
    const doorLen = Math.round(GRID_SIZE);

    for (const d of doorRecords) {
      const mapped = doorTypeToFoundry(d.type);
      if (!mapped) continue;

      const { x: cx, y: cy } = doorCenterPoint(d);

      if (d.dir === "north" || d.dir === "south") {
        out.push({
          c: [cx - Math.floor(doorLen / 2), cy, cx + Math.floor(doorLen / 2), cy],
          door: mapped.door,
          ds: mapped.ds
        });
      } else {
        out.push({
          c: [cx, cy - Math.floor(doorLen / 2), cx, cy + Math.floor(doorLen / 2)],
          door: mapped.door,
          ds: mapped.ds
        });
      }
    }

    return out;
  }

  function doorAnchorPoint(d) {
    const dir = String(d?.dir || "").toLowerCase();
    const col = Number(d?.col);
    const row = Number(d?.row);

    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      return {
        x: sceneCenterFromMapCell(col),
        y: sceneCenterFromMapCell(row)
      };
    }

    
    
    if (dir === "north") return { x: sceneCenterFromMapCell(col), y: sceneBoundaryFromMapCell(row + 1) };
    if (dir === "south") return { x: sceneCenterFromMapCell(col), y: sceneBoundaryFromMapCell(row) };
    if (dir === "west") return { x: sceneBoundaryFromMapCell(col + 1), y: sceneCenterFromMapCell(row) };
    if (dir === "east") return { x: sceneBoundaryFromMapCell(col), y: sceneCenterFromMapCell(row) };

    return {
      x: sceneCenterFromMapCell(col),
      y: sceneCenterFromMapCell(row)
    };
  }

  function doorCenterPoint(d) {
    const col = Number(d?.col);
    const row = Number(d?.row);
    return {
      x: sceneCenterFromMapCell(col),
      y: sceneCenterFromMapCell(row)
    };
  }

  function splitWallAtPoint(wall, px, py, tEpsilon = 0.02) {
    const [x1, y1, x2, y2] = wall.c;
    const proj = projectPointToSegment(px, py, x1, y1, x2, y2);
    if (proj.t <= tEpsilon || proj.t >= (1 - tEpsilon)) return [wall];

    const mx = Math.round(proj.x);
    const my = Math.round(proj.y);
    return [
      { ...wall, c: [Math.round(x1), Math.round(y1), mx, my] },
      { ...wall, c: [mx, my, Math.round(x2), Math.round(y2)] }
    ].filter((w) => !(w.c[0] === w.c[2] && w.c[1] === w.c[3]));
  }

  function rayHitSegment(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1;
    const sy = y2 - y1;
    const det = (dx * sy) - (dy * sx);
    if (Math.abs(det) < 1e-9) return null;

    const qx = x1 - ox;
    const qy = y1 - oy;
    const t = ((qx * sy) - (qy * sx)) / det; 
    const u = ((qx * dy) - (qy * dx)) / det; 
    if (t < 0 || u < 0 || u > 1) return null;
    return { t, x: ox + (dx * t), y: oy + (dy * t) };
  }

  function firstRayHitOnWalls(origin, dir, walls, maxDistance = Infinity) {
    const len = Math.hypot(dir.x, dir.y);
    if (len < 1e-6) return null;
    const ux = dir.x / len;
    const uy = dir.y / len;
    let best = null;
    for (const w of walls) {
      const [x1, y1, x2, y2] = w.c;
      const hit = rayHitSegment(origin.x, origin.y, ux, uy, x1, y1, x2, y2);
      if (!hit) continue;
      if (!best || hit.t < best.t) best = hit;
    }
    if (!best || best.t > maxDistance) return null;
    return { x: Math.round(best.x), y: Math.round(best.y), distance: best.t };
  }

  function closestPointOnWalls(walls, point, maxDistance = Infinity) {
    let best = null;
    let bestDistance = Infinity;
    for (const w of walls) {
      const [x1, y1, x2, y2] = w.c;
      const proj = projectPointToSegment(point.x, point.y, x1, y1, x2, y2);
      if (proj.distance < bestDistance) {
        bestDistance = proj.distance;
        best = { x: Math.round(proj.x), y: Math.round(proj.y), distance: proj.distance };
      }
    }
    if (!best || best.distance > maxDistance) return null;
    return best;
  }

  function closestPointOnWallsDirectional(walls, point, inward, maxDistance = Infinity) {
    const ilen = Math.hypot(inward.x, inward.y);
    if (ilen < 1e-6) return closestPointOnWalls(walls, point, maxDistance);
    const ux = inward.x / ilen;
    const uy = inward.y / ilen;
    const tx = -uy;
    const ty = ux;

    let best = null;
    let bestLateral = Infinity;
    let bestDistance = Infinity;
    for (const w of walls) {
      const [x1, y1, x2, y2] = w.c;
      const proj = projectPointToSegment(point.x, point.y, x1, y1, x2, y2);
      const vx = proj.x - point.x;
      const vy = proj.y - point.y;
      const forward = (vx * ux) + (vy * uy);
      if (forward < -1) continue; 
      const lateral = Math.abs((vx * tx) + (vy * ty));
      if (lateral + 1e-6 < bestLateral || (Math.abs(lateral - bestLateral) <= 1e-6 && proj.distance < bestDistance)) {
        bestLateral = lateral;
        bestDistance = proj.distance;
        best = { x: Math.round(proj.x), y: Math.round(proj.y), distance: proj.distance };
      }
    }
    if (!best || best.distance > maxDistance) return null;
    return best;
  }

  function getPortalSidesForDoor(d) {
    const col = Number(d.col);
    const row = Number(d.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    const dir = String(d.dir || "").toLowerCase();

    if (dir === "north") {
      const y = sceneBoundaryFromMapCell(row + 1);
      return {
        points: [
          { x: sceneBoundaryFromMapCell(col), y },
          { x: sceneBoundaryFromMapCell(col + 1), y }
        ],
        inward: { x: 0, y: 1 }
      };
    }
    if (dir === "south") {
      const y = sceneBoundaryFromMapCell(row);
      return {
        points: [
          { x: sceneBoundaryFromMapCell(col), y },
          { x: sceneBoundaryFromMapCell(col + 1), y }
        ],
        inward: { x: 0, y: -1 }
      };
    }
    if (dir === "west") {
      const x = sceneBoundaryFromMapCell(col + 1);
      return {
        points: [
          { x, y: sceneBoundaryFromMapCell(row) },
          { x, y: sceneBoundaryFromMapCell(row + 1) }
        ],
        inward: { x: 1, y: 0 }
      };
    }
    if (dir === "east") {
      const x = sceneBoundaryFromMapCell(col);
      return {
        points: [
          { x, y: sceneBoundaryFromMapCell(row) },
          { x, y: sceneBoundaryFromMapCell(row + 1) }
        ],
        inward: { x: -1, y: 0 }
      };
    }
    return null;
  }

  function splitWallsAtPoints(walls, points, tolerance = 1.5) {
    const out = [];
    for (const wall of walls) {
      const [x1, y1, x2, y2] = wall.c;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = (dx * dx) + (dy * dy);
      if (len2 < 1e-9) continue;

      const ts = [0, 1];
      for (const p of points) {
        const proj = projectPointToSegment(p.x, p.y, x1, y1, x2, y2);
        if (proj.distance > tolerance) continue;
        if (proj.t <= 0.01 || proj.t >= 0.99) continue;
        ts.push(proj.t);
      }

      ts.sort((a, b) => a - b);
      const uniq = [];
      for (const t of ts) {
        if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-4) uniq.push(t);
      }

      for (let i = 0; i < uniq.length - 1; i++) {
        const a = uniq[i];
        const b = uniq[i + 1];
        if ((b - a) <= 1e-4) continue;
        const sx = Math.round(x1 + (dx * a));
        const sy = Math.round(y1 + (dy * a));
        const ex = Math.round(x1 + (dx * b));
        const ey = Math.round(y1 + (dy * b));
        if (sx === ex && sy === ey) continue;
        out.push({ ...wall, c: [sx, sy, ex, ey] });
      }
    }
    return out;
  }

  function segmentIntersection(a1, a2, b1, b2) {
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    const s = { x: b2.x - b1.x, y: b2.y - b1.y };
    const denom = (r.x * s.y) - (r.y * s.x);
    if (Math.abs(denom) < 1e-9) return null;
    const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
    const t = ((qp.x * s.y) - (qp.y * s.x)) / denom;
    const u = ((qp.x * r.y) - (qp.y * r.x)) / denom;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { x: a1.x + (r.x * t), y: a1.y + (r.y * t) };
  }

  function buildPortalStepRect(pA, pB, inward, stepIndex) {
    const d0 = stepIndex * GRID_SIZE;
    const d1 = (stepIndex + 1) * GRID_SIZE;
    const nearA = { x: pA.x + (inward.x * d0), y: pA.y + (inward.y * d0) };
    const nearB = { x: pB.x + (inward.x * d0), y: pB.y + (inward.y * d0) };
    const farA = { x: pA.x + (inward.x * d1), y: pA.y + (inward.y * d1) };
    const farB = { x: pB.x + (inward.x * d1), y: pB.y + (inward.y * d1) };
    return { nearA, nearB, farB, farA };
  }

  function estimateStepRectOverlap(rect, containsFn, samples = 5) {
    let inside = 0;
    let total = 0;
    for (let i = 0; i < samples; i++) {
      const u = (i + 0.5) / samples;
      const sx0 = rect.nearA.x + ((rect.nearB.x - rect.nearA.x) * u);
      const sy0 = rect.nearA.y + ((rect.nearB.y - rect.nearA.y) * u);
      const sx1 = rect.farA.x + ((rect.farB.x - rect.farA.x) * u);
      const sy1 = rect.farA.y + ((rect.farB.y - rect.farA.y) * u);
      for (let j = 0; j < samples; j++) {
        const v = (j + 0.5) / samples;
        const x = sx0 + ((sx1 - sx0) * v);
        const y = sy0 + ((sy1 - sy0) * v);
        total++;
        if (containsFn(x, y)) inside++;
      }
    }
    return total > 0 ? inside / total : 0;
  }

  function ringRectIntersections(ringWalls, rect) {
    const edges = [
      [rect.nearA, rect.nearB],
      [rect.nearB, rect.farB],
      [rect.farB, rect.farA],
      [rect.farA, rect.nearA]
    ];
    const points = [];

    const addPoint = (p) => {
      for (const q of points) {
        if (Math.hypot(q.x - p.x, q.y - p.y) < 1) return;
      }
      points.push({ x: Math.round(p.x), y: Math.round(p.y) });
    };

    for (const w of ringWalls) {
      const a = { x: w.c[0], y: w.c[1] };
      const b = { x: w.c[2], y: w.c[3] };
      for (const [e1, e2] of edges) {
        const p = segmentIntersection(a, b, e1, e2);
        if (p) addPoint(p);
      }
    }
    return points;
  }

  function firstSegmentHitOnRing(start, end, ringWalls) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;

    let best = null;
    let bestDist = Infinity;
    for (const w of ringWalls) {
      const p = segmentIntersection(
        start,
        end,
        { x: w.c[0], y: w.c[1] },
        { x: w.c[2], y: w.c[3] }
      );
      if (!p) continue;
      const dist = Math.hypot(p.x - start.x, p.y - start.y);
      if (dist < 1e-6 || dist > (len + 1e-6)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: Math.round(p.x), y: Math.round(p.y), distance: dist };
      }
    }
    return best;
  }

  function choosePortalSideHits(points, pA, pB, inward) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const tx = -inward.y;
    const ty = inward.x;
    const proj = (p) => (p.x * tx) + (p.y * ty);
    const sorted = [...points].sort((a, b) => proj(a) - proj(b));
    const left = sorted[0];
    const right = sorted[sorted.length - 1];
    const aIsLeft = proj(pA) <= proj(pB);
    return aIsLeft ? { qA: left, qB: right } : { qA: right, qB: left };
  }

  function chooseRectHitForPortalSide(points, portalPoint, inward) {
    if (!Array.isArray(points) || !points.length) return null;
    const ilen = Math.hypot(inward.x, inward.y) || 1;
    const ux = inward.x / ilen;
    const uy = inward.y / ilen;
    const tx = -uy;
    const ty = ux;

    let best = null;
    let bestScore = Infinity;
    for (const p of points) {
      const vx = p.x - portalPoint.x;
      const vy = p.y - portalPoint.y;
      const forward = (vx * ux) + (vy * uy);
      if (forward < -1) continue;
      const lateral = Math.abs((vx * tx) + (vy * ty));
      const score = (lateral * 12) + forward;
      if (score < bestScore) {
        bestScore = score;
        best = { x: Math.round(p.x), y: Math.round(p.y) };
      }
    }
    return best;
  }

  function cutRingByPortalQuads(ringWalls, portalQuads) {
    if (!Array.isArray(portalQuads) || !portalQuads.length) return ringWalls;
    return ringWalls.filter((w) => {
      const mx = (w.c[0] + w.c[2]) / 2;
      const my = (w.c[1] + w.c[3]) / 2;
      return !portalQuads.some((quad) => pointInPolygon(mx, my, quad));
    });
  }

  function cutWallsByPortalQuads(walls, portalQuads) {
    if (!Array.isArray(portalQuads) || !portalQuads.length) return walls;
    const out = [];
    const quadEdges = portalQuads.map((quad) => ([
      [quad[0], quad[1]],
      [quad[1], quad[2]],
      [quad[2], quad[3]],
      [quad[3], quad[0]]
    ]));

    for (const w of walls) {
      if ((w.door || 0) > 0) {
        out.push(w);
        continue;
      }

      const [x1, y1, x2, y2] = w.c;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = (dx * dx) + (dy * dy);
      if (len2 < 1e-9) continue;

      const ts = [0, 1];
      for (const edges of quadEdges) {
        for (const [a, b] of edges) {
          const hit = segmentIntersection(
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            a,
            b
          );
          if (!hit) continue;
          const t = Math.abs(dx) >= Math.abs(dy)
            ? (Math.abs(dx) < 1e-9 ? 0 : (hit.x - x1) / dx)
            : (Math.abs(dy) < 1e-9 ? 0 : (hit.y - y1) / dy);
          if (t > 1e-5 && t < (1 - 1e-5)) ts.push(t);
        }
      }

      ts.sort((a, b) => a - b);
      const uniq = [];
      for (const t of ts) {
        if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-4) uniq.push(t);
      }

      for (let i = 0; i < uniq.length - 1; i++) {
        const t0 = uniq[i];
        const t1 = uniq[i + 1];
        if ((t1 - t0) <= 1e-4) continue;
        const mx = x1 + (dx * ((t0 + t1) * 0.5));
        const my = y1 + (dy * ((t0 + t1) * 0.5));
        const inside = portalQuads.some((quad) => pointInPolygon(mx, my, quad));
        if (inside) continue;

        const sx = Math.round(x1 + (dx * t0));
        const sy = Math.round(y1 + (dy * t0));
        const ex = Math.round(x1 + (dx * t1));
        const ey = Math.round(y1 + (dy * t1));
        if (sx === ex && sy === ey) continue;
        out.push({ ...w, c: [sx, sy, ex, ey] });
      }
    }

    return out;
  }

  function findPortalSideConnector(p, inward, ringWalls, maxReach) {
    const ilen = Math.hypot(inward.x, inward.y) || 1;
    const ux = inward.x / ilen;
    const uy = inward.y / ilen;

    const inwardOffsets = [0, 1, 2, 4, 8];
    for (const eps of inwardOffsets) {
      const origin = {
        x: p.x + (ux * eps),
        y: p.y + (uy * eps)
      };
      const hit = firstRayHitOnWalls(origin, inward, ringWalls, maxReach);
      if (hit) return { hit: { x: Math.round(hit.x), y: Math.round(hit.y) }, segments: [] };
    }

    const fallback = closestPointOnWallsDirectional(ringWalls, p, inward, maxReach);
    if (!fallback) return null;
    return { hit: { x: Math.round(fallback.x), y: Math.round(fallback.y) }, segments: [] };
  }

  function buildSpecialDoorConnectorSegments(ringWalls, roomDoors) {
    const connectors = [];
    const portalLinks = [];
    const splitPoints = [];
    const portalQuads = [];
    const ringVerts = ringWalls.map((w) => ({ x: w.c[0], y: w.c[1] }));
    const containsFn = (x, y) => pointInPolygon(x, y, ringVerts);
    const maxSteps = 10;

    const addConnectorSegment = (a, b) => {
      const x1 = Math.round(a.x);
      const y1 = Math.round(a.y);
      const x2 = Math.round(b.x);
      const y2 = Math.round(b.y);
      if (x1 === x2 && y1 === y2) return;
      connectors.push({
        c: [x1, y1, x2, y2],
        door: 0,
        ds: 0,
        portalExt: true
      });
    };

    for (const d of roomDoors) {
      const portal = getPortalSidesForDoor(d);
      if (!portal) continue;
      const [pA, pB] = portal.points;
      const inward = portal.inward;

      let chosenStep = 0;
      for (let s = 0; s < maxSteps; s++) {
        const rect = buildPortalStepRect(pA, pB, inward, s);
        if (estimateStepRectOverlap(rect, containsFn, 5) >= 0.5) {
          chosenStep = s;
          break;
        }
      }

      const rect = buildPortalStepRect(pA, pB, inward, chosenStep);

      
      const rayReach = GRID_SIZE * 16;
      const rayA = firstRayHitOnWalls(pA, inward, ringWalls, rayReach);
      const rayB = firstRayHitOnWalls(pB, inward, ringWalls, rayReach);
      let qA = rayA ? { x: rayA.x, y: rayA.y } : null;
      let qB = rayB ? { x: rayB.x, y: rayB.y } : null;

      
      if (!qA || !qB) {
        const hitA = firstSegmentHitOnRing(pA, rect.farA, ringWalls);
        const hitB = firstSegmentHitOnRing(pB, rect.farB, ringWalls);
        if (!qA && hitA) qA = { x: hitA.x, y: hitA.y };
        if (!qB && hitB) qB = { x: hitB.x, y: hitB.y };
      }

      
      if (!qA || !qB) {
        const rectPts = ringRectIntersections(ringWalls, rect);
        if (!qA) qA = chooseRectHitForPortalSide(rectPts, pA, inward);
        if (!qB) qB = chooseRectHitForPortalSide(rectPts, pB, inward);

        if ((!qA || !qB) && rectPts.length >= 2) {
          const sidePair = choosePortalSideHits(rectPts, pA, pB, inward);
          if (!qA && sidePair?.qA) qA = { x: sidePair.qA.x, y: sidePair.qA.y };
          if (!qB && sidePair?.qB) qB = { x: sidePair.qB.x, y: sidePair.qB.y };
        }
      }

      
      if (!qA || !qB) {
        const maxReach = GRID_SIZE * 8;
        if (!qA) {
          const cA = findPortalSideConnector(pA, inward, ringWalls, maxReach);
          if (cA) qA = cA.hit;
        }
        if (!qB) {
          const cB = findPortalSideConnector(pB, inward, ringWalls, maxReach);
          if (cB) qB = cB.hit;
        }
      }

      if (!qA || !qB) continue;

      const depth = (chosenStep + 1) * GRID_SIZE;
      portalLinks.push({ portal: pA, ring: qA, inward, depth });
      portalLinks.push({ portal: pB, ring: qB, inward, depth });
      splitPoints.push({ x: qA.x, y: qA.y });
      splitPoints.push({ x: qB.x, y: qB.y });
      portalQuads.push([pA, pB, qB, qA]);

      addConnectorSegment(pA, qA);
      addConnectorSegment(pB, qB);
    }

    return { connectors, splitPoints, portalLinks, portalQuads };
  }

  function snapPortalCorridorWallsToRing(cellWalls, portalLinks, endpointTolerance = 4) {
    if (!portalLinks?.length) return cellWalls;
    const cloned = cellWalls.map((w) => ({ ...w, c: [...w.c] }));
    const portalPoints = portalLinks.map((l) => l?.portal).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    const out = splitWallsAtPoints(cloned, portalPoints, Math.max(2, endpointTolerance + 12));

    for (const link of portalLinks) {
      const p = link?.portal;
      const q = link?.ring;
      const inward = link?.inward;
      if (!p || !q || !inward) continue;

      const vertical = Math.abs(inward.y) >= Math.abs(inward.x);
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      const qx = Math.round(q.x);
      const qy = Math.round(q.y);

      let best = null;
      for (let i = 0; i < out.length; i++) {
        const w = out[i];
        if ((w.door || 0) > 0) continue;
        const [x1, y1, x2, y2] = w.c;
        const isVertical = Math.round(x1) === Math.round(x2);
        const isHorizontal = Math.round(y1) === Math.round(y2);
        if (vertical && !isVertical) continue;
        if (!vertical && !isHorizontal) continue;

        let endpoint = -1;
        let dist = Infinity;
        const d1 = Math.hypot(x1 - px, y1 - py);
        if (d1 <= endpointTolerance) {
          endpoint = 0;
          dist = d1;
        }
        const d2 = Math.hypot(x2 - px, y2 - py);
        if (d2 <= endpointTolerance && d2 < dist) {
          endpoint = 1;
          dist = d2;
        }
        if (endpoint < 0) continue;

        const ox = endpoint === 0 ? x2 : x1;
        const oy = endpoint === 0 ? y2 : y1;
        const dot = ((ox - px) * inward.x) + ((oy - py) * inward.y);
        
        const score = dist + (dot > 0 ? 0 : 10000);
        if (!best || score < best.score) best = { i, endpoint, score };
      }

      if (best) {
        const w = out[best.i];
        
        if (best.endpoint === 0) {
          w.c[0] = px;
          w.c[1] = py;
          w.c[2] = qx;
          w.c[3] = qy;
        } else {
          w.c[2] = px;
          w.c[3] = py;
          w.c[0] = qx;
          w.c[1] = qy;
        }
        w.portalExt = true;
      } else {
        out.push({
          c: [px, py, qx, qy],
          door: 0,
          ds: 0,
          portalExt: true
        });
      }
    }

    return out;
  }

  function adaptSpecialConnectorsToCellWalls(connectors, cellWalls) {
    const nonDoorCell = cellWalls.filter((w) => (w.door || 0) === 0);

    const containsPointOnAxis = (w, x, y, vertical) => {
      const [x1, y1, x2, y2] = w.c;
      if (vertical) {
        if (Math.round(x1) !== Math.round(x2) || Math.round(x1) !== Math.round(x)) return false;
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        return y >= minY - 1 && y <= maxY + 1;
      }
      if (Math.round(y1) !== Math.round(y2) || Math.round(y1) !== Math.round(y)) return false;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      return x >= minX - 1 && x <= maxX + 1;
    };

    return connectors
      .map((w) => {
        const [qx, qy, px, py] = w.c;
        const vx = qx - px;
        const vy = qy - py;
        const vertical = Math.abs(vy) >= Math.abs(vx);
        const dir = vertical ? Math.sign(vy || 1) : Math.sign(vx || 1);
        const dist = Math.hypot(vx, vy);

        let bestAdvance = 0;
        let best = { x: px, y: py };

        for (const cw of nonDoorCell) {
          if (!containsPointOnAxis(cw, px, py, vertical)) continue;
          const [x1, y1, x2, y2] = cw.c;

          if (vertical) {
            const cand = dir > 0 ? Math.max(y1, y2) : Math.min(y1, y2);
            const adv = dir * (cand - py);
            if (adv > bestAdvance && adv < (dist - 2)) {
              bestAdvance = adv;
              best = { x: px, y: Math.round(cand) };
            }
          } else {
            const cand = dir > 0 ? Math.max(x1, x2) : Math.min(x1, x2);
            const adv = dir * (cand - px);
            if (adv > bestAdvance && adv < (dist - 2)) {
              bestAdvance = adv;
              best = { x: Math.round(cand), y: py };
            }
          }
        }

        return { ...w, c: [qx, qy, best.x, best.y] };
      })
      .filter((w) => !(Math.round(w.c[0]) === Math.round(w.c[2]) && Math.round(w.c[1]) === Math.round(w.c[3])));
  }

  function buildEndpointDegree(walls) {
    const degree = new Map();
    for (const w of walls) {
      const a = `${Math.round(w.c[0])},${Math.round(w.c[1])}`;
      const b = `${Math.round(w.c[2])},${Math.round(w.c[3])}`;
      degree.set(a, (degree.get(a) || 0) + 1);
      degree.set(b, (degree.get(b) || 0) + 1);
    }
    return degree;
  }

  function stitchDoorJunctions(walls, maxDistance = 26) {
    const others = walls.filter((w) => (w.door || 0) === 0).map((w) => ({ ...w, c: [...w.c] }));
    const doors = walls.filter((w) => (w.door || 0) > 0).map((w) => ({ ...w, c: [...w.c] }));
    if (!doors.length || !others.length) return walls;

    for (const door of doors) {
      for (const end of [0, 1]) {
        const ex = door.c[end * 2];
        const ey = door.c[end * 2 + 1];

        let bestIdx = -1;
        let bestProj = null;
        let bestDist = Infinity;

        for (let i = 0; i < others.length; i++) {
          const [x1, y1, x2, y2] = others[i].c;
          const proj = projectPointToSegment(ex, ey, x1, y1, x2, y2);
          if (proj.distance < bestDist) {
            bestDist = proj.distance;
            bestIdx = i;
            bestProj = proj;
          }
        }

        if (bestIdx < 0 || !bestProj || bestDist > maxDistance) continue;

        const sx = Math.round(bestProj.x);
        const sy = Math.round(bestProj.y);
        const target = others[bestIdx];
        const split = splitWallAtPoint(target, sx, sy);
        if (split.length === 2) {
          others.splice(bestIdx, 1, split[0], split[1]);
        }

        door.c[end * 2] = sx;
        door.c[end * 2 + 1] = sy;
      }
    }

    return [...others, ...doors];
  }

  function bridgeTinyGapsNearPortals(walls, portalLinks, nearRadius = 240, maxGap = 42) {
    if (!Array.isArray(portalLinks) || !portalLinks.length) return walls;
    const pts = [];
    for (const l of portalLinks) {
      if (l?.portal && Number.isFinite(l.portal.x) && Number.isFinite(l.portal.y)) pts.push({ x: l.portal.x, y: l.portal.y });
      if (l?.ring && Number.isFinite(l.ring.x) && Number.isFinite(l.ring.y)) pts.push({ x: l.ring.x, y: l.ring.y });
    }
    if (!pts.length) return walls;

    const degree = buildEndpointDegree(walls);
    const dangles = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if ((w.door || 0) > 0) continue;
      const a = { x: Math.round(w.c[0]), y: Math.round(w.c[1]) };
      const b = { x: Math.round(w.c[2]), y: Math.round(w.c[3]) };
      for (const p of [a, b]) {
        const k = `${p.x},${p.y}`;
        if ((degree.get(k) || 0) !== 1) continue;
        let near = false;
        for (const n of pts) {
          if (Math.hypot(p.x - n.x, p.y - n.y) <= nearRadius) {
            near = true;
            break;
          }
        }
        if (near) dangles.push(p);
      }
    }

    const add = [];
    const used = new Set();
    for (let i = 0; i < dangles.length; i++) {
      const a = dangles[i];
      let best = null;
      let bestDist = Infinity;
      for (let j = i + 1; j < dangles.length; j++) {
        const b = dangles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 1 || d > maxGap) continue;
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
      if (!best) continue;
      const ka = `${a.x},${a.y}`;
      const kb = `${best.x},${best.y}`;
      const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (used.has(edge)) continue;
      used.add(edge);
      add.push({ c: [a.x, a.y, best.x, best.y], door: 0, ds: 0, portalExt: true });
    }

    return add.length ? [...walls, ...add] : walls;
  }

  function weldDanglingNearDoorsToWalls(walls, doorRecords, nearDoorRadius = 260, maxProjectDistance = 120) {
    const list = walls.map((w) => ({ ...w, c: [...w.c] }));
    const doorCenters = (doorRecords || []).map((d) => doorCenterPoint(d));
    if (!doorCenters.length) return list;

    const isNearDoor = (x, y) => doorCenters.some((p) => Math.hypot(x - p.x, y - p.y) <= nearDoorRadius);

    for (let pass = 0; pass < 2; pass++) {
      const degree = buildEndpointDegree(list);

      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        if ((w.door || 0) > 0) continue;

        for (const end of [0, 1]) {
          const ex = Math.round(w.c[end * 2]);
          const ey = Math.round(w.c[end * 2 + 1]);
          const key = `${ex},${ey}`;
          if ((degree.get(key) || 0) !== 1) continue;
          if (!isNearDoor(ex, ey)) continue;

          let best = null;
          let bestIdx = -1;
          let bestDist = Infinity;

          for (let j = 0; j < list.length; j++) {
            if (j === i) continue;
            const t = list[j];
            if ((t.door || 0) > 0) continue;

            const [x1, y1, x2, y2] = t.c;
            const axisAligned = Math.round(x1) === Math.round(x2) || Math.round(y1) === Math.round(y2);
            if (!axisAligned) continue;

            const proj = projectPointToSegment(ex, ey, x1, y1, x2, y2);
            if (!proj || proj.distance < 0.5 || proj.distance > maxProjectDistance) continue;
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              best = proj;
              bestIdx = j;
            }
          }

          if (!best || bestIdx < 0) continue;

          const sx = Math.round(best.x);
          const sy = Math.round(best.y);
          if (sx === ex && sy === ey) continue;

          w.c[end * 2] = sx;
          w.c[end * 2 + 1] = sy;

          const target = list[bestIdx];
          const split = splitWallAtPoint(target, sx, sy);
          if (split.length === 2) {
            list.splice(bestIdx, 1, split[0], split[1]);
          }
        }
      }
    }

    return list;
  }

  function roomCenter(room) {
    const left = sceneBoundaryFromMapCell(room.west);
    const right = sceneBoundaryFromMapCell(room.east + 1);
    const top = sceneBoundaryFromMapCell(room.north);
    const bottom = sceneBoundaryFromMapCell(room.south + 1);
    return {
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2)
    };
  }

  function isPointInsideSpecial(px, py, specialRooms) {
    return specialRooms.some((s) => {
      if (s.type === "circle") return pointInEllipse(px, py, s.cx, s.cy, s.rx * 0.985, s.ry * 0.985);
      return pointInPolygon(px, py, s.vertices);
    });
  }

  function formatRoomMapNoteHtml(room) {
    const detail = room?.contents?.detail || {};
    const summary = String(room?.contents?.summary || "").trim();
    const feature = String(detail.room_features || "").trim();
    const monsters = Array.isArray(detail.monster) ? detail.monster : [];
    const monsterLine = String(monsters[0] || room?.contents?.inhabited || "").trim();
    const treasureLine = String(monsters[2] || "").replace(/^Treasure:\s*/i, "").trim();

    const doorBits = [];
    for (const dir of ["north", "east", "south", "west"]) {
      const list = Array.isArray(room?.doors?.[dir]) ? room.doors[dir] : [];
      if (!list.length) continue;
      const labels = list.map((d) => String(d?.desc || d?.type || "door").trim()).filter(Boolean);
      if (!labels.length) continue;
      const cap = dir.charAt(0).toUpperCase() + dir.slice(1);
      doorBits.push(`<li><strong>${escapeHtml(cap)}:</strong> ${escapeHtml(labels.join(", "))}</li>`);
    }

    return `
      <article>
        ${summary ? `<p><strong>Summary:</strong> ${escapeHtml(summary)}</p>` : ""}
        ${feature ? `<p>${escapeHtml(feature).replace(/\n/g, "<br>")}</p>` : ""}
        ${monsterLine ? `<p><strong>Monsters:</strong> ${escapeHtml(monsterLine)}</p>` : ""}
        ${treasureLine ? `<p><strong>Treasure:</strong> ${escapeHtml(treasureLine).replace(/\n/g, "<br>")}</p>` : ""}
        ${doorBits.length ? `<h3>Doors</h3><ul>${doorBits.join("")}</ul>` : ""}
      </article>
    `.trim();
  }

  async function createMapNotes(scene, sceneName, rooms, corridorFeatures) {
    const moduleActive = !!game.modules.get("campaign-codex")?.active;
    const widgetId = foundry.utils.randomID();
    const folderId = await ensureDonjonImportJournalFolder();
    const widgetNotes = [];
    const noteSeeds = [];

    for (const room of rooms) {
      const marker = toMarker(`R${room.id}`) || `R${room.id}`;
      const noteId = foundry.utils.randomID();
      widgetNotes.push({
        id: noteId,
        title: `Room ${room.id}`,
        mapId: marker,
        content: formatRoomMapNoteHtml(room),
        visible: false
      });
      noteSeeds.push({
        noteId,
        marker,
        x: roomCenter(room).x,
        y: roomCenter(room).y
      });
    }

    for (const feat of Object.values(corridorFeatures || {})) {
      const key = toMarker(feat?.key || "");
      if (!key) continue;
      const summary = String(feat?.summary || "Corridor Feature");
      const detail = String(feat?.detail || "");
      const noteId = foundry.utils.randomID();
      widgetNotes.push({
        id: noteId,
        title: summary,
        mapId: key,
        content: `<article><h2>${escapeHtml(summary)}</h2><p>${escapeHtml(detail).replace(/\n/g, "<br>")}</p></article>`,
        visible: false
      });

      const marks = Array.isArray(feat?.marks) ? feat.marks : [];
      for (const m of marks) {
        if (!Number.isFinite(m?.col) || !Number.isFinite(m?.row)) continue;
        const markOffset = resolveMarkOffset(m.col, m.row);
        noteSeeds.push({
          noteId,
          marker: key,
          x: sceneCenterFromMapCell(m.col, markOffset),
          y: sceneCenterFromMapCell(m.row, markOffset)
        });
      }
    }

    if (!widgetNotes.length) return;

    let journal;
    if (moduleActive) {
      journal = await JournalEntry.create({
        name: `${sceneName} Notes`,
        folder: folderId,
        flags: {
          core: { sheetClass: "campaign-codex.LocationSheet" },
          "campaign-codex": {
            type: "location",
            data: {
              description: `<p>Auto-generated map notes for ${escapeHtml(sceneName)}.</p>`,
              widgets: { mapnote: { [widgetId]: { notes: widgetNotes } } }
            },
            "sheet-widgets": [
              { id: widgetId, widgetName: "Map Notes", active: true, tab: "info" }
            ]
          }
        }
      });
    } else {
      journal = await JournalEntry.create({
        name: `${sceneName} Notes`,
        folder: folderId,
        pages: widgetNotes.map((n) => ({
          name: n.title,
          type: "text",
          text: { content: n.content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }
        }))
      });
    }

    if (folderId && journal?.folder?.id !== folderId) {
      await journal.update({ folder: folderId });
    }

    const docs = [];
    for (const n of noteSeeds) {
      const base = {
        entryId: journal.id,
        x: n.x,
        y: n.y,
        text: n.marker,
        global: true,
        iconSize: 34
      };

      if (moduleActive) {
        base.flags = {
          "campaign-codex": {
            noteid: n.noteId,
            widgetid: widgetId,
            markerid: n.marker
          }
        };
      }

      docs.push(base);
    }

    if (docs.length) {
      try {
        await scene.createEmbeddedDocuments("Note", docs);
      } catch (err) {
        console.warn("Failed creating scene map notes", err);
      }
    }
  }

  async function promptForFiles() {
    const content = `
      <form autocomplete="off">
        <div class="form-group">
          <label><b>Scene Name</b></label>
          <input type="text" name="sceneName" placeholder="Leave blank to use image filename" />
        </div>
        <div class="form-group">
          <label><b>Donjon JSON File</b></label>
          <input type="file" name="jsonFile" accept=".json,application/json" />
        </div>
        <div class="form-group">
          <label><b>Map Image</b></label>
          <input type="file" name="imageFile" accept="image/*" />
        </div>
        <div class="form-group">
          <label><b>Circle Smoothness</b></label>
          <input type="number" name="circleSides" value="28" min="8" step="1" />
        </div>
        <div class="form-group">
          <label><b>Create Map Notes</b></label>
          <input type="checkbox" name="createNotes" checked />
        </div>
      </form>
    `;

    return DialogV2.wait({
      window: { title: "Donjon → Foundry (Grid 100)" },
      content,
      buttons: [
        {
          action: "import",
          label: "Create Scene",
          icon: "<i class='fas fa-dungeon'></i>",
          default: true,
          callback: (_event, button) => {
            const fd = new FormData(button.form);
            const sceneName = String(fd.get("sceneName") || "").trim();
            const jsonFile = fd.get("jsonFile");
            const imageFile = fd.get("imageFile");
            const circleSides = Math.max(8, Number.parseInt(fd.get("circleSides"), 10) || 28);
            const createNotes = fd.get("createNotes") === "on";
            return {
              sceneName,
              jsonFile: jsonFile instanceof File && jsonFile.size > 0 ? jsonFile : null,
              imageFile: imageFile instanceof File && imageFile.size > 0 ? imageFile : null,
              circleSides,
              createNotes
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

  const { sceneName, jsonFile, imageFile, circleSides, createNotes } = input;
  if (!jsonFile) return ui.notifications.warn("Please select a Donjon JSON file.");
  if (!imageFile) return ui.notifications.warn("Please select a map image.");

  try {
    ui.notifications.info("Reading Donjon JSON...");
    const mapData = JSON.parse(await readTextFile(jsonFile));

    if (!Array.isArray(mapData?.cells) || !mapData.cells.length || !Array.isArray(mapData.cells[0])) {
      throw new Error("Invalid Donjon JSON: missing cells grid.");
    }

    const rows = mapData.cells.length;
    const cols = mapData.cells[0].length;
    const bleed = Number(mapData?.settings?.bleed ?? 0);
    const nRows = Number(mapData?.settings?.n_rows ?? rows);
    const nCols = Number(mapData?.settings?.n_cols ?? cols);
    const hasValidBleedCrop =
      Number.isFinite(bleed) && bleed > 0 &&
      Number.isFinite(nRows) && Number.isFinite(nCols) &&
      nRows > 0 && nCols > 0 &&
      rows === (nRows + (bleed * 2)) &&
      cols === (nCols + (bleed * 2));

    CELL_OFFSET = hasValidBleedCrop ? bleed : 0;
    SCENE_ROWS = hasValidBleedCrop ? nRows : rows;
    SCENE_COLS = hasValidBleedCrop ? nCols : cols;
    ROOM_OFFSET = detectFeatureOffset(mapData, CELL_OFFSET, SCENE_COLS, SCENE_ROWS);
    MARK_OFFSET = detectMarkOffset(mapData, CELL_OFFSET, SCENE_COLS, SCENE_ROWS);

    await ensureUploadsFolder();
    const uploadFile = await convertImageToUploadFile(imageFile);
    const safeName = sanitizeFilename(uploadFile.name);
    ui.notifications.info("Uploading map image...");
    const uploadResult = await foundry.applications.apps.FilePicker.implementation.upload("data", "uploads", uploadFile, {}, { notify: false });
    const imagePath = uploadResult?.path || `uploads/${safeName}`;

    const finalSceneName = sceneName || getBaseName(imageFile.name);

    ui.notifications.info("Creating scene...");
    const scene = await Scene.create({
      name: finalSceneName,
      width: SCENE_COLS * GRID_SIZE,
      height: SCENE_ROWS * GRID_SIZE,
      padding: 0,
      grid: {
        size: GRID_SIZE,
        type: CONST.GRID_TYPES.SQUARE,
        distance: 5,
        units: "ft"
      },
      background: { src: imagePath },
      img: imagePath
    });

    const rooms = Array.isArray(mapData.rooms) ? mapData.rooms.filter(Boolean) : [];

    const roomIdMask = Number(mapData?.cell_bit?.room_id || 0);
    const roomIdShift = roomIdMask ? computeMaskShift(roomIdMask) : 0;
    const getCellRoomId = (v) => roomIdMask ? ((Number(v) & roomIdMask) >> roomIdShift) : 0;

    const specialRooms = [];
    const specialRoomIds = new Set();
    const specialWallsRaw = [];
    const specialConnectorWallsRaw = [];
    const specialPortalLinksRaw = [];
    const specialPortalQuadsRaw = [];
    const allDoorRecordsRaw = [];

    for (const room of rooms) {
      const shape = String(room.shape || "").toLowerCase();
      const polySides = Number(room.polygon || 0);
      const isCircle = shape === "circle";
      const isPolygon = shape === "polygon" && polySides >= 3;

      const roomDoors = getRoomDoorRecords(room)
        .filter((d) => d.col >= ROOM_OFFSET && d.col < (ROOM_OFFSET + SCENE_COLS) && d.row >= ROOM_OFFSET && d.row < (ROOM_OFFSET + SCENE_ROWS));
      allDoorRecordsRaw.push(...roomDoors);

      if (!isCircle && !isPolygon) continue;

      const rid = Number(room.id);
      if (Number.isFinite(rid)) specialRoomIds.add(rid);

      const left = sceneBoundaryFromMapCell(room.west);
      const right = sceneBoundaryFromMapCell(room.east + 1);
      const top = sceneBoundaryFromMapCell(room.north);
      const bottom = sceneBoundaryFromMapCell(room.south + 1);

      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const rx = Math.max(1, (right - left) / 2);
      const ry = Math.max(1, (bottom - top) / 2);

      if (isCircle) {
        specialRooms.push({ type: "circle", cx, cy, rx, ry });
        const ring = wallsFromVertices(polygonVertices(cx, cy, rx, ry, circleSides, -Math.PI / 2));
        const stitching = buildSpecialDoorConnectorSegments(ring, roomDoors);
        const splitRing = splitWallsAtPoints(ring, stitching.splitPoints, 1.5);
        const cutRing = cutRingByPortalQuads(splitRing, stitching.portalQuads || []);
        specialWallsRaw.push(...cutRing);
        specialConnectorWallsRaw.push(...(stitching.connectors || []));
        specialPortalLinksRaw.push(...(stitching.portalLinks || []));
        specialPortalQuadsRaw.push(...(stitching.portalQuads || []));
      } else {
        const verts = polygonVertices(cx, cy, rx, ry, polySides, -Math.PI / 2);
        specialRooms.push({ type: "polygon", vertices: verts });
        const ring = wallsFromVertices(verts);
        const stitching = buildSpecialDoorConnectorSegments(ring, roomDoors);
        const splitRing = splitWallsAtPoints(ring, stitching.splitPoints, 1.5);
        const cutRing = cutRingByPortalQuads(splitRing, stitching.portalQuads || []);
        specialWallsRaw.push(...cutRing);
        specialConnectorWallsRaw.push(...(stitching.connectors || []));
        specialPortalLinksRaw.push(...(stitching.portalLinks || []));
        specialPortalQuadsRaw.push(...(stitching.portalQuads || []));
      }
    }

    const allDoorRecords = dedupeDoorRecords(allDoorRecordsRaw);
    const rawCellWalls = [];

    for (let py = 0; py < SCENE_ROWS; py++) {
      for (let px = 0; px < SCENE_COLS; px++) {
        const mapY = py + CELL_OFFSET;
        const mapX = px + CELL_OFFSET;
        const c0 = mapData.cells[mapY][mapX];
        const cur = isWalkableCell(c0);

        if (px + 1 < SCENE_COLS) {
          const c1 = mapData.cells[mapY][mapX + 1];
          const right = isWalkableCell(c1);

          if (cur !== right) {
            const id0 = getCellRoomId(c0);
            const id1 = getCellRoomId(c1);
            if (!(specialRoomIds.has(id0) || specialRoomIds.has(id1))) {
              const seg = {
                x1: (px + 1) * GRID_SIZE,
                y1: py * GRID_SIZE,
                x2: (px + 1) * GRID_SIZE,
                y2: (py + 1) * GRID_SIZE
              };

              const mx = (seg.x1 + seg.x2) / 2;
              const my = (seg.y1 + seg.y2) / 2;
              const q1x = seg.x1 + (seg.x2 - seg.x1) * 0.25;
              const q1y = seg.y1 + (seg.y2 - seg.y1) * 0.25;
              const q3x = seg.x1 + (seg.x2 - seg.x1) * 0.75;
              const q3y = seg.y1 + (seg.y2 - seg.y1) * 0.75;
              const inSpecial =
                isPointInsideSpecial(mx, my, specialRooms) ||
                isPointInsideSpecial(q1x, q1y, specialRooms) ||
                isPointInsideSpecial(q3x, q3y, specialRooms);

              if (!inSpecial) rawCellWalls.push(seg);
            }
          }
        }

        if (py + 1 < SCENE_ROWS) {
          const c1 = mapData.cells[mapY + 1][mapX];
          const below = isWalkableCell(c1);

          if (cur !== below) {
            const id0 = getCellRoomId(c0);
            const id1 = getCellRoomId(c1);
            if (!(specialRoomIds.has(id0) || specialRoomIds.has(id1))) {
              const seg = {
                x1: px * GRID_SIZE,
                y1: (py + 1) * GRID_SIZE,
                x2: (px + 1) * GRID_SIZE,
                y2: (py + 1) * GRID_SIZE
              };

              const mx = (seg.x1 + seg.x2) / 2;
              const my = (seg.y1 + seg.y2) / 2;
              const q1x = seg.x1 + (seg.x2 - seg.x1) * 0.25;
              const q1y = seg.y1 + (seg.y2 - seg.y1) * 0.25;
              const q3x = seg.x1 + (seg.x2 - seg.x1) * 0.75;
              const q3y = seg.y1 + (seg.y2 - seg.y1) * 0.75;
              const inSpecial =
                isPointInsideSpecial(mx, my, specialRooms) ||
                isPointInsideSpecial(q1x, q1y, specialRooms) ||
                isPointInsideSpecial(q3x, q3y, specialRooms);

              if (!inSpecial) rawCellWalls.push(seg);
            }
          }
        }
      }
    }

    
    
    const cellWalls = rawCellWalls.map((w) => ({
      c: [Math.round(w.x1), Math.round(w.y1), Math.round(w.x2), Math.round(w.y2)],
      door: 0,
      ds: 0
    }));

    const allDoorPoints = allDoorRecords.map((d) => doorAnchorPoint(d));

    const openedCellWalls = cutWallsForDoors(cellWalls, allDoorPoints, GRID_SIZE * 0.35, false);
    const cutCellWalls = cutWallsByPortalQuads(openedCellWalls, specialPortalQuadsRaw);
    const doorSegments = buildDoorSegments(allDoorRecords);

    let allWalls = [...cutCellWalls, ...specialWallsRaw, ...specialConnectorWallsRaw, ...doorSegments];
    allWalls = removeDoorStubs(allWalls, allDoorPoints, GRID_SIZE * 0.75, GRID_SIZE * 0.42);
    allWalls = pruneDanglingNearDoors(allWalls, allDoorPoints, GRID_SIZE * 0.9, GRID_SIZE * 0.55, 4);
    allWalls = stitchDoorJunctions(allWalls, 16);
    allWalls = snapAndWeldWalls(allWalls, 8);
    allWalls = collapseAxisOverlaps(allWalls);
    allWalls = dedupeDoorWalls(allWalls);
    allWalls = dedupeWalls(allWalls);

    allWalls = stitchDoorJunctions(allWalls, 28);
    allWalls = snapAndWeldWalls(allWalls, 12);
    allWalls = collapseAxisOverlaps(allWalls);
    allWalls = dedupeDoorWalls(allWalls);
    allWalls = dedupeWalls(allWalls);

    
    

    ui.notifications.info("Creating walls and doors...");
    await scene.createEmbeddedDocuments("Wall", allWalls);

    if (createNotes) {
      ui.notifications.info("Creating map notes...");
      await createMapNotes(scene, finalSceneName, rooms, mapData.corridor_features || {});
    }

    await scene.activate();
    ui.notifications.info(`Scene \"${finalSceneName}\" created (${SCENE_COLS}x${SCENE_ROWS} cells, grid ${GRID_SIZE}) with ${allWalls.length} wall segments.${hasValidBleedCrop ? ` (bleed ${bleed} applied; room offset ${ROOM_OFFSET}, mark offset ${MARK_OFFSET})` : ""}`);
  } catch (err) {
    console.error(err);
    ui.notifications.error(`Import failed: ${err.message}`);
  }
})();

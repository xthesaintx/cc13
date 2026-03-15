(async () => {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can run this macro.");

  const { DialogV2 } = foundry.applications.api;
  const WALL_OFFSET = 0.25;
  const ROTUNDA_SIDES = 28;
  const ROTUNDA_PAD_CELLS_DEFAULT = 0.25;

  
  const DOOR_TYPE_EMPTY = 0;
  const DOOR_TYPE_SINGLE_DOOR = 1;
  const DOOR_TYPE_OPENING = 2;
  const DOOR_TYPE_STAIR_ENTRANCE = 3;
  const DOOR_TYPE_BARS = 4;
  const DOOR_TYPE_DOUBLE_DOOR = 5;
  const DOOR_TYPE_SECRET_WALL = 6;
  const DOOR_TYPE_FLUSH_DOOR = 7;
  const DOOR_TYPE_STAIR_EXIT = 8;
  const DOOR_TYPE_SPECIAL_LOCKED = 9;

  class MatrixMap {
    constructor() {
      this.matrix = {};
      this.list = [];
    }

    get(x, y) {
      return this.matrix[x] && this.matrix[x][y];
    }

    put(x, y) {
      if (!this.matrix[x]) this.matrix[x] = {};
      this.matrix[x][y] = true;
      this.list.push([x, y]);
    }

    addRect(rect) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
          this.put(x, y);
        }
      }
    }

    getWalls() {
      const walls = [];
      this.list.forEach(([x, y]) => {
        if (!this.get(x, y - 1)) walls.push([x, y, x + 1, y]);
        if (!this.get(x, y + 1)) walls.push([x, y + 1, x + 1, y + 1]);
        if (!this.get(x - 1, y)) walls.push([x, y, x, y + 1]);
        if (!this.get(x + 1, y)) walls.push([x + 1, y, x + 1, y + 1]);
      });
      return walls;
    }

    getProcessedWalls() {
      const walls = this.getWalls();
      const keys = [[], []];
      const sorting = [{}, {}];

      walls.forEach((w) => {
        if (w[1] === w[3]) {
          if (!sorting[0][w[1]]) {
            sorting[0][w[1]] = [];
            keys[0].push(w[1]);
          }
          sorting[0][w[1]].push(w);
        } else {
          if (!sorting[1][w[0]]) {
            sorting[1][w[0]] = [];
            keys[1].push(w[0]);
          }
          sorting[1][w[0]].push(w);
        }
      });

      const result = [];
      for (let i = 0; i < 2; i++) {
        keys[i].forEach((k) => {
          const heap = sorting[i][k];
          heap.sort((a, b) => (a[i] > b[i] ? 1 : -1));
          const stack = [heap[0]];

          heap.forEach((wall) => {
            if (wall[i] > stack[stack.length - 1][i + 2]) {
              stack.push(wall);
            } else if (stack[stack.length - 1][i + 2] < wall[i + 2]) {
              stack[stack.length - 1][i + 2] = wall[i + 2];
            }
          });

          stack.forEach((wall) => result.push(wall));
        });
      }

      
      result.forEach((wall, index) => {
        for (let p = 0; p < 2; p++) {
          const x = wall[2 * p];
          const y = wall[2 * p + 1];

          let subgrid = [[false, false], [false, false]];
          let parity = 0;
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              subgrid[i][j] = this.get(x - 1 + i, y - 1 + j);
              if (subgrid[i][j]) parity += 1;
            }
          }

          if (parity === 1) {
            subgrid = [
              [!subgrid[1][1], !subgrid[1][0]],
              [!subgrid[0][1], !subgrid[0][0]]
            ];
          }

          let insideCorner = [1, 1];
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              if (!subgrid[i][j]) insideCorner = [i, j];
            }
          }

          result[index][2 * p] = x + (insideCorner[0] === 0 ? -WALL_OFFSET : WALL_OFFSET);
          result[index][2 * p + 1] = y + (insideCorner[1] === 0 ? -WALL_OFFSET : WALL_OFFSET);
        }
      });

      return result;
    }
  }

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

  function buildTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function getSafeExtension(filename) {
    const ext = String(filename || "").split(".").pop() || "img";
    return sanitizeFilename(ext).toLowerCase() || "img";
  }

  function polygonVertices(cx, cy, rx, ry, sides, rotation = -Math.PI / 2) {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = rotation + ((Math.PI * 2 * i) / sides);
      out.push({ x: cx + (Math.cos(a) * rx), y: cy + (Math.sin(a) * ry) });
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

  function normalizeAngle(theta) {
    const twopi = Math.PI * 2;
    let out = theta % twopi;
    if (out < 0) out += twopi;
    return out;
  }

  function angleDeltaCCW(a, b) {
    return normalizeAngle(b - a);
  }

  function minorArcBetween(a, b) {
    const ccw = angleDeltaCCW(a, b);
    if (ccw <= Math.PI) return { start: normalizeAngle(a), end: normalizeAngle(b) };
    return { start: normalizeAngle(b), end: normalizeAngle(a) };
  }

  function minorArcBetweenHits(a, b) {
    const ccw = angleDeltaCCW(a.theta, b.theta);
    if (ccw <= Math.PI) {
      return {
        start: normalizeAngle(a.theta),
        end: normalizeAngle(b.theta),
        startPoint: { x: a.x, y: a.y },
        endPoint: { x: b.x, y: b.y }
      };
    }
    return {
      start: normalizeAngle(b.theta),
      end: normalizeAngle(a.theta),
      startPoint: { x: b.x, y: b.y },
      endPoint: { x: a.x, y: a.y }
    };
  }

  function angleInArc(theta, start, end) {
    const t = normalizeAngle(theta);
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    if (s <= e) return t >= s && t <= e;
    return t >= s || t <= e;
  }

  function ellipseValue(x, y, ellipse) {
    const dx = (x - ellipse.cx) / ellipse.rx;
    const dy = (y - ellipse.cy) / ellipse.ry;
    return (dx * dx) + (dy * dy);
  }

  function thetaOnEllipse(x, y, ellipse) {
    return normalizeAngle(Math.atan2((y - ellipse.cy) / ellipse.ry, (x - ellipse.cx) / ellipse.rx));
  }

  function segmentEllipseIntersections(x1, y1, x2, y2, ellipse) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    const ex1 = (x1 - ellipse.cx) / ellipse.rx;
    const ey1 = (y1 - ellipse.cy) / ellipse.ry;
    const edx = dx / ellipse.rx;
    const edy = dy / ellipse.ry;

    const A = (edx * edx) + (edy * edy);
    const B = 2 * ((ex1 * edx) + (ey1 * edy));
    const C = (ex1 * ex1) + (ey1 * ey1) - 1;

    if (Math.abs(A) < 1e-9) return [];
    const disc = (B * B) - (4 * A * C);
    if (disc < 0) return [];

    const out = [];
    const sqrtD = Math.sqrt(Math.max(0, disc));
    const t1 = (-B - sqrtD) / (2 * A);
    const t2 = (-B + sqrtD) / (2 * A);
    for (const t of [t1, t2]) {
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      const tt = Math.max(0, Math.min(1, t));
      out.push({ t: tt, x: x1 + (dx * tt), y: y1 + (dy * tt) });
    }

    out.sort((a, b) => a.t - b.t);
    const deduped = [];
    for (const p of out) {
      const last = deduped[deduped.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) deduped.push(p);
    }
    return deduped;
  }

  function buildRotundaRings(rects, gridSize, sides = ROTUNDA_SIDES, padCells = ROTUNDA_PAD_CELLS_DEFAULT) {
    const rings = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!Number.isFinite(r?.x) || !Number.isFinite(r?.y) || !Number.isFinite(r?.w) || !Number.isFinite(r?.h)) continue;
      const pad = Math.max(0, Number(padCells) || 0);
      const ellipse = {
        id: i,
        cx: (r.x + (r.w / 2)) * gridSize,
        cy: (r.y + (r.h / 2)) * gridSize,
        rx: Math.max(0.5, ((r.w / 2) + pad) * gridSize),
        ry: Math.max(0.5, ((r.h / 2) + pad) * gridSize)
      };

      const verts = polygonVertices(
        r.x + (r.w / 2),
        r.y + (r.h / 2),
        Math.max(0.5, (r.w / 2) + pad),
        Math.max(0.5, (r.h / 2) + pad),
        sides,
        -Math.PI / 2
      )
        .map((v) => ({ x: v.x * gridSize, y: v.y * gridSize }));
      const walls = [];
      for (let n = 0; n < verts.length; n++) {
        const a = verts[n];
        const b = verts[(n + 1) % verts.length];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        walls.push({
          c: [a.x, a.y, b.x, b.y],
          door: 0,
          ds: 0,
          theta: thetaOnEllipse(mx, my, ellipse)
        });
      }
      rings.push({ ellipse, walls });
    }
    return rings;
  }

  function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = (dx * dx) + (dy * dy);
    if (len2 <= 1e-9) return { t: 0, x: x1, y: y1, distance: Math.hypot(px - x1, py - y1) };
    const t = Math.max(0, Math.min(1, (((px - x1) * dx) + ((py - y1) * dy)) / len2));
    const x = x1 + (t * dx);
    const y = y1 + (t * dy);
    return { t, x, y, distance: Math.hypot(px - x, py - y) };
  }

  function trimBaseWallsToRotundas(baseWalls, rotundaRings) {
    if (!rotundaRings.length) return { walls: baseWalls, hits: [] };

    const out = [];
    const hits = [];

    for (const wall of baseWalls) {
      let [x1, y1, x2, y2] = wall.c;
      let removed = false;

      for (let r = 0; r < rotundaRings.length; r++) {
        const ellipse = rotundaRings[r].ellipse;
        const v1 = ellipseValue(x1, y1, ellipse);
        const v2 = ellipseValue(x2, y2, ellipse);
        const in1 = v1 <= (1 - 1e-4);
        const in2 = v2 <= (1 - 1e-4);

        if (in1 && in2) {
          removed = true;
          break;
        }

        if (in1 === in2) continue;

        const intersections = segmentEllipseIntersections(x1, y1, x2, y2, ellipse);
        if (!intersections.length) continue;

        const hit = in1
          ? intersections.reduce((best, p) => (!best || p.t < best.t ? p : best), null)
          : intersections.reduce((best, p) => (!best || p.t > best.t ? p : best), null);
        if (!hit) continue;

        if (in1) {
          x1 = hit.x;
          y1 = hit.y;
        } else {
          x2 = hit.x;
          y2 = hit.y;
        }

        const orientation = Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? "h" : "v";
        hits.push({
          ringIndex: r,
          orientation,
          x: hit.x,
          y: hit.y,
          theta: thetaOnEllipse(hit.x, hit.y, ellipse)
        });
      }

      if (removed) continue;
      out.push({ ...wall, c: [x1, y1, x2, y2] });
    }

    return { walls: out, hits };
  }

  function pairPortalHitsByRing(hits, gridSize) {
    const byRing = new Map();
    for (const h of hits) {
      if (!byRing.has(h.ringIndex)) byRing.set(h.ringIndex, []);
      byRing.get(h.ringIndex).push(h);
    }

    const openingsByRing = new Map();
    for (const [ringIndex, ringHits] of byRing.entries()) {
      const openings = [];
      for (const orientation of ["v", "h"]) {
        const list = ringHits.filter((h) => h.orientation === orientation);
        const used = new Set();

        for (let i = 0; i < list.length; i++) {
          if (used.has(i)) continue;
          const a = list[i];
          let bestJ = -1;
          let bestScore = Infinity;

          for (let j = i + 1; j < list.length; j++) {
            if (used.has(j)) continue;
            const b = list[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < (gridSize * 0.35) || dist > (gridSize * 3.2)) continue;

            const aligned = orientation === "v" ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
            if (aligned > (gridSize * 0.75)) continue;

            const score = aligned + Math.abs(dist - (gridSize * 1.4));
            if (score < bestScore) {
              bestScore = score;
              bestJ = j;
            }
          }

          if (bestJ < 0) continue;
          used.add(i);
          used.add(bestJ);
          openings.push(minorArcBetweenHits(a, list[bestJ]));
        }
      }

      if (openings.length) openingsByRing.set(ringIndex, openings);
    }

    return openingsByRing;
  }

  function cutRotundaRingsByArcOpenings(rotundaRings, openingsByRing, snapDistance = 80) {
    const out = [];
    for (let i = 0; i < rotundaRings.length; i++) {
      const ring = rotundaRings[i];
      const openings = openingsByRing.get(i) || [];
      const kept = [];

      for (const w of ring.walls) {
        const blocked = openings.some((o) => angleInArc(w.theta, o.start, o.end));
        if (!blocked) kept.push({ c: [...w.c], door: 0, ds: 0 });
      }

      
      const snapTargets = openings.flatMap((o) => [o.startPoint, o.endPoint]);
      for (const target of snapTargets) {
        let best = null;
        for (let wi = 0; wi < kept.length; wi++) {
          const w = kept[wi];
          const d0 = Math.hypot(w.c[0] - target.x, w.c[1] - target.y);
          if (!best || d0 < best.dist) best = { wi, endpoint: 0, dist: d0 };
          const d1 = Math.hypot(w.c[2] - target.x, w.c[3] - target.y);
          if (!best || d1 < best.dist) best = { wi, endpoint: 1, dist: d1 };
        }
        if (!best || best.dist > snapDistance) continue;
        if (best.endpoint === 0) {
          kept[best.wi].c[0] = target.x;
          kept[best.wi].c[1] = target.y;
        } else {
          kept[best.wi].c[2] = target.x;
          kept[best.wi].c[3] = target.y;
        }
      }

      out.push(...kept);
    }
    return out;
  }

  function getRectBounds(rects) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const r of rects) {
      if (!Number.isFinite(r?.x) || !Number.isFinite(r?.y) || !Number.isFinite(r?.w) || !Number.isFinite(r?.h)) continue;
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY, cols: maxX - minX, rows: maxY - minY };
  }

  function calculateSuggestedGridSize(texWidth, texHeight, rects) {
    const bounds = getRectBounds(rects);
    if (!bounds || bounds.cols <= 0 || bounds.rows <= 0 || texWidth <= 0 || texHeight <= 0) return null;

    const candidates = [
      { label: "no-bleed", cols: bounds.cols, rows: bounds.rows },
      { label: "bleed+1", cols: bounds.cols + 2, rows: bounds.rows + 2 }
    ];

    let best = null;
    for (const c of candidates) {
      const gw = texWidth / c.cols;
      const gh = texHeight / c.rows;
      if (!Number.isFinite(gw) || !Number.isFinite(gh) || gw <= 0 || gh <= 0) continue;
      const mismatch = Math.abs(gw - gh);
      const avg = (gw + gh) / 2;
      const score = mismatch + (Math.abs(Math.round(avg) - avg) * 0.25);
      if (!best || score < best.score) {
        best = { ...c, gw, gh, mismatch, avg, score };
      }
    }

    if (!best) return null;
    return {
      recommended: Math.max(1, Math.round(best.avg)),
      measured: best.avg,
      mode: best.label,
      cols: best.cols,
      rows: best.rows,
      mismatch: best.mismatch
    };
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

  async function ensureOnePageJournalFolder() {
    const folderName = "OnePage Import";
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

  function doorToWall(door) {
    const result = {};
    result.c = [
      door.x - (0.75 * door.dir.y),
      door.y - (0.75 * door.dir.x),
      door.x + (0.75 * door.dir.y),
      door.y + (0.75 * door.dir.x)
    ].map((p) => p + 0.5);

    if (door.type === DOOR_TYPE_SECRET_WALL || door.type === DOOR_TYPE_FLUSH_DOOR) {
      result.c = [
        result.c[0] - (WALL_OFFSET * door.dir.x),
        result.c[1] - (WALL_OFFSET * door.dir.y),
        result.c[2] - (WALL_OFFSET * door.dir.x),
        result.c[3] - (WALL_OFFSET * door.dir.y)
      ];
    }

    result.door = CONST.WALL_DOOR_TYPES.DOOR;
    if (door.type === DOOR_TYPE_SECRET_WALL) result.door = CONST.WALL_DOOR_TYPES.SECRET;

    if (door.type === DOOR_TYPE_BARS) {
      result.sense = CONST.WALL_SENSE_TYPES.NONE;
      result.ds = CONST.WALL_DOOR_STATES.LOCKED;
    }

    if (door.type === DOOR_TYPE_DOUBLE_DOOR || door.type === DOOR_TYPE_SPECIAL_LOCKED) {
      result.ds = CONST.WALL_DOOR_STATES.LOCKED;
    }

    if (
      door.type === DOOR_TYPE_EMPTY ||
      door.type === DOOR_TYPE_OPENING ||
      door.type === DOOR_TYPE_STAIR_ENTRANCE ||
      door.type === DOOR_TYPE_STAIR_EXIT
    ) {
      result.remove = true;
    }

    return result;
  }

  function formatOnePageNoteHtml(note) {
    const ref = String(note?.ref || "").trim();
    const text = String(note?.text || "").trim();

    return `
      <article>
        ${ref ? `<h2>${escapeHtml(ref)}</h2>` : ""}
        ${text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : ""}
      </article>
    `.trim();
  }

  async function createMapNotes(scene, sceneName, notes, transform, journalMeta = {}) {
    if (!Array.isArray(notes) || !notes.length) return;

    const moduleActive = !!game.modules.get("campaign-codex")?.active;
    const widgetId = foundry.utils.randomID();
    const folderId = await ensureOnePageJournalFolder();
    const widgetNotes = [];
    const noteSeeds = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const ref = String(note?.ref || `${i + 1}`).trim() || `${i + 1}`;
      const marker = toMarker(ref) || toMarker(`N${i + 1}`) || `N${i + 1}`;
      const noteId = foundry.utils.randomID();

      widgetNotes.push({
        id: noteId,
        title: `Note ${ref}`,
        mapId: marker,
        content: formatOnePageNoteHtml(note),
        visible: false
      });

      const px = Number(note?.pos?.x);
      const py = Number(note?.pos?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

      noteSeeds.push({
        noteId,
        marker,
        x: transform.x(px),
        y: transform.y(py)
      });
    }

    if (!widgetNotes.length) return;

    const journalTitle = String(journalMeta.title || "").trim() || `${sceneName} Notes`;
    const journalStory = String(journalMeta.story || "").trim();
    const journalDescription = journalStory
      ? `<p>${escapeHtml(journalStory).replace(/\n/g, "<br>")}</p>`
      : `<p>Auto-generated map notes for ${escapeHtml(sceneName)}.</p>`;

    let journal;
    if (moduleActive) {
      journal = await JournalEntry.create({
        name: journalTitle,
        folder: folderId,
        flags: {
          core: { sheetClass: "campaign-codex.LocationSheet" },
          "campaign-codex": {
            type: "location",
            data: {
              description: journalDescription,
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
        name: journalTitle,
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

  function promptForFiles() {
    const content = `
      <form autocomplete="off">
        <div class="form-group">
          <label><b>Scene Name</b></label>
          <input type="text" name="sceneName" placeholder="Leave blank to use image filename" />
        </div>
        <div class="form-group">
          <label><b>Grid Size (px)</b></label>
          <input type="number" name="gridSize" value="100" min="1" step="1" />
        </div>
        <div class="form-group">
          <label><b>OnePage JSON File</b></label>
          <input type="file" name="jsonFile" accept=".json,application/json" />
        </div>
        <div class="form-group">
          <label><b>Map Image</b></label>
          <input type="file" name="imageFile" accept="image/*" />
        </div>
        <div class="form-group">
          <label><b>Create Map Notes</b></label>
          <input type="checkbox" name="createNotes" checked />
        </div>
        <div class="form-group">
          <label><b>Set Background Color White</b></label>
          <input type="checkbox" name="whiteBackground" />
        </div>
        <div class="form-group">
          <label><b>Image/JSON Grid Size Correction</b></label>
          <input type="checkbox" name="gridCorrection" checked />
        </div>
      </form>
    `;

    return DialogV2.wait({
      window: { title: "OnePage JSON -> Foundry" },
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
            const gridSize = Math.max(1, Number.parseInt(fd.get("gridSize"), 10) || 100);
            const jsonFile = fd.get("jsonFile");
            const imageFile = fd.get("imageFile");
            const createNotes = fd.get("createNotes") === "on";
            const whiteBackground = fd.get("whiteBackground") === "on";
            const gridCorrection = fd.get("gridCorrection") === "on";
            return {
              sceneName,
              gridSize,
              jsonFile: jsonFile instanceof File && jsonFile.size > 0 ? jsonFile : null,
              imageFile: imageFile instanceof File && imageFile.size > 0 ? imageFile : null,
              createNotes,
              whiteBackground,
              gridCorrection
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

  const { sceneName, gridSize, jsonFile, imageFile, createNotes, whiteBackground, gridCorrection } = input;
  if (!jsonFile) return ui.notifications.warn("Please select a OnePage JSON file.");
  if (!imageFile) return ui.notifications.warn("Please select a map image.");

  try {
    ui.notifications.info("Reading OnePage JSON...");
    const info = JSON.parse(await jsonFile.text());

    if (!Array.isArray(info?.rects) || !info.rects.length) {
      throw new Error("Invalid JSON: missing rects array.");
    }

    const map = new MatrixMap();
    const rects = Array.isArray(info.rects) ? info.rects : [];
    const rotundas = rects.filter((r) => !!r?.rotunda);
    const normalRects = rects.filter((r) => !r?.rotunda);

    normalRects.forEach((r) => map.addRect(r));

    await ensureUploadsFolder();
    const uploadFile = await convertImageToUploadFile(imageFile);
    const safeName = sanitizeFilename(uploadFile.name);

    ui.notifications.info("Uploading map image...");
    const uploadResult = await foundry.applications.apps.FilePicker.implementation.upload("data", "uploads", uploadFile, {}, { notify: false });
    const imagePath = uploadResult?.path || `uploads/${safeName}`;

    const tex = await new foundry.canvas.TextureLoader().loadTexture(imagePath);
    const suggestedGrid = calculateSuggestedGridSize(tex.width, tex.height, rects);
    const userGrid = gridSize;
    let effectiveGrid = userGrid;
    if (gridCorrection && suggestedGrid && Math.abs(userGrid - suggestedGrid.recommended) >= 5) {
      effectiveGrid = suggestedGrid.recommended;
      ui.notifications.info(`Grid size auto-corrected from ${userGrid} to ${effectiveGrid} (mode: ${suggestedGrid.mode}, ${suggestedGrid.cols}x${suggestedGrid.rows} cells).`);
    }
    const finalSceneName = sceneName || getBaseName(imageFile.name) || String(info?.title || "OnePage Import");

    ui.notifications.info("Creating scene...");
    const scene = await Scene.create({
      name: finalSceneName,
      grid: {
        size: effectiveGrid,
        type: CONST.GRID_TYPES.SQUARE,
        distance: 5,
        units: "ft"
      },
      background: { src: imagePath },
      img: imagePath,
      width: tex.width,
      height: tex.height,
      padding: 0,
      fogExploration: true,
      tokenVision: true,
      ...(whiteBackground ? { backgroundColor: "#FFFFFF" } : {})
    });

    let baseWalls = map.getProcessedWalls()
      .map((m) => m.map((v) => v * effectiveGrid))
      .map((m) => ({ c: m }));

    const rotundaRings = buildRotundaRings(rotundas, effectiveGrid, ROTUNDA_SIDES, ROTUNDA_PAD_CELLS_DEFAULT);
    const trimResult = trimBaseWallsToRotundas(baseWalls, rotundaRings);
    baseWalls = trimResult.walls;
    const portalOpeningsByRing = pairPortalHitsByRing(trimResult.hits, effectiveGrid);
    const rotundaWalls = cutRotundaRingsByArcOpenings(rotundaRings, portalOpeningsByRing);

    let walls = baseWalls.concat(rotundaWalls);

    let doors = (Array.isArray(info?.doors) ? info.doors : [])
      .map((d) => doorToWall(d))
      .filter((d) => !d.remove)
      .map((d) => ({ ...d, c: d.c.map((v) => v * effectiveGrid) }));

    walls = walls.concat(doors);

    const minvals = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    walls.forEach((w) => {
      minvals[0] = Math.min(minvals[0], w.c[0], w.c[2]);
      minvals[1] = Math.min(minvals[1], w.c[1], w.c[3]);
    });

    const minTile = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    const minTilePos = [[], []];

    rects.forEach((r) => {
      if (r.x < minTile[0]) {
        minTile[0] = r.x;
        minTilePos[0] = [r.y];
      } else if (r.x === minTile[0]) {
        minTilePos[0].push(r.y);
      }

      if (r.y < minTile[1]) {
        minTile[1] = r.y;
        minTilePos[1] = [r.x];
      } else if (r.y === minTile[1]) {
        minTilePos[1].push(r.x);
      }
    });

    let xEdgeHasTile = true;
    minTilePos[0].forEach((r) => {
      const matches = (Array.isArray(info?.doors) ? info.doors : []).filter((d) => d.x === minTile[0] && d.y === r);
      if (!matches.length) xEdgeHasTile = false;
    });

    let yEdgeHasTile = true;
    minTilePos[1].forEach((r) => {
      const matches = (Array.isArray(info?.doors) ? info.doors : []).filter((d) => d.x === r && d.y === minTile[1]);
      if (!matches.length) yEdgeHasTile = false;
    });

    const xOffset = xEdgeHasTile ? -0.25 * effectiveGrid : 0.75 * effectiveGrid;
    const yOffset = yEdgeHasTile ? -0.25 * effectiveGrid : 0.75 * effectiveGrid;

    walls = walls.map((w) => ({
      ...w,
      c: [
        w.c[0] - minvals[0] + xOffset,
        w.c[1] - minvals[1] + yOffset,
        w.c[2] - minvals[0] + xOffset,
        w.c[3] - minvals[1] + yOffset
      ]
    }));

    ui.notifications.info("Creating walls...");
    await scene.createEmbeddedDocuments("Wall", walls);

    if (createNotes) {
      ui.notifications.info("Creating map notes...");
      const notes = Array.isArray(info?.notes) ? info.notes : [];
      await createMapNotes(scene, finalSceneName, notes, {
        x: (v) => (Number(v) * effectiveGrid) - minvals[0] + xOffset,
        y: (v) => (Number(v) * effectiveGrid) - minvals[1] + yOffset
      }, {
        title: info?.title,
        story: info?.story
      });
    }

    await scene.activate();
    ui.notifications.info(`Scene "${finalSceneName}" created with grid ${effectiveGrid}px, ${walls.length} wall segments.`);
  } catch (err) {
    console.error(err);
    ui.notifications.error(`Import failed: ${err.message}`);
  }
})();

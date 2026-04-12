const { DialogV2 } = foundry.applications.api;
import { getCampaignCodexMapMarkerCode } from "../codex-map-marker.js";

const MAP_MARKER_IMAGE_FLAG_PATH = "data.mapMarkerImage";
const DEFAULT_ICON_SIZE = 40;
const CUSTOM_MARKER_TEXTURE_FIT = "cover";
const DEFAULT_MARKER_TEXTURE_FIT = "contain";

function normalizeMapMarkerImageConfig(rawConfig = {}) {
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const src = String(source.src || "").trim();
  let size = Number(source.size);
  if (!Number.isFinite(size)) size = DEFAULT_ICON_SIZE;
  size = Math.clamp(Math.round(size), 8, 512);
  const enabled = Boolean(source.enabled) && !!src;
  return { enabled, src, size };
}

function requestCampaignCodexNoteRedraw(note) {
  if (!note || note.destroyed) return;
  if (note.renderFlags?.set) {
    note.renderFlags.set({ redraw: true });
    return;
  }
  if (typeof note.refresh === "function") note.refresh();
}

export class MapMarkerImagePicker {
  static async open(parentSheet) {
    if (!parentSheet?.document || !game.user.isGM) return;

    const currentRaw = parentSheet.document.getFlag("campaign-codex", MAP_MARKER_IMAGE_FLAG_PATH) || {};
    const current = normalizeMapMarkerImageConfig(currentRaw);

    const content = await foundry.applications.handlebars.renderTemplate(
      "modules/campaign-codex/templates/map-marker-image-picker.hbs",
      {
        enabled: current.enabled,
        src: current.src,
        size: current.size,
        hasSrc: !!current.src,
      },
    );

    const result = await DialogV2.prompt({
      window: { title: "Map Marker Image" },
      content,
      ok: {
        label: "Save",
        callback: (_event, button) => {
          const form = button.form;
          const src = String(form?.elements?.src?.value || "").trim();
          let size = Number(form?.elements?.size?.value);
          if (!Number.isFinite(size)) size = DEFAULT_ICON_SIZE;
          size = Math.clamp(Math.round(size), 8, 512);
          const enabled = Boolean(form?.elements?.enabled?.checked) && !!src;
          return { enabled, src, size };
        },
      },
      cancel: { label: "Cancel" },
      render: (dialog) => {
        const form = dialog?.target?.element?.querySelector("form");
        if (!form) return;

        const enabledInput = form.querySelector('input[name="enabled"]');
        const srcInput = form.querySelector('input[name="src"]');
        const preview = form.querySelector(".cc-map-marker-image-preview");
        const previewState = form.querySelector(".cc-map-marker-image-preview-state");
        const browseButton = form.querySelector('[data-action="browseImage"]');
        const clearButton = form.querySelector('[data-action="clearImage"]');

        const updatePreview = () => {
          const src = String(srcInput?.value || "").trim();
          if (preview) {
            preview.src = src || "";
            preview.hidden = !src;
          }
          if (previewState) previewState.hidden = !!src;
        };

        browseButton?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const currentPath = String(srcInput?.value || "").trim();
          new foundry.applications.apps.FilePicker.implementation({
            type: "image",
            current: currentPath,
            callback: (path) => {
              if (srcInput) srcInput.value = path;
              if (enabledInput) enabledInput.checked = true;
              updatePreview();
            },
            top: parentSheet.position.top + 40,
            left: parentSheet.position.left + 40,
          }).browse();
        });

        clearButton?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (srcInput) srcInput.value = "";
          if (enabledInput) enabledInput.checked = false;
          updatePreview();
        });

        updatePreview();
      },
      rejectClose: false,
    }).catch(() => null);

    if (!result) return;

    const nextConfig = {
      enabled: !!result.enabled,
      src: result.src || "",
      size: result.size,
    };
    await parentSheet.document.setFlag("campaign-codex", MAP_MARKER_IMAGE_FLAG_PATH, nextConfig);
    await this._refreshLinkedSceneNotes(parentSheet.document, current, nextConfig);
    parentSheet.render(false);
  }

  static async _refreshLinkedSceneNotes(journal, previousConfig, nextConfig) {
    if (!canvas?.ready || !canvas?.scene || !game.user.isGM) return;

    const previousSrc = String(previousConfig?.src || "").trim();
    const next = normalizeMapMarkerImageConfig(nextConfig || {});
    const defaultSrc = "icons/svg/book.svg";
    const defaultSize = DEFAULT_ICON_SIZE;
    const linkedNotes = canvas.notes.placeables.filter((n) => n?.document?.entryId === journal.id);
    if (!linkedNotes.length) return;

    const noteUpdates = [];
    for (const note of linkedNotes) {
      const noteMarker = note.document.getFlag("campaign-codex", "markerid");
      const markerCode = getCampaignCodexMapMarkerCode({ journal, noteMarker });

      const currentSrc = String(note.document.texture?.src || "").trim();
      const currentSize = Number(note.document.iconSize ?? defaultSize);
      const currentFit = String(note.document.texture?.fit || "").trim();
      const currentScaleX = Number(note.document.texture?.scaleX ?? 1);
      const currentScaleY = Number(note.document.texture?.scaleY ?? 1);
      const update = { _id: note.document.id };
      let changed = false;

      // Icon size applies to code markers and image markers.
      if (currentSize !== next.size) {
        update.iconSize = next.size;
        changed = true;
      }

      // Marker codes keep their custom rendered icon; do not alter note texture.
      if (markerCode) {
        if (changed) noteUpdates.push(update);
        continue;
      }

      if (next.enabled && next.src) {
        if (currentSrc !== next.src) {
          update["texture.src"] = next.src;
          changed = true;
        }
        if (currentFit !== CUSTOM_MARKER_TEXTURE_FIT) {
          update["texture.fit"] = CUSTOM_MARKER_TEXTURE_FIT;
          changed = true;
        }
        if (currentScaleX !== 1) {
          update["texture.scaleX"] = 1;
          changed = true;
        }
        if (currentScaleY !== 1) {
          update["texture.scaleY"] = 1;
          changed = true;
        }
      } else {
        const shouldReset = (previousSrc && currentSrc === previousSrc) || (next.src && currentSrc === next.src);
        if (!shouldReset) continue;
        if (currentSrc !== defaultSrc) {
          update["texture.src"] = defaultSrc;
          changed = true;
        }
        if (currentFit !== DEFAULT_MARKER_TEXTURE_FIT) {
          update["texture.fit"] = DEFAULT_MARKER_TEXTURE_FIT;
          changed = true;
        }
        if (currentScaleX !== 1) {
          update["texture.scaleX"] = 1;
          changed = true;
        }
        if (currentScaleY !== 1) {
          update["texture.scaleY"] = 1;
          changed = true;
        }
      }

      if (changed) noteUpdates.push(update);
    }

    if (noteUpdates.length) {
      await canvas.scene.updateEmbeddedDocuments("Note", noteUpdates);
    }
    for (const note of linkedNotes) requestCampaignCodexNoteRedraw(note);
  }
}

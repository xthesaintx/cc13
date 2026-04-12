import {
  CampaignCodexMapMarker,
  _getCampaignCodexIcon,
  getCampaignCodexMapMarkerCode,
  getCampaignCodexCustomMarkerImage,
  getCampaignCodexCustomMarkerImageSize,
  getCampaignCodexMapMarkerImageConfig,
} from "./codex-map-marker.js";

const CUSTOM_MARKER_TEXTURE_FIT = "cover";
const DEFAULT_MARKER_TEXTURE_FIT = "contain";

function requestCampaignCodexNoteRedraw(note) {
  if (!note || note.destroyed) return;
  if (note.renderFlags?.set) {
    note.renderFlags.set({ redraw: true });
    return;
  }
  if (typeof note.refresh === "function") note.refresh();
}

function didFlagPropertyChange(changes, propertyPath) {
  if (!changes) return false;
  if (foundry.utils.hasProperty(changes, propertyPath)) return true;

  const flattened = foundry.utils.flattenObject(changes);
  const parentPath = propertyPath.split(".").slice(0, -1).join(".");
  const key = propertyPath.split(".").at(-1);
  const unsetPath = `${parentPath}.-=${key}`;

  return Object.keys(flattened).some((k) =>
    k === propertyPath
    || k.startsWith(`${propertyPath}.`)
    || k === unsetPath
    || k.startsWith(`${unsetPath}.`)
    || k === parentPath
  );
}

function getChangedSheetMapMarker(changes) {
  if (!changes) return undefined;
  const propertyPath = "flags.campaign-codex.data.mapMarker";
  if (foundry.utils.hasProperty(changes, propertyPath)) {
    return foundry.utils.getProperty(changes, propertyPath);
  }

  const flattened = foundry.utils.flattenObject(changes);
  const unsetPath = "flags.campaign-codex.data.-=mapMarker";
  if (Object.keys(flattened).some((k) => k === unsetPath || k.startsWith(`${unsetPath}.`))) {
    return "";
  }

  return undefined;
}

export function initializeCampaignCodexMapMarkerRendering() {
  if (!game.settings.get("campaign-codex", "mapMarkers")) return;

  console.log("Campaign Codex | Initializing custom map markers");
  CONFIG.CampaignCodex = CONFIG.CampaignCodex || {};
  CONFIG.CampaignCodex.mapLocationMarker = {
    default: {
      icon: CampaignCodexMapMarker,
      backgroundColor: game.settings.get("campaign-codex", "color-accent"),
      borderColor: 0x2a2a2a,
      borderHoverColor: 0xff5500,
      fontFamily: "Roboto Slab",
      shadowColor: 0x000000,
      textColor: 0x2a2a2a,
    },
  };

  const customScale = (game.settings.get("campaign-codex", "mapMarkerOverride") * 18) - 18;
  const NoteClass = CONFIG.Note.objectClass;

  if (NoteClass.prototype._ccMapMarkerControlIconPatched) return;

  NoteClass.prototype._getCampaignCodexIcon = _getCampaignCodexIcon;
  const originalDrawControlIcon = NoteClass.prototype._drawControlIcon;
  NoteClass.prototype._drawControlIcon = function (...args) {
    const codexIcon = this._getCampaignCodexIcon();
    if (codexIcon) {
      codexIcon.x -= ((this.document.iconSize + customScale) / 2);
      codexIcon.y -= ((this.document.iconSize + customScale) / 2);
      return codexIcon;
    }

    const icon = originalDrawControlIcon.apply(this, args);
    const journal = this.document?.entry;
    const isCampaignCodexSheet = !!journal?.getFlag?.("campaign-codex", "type");
    if (!isCampaignCodexSheet || !icon) return icon;

    const noteMarker = this.document.getFlag?.("campaign-codex", "markerid");
    const markerCode = getCampaignCodexMapMarkerCode({ journal, noteMarker });
    const customMarkerImage = getCampaignCodexCustomMarkerImage(journal);
    const textureSrc = String(this.document?.texture?.src || "").trim();
    const isCustomImageMarker = !!customMarkerImage && !markerCode && textureSrc === customMarkerImage;
    if (!isCustomImageMarker) return icon;

    const hideIconChrome = () => {
      if (icon.bg) {
        icon.bg.visible = false;
        icon.bg.alpha = 0;
      }
      if (icon.border) {
        icon.border.visible = false;
        icon.border.alpha = 0;
      }
    };

    hideIconChrome();

    if (!icon._ccNoChromeRefreshPatched && typeof icon.refresh === "function") {
      const originalRefresh = icon.refresh.bind(icon);
      icon.refresh = function (options) {
        const patchedOptions = options && typeof options === "object"
          ? { ...options, borderVisible: false }
          : options;
        const result = originalRefresh(patchedOptions);
        if (this.bg) {
          this.bg.visible = false;
          this.bg.alpha = 0;
        }
        if (this.border) {
          this.border.visible = false;
          this.border.alpha = 0;
        }
        return result;
      };
      Object.defineProperty(icon, "_ccNoChromeRefreshPatched", {
        value: true,
        configurable: true,
      });
    }

    return icon;
  };

  Object.defineProperty(NoteClass.prototype, "_ccMapMarkerControlIconPatched", {
    value: true,
    configurable: true,
  });
}

export async function refreshCampaignCodexMapMarkersForJournal(document, changes) {
  if (!canvas?.ready) return;

  const mapMarkerChanged = didFlagPropertyChange(changes, "flags.campaign-codex.data.mapMarker");
  const mapMarkerImageChanged = didFlagPropertyChange(changes, "flags.campaign-codex.data.mapMarkerImage");
  if (!mapMarkerChanged && !mapMarkerImageChanged) return;
  const changedSheetMarker = mapMarkerChanged ? getChangedSheetMapMarker(changes) : undefined;

  const linkedNotes = canvas.notes.placeables.filter((n) => n?.document?.entryId === document.id);
  if (!linkedNotes.length) return;

  // Re-evaluate texture behavior when either the marker code or marker-image config changes.
  if (game.user.isGM && canvas.scene && (mapMarkerChanged || mapMarkerImageChanged)) {
    const markerImageConfig = getCampaignCodexMapMarkerImageConfig(document);
    const customMarkerImage = markerImageConfig.enabled ? markerImageConfig.src : "";
    const customMarkerSize = markerImageConfig.size;
    const noteUpdates = [];

    for (const note of linkedNotes) {
      const noteMarker = note.document.getFlag("campaign-codex", "markerid");
      const markerCode = getCampaignCodexMapMarkerCode({
        journal: document,
        noteMarker,
        sheetMarkerOverride: changedSheetMarker,
      });

      const currentSrc = String(note.document.texture?.src || "").trim();
      const currentSize = Number(note.document.iconSize ?? 40);
      const currentFit = String(note.document.texture?.fit || "").trim();
      const currentScaleX = Number(note.document.texture?.scaleX ?? 1);
      const currentScaleY = Number(note.document.texture?.scaleY ?? 1);
      const update = { _id: note.document.id };
      let changedUpdate = false;

      // Icon size applies to code markers and image markers.
      if (currentSize !== customMarkerSize) {
        update.iconSize = customMarkerSize;
        changedUpdate = true;
      }

      // Marker codes use the custom code icon; do not alter note texture.
      if (markerCode) {
        if (changedUpdate) noteUpdates.push(update);
        continue;
      }

      if (customMarkerImage) {
        if (currentSrc !== customMarkerImage) {
          update["texture.src"] = customMarkerImage;
          changedUpdate = true;
        }
        if (currentFit !== CUSTOM_MARKER_TEXTURE_FIT) {
          update["texture.fit"] = CUSTOM_MARKER_TEXTURE_FIT;
          changedUpdate = true;
        }
        if (currentScaleX !== 1) {
          update["texture.scaleX"] = 1;
          changedUpdate = true;
        }
        if (currentScaleY !== 1) {
          update["texture.scaleY"] = 1;
          changedUpdate = true;
        }
      } else if (markerImageConfig.src && currentSrc === markerImageConfig.src) {
        if (currentSrc !== "icons/svg/book.svg") {
          update["texture.src"] = "icons/svg/book.svg";
          changedUpdate = true;
        }
        if (currentFit !== DEFAULT_MARKER_TEXTURE_FIT) {
          update["texture.fit"] = DEFAULT_MARKER_TEXTURE_FIT;
          changedUpdate = true;
        }
        if (currentScaleX !== 1) {
          update["texture.scaleX"] = 1;
          changedUpdate = true;
        }
        if (currentScaleY !== 1) {
          update["texture.scaleY"] = 1;
          changedUpdate = true;
        }
      }

      if (changedUpdate) noteUpdates.push(update);
    }

    if (noteUpdates.length) {
      await canvas.scene.updateEmbeddedDocuments("Note", noteUpdates);
    }
  }

  for (const note of linkedNotes) requestCampaignCodexNoteRedraw(note);
}

export function getCampaignCodexMapMarkerPreCreateUpdate(document, data, pending) {
  const updateData = {};
  const entryId = document.entryId || data?.entryId;
  const journal = entryId ? game.journal.get(entryId) : null;
  const isCampaignCodexSheet = !!journal?.getFlag("campaign-codex", "type");
  if (!isCampaignCodexSheet) return updateData;

  const pendingMarkerId = pending?.flags?.["campaign-codex"]?.markerid;
  const existingMarkerId = foundry.utils.getProperty(data, "flags.campaign-codex.markerid");
  const markerId = String(pendingMarkerId ?? existingMarkerId ?? "").trim();
  const markerCode = getCampaignCodexMapMarkerCode({ journal, noteMarker: markerId });
  const customMarkerImage = getCampaignCodexCustomMarkerImage(journal);
  const customMarkerImageSize = getCampaignCodexCustomMarkerImageSize(journal);

  foundry.utils.setProperty(updateData, "iconSize", customMarkerImageSize);

  if (!markerCode && customMarkerImage) {
    foundry.utils.setProperty(updateData, "texture.src", customMarkerImage);
    foundry.utils.setProperty(updateData, "texture.fit", CUSTOM_MARKER_TEXTURE_FIT);
    foundry.utils.setProperty(updateData, "texture.scaleX", 1);
    foundry.utils.setProperty(updateData, "texture.scaleY", 1);
  }

  return updateData;
}

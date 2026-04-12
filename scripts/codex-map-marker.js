/**
 * Custom control icon used to display Campaign Codex journal pages with map codes.
 * This class renders the circular icon based on the style defined in CONFIG.
 */
const ControlIcon = foundry.canvas.containers.ControlIcon;
const MAP_CODE_REGEX = /^([A-Z]?\d{1,3}[A-Z]?)(?=\s*[-: ]|$)/i;
const DEFAULT_MARKER_IMAGE_ICON_SIZE = 40;

export class CampaignCodexMapMarker {
  constructor(options = {}, ...args) {
    const MarkerClass = game.release.generation >= 14 ? CampaignCodexMapMarkerV14 : CampaignCodexMapMarkerV13;
    return new MarkerClass(options, ...args);
  }
}

class CampaignCodexMapMarkerV13 extends PIXI.Container {
  constructor({ code, size = 40, ...style } = {}, ...args) {
    super(...args);

    this.code = code;
    this._size = size;
    this._elevation = 0;

    this.style = style;
    this.uiColor = game.settings.get("campaign-codex", "color-accent");
    this.customColour = game.settings.get("campaign-codex", "mapMarkerColor");
    this.customScale = (game.settings.get("campaign-codex", "mapMarkerOverride") * 18) - 18;
    this.borderColor = this.style.borderColor ?? 0x2a2a2a;

    this.renderMarker();
    this.refresh();
  }

  get size() {
    return this._size;
  }

  set size(value) {
    if (value === this._size) return;
    this._size = value;
    if (this.bg) {
      this.renderMarker();
      this.refresh();
    }
  }

  get elevation() {
    return this._elevation;
  }

  set elevation(value) {
    if ((typeof value !== "number") || !Number.isFinite(value)) return;
    this._elevation = value;
  }

  async draw() {
    return this.refresh();
  }

  renderMarker() {
    for (const child of this.removeChildren()) {
      child.destroy({ children: true });
    }

    const markerColor = this.customColour ? this.uiColor : (this.style.tint ?? this.style.backgroundColor ?? 0xFFFFFF);
    const bgColor = Color.from(markerColor);
    this.style.textColor = this._getContrastColor(Number(bgColor));
    this.radius = this.size + this.customScale;
    const centerX = this.radius / 2;
    const centerY = this.radius / 2;

    this.eventMode = "static";
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Circle(centerX, centerY, this.radius);
    this.cursor = "pointer";

    this.shadow = this.addChild(new PIXI.Graphics());
    this.shadow.clear()
      .beginFill(this.style.shadowColor, 0.65)
      .drawCircle(centerX, centerY + 2, this.radius + 2)
      .endFill();
    this.shadow.filters = [new PIXI.BlurFilter(5)];

    this.bg = this.addChild(new PIXI.Graphics());
    this.bg.clear()
      .beginFill(bgColor, 1.0)
      .lineStyle(2, this.style.borderColor ?? this.borderColor, 1.0)
      .drawCircle(centerX, centerY, this.radius)
      .endFill();

    this.text = new PIXI.Text(this.code, this._getTextStyle(this.code.length, this.size + (this.customScale / 2)));
    this.text.anchor.set(0.5, 0.5);
    this.text.position.set(centerX, centerY);
    this.addChild(this.text);

    this.icon = { tint: this.style.tint ?? 0xFFFFFF };

    this.border = this.addChild(new PIXI.Graphics());
    this.border.visible = false;
    this.circle = [centerX, centerY, this.radius];
    if (this._centerOnOrigin) this.centerOnNote();
  }

  centerOnNote(offset = this.radius / 2) {
    this._centerOnOrigin = true;
    this.position.set(-offset, -offset);
    return this;
  }

  _getContrastColor(bgColorInt) {
    const r = (bgColorInt >> 16) & 255;
    const g = (bgColorInt >> 8) & 255;
    const b = bgColorInt & 255;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? 0x2a2a2a : 0xFFFFFF;
  }

  refresh({ visible, iconColor, borderColor, borderVisible } = {}) {
    if (iconColor !== undefined) this.icon.tint = iconColor ?? 0xFFFFFF;
    if (borderColor !== undefined) this.borderColor = borderColor;
    this.border.clear().lineStyle(2, 0xFFFFFF, 1.0).drawCircle(...this.circle).endFill();
    this.border.tint = this.borderColor;
    if (borderVisible !== undefined) this.border.visible = borderVisible;
    if (visible !== undefined) this.visible = visible;
    return this;
  }

  _getTextStyle(characterCount, size) {
    const style = new PIXI.TextStyle({
      dropShadow: false,
      fill: this.style.textColor,
      strokeThickness: 0,
      fontFamily: "Signika",
      fontSize: characterCount > 2 ? size * 0.5 : size * 0.6,
      fontWeight: "bold",
    });

    if (this.style.fontFamily) {
      style.fontFamily = Array.isArray(this.style.fontFamily)
        ? [...this.style.fontFamily, "Signika"]
        : [this.style.fontFamily, "Signika"];
    }
    return style;
  }
}

class CampaignCodexMapMarkerV14 extends ControlIcon {
  constructor({ code, size = 40, tint = 0xFFFFFF, ...style } = {}, ...args) {
    super({
      texture: PIXI.Texture.EMPTY,
      size,
      tint,
      borderColor: style.borderColor ?? 0x2a2a2a,
      elevation: 0,
    }, ...args);

    this.code = code;
    this.markerTint = tint;
    this.style = style;
    this.style.textColor ??= 0xFFFFFF;
    this.uiColor = game.settings.get("campaign-codex", "color-accent");
    this.customColour = game.settings.get("campaign-codex", "mapMarkerColor");
    this.customScale = (game.settings.get("campaign-codex", "mapMarkerOverride") * 18) - 18;
    this.markerBorderColor = this.style.borderColor ?? 0x2a2a2a;
    this.bg.tint = 0xFFFFFF;
    this.bg.alpha = 1;
    this.icon.visible = false;
    this.tooltip.visible = false;

    this.shadow = this.addChildAt(new PIXI.Graphics(), 0);
    this.text = new PIXI.Text("", this._getTextStyle(0, size));
    this.addChildAt(this.text, this.getChildIndex(this.border));

    this.renderMarker();
  }

  async draw() {
    return this.refresh();
  }

  renderMarker() {
    const markerColor = this.customColour ? this.uiColor : (this.markerTint ?? this.style.backgroundColor ?? 0xFFFFFF);
    const bgColor = Color.from(markerColor);
    this.style.textColor = this._getContrastColor(Number(bgColor));
    this.radius = this.size + this.customScale;
    const centerX = this.radius / 2;
    const centerY = this.radius / 2;

    this.eventMode = "static";
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Circle(centerX, centerY, this.radius);
    this.cursor = "pointer";

    this.shadow.clear()
      .beginFill(this.style.shadowColor, 0.65)
      .drawCircle(centerX, centerY + 2, this.radius + 2)
      .endFill();
    this.shadow.filters = [new PIXI.BlurFilter(5)];

    this.bg.clear()
      .beginFill(bgColor, 1.0)
      .lineStyle(2, this.style.borderColor ?? this.markerBorderColor, 1.0)
      .drawCircle(centerX, centerY, this.radius)
      .endFill();

    this.text.text = this.code;
    this.text.style = this._getTextStyle(this.code.length, this.size + (this.customScale / 2));
    this.text.anchor.set(0.5, 0.5);
    this.text.position.set(centerX, centerY);

    this.border.clear()
      .lineStyle(2, 0xFFFFFF, 1.0)
      .drawCircle(centerX, centerY, this.radius)
      .endFill();
    this.border.tint = this.markerBorderColor;

    if (this._centerOnOrigin) this.centerOnNote();
  }

  centerOnNote(offset = this.radius / 2) {
    this._centerOnOrigin = true;
    this.position.set(0, 0);
    this.pivot.set(offset, offset);
    return this;
  }

  _getContrastColor(bgColorInt) {
    const r = (bgColorInt >> 16) & 255;
    const g = (bgColorInt >> 8) & 255;
    const b = bgColorInt & 255;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? 0x2a2a2a : 0xFFFFFF;
  }

  refresh({ visible, iconColor, borderColor, borderVisible } = {}) {
    if (iconColor !== undefined) {
      this.icon.tint = iconColor ?? 0xFFFFFF;
      this.markerTint = this.icon.tint;
    }
    if (borderColor !== undefined) this.markerBorderColor = borderColor;
    this.renderMarker();
    if (borderVisible !== undefined) this.border.visible = borderVisible;
    if (visible !== undefined) this.visible = visible;
    return this;
  }

  _getTextStyle(characterCount, size) {
    const style = new PIXI.TextStyle({
      dropShadow: false,
      fill: this.style.textColor,
      strokeThickness: 0,
      fontFamily: "Signika",
      fontSize: characterCount > 2 ? size * 0.5 : size * 0.6,
      fontWeight: "bold",
    });

    if (this.style.fontFamily) {
      style.fontFamily = Array.isArray(this.style.fontFamily)
        ? [...this.style.fontFamily, "Signika"]
        : [this.style.fontFamily, "Signika"];
    }
    return style;
  }
}

export function getCampaignCodexMapMarkerCode({ journal, noteMarker, sheetMarkerOverride } = {}) {
  if (!journal) return "";

  const markerFromNote = String(noteMarker || "").trim();
  if (markerFromNote) return markerFromNote.toUpperCase();

  if (sheetMarkerOverride !== undefined) {
    const markerFromOverride = String(sheetMarkerOverride || "").trim();
    if (markerFromOverride) return markerFromOverride.toUpperCase();
  }

  const markerFromSheet = String(journal.getFlag("campaign-codex", "data")?.mapMarker || "").trim();
  if (markerFromSheet) return markerFromSheet.toUpperCase();

  const match = String(journal.name || "").match(MAP_CODE_REGEX);
  return match?.[1]?.toUpperCase() || "";
}

export function getCampaignCodexMapMarkerImageConfig(journal) {
  if (!journal) return { enabled: false, src: "", size: DEFAULT_MARKER_IMAGE_ICON_SIZE };
  const rawConfig = journal.getFlag("campaign-codex", "data")?.mapMarkerImage;
  const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  const src = String(config.src || "").trim();
  let size = Number(config.size);
  if (!Number.isFinite(size)) size = DEFAULT_MARKER_IMAGE_ICON_SIZE;
  size = Math.clamp(Math.round(size), 8, 512);

  const enabled = !!config.enabled && !!src;
  return { enabled, src, size };
}

export function getCampaignCodexCustomMarkerImage(journal) {
  const config = getCampaignCodexMapMarkerImageConfig(journal);
  if (!config.enabled || !config.src) return "";
  return config.src;
}

export function getCampaignCodexCustomMarkerImageSize(journal) {
  const config = getCampaignCodexMapMarkerImageConfig(journal);
  return config.size;
}

/**
 * A helper function to be attached to the Note.prototype.
 * It checks if a note should have a custom Campaign Codex icon.
 * 'this' is assumed to be an instance of a Note.
 * @returns {PIXI.Container|void}
 */
export function _getCampaignCodexIcon() {
  const journal = this.document.entry;
  if (!journal) return;
  const isCC = journal.getFlag("campaign-codex", "type");
  if (!isCC) return;
  const noteMarker = this.document.getFlag("campaign-codex", "markerid");
  const code = getCampaignCodexMapMarkerCode({ journal, noteMarker });
  if (!code) return;

  const { icon: IconClass, ...style } = foundry.utils.mergeObject(
    CONFIG.CampaignCodex.mapLocationMarker.default,
    {},
    { inplace: false },
  );

  const options = {
    size: this.document.iconSize,
    tint: Color.from(this.document.texture.tint ?? 0xFFFFFF),
  };
  return new IconClass({ code, ...options, ...style });
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DEFAULT_ICONS = [
  "fa-globe",
  "fa-location-dot",
  "fa-house",
  "fa-user",
  "fa-box",
  "fa-sitemap",
  "fa-tag",
  "fa-people-group",
  "fa-scroll",
];

const ICON_DICTIONARY_PATH = "modules/campaign-codex/data/icons-dictionary.json";
const MAX_FILTER_RESULTS = 300;
const RANDOM_UNFILTERED_COUNT = 50;

export class iconPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(_object, parent, options = {}) {
    super(options);
    this._parentSheet = parent ?? options.parent ?? null;
    this.stat = options.stat ?? null;

    this.defaultFonts = [...DEFAULT_ICONS];
    this.fonts = [...this.defaultFonts];
    this.allFonts = [...this.defaultFonts];
    this.unfilteredFonts = [...this.defaultFonts];
    this.currentIcon = "";
    this._dictionaryLoaded = false;
  }

  static DEFAULT_OPTIONS = {
    id: "cc-iconpicker",
    tag: "div",
    classes: ["sheet"],
    sheetConfig: false,
    window: {
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-image",
      title: "Icon",
      resizable: true,
    },
    actions: {
      selectIcon: iconPicker.selectIcon,
    },
    position: { width: 350, height: 250 },
  };

  static PARTS = {
    body: {
      classes: ["standard-form"],
      template: "modules/campaign-codex/templates/iconpicker.hbs",
      scrollable: [""],
    },
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "body") this._prepareBodyContext(context, options);
    return context;
  }

  _prepareBodyContext(context, _options) {
    return foundry.utils.mergeObject(context, {
      fonts: this.fonts,
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    await this._ensureDictionaryLoaded();
    this.currentIcon = this._getCurrentIcon();
    this.unfilteredFonts = this._buildUnfilteredIcons();
    this.fonts = [...this.unfilteredFonts];

    const input = this.element.querySelector(".search-icons");
    if (input) {
      input.addEventListener("input", this.filterIcons.bind(this));
      input.addEventListener("keydown", this._onSearchKeydown.bind(this));
    }

    this._renderIcons(this.fonts);
  }

  async _ensureDictionaryLoaded() {
    if (this._dictionaryLoaded) return;

    try {
      const response = await fetch(ICON_DICTIONARY_PATH, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Failed to load icon dictionary: ${response.status}`);
      const payload = await response.json();
      const normalized = this._normalizeIconDictionary(payload);
      if (normalized.length) this.allFonts = normalized;
    } catch (error) {
      console.warn("[campaign-codex] Icon dictionary load failed, using defaults only.", error);
      this.allFonts = [...this.defaultFonts];
    }

    this._dictionaryLoaded = true;
  }

  _normalizeIconDictionary(payload) {
    const source = Array.isArray(payload) ? payload : Array.isArray(payload?.icons) ? payload.icons : [];
    const seen = new Set();
    const icons = [];

    for (const entry of source) {
      const normalized = this._normalizeIconName(entry);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      icons.push(normalized);
    }

    return icons;
  }

  _normalizeIconName(entry) {
    let raw = "";

    if (typeof entry === "string") {
      raw = entry;
    } else if (entry && typeof entry === "object") {
      raw = entry.icon ?? entry.class ?? entry.name ?? "";
    }

    if (!raw) return "";

    const parts = String(raw).trim().split(/\s+/).filter(Boolean);
    const styleClasses = new Set([
      "fa",
      "fas",
      "far",
      "fal",
      "fab",
      "fa-solid",
      "fa-regular",
      "fa-light",
      "fa-thin",
      "fa-duotone",
      "fa-brands",
    ]);

    let token = parts.find((p) => p.startsWith("fa-") && !styleClasses.has(p));
    if (!token) token = parts.find((p) => p.startsWith("fa-")) ?? parts[0];
    if (!token) return "";

    if (!token.startsWith("fa-")) token = `fa-${token}`;

    return token;
  }

  filterIcons(event) {
    const rawTerm = String(event.currentTarget?.value ?? "").trim();
    const term = rawTerm.toLowerCase();
    const termWithoutPrefix = term.startsWith("fa-") ? term.slice(3) : term;

    if (!term) {
      this.fonts = [...this.unfilteredFonts];
      this._renderIcons(this.fonts);
      return;
    }

    const matches = this.allFonts
      .filter((icon) => {
        const normalized = icon.toLowerCase();
        const normalizedWithoutPrefix = normalized.startsWith("fa-") ? normalized.slice(3) : normalized;
        return normalized.includes(term) || normalizedWithoutPrefix.includes(termWithoutPrefix);
      })
      .slice(0, MAX_FILTER_RESULTS);
    if (this.currentIcon && matches.includes(this.currentIcon)) {
      this.fonts = [this.currentIcon, ...matches.filter((icon) => icon !== this.currentIcon)];
    } else {
      this.fonts = matches;
    }

    if (!this.fonts.length) {
      const manualIcon = this._normalizeIconName(rawTerm);
      if (manualIcon) this.fonts = [manualIcon];
    }

    this._renderIcons(this.fonts);
  }

  _onSearchKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    this._commitTypedIcon(event.currentTarget?.value);
  }

  _commitTypedIcon(value) {
    const icon = this._normalizeIconName(value);
    if (!icon) return;
    this._selectIcon(icon);
  }

  _renderIcons(icons) {
    const list = this.element.querySelector(".icon-list");
    if (!list) return;

    list.replaceChildren();

    for (const icon of icons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `inline-control icon fa-solid ${icon}`;
      button.dataset.value = icon;
      const isCurrent = icon === this.currentIcon;
      button.title = isCurrent ? `${icon} (current)` : icon;
      button.setAttribute("aria-label", icon);
      if (isCurrent) {
        button.classList.add("is-current-icon");
        button.classList.add("campaign-codex");
        button.dataset.current = "true";
      }
      button.addEventListener("click", () => this._selectIcon(icon));
      list.appendChild(button);
    }
  }

  _extractIconToken(value) {
    if (!value) return "";
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    const token = parts.find((p) => p.startsWith("fa-") && p !== "fa-solid");
    return token ?? "";
  }

  _getCurrentIcon() {
    const fromFlag = this._parentSheet?.document?.getFlag?.("campaign-codex", "icon-override");
    const iconFromFlag = this._extractIconToken(fromFlag);
    if (iconFromFlag) return iconFromFlag;

    const iconButton = this._parentSheet?.element?.querySelector?.(".icon button");
    const iconFromButton = this._extractIconToken(iconButton?.className);
    if (iconFromButton) return iconFromButton;

    return "";
  }

  _buildUnfilteredIcons() {
    const pinned = [];
    const seen = new Set();
    const add = (icon) => {
      if (!icon || seen.has(icon)) return;
      seen.add(icon);
      pinned.push(icon);
    };

    add(this.currentIcon);
    for (const icon of this.defaultFonts) add(icon);

    const pool = this.allFonts.filter((icon) => !seen.has(icon));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return [...pinned, ...pool.slice(0, RANDOM_UNFILTERED_COUNT)];
  }

  _selectIcon(icon) {
    const parent = this._parentSheet ?? this.options?.parent;
    const statId = this.stat?.id ?? this.options?.stat?.id ?? "icon-override";
    if (!parent?.setIcon) return;
    parent.setIcon(statId, icon);
    this.close();
  }

  static selectIcon(_event, target) {
    const icon = target?.dataset?.value;
    if (!icon) return;
    this._selectIcon(icon);
  }
}

const { SchemaField, BooleanField } = foundry.data.fields;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const TabPickerApp = HandlebarsApplicationMixin((ApplicationV2));
import { localize } from "./helper.js";

const TABS_BY_SHEET = {
  npc: ["info", "locations", "regions", "shops", "inventory", "associates", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
  location: ["info", "shops", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
  shop: ["info", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
  region: ["info", "shops", "regions", "parentregions", "locations", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
  group: ["info", "regions", "locations", "shops", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
  tag: ["info", "inventory", "quests", "journals", "widgets", "notes", "mapMarker"],
  quest: ["info", "inventory", "journals", "notes", "mapMarker"]

};


const ALL_TABS_MAP = {
  info: "Info",
  parentregions: "Parent",
  regions: "Regions",
  locations: "Locations",
  shops: "Entries",
  npcs: "NPCs",
  associates: "Associates",
  factions: "Factions",
  inventory: "Inventory",
  quests: "Quests",
  journals: "Journals",
  widgets: "Widgets",
  notes: "Notes (GM)",
  mapMarker: "Map Marker",
};

/**
 * Helper to get the default structure.
 * @param {boolean} visibleDefault - Default value for 'visible' (default: true)
 * @param {boolean} hiddenDefault - Default value for 'hidden' (default: false)
 */
function getDefaultVisibilities(visibleDefault = true, hiddenDefault = false) {
  const defaults = {};
  for (const [sheetType, tabs] of Object.entries(TABS_BY_SHEET)) {
    defaults[sheetType] = {};
    for (const tabKey of tabs) {
      defaults[sheetType][tabKey] = { visible: visibleDefault, hidden: hiddenDefault };
    }
  }
  return defaults;
}

export class tabPicker extends TabPickerApp {
  static get DEFAULT_OPTIONS() {
  return {    
  // static DEFAULT_OPTIONS = {
    tag: 'form',
    id: "campaign-codex-tab-config",
    classes: ["campaign-codex-tab-config", "campaign-codex"],
    window: {
      icon: "fas fa-bars",
      title: localize("dialog.defaultTabVisibility"),
      contentClasses: ["standard-form"]
    },
    position: { width: 700, height: "auto" },
    form: {
      handler: this.#onSubmitForm,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      reset: this.#onResetDefaults,
    }
  };}

  /** @override */
  static PARTS = {
    form: {
      template: "modules/campaign-codex/templates/tab-picker-config.hbs",
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Dynamically define the schema based on our TABS_BY_SHEET mapping.
   * @override
   */
  static defineSchema() {
    const fields = {};
    const defaultVisibilities = getDefaultVisibilities();

    for (const [sheetType, tabs] of Object.entries(TABS_BY_SHEET)) {
      const tabFields = {};
      for (const tabKey of tabs) {
        const defaults = defaultVisibilities[sheetType]?.[tabKey] || { visible: true, hidden: false };
        tabFields[tabKey] = new SchemaField({
          visible: new BooleanField({
            label: ALL_TABS_MAP[tabKey] || tabKey,
            initial: defaults.visible
          }),
          hidden: new BooleanField({
            label: localize("ui.hiddenFromPlayer"),
            initial: defaults.hidden
          })
        });
      }
      fields[sheetType] = new SchemaField(tabFields);
    }
    return new SchemaField(fields);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const defaults = getDefaultVisibilities(true, false);
    const settings = game.settings.get("campaign-codex", "defaultTabVisibility");

    const normalizedSettings = {};
    if (settings) {
      for (const [sheet, tabs] of Object.entries(settings)) {
        normalizedSettings[sheet] = {};
        for (const [tab, value] of Object.entries(tabs)) {
          if (typeof value === "boolean") {
            normalizedSettings[sheet][tab] = { visible: value, hidden: false };
          } else {
            normalizedSettings[sheet][tab] = value;
          }
        }
      }
    }

    const currentData = foundry.utils.mergeObject(defaults, normalizedSettings);

    const sheetTypes = Object.keys(TABS_BY_SHEET).map(key => ({
      key: key,
      label: key.charAt(0).toUpperCase() + key.slice(1)
    }));

    const tabRows = Object.keys(ALL_TABS_MAP).map(tabKey => {
      const row = {
        key: tabKey,
        label: ALL_TABS_MAP[tabKey],
        isNotes: tabKey === "notes",
        sheets: []
      };

      row.sheets = sheetTypes.map(sheet => {
        const sheetKey = sheet.key;
        if (TABS_BY_SHEET[sheetKey].includes(tabKey)) {
          const setting = currentData[sheetKey]?.[tabKey];
          return {
            exists: true,
            sheetName: sheet.label,
            tabLabel: row.label,
            nameVisible: `${sheetKey}.${tabKey}.visible`,
            nameHidden: `${sheetKey}.${tabKey}.hidden`,
            visible: setting?.visible ?? true,
            hidden: setting?.hidden ?? false
          };
        } else {
          return { exists: false };
        }
      });

      return row;
    });
    context.description = localize("ui.tabPickerDescription");
    context.sheetTypes = sheetTypes;
    context.tabRows = tabRows;
    context.buttons = this._getButtons();
    return context;
  }

  _getButtons() {
    return [
      {
        type: "button",
        action: "reset",
        icon: "fa-solid fa-undo",
        label: localize("tabs.reset")
      },
      {
        type: "submit",
        icon: "fa-solid fa-floppy-disk",
        label: localize("dialog.save")
      }
    ];
  }

  static async #onSubmitForm(event, form, formData) {
    event.preventDefault();
    const skeleton = getDefaultVisibilities(false, false);
    const submitData = foundry.utils.mergeObject(skeleton, formData.object);

    await game.settings.set("campaign-codex", "defaultTabVisibility", submitData);
    ui.notifications.info(localize('notify.tabVisibilitySaved'));
    game.campaignCodex.refreshAllOpenCodexSheets();
  }

  static async #onResetDefaults(event) {
    event.preventDefault();
    const defaults = getDefaultVisibilities(true, false);
    await game.settings.set("campaign-codex", "defaultTabVisibility", defaults);
    ui.notifications.info(localize('notify.tabVisibilityReset'));
    this.render();
  }
}

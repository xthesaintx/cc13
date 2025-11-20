const { SchemaField, BooleanField } = foundry.data.fields;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const TabPickerApp = HandlebarsApplicationMixin((ApplicationV2));

const TABS_BY_SHEET = {
  npc: ["info", "locations", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
  location: ["info", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
  shop: ["info", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
  region: ["info", "shops", "regions", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
  tag: ["info", "locations", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"]
};


const ALL_TABS_MAP = {
  info: "Info",
  locations: "Locations",
  shops: "Shops",
  inventory: "Inventory",
  npcs: "NPCs",
  regions: "Regions",
  quests: "Quests",
  journals: "Journals",
  widgets: "Widgets",
  notes: "Notes (GM)"
};


function getDefaultVisibilities() {
  const defaults = {};
  for (const [sheetType, tabs] of Object.entries(TABS_BY_SHEET)) {
    defaults[sheetType] = {};
    for (const tabKey of tabs) {
      defaults[sheetType][tabKey] = true;
    }
  }
  return defaults;
}

export class tabPicker extends TabPickerApp {
  static DEFAULT_OPTIONS = {
    tag: 'form',
    id: "campaign-codex-tab-config",
    title: "Default Tab Visibility",
    classes: ["campaign-codex-tab-config", "campaign-codex"],
    window: {
      icon: "fas fa-bars",
      contentClasses: ["standard-form"]
    },
    position: { width: "auto", height: "auto" },
    form: {
      handler: this.#onSubmitForm,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      reset: this.#onResetDefaults,
    }
  };

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
        tabFields[tabKey] = new BooleanField({
          label: ALL_TABS_MAP[tabKey] || tabKey,
          initial: defaultVisibilities[sheetType]?.[tabKey] ?? true
        });
      }
      fields[sheetType] = new SchemaField(tabFields);
    }
    return new SchemaField(fields);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Get the current settings, merging them with defaults
    const defaults = getDefaultVisibilities();
    const settings = game.settings.get("campaign-codex", "defaultTabVisibility");
    const currentData = foundry.utils.mergeObject(defaults, settings);

    // Create a master list of all tabs for the table header
    const allTabs = Object.keys(ALL_TABS_MAP).map(key => ({
      key: key,
      label: ALL_TABS_MAP[key]
    }));

    const sheetRows = Object.keys(TABS_BY_SHEET).map(sheetKey => {
      const friendlyName = sheetKey.charAt(0).toUpperCase() + sheetKey.slice(1);
      
      const tabs = allTabs.map(tab => {
        const tabKey = tab.key;
        if (TABS_BY_SHEET[sheetKey].includes(tabKey)) {
          return {
            exists: true,
            key: tabKey,
            name: `${sheetKey}.${tabKey}`, // e.g., "npc.info"
            label: tab.label,
            checked: currentData[sheetKey]?.[tabKey] ?? true
          };
        } else {
          return { exists: false };
        }
      });

      return {
        key: sheetKey,
        name: friendlyName,
        tabs: tabs
      };
    });

    context.allTabs = allTabs;
    context.sheetRows = sheetRows;
    context.buttons = this._getButtons();
    return context;
  }

  _getButtons() {
    return [
      {
        type: "button",
        action: "reset",
        icon: "fa-solid fa-undo",
        label: "Reset Defaults"
      },
      {
        type: "submit",
        icon: "fa-solid fa-floppy-disk",
        label: "Save Changes"
      }
    ];
  }

  static async #onSubmitForm(event, form, formData) {
    event.preventDefault();
    await game.settings.set("campaign-codex", "defaultTabVisibility", formData.object);
    ui.notifications.info("Campaign Codex default tab visibility saved!");
    game.campaignCodex.refreshAllOpenCodexSheets();
  }

  static async #onResetDefaults(event) {
    event.preventDefault();
    const defaults = getDefaultVisibilities();
    await game.settings.set("campaign-codex", "defaultTabVisibility", defaults);
    ui.notifications.info("Campaign Codex default tab visibility has been reset.");
    this.render(); // Re-render the form
  }
}
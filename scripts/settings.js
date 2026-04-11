import { ColorThemeConfig } from "./color-theme-config.js";
import { SimpleCampaignCodexExporter } from "./campaign-codex-exporter.js";
import { templateManager } from "./journal-template-manager.js";
import { tabPicker } from "./tab-picker.js";
import { TemplatePicker } from "./template-picker.js";
import {
    CorePermissionSettingsMenu,
    CoreEconomySettingsMenu,
    CoreGeneralSettingsMenu,
    CoreMapMarkerSettingsMenu
} from "./core-settings-submenu.js";
import {
    applyTocButtonStyle,
    applyThemeColors
} from "./helper.js";
export const MODULE_NAME = "campaign-codex";
const { ColorField } = foundry.data.fields;


export default async function campaigncodexSettings() {
    const localize = (key) => game.i18n.localize(`CAMPAIGN_CODEX.settings.${key}`);

    game.settings.register("campaign-codex", "tocSheetDimensions", {
        scope: "client",
        config: false,  
        type: Object,
        default: { width: 450, height: 500 } 
    });
    
    game.settings.register("campaign-codex", "themeEnabled", {
        name: localize("enableThemes.name"),
        hint: localize("enableThemes.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => applyThemeColors() 

    });

    game.settings.registerMenu("campaign-codex", "coreGeneralSettingsMenu", {
        name: "General Settings",
        label: "General",
        hint: "Core behavior, UI toggles, and general gameplay options.",
        icon: "fa-solid fa-sliders",
        type: CoreGeneralSettingsMenu,
        restricted: true
    });

    game.settings.registerMenu("campaign-codex", "coreEconomySettingsMenu", {
        name: "Economy Settings",
        label: "Economy",
        hint: "Currency paths, purchasing behavior, and inventory visibility controls.",
        icon: "fa-solid fa-coins",
        type: CoreEconomySettingsMenu,
        restricted: true
    });

    game.settings.registerMenu("campaign-codex", "corePermissionSettingsMenu", {
        name: "Permission Settings",
        label: "Permissions",
        hint: "Player visibility and permission controls.",
        icon: "fa-solid fa-eye",
        type: CorePermissionSettingsMenu,
        restricted: true
    });

    game.settings.registerMenu("campaign-codex", "coreMapMarkerSettingsMenu", {
        name: "Map Marker Settings",
        label: "Map Markers",
        hint: "Map marker visibility, hover behavior, and color controls.",
        icon: "fa-solid fa-map-marker-alt",
        type: CoreMapMarkerSettingsMenu,
        restricted: true
    });


    game.settings.register("campaign-codex", "playerCurrencyPath", {
        name: localize("playerCurrencyPath.name"),
        hint: localize("playerCurrencyPath.hint"),
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemPricePath", {
        name: localize("itemPricePath.name"),
        hint: localize("itemPricePath.hint"),
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationPath", {
        name: localize("itemDenominationPath.name"),
        hint: localize("itemDenominationPath.hint"),
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationOverride", {
        name: localize("itemDenominationOverride.name"),
        hint: localize("itemDenominationOverride.hint"),
        scope: "world",
        config: false,
        type: String,
        default: "",
    });
    game.settings.register("campaign-codex", "sortCardsAlpha", {
        name: localize("sortCardsAlpha.name"),
        hint: localize("sortCardsAlpha.hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "runonlyonce", {
        name: localize("runonlyonce.name"),
        hint: localize("runonlyonce.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "runonlyonce300", {
        name: localize("runonlyonce.name"),
        hint: localize("runonlyonce.hint"),
        scope: "world",
        requiresReload: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "runonlyonce185", {
        name: localize("runonlyonce.name"),
        hint: localize("runonlyonce.hint"),
        scope: "world",
        requiresReload: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "useOrganizedFolders", {
        name: localize("useOrganizedFolders.name"),
        hint: localize("useOrganizedFolders.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "hideByPermission", {
        name: localize("hideByPermission.name"),
        hint: localize("hideByPermission.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "hideInventoryByPermission", {
        name: localize("hideInventoryByPermission.name"),
        hint: localize("hideInventoryByPermission.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "allowPlayerPurchasing", {
        name: localize("allowPlayerPurchasing.name"),
        hint: localize("allowPlayerPurchasing.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });  

      game.settings.register("campaign-codex", "allowPlayerLooting", {
        name: localize("allowPlayerLooting.name"),
        hint: localize("allowPlayerLooting.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "addPurchaseFundsToInventoryCash", {
        name: localize("addPurchaseFundsToInventoryCash.name"),
        hint: localize("addPurchaseFundsToInventoryCash.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "enableTransactionLogging", {
        name: localize("enableTransactionLogging.name"),
        hint: localize("enableTransactionLogging.hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "roundFinalPrice", {
        name: localize("roundFinalPrice.name"),
        hint: localize("roundFinalPrice.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "maxRegionDepth", {
        name: localize("maxRegionDepth.name"),
        hint: localize("maxRegionDepth.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: new foundry.data.fields.NumberField({nullable: false, min: 1, max: 10, step: 1}),
        default: 5,
        onChange: value => {console.log(value)}
    });
    game.settings.register("campaign-codex", "showStats", {
        name: localize("showStats.name"),
        hint: localize("showStats.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "showActorDropperDialog", {
        name: localize("showActorDropperDialog.name"),
        hint: localize("showActorDropperDialog.hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "allowPlayerNotes", {
        name: "Allow Player Notes",
        hint: "If enabled, players can access the Notes tab and save personal notes per sheet.",
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "showOnlyPinned", {
        name: localize("showOnlyPinned.name"),
        hint: localize("showOnlyPinned.hint"),
    scope: "world", 
    config: false,   
    type: Boolean,
    default: false,
});


    game.settings.register("campaign-codex", "hideCCbutton", {
        name: localize("hideCCbutton.name"),
        hint: localize("hideCCbutton.hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "useStyledTocButton", {
        name: localize("useStyledTocButton.name"),
        hint: localize("useStyledTocButton.hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
        onChange: (value) => applyTocButtonStyle(value),
    });

    game.settings.register("campaign-codex", "mapMarkers", {
        name: localize("mapMarkers.name"),
        hint: localize("mapMarkers.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "mapMarkersHoverDelay", {
        name: localize("mapMarkersHoverDelay.name"),
        hint: localize("mapMarkersHoverDelay.hint"),
        scope: "world",
        config: false,
        type: Number,
        range: {
            min: 0,
            max: 1500,
            step: 50
        },
        default: 0
    });
    
    game.settings.register("campaign-codex", "mapMarkersHover", {
        name: localize("mapMarkersHover.name"),
        hint: localize("mapMarkersHover.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "mapMarkerColor", {
        name: localize("mapMarkerColor.name"),
        hint: localize("mapMarkerColor.hint"),
        scope: "world",
        config: false,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

game.settings.register("campaign-codex", "mapMarkerOverride", {
    name: localize("mapMarkerOverride.name"),
    hint: localize("mapMarkerOverride.hint"),
    scope: "world",
    config: false,
    requiresReload: true,
    type: new foundry.data.fields.NumberField({nullable: false, min: 0, max: 1, step: 0.5}),
    default: 1,
});


const accentDefault = "#d4af37";


const colors = {
    primary: "#8b1538",
    slate:"#5a6268",
    textMuted: "#888",
    sidebarBg: "#2a2a2a",
    sidebarText: "#ffffff",
    success: "#28a745",
    danger: "#dc3545",
    mainBg: "#f8f9fa",
    mainText: "#2a2a2a",
    border: "#444444",
    cardBg: "#ffffff",
    fontHeading: 'Modesto Condensed',
    fontBody: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif;',
};

for (const [key, defaultValue] of Object.entries(colors)) {
    game.settings.register("campaign-codex", `color-${key}`, {
        scope: "world",
        config: false, 
        type: String,
        default: defaultValue,
        onChange: () => applyThemeColors() 
    });
}

game.settings.register("campaign-codex", "color-backgroundImage", {
    scope: "world",
    config: false, 
    type: String,
    filePicker: "image",
    default: "",
    onChange: () => applyThemeColors() 
});

game.settings.register("campaign-codex", "color-themeOverrideToLight", {
    scope: "world",
    config: false,
    requiresReload: true,
    type: String,
    default: "none",
    onChange: () => applyThemeColors(),
});

game.settings.register("campaign-codex", "color-anchorImage", {
    scope: "world",
    config: false,
    requiresReload: true,
    type: Boolean,
    default: false,
    onChange: () => applyThemeColors(),
});


game.settings.register("campaign-codex", "color-backgroundImageTile", {
    scope: "world",
    config: false,
    requiresReload: true,
    type: Boolean,
    default: false,
    onChange: () => applyThemeColors(),
});

game.settings.register("campaign-codex", "color-backgroundOpacity", {
    scope: "world",
    config: false,
    requiresReload: true,
    type: new foundry.data.fields.NumberField({nullable: false, min: 1, max: 100, step: 1}),
    default: 100,
    onChange: () => applyThemeColors() 
});

game.settings.register("campaign-codex", "color-accent", {
    scope: "world",
    config: false,
    type: String,
    default: accentDefault,
    onChange: async (newColor) => {
        const baseColor = newColor.startsWith('#') ? newColor.substring(0, 7) : `#${newColor.substring(0, 6)}`;
        await Promise.all([
            game.settings.set("campaign-codex", "color-accent80", baseColor + "CC"),
            game.settings.set("campaign-codex", "color-accent30", baseColor + "4D"),
            game.settings.set("campaign-codex", "color-accent10", baseColor + "1A")
        ]);
        applyThemeColors();
    }
});

game.settings.register("campaign-codex", "color-accent80", {
    scope: "world", config: false, type: String, default: accentDefault + "CC", onChange: () => applyThemeColors()
});
game.settings.register("campaign-codex", "color-accent30", {
    scope: "world", config: false, type: String, default: accentDefault + "4D", onChange: () => applyThemeColors()
});
game.settings.register("campaign-codex", "color-accent10", {
    scope: "world", config: false, type: String, default: accentDefault + "1A", onChange: () => applyThemeColors()
});


game.settings.registerMenu("campaign-codex", "themeColorPicker", {
    name: "Configure Campaign Codex Colors",
    label: "Configure Colors",
    hint: "Customize the colors of the Campaign Codex UI.",
    icon: "fa-solid fa-bars",  
    type: ColorThemeConfig,
    restricted: true  
});


    game.settings.register("campaign-codex", "journalTemplateFolder", {
        name: "Journal Template Folder",
        hint: "The folder to scan for ProseMirror journal templates.",
        scope: "world",
        config: true, 
        type: String,
        filePicker: "folder",
        default: "",
        onChange: () => templateManager.scanAllTemplates()
    });


    game.settings.register("campaign-codex", "defaultTabVisibility", {
        name: "Default Tab Visibility",
        scope: "world",
        config: false, 
        type: Object,
        default: getDefaultVisibilities(), 
    });

    game.settings.registerMenu("campaign-codex", "defaultTabsPicker", {
        name: "Default Tabs for Sheets",
        label: "Default Sheet Tabs",
        hint: "Select the default Tabs for Campaign Codex Sheets",
        icon: "fas fa-bars",
        type: tabPicker, 
        restricted: true
    });


    game.keybindings.register("campaign-codex", "tocOpen", {
      name: "Open the Camapign Codex Table of Contents",
      editable: [
        {key: "KeyT", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL]}
      ],
      onDown: () => {game.campaignCodex.openTOCSheet();}
    });

    game.keybindings.register("campaign-codex", "newCCSheet", {
      name: "Create a new Camapign Codex sheet",
      editable: [
        {key: "KeyN", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL, foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT]}
      ],
      onDown: () => {game.campaignCodex.newJournal();}
    });

    game.keybindings.register("campaign-codex", "questOpen", {
      name: "Open the Camapign Codex Quest Board",
      editable: [
        {key: "KeyC", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL, foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT]}
      ],
      onDown: () => {game.campaignCodex.openQuestBoard();}
    });
    
}
function getDefaultVisibilities() {
  const TABS_BY_SHEET = {
    npc: ["info", "locations", "regions", "shops", "inventory", "associates", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
    location: ["info", "shops", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
    shop: ["info", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
    region: ["info", "shops", "regions", "parentregions", "locations", "inventory", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
    group: ["info", "regions", "locations", "shops", "npcs", "factions", "quests", "journals", "widgets", "notes", "mapMarker"],
    tag: ["info", "factions", "inventory", "quests", "journals", "widgets", "notes", "mapMarker"]
  };
  
  const defaults = {};
  for (const [sheetType, tabs] of Object.entries(TABS_BY_SHEET)) {
    defaults[sheetType] = {};
    for (const tabKey of tabs) {
      defaults[sheetType][tabKey] = true; 
    }
  }
  return defaults;
}

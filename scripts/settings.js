import { ColorThemeConfig } from "./color-theme-config.js";
import { SimpleCampaignCodexExporter } from "./campaign-codex-exporter.js";
import { templateManager } from "./journal-template-manager.js";
import { tabPicker } from "./tab-picker.js";
import { TemplatePicker } from "./template-picker.js";
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

    game.settings.register("campaign-codex", "itemPricePath", {
        name: localize("itemPricePath.name"),
        hint: localize("itemPricePath.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationPath", {
        name: localize("itemDenominationPath.name"),
        hint: localize("itemDenominationPath.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationOverride", {
        name: localize("itemDenominationOverride.name"),
        hint: localize("itemDenominationOverride.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "hideBaseCost", {
        name: localize("hideBaseCost.name"),
        hint: localize("hideBaseCost.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "sortCardsAlpha", {
        name: localize("sortCardsAlpha.name"),
        hint: localize("sortCardsAlpha.hint"),
        scope: "world",
        config: true,
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

    game.settings.register("campaign-codex", "useOrganizedFolders", {
        name: localize("useOrganizedFolders.name"),
        hint: localize("useOrganizedFolders.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "hideByPermission", {
        name: localize("hideByPermission.name"),
        hint: localize("hideByPermission.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "hideInventoryByPermission", {
        name: localize("hideInventoryByPermission.name"),
        hint: localize("hideInventoryByPermission.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "roundFinalPrice", {
        name: localize("roundFinalPrice.name"),
        hint: localize("roundFinalPrice.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "maxRegionDepth", {
        name: localize("maxRegionDepth.name"),
        hint: localize("maxRegionDepth.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: new foundry.data.fields.NumberField({nullable: false, min: 1, max: 10, step: 1}),
        default: 5,
        onChange: value => {console.log(value)}
    });
    game.settings.register("campaign-codex", "showStats", {
        name: localize("showStats.name"),
        hint: localize("showStats.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });
    game.settings.register("campaign-codex", "showOnlyPinned", {
        name: localize("showOnlyPinned.name"),
        hint: localize("showOnlyPinned.hint"),
    scope: "world", 
    config: true,   
    type: Boolean,
    default: false,
});


    game.settings.register("campaign-codex", "hideCCbutton", {
        name: localize("hideCCbutton.name"),
        hint: localize("hideCCbutton.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "useStyledTocButton", {
        name: localize("useStyledTocButton.name"),
        hint: localize("useStyledTocButton.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: (value) => applyTocButtonStyle(value),
    });

    game.settings.register("campaign-codex", "mapMarkers", {
        name: localize("mapMarkers.name"),
        hint: localize("mapMarkers.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "mapMarkerColor", {
        name: localize("mapMarkerColor.name"),
        hint: localize("mapMarkerColor.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

const accentDefault = "#d4af37";


const colors = {
    ui: "#d4af37",
    primary: "#8b1538",
    sidebarBg: "#2a2a2a",
    sidebarText: "#ffffff",
    mainBg: "#f8f9fa",
    mainText: "#2a2a2a",
    // accent: "#d4af37",
    success: "#28a745",
    danger: "#dc3545",
    border: "#444444",
    cardBg: "#ffffff",
    borderLight: "#e9ecef",
    slate:"#5a6268",
    textMuted: "#888",
    borderMedium:"#CCC",
    // accent80: "#d4af37CC",
    // accent30: "#d4af374D",
    // accent10: "#d4af371A",
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

    game.settings.register("campaign-codex", "collapsedFolderStates", {
        name: "Collapsed Folder States (TOC)", // Display name (can be localized)
        hint: "Remembers which folder groups are collapsed by the user in the Table of Contents.", // Help text
        scope: "client", 
        config: false, 
        default: [], 
        type: Array 
    });


    game.settings.register("campaign-codex", "resetItemPathsButton", {
        name: localize("resetItemPathsButton.name"),
        hint: localize("resetItemPathsButton.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
        onChange: async (value) => {
            if (value) {
                await game.settings.set("campaign-codex", "itemPricePath", "");
                await game.settings.set("campaign-codex", "itemDenominationPath", "");
                await game.settings.set("campaign-codex", "itemDenominationOverride", "",);
                await game.settings.set(
                    "campaign-codex",
                    "resetItemPathsButton",
                    false,
                );
                ui.notifications.info(game.i18n.localize("CAMPAIGN_CODEX.notifications.itemPricePathsReset"));
            }
        },
    });

    game.keybindings.register("campaign-codex", "tocOpen", {
      name: "Open the Camapign Codex Table of Contents",
      editable: [
        {key: "KeyT", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL]}
      ],
      onDown: () => {game.campaignCodex.openTOCSheet();}
    });


}
function getDefaultVisibilities() {
  const TABS_BY_SHEET = {
    npc: ["info", "locations", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
    location: ["info", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
    shop: ["info", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
    region: ["info", "shops", "regions", "parentregions", "inventory", "npcs", "quests", "journals", "widgets", "notes"],
    tag: ["info", "locations", "shops", "inventory", "npcs", "quests", "journals", "widgets", "notes"]
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

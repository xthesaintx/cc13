import { widgetManager } from "./widgets/WidgetManager.js";
import { CampaignCodexWidget} from "./widgets/CampaignCodexWidget.js";

import { templateManager } from "./journal-template-manager.js";
import { SimpleCampaignCodexExporter } from "./campaign-codex-exporter.js";
import "./prosemirror-integration.js";
import campaigncodexSettings, { MODULE_NAME } from "./settings.js";
import { CampaignManager } from "./campaign-manager.js";
import { LocationSheet } from "./sheets/location-sheet.js";
import { ShopSheet } from "./sheets/shop-sheet.js";
import { NPCSheet } from "./sheets/npc-sheet.js";
import { RegionSheet } from "./sheets/region-sheet.js";
import { CleanUp } from "./cleanup.js";
import { CampaignCodexJournalConverter } from "./campaign-codex-convertor.js";
import { NPCDropper } from "./npc-dropper.js";
import { CampaignCodexTokenPlacement } from "./token-placement.js";
import { GroupSheet } from "./sheets/group-sheet.js";
import { TemplateComponents } from "./sheets/template-components.js";
import { GroupLinkers } from "./sheets/group-linkers.js";
import {
    localize,
    format,
    createFromScene,
    handleCampaignCodexClick,
    ensureCampaignCodexFolders,
    getFolderColor,
    getCampaignCodexFolder,
    addJournalDirectoryUI,
    mergeDuplicateCodexFolders,
    applyThemeColors,
    applyTocButtonStyle,
    handleJournalConversion, 
    confirmationDialog,
    convertJournalToCCSheet,
    migrateLegacyWidgets
} from "./helper.js";
import { CampaignCodexMapMarker, _getCampaignCodexIcon } from "./codex-map-marker.js";
import { CampaignCodexTOCSheet } from "./campaign-codex-toc.js";
// let tocSheetInstance = null;

Hooks.once("init", async function () {
    console.log("Campaign Codex | Initializing");
    console.log("Campaign Codex | Pausing relationship updates for until ready.");
    const templatePaths = [
    "modules/campaign-codex/templates/partials/toc-quest-objective.hbs",
    "modules/campaign-codex/templates/quests/quest-list.hbs",
    "modules/campaign-codex/templates/partials/quest-card.hbs",
    "modules/campaign-codex/templates/partials/selected-sheet-view.hbs",
    "modules/campaign-codex/templates/partials/group-sheet-sidebar.hbs",
    "modules/campaign-codex/templates/partials/group-tab-info.hbs",
    "modules/campaign-codex/templates/partials/group-tab-inventory.hbs",
    "modules/campaign-codex/templates/partials/group-tab-regions.hbs",
    "modules/campaign-codex/templates/partials/group-tab-locations.hbs",
    "modules/campaign-codex/templates/partials/group-location-card.hbs",
    "modules/campaign-codex/templates/partials/selected-tab-inventory.hbs",
    "modules/campaign-codex/templates/partials/group-tree-tag-node.hbs",
    "modules/campaign-codex/templates/partials/group-tree-node.hbs",
    "modules/campaign-codex/templates/partials/selected-tab-npcs.hbs",
    "modules/campaign-codex/templates/partials/selected-tab-tags.hbs",
    "modules/campaign-codex/templates/partials/selected-tab-associates.hbs",
    "modules/campaign-codex/templates/partials/group-tab-journals.hbs",
    "modules/campaign-codex/templates/partials/group-tab-quests.hbs",
    "modules/campaign-codex/templates/partials/group-tab-npcs.hbs",
    "modules/campaign-codex/templates/partials/quest-objective.hbs",
    "modules/campaign-codex/templates/partials/quest-sub-objective.hbs",
    "modules/campaign-codex/templates/partials/base-info.hbs",
    "modules/campaign-codex/templates/partials/base-notes.hbs",
    "modules/campaign-codex/templates/partials/group-widgets.hbs",
    ];
    foundry.applications.handlebars.loadTemplates(templatePaths);
    // if (game.settings.get("campaign-codex", "mapMarkers")) {
    // }



    game.campaignCodexImporting = true;
    await campaigncodexSettings();
    Handlebars.registerHelper("ccLocalize", localize);
    Handlebars.registerHelper("getAsset", TemplateComponents.getAsset);
    Handlebars.registerHelper("ccFormat", format);
    Handlebars.registerHelper("getIcon", function (entityType) { return TemplateComponents.getAsset("icon", entityType); });
    Handlebars.registerHelper("if_system", function (systemId, options) {
        if (game.system.id === systemId) {
            return options.fn(this);
        }
        return options.inverse(this);
    });
    Handlebars.registerHelper('capitalize', function(string) {
      if (typeof string !== 'string' || !string) return '';
      return string.charAt(0).toUpperCase() + string.slice(1);
    });
});
Hooks.once("setup", async function () {
    if (game.settings.get("campaign-codex", "mapMarkers")){
    // === [MAP MARKERS] ===
    console.log("Campaign Codex | Initializing custom map markers");
    CONFIG.CampaignCodex = CONFIG.CampaignCodex || {};
    CONFIG.CampaignCodex.mapLocationMarker = {
      default: {
        icon: CampaignCodexMapMarker, 
        backgroundColor: 0xd4af37,
        borderColor: 0x2a2a2a,
        borderHoverColor: 0xFF5500,
        fontFamily: "Roboto Slab",
        shadowColor: 0x000000,
        textColor: 0x2a2a2a  
      }
    };
    
    const NoteClass = CONFIG.Note.objectClass;
    NoteClass.prototype._getCampaignCodexIcon = _getCampaignCodexIcon;
    const originalDrawControlIcon = NoteClass.prototype._drawControlIcon;
    NoteClass.prototype._drawControlIcon = function(...args) {
      const codexIcon = this._getCampaignCodexIcon();
      if (codexIcon) {
        codexIcon.x -= (this.document.iconSize / 2);
        codexIcon.y -= (this.document.iconSize / 2);
        return codexIcon;
      }
      return originalDrawControlIcon.apply(this, args);
    };
    // === [END MAP MARKERS] ===
}
});

Hooks.once("i18nInit", async function () {
    await campaigncodexSettings();
    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", LocationSheet, {
        canBeDefault: false, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.location')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", ShopSheet, {
        canBeDefault: false, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.shop')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", NPCSheet, {
        canBeDefault: false, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.npc')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", RegionSheet, {
        canBeDefault: false, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.region')}`,
    });
    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", GroupSheet, {
        canBeDefault: false, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.group')}`,
    });

    console.log("Campaign Codex | Sheets registered");
});


Hooks.once("ready", async function () {
    // TEMPLATE MENU BUILD
    templateManager.scanAllTemplates();

    console.log("Campaign Codex | Ready");
    game.campaignCodex = new CampaignManager();
    game.campaignCodex.initialize(); 
    game.campaignCodex.tocSheetInstance = null;

    // Exporter Testing
    game.SimpleCampaignCodexExporter = SimpleCampaignCodexExporter; 
    game.campaignCodex.convertJournalToCCSheet = convertJournalToCCSheet;
 
    //API
    game.modules.get('campaign-codex').api = {
      openTOCSheet: game.campaignCodex.openTOCSheet,
      convertJournalToCCSheet: convertJournalToCCSheet,
      exportToObsidian:()=> SimpleCampaignCodexExporter.exportToObsidian(),
      migrateLegacyWidgets:(document)=> migrateLegacyWidgets(document),
      CampaignCodexWidget: CampaignCodexWidget, 
      widgetManager: widgetManager
    };


    await game.campaignCodex.initializeTagCache();
    game.campaignCodexCleanup = new CleanUp();
    game.campaignCodexNPCDropper = NPCDropper;
    game.campaignCodexTokenPlacement = CampaignCodexTokenPlacement;
    window.CampaignCodexTokenPlacement = CampaignCodexTokenPlacement;
    // THEMES
    applyThemeColors();
    if (game.settings.get("campaign-codex", "useOrganizedFolders")) {
        await ensureCampaignCodexFolders();
    }

    if (game.user.isGM) {
        if (game.settings.get(MODULE_NAME, "runonlyonce") === false) {
            await ChatMessage.create(
                {
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker(),
                    content: localize("welcomePageHTML"),
                },
                {},
            );
            await game.settings.set(MODULE_NAME, "runonlyonce", true);
        }
    }
    console.log("Campaign Codex | Resuming relationship updates");
    delete game.campaignCodexImporting;
});

Hooks.on("preDeleteScene", async (scene, options, userId) => {
    try {
        const allCCDocuments = game.journal.filter((j) => j.getFlag("campaign-codex", "type"));
        const updatePromises = await game.campaignCodexCleanup.cleanupSceneRelationships(scene.uuid, allCCDocuments);
        if (updatePromises.length > 0) {
            await Promise.allSettled(updatePromises);
            console.log(`Campaign Codex | Scene cleanup completed for: ${scene.name}`);
        }
    } catch (error) {
        console.warn(`Campaign Codex | Scene cleanup failed for ${scene.name}:`, error);
    }
});


Hooks.on("preDeleteJournalEntry", async (journal, options, userId) => {
    if (journal.getFlag("campaign-codex", "type")) return;

    try {
        const allCCDocuments = game.journal.filter((j) => j.getFlag("campaign-codex", "type"));
        const updatePromises = await game.campaignCodexCleanup.cleanupStandardJournalRelationships(journal.uuid, allCCDocuments);

        if (updatePromises.length > 0) {
            await Promise.allSettled(updatePromises);
            console.log(`Campaign Codex | Standard journal link cleanup completed for: ${journal.name}`);
        }
    } catch (error) {
        console.warn(`Campaign Codex | Standard journal link cleanup failed for ${journal.name}:`, error);
    }
});

Hooks.on("getJournalEntryContextOptions", (application, menuItems) => {
    if (!game.user.isGM) return;

    menuItems.push(
        {
            name: localize("context.export"),
            icon: '<i class="fas fa-book"></i>',
            condition: (element) => {
                const journalId = element.dataset.entryId;
                const journal = game.journal.get(journalId);
                return journal && journal.getFlag("campaign-codex", "type");
            },
            callback: async (element) => {
                const journalId = element.dataset.entryId;
                const journal = game.journal.get(journalId);
                if (journal) {
                    await CampaignCodexJournalConverter.showExportDialog(journal);
                }
            },
        },

    );
});

Hooks.on("renderDialogV2", (dialog, html, data) => {
    if (dialog.title !== "Create Journal Entry") return;

    const form = html.querySelector("form");
    if (!form) return;

    form.insertAdjacentHTML("beforeend", '<input type="hidden" name="flags.core.sheetClass" value="">');
    const hiddenSheetInput = form.querySelector('input[name="flags.core.sheetClass"]');
   
    const sheetClassMap = {
        region: "campaign-codex.RegionSheet",
        location: "campaign-codex.LocationSheet",
        shop: "campaign-codex.ShopSheet",
        npc: "campaign-codex.NPCSheet", 
        group: "campaign-codex.GroupSheet",
    };
    const campaignCodexTypes = {
        region: `Campaign Codex: ${localize("names.region")}`,
        location: `Campaign Codex: ${localize("names.location")}`,
        shop: `Campaign Codex: ${localize("names.shop")}`,
        npc: `Campaign Codex: ${localize("names.npc")}`,
        group: `Campaign Codex: ${localize("names.group")}`,
    };

    const nameInput = form.querySelector('input[name="name"]');
    if (!nameInput) return;

    const selectHTML = `
        <div class="form-group">
            <label>Type</label>
            <div class="form-fields">
                <select name="flags.campaign-codex.type">
                    <option value="">${format("sheet.journal", { type: localize("names.standard") })}</option>
                    <optgroup label="Campaign Codex">
                        ${Object.entries(campaignCodexTypes)
                            .map(
                                ([key, label]) => `
                            <option value="${key}">${label}</option>
                        `,
                            )
                            .join("")}
                    </optgroup>
                </select>
            </div>
        </div>
    `;

    nameInput.closest(".form-group").insertAdjacentHTML("afterend", selectHTML);
    dialog.setPosition({ height: "auto" });

    const typeSelect = form.querySelector('select[name="flags.campaign-codex.type"]');
    if (typeSelect) {
        typeSelect.addEventListener("change", (event) => {
            const type = event.target.value;
            hiddenSheetInput.value = sheetClassMap[type] || "";
        });
    }
});

Hooks.on("renderJournalDirectory", (app, html, data) => {
    addJournalDirectoryUI(html);
});

Hooks.on("createJournalEntry", async (document, options, userId) => {
    if (game.user.id !== userId || document.pack || options.skipRelationshipUpdates || options.campaignCodexImport || game.campaignCodexImporting) return;

    const journalType = document.getFlag("campaign-codex", "type");
    if (!journalType) return;
    const tag = document.getFlag("campaign-codex", "data")?.tagMode;
    const folderType = (tag && journalType === "npc") ? 'tag' : journalType;
    const folder = getCampaignCodexFolder(folderType, document.folder);
    if (folder) {
        await document.update({ folder: folder.id });
    }
});

Hooks.on("createScene", async (scene, options, userId) => {
    if (options.campaignCodexImport) {
        return;
    }
});

Hooks.on("renderJournalEntry", async (journal, html, data) => {
    const journalType = journal.getFlag("campaign-codex", "type");
    if (!journalType) return;

    const currentSheetName = journal.sheet.constructor.name;
    let targetSheet = null;

    switch (journalType) {
        case "location":
            if (currentSheetName !== "LocationSheet") targetSheet = LocationSheet;
            break;
        case "shop":
            if (currentSheetName !== "ShopSheet") targetSheet = ShopSheet;
            break;
        case "npc":
            if (currentSheetName !== "NPCSheet") targetSheet = NPCSheet;
            break;
        case "region":
            if (currentSheetName !== "RegionSheet") targetSheet = RegionSheet;
            break;
        case "group":
            if (currentSheetName !== "GroupSheet") targetSheet = GroupSheet;
            break;
    }

    if (targetSheet) {
        await journal.sheet.close();

        const sheet = new targetSheet(journal);
        sheet.render(true);
    }
});

Hooks.on("preUpdateJournalEntry", async (journal, changed, options, userId) => {
    const sheetClass = changed.flags?.core?.sheetClass;
    if (sheetClass && sheetClass.startsWith('campaign-codex.')) {
        const type = sheetClass.split('.')[1]?.replace('Sheet', '').toLowerCase();
        if (type) {
            console.log(`Campaign Codex | Setting type for '${journal.name}' to '${type}'`);
            foundry.utils.setProperty(changed, "flags.campaign-codex.type", type);
            await handleJournalConversion(journal, changed);
        }
    }
});

Hooks.on("updateFolder", async (document, changes, options, userId) => {
  if (document && document.type === "JournalEntry"){
  const tocSheet = foundry.applications.instances.get("campaign-codex-toc-sheet");
    if (tocSheet) {
      tocSheet.render();
    }
}
});
 
Hooks.on("updateJournalEntry", async (document, changes, options, userId) => {
  if (
    document._skipRelationshipUpdates ||
    options.skipRelationshipUpdates ||
    game.campaignCodexImporting ||
    game.user.id !== userId
  ) {
    return; 
  }

  const type = document.getFlag("campaign-codex", "type");
  const isTag = type === "npc" && !!document.getFlag("campaign-codex", "data")?.tagMode;

  if (type) {
    try {
      await game.campaignCodex.handleRelationshipUpdates(
        document,
        changes,
        type
      );
      if (isTag) {
        game.campaignCodex.updateTagInCache(document);
      }
    } catch (error) {
      console.error(
        "Campaign Codex | Error handling relationship updates:",
        error
      );
    }
  }
    if (isTag && changes.hasOwnProperty("name")) {
         await game.campaignCodex.scheduleGlobalRefresh();
     } else {
         await game.campaignCodex.scheduleSheetRefresh(document.uuid);
     }
  // if (isTag && changes.hasOwnProperty("name")) {
  //   await game.campaignCodex.refreshAllOpenCodexSheets();
  //   console.log("all");
  // } else {
  //   await game.campaignCodex._scheduleSheetRefresh(document.uuid);
  //   console.log("schedule");
  // }
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (game.user.id !== userId) return;

  const linkedNPC = game.journal.find(
    (j) => j.getFlag("campaign-codex", "data")?.linkedActor === actor.uuid,
  );

  if (linkedNPC) {
    await game.campaignCodex.scheduleSheetRefresh(linkedNPC.uuid);
  }
});


Hooks.on("renderChatMessageHTML", (app, html, data) => {
    const handlers = html.querySelectorAll(`[data-campaign-codex-handler^="${MODULE_NAME}|"]`);
    handlers.forEach((element) => {
        element.addEventListener("click", handleCampaignCodexClick);
    });
});

/**
 * Sets a global flag to pause Campaign Codex operations when a standard
 * Foundry adventure import begins.
 */
Hooks.on("preImportAdventure", (adventure, formData, toCreate, toUpdate) => {
    console.log("Campaign Codex | Pausing relationship updates for adventure import.");
    game.campaignCodexImporting = true;
});

/**
 * Unsets the global flag to resume Campaign Codex operations after a standard
 * Foundry adventure import has finished.
 */
Hooks.on("importAdventure", async (adventure, formData, created, updated) => {
    try {
        console.log("Campaign Codex | Adventure import complete. Resuming relationship updates.");
        await mergeDuplicateCodexFolders();
    } finally {
        delete game.campaignCodexImporting;
    }
});


Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.settings.get("campaign-codex", "hideCCbutton") || game.user.isGM){
    controls["campaign-codex"] = {
        name: "campaign-codex",
        title: "Campaign Codex",
        icon: "fas fa-closed-captioning",
        visible: true,
        button:true,
        order: Object.keys(controls).length+1,
        onChange: (event, active) => {
        if ( active ) canvas.tokens.activate();
        },
      onToolChange: () => {},
        tools: {
            "toc-sheet": {
                name: "toc-sheet",
                title: format('button.title', { type: localize('names.group') }),
                icon: "fas fa-sitemap",
                button: true,
                order: 11,
                onChange: (event, toggle) => {
                    if (game.campaignCodex.tocSheetInstance && game.campaignCodex.tocSheetInstance.rendered) {
                        game.campaignCodex.tocSheetInstance.close();
                        return;
                    }
                    let savedDimensions = game.settings.get("campaign-codex", "tocSheetDimensions");
                    game.campaignCodex.tocSheetInstance = new CampaignCodexTOCSheet({ position: { width: savedDimensions.width, height: savedDimensions.height } });
                    game.campaignCodex.tocSheetInstance.render(true);
                }
            },

        },
        activeTool: "toc-sheet"
    };
}
});



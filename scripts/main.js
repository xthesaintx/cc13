import { displayCodexNote, hoverCodexNote } from "./widgets/viewMapNote.js";
import { widgetManager } from "./widgets/WidgetManager.js";
import { CampaignCodexWidget} from "./widgets/CampaignCodexWidget.js";
import { TRADE_IN_SOCKET_ACTION, processTradeInSocketRequest } from "./widgets/TradeInWidget.js";
import { appendTransaction, TRANSACTION_LOG_SOCKET_ACTION } from "./transaction-log.js";
import { TagSheet } from "./sheets/tag-sheet.js";
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
import { QuestSheet } from "./sheets/quest-sheet.js";
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
    // applyTocButtonStyle,
    handleJournalConversion, 
    confirmationDialog,
    convertJournalToCCSheet,
    migrateLegacyWidgets,
    ExtraFunctions,
} from "./helper.js";
import { CampaignCodexMapMarker, _getCampaignCodexIcon } from "./codex-map-marker.js";
import { CampaignCodexTOCSheet } from "./campaign-codex-toc.js";
import { registerMapNoteTextEnricher, registerMapNoteLinkClickHandler } from "./map-note-links.js";
// let tocSheetInstance = null;
const hoverNoteTimers = new Map();

Hooks.once("init", async function () {
    console.log("Campaign Codex | Initializing");
    registerMapNoteTextEnricher();
    
    widgetManager.initialize();

    console.log("Campaign Codex | Pausing relationship updates for until ready.");
    const templatePaths = [
    "modules/campaign-codex/templates/partials/toc-quest-objective.hbs",
    "modules/campaign-codex/templates/quests/quest-list.hbs",
    "modules/campaign-codex/templates/partials/quest-linked-card.hbs",
    "modules/campaign-codex/templates/partials/quest-sidebar-links.hbs",
    "modules/campaign-codex/templates/partials/quest-sidebar-admin.hbs",
    "modules/campaign-codex/templates/partials/quest-sheet-editor.hbs",
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
    "modules/campaign-codex/templates/partials/tag-nodes.hbs",
    ];
    foundry.applications.handlebars.loadTemplates(templatePaths);




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
    const uiColor = game.settings.get("campaign-codex", "color-accent");

    if (game.settings.get("campaign-codex", "mapMarkers")){
    console.log("Campaign Codex | Initializing custom map markers");
    CONFIG.CampaignCodex = CONFIG.CampaignCodex || {};
    CONFIG.CampaignCodex.mapLocationMarker = {
      default: {
        icon: CampaignCodexMapMarker, 
        backgroundColor: uiColor,
        borderColor: 0x2a2a2a,
        borderHoverColor: 0xFF5500,
        fontFamily: "Roboto Slab",
        shadowColor: 0x000000,
        textColor: 0x2a2a2a  
      }
    };
    const customScale = (game.settings.get("campaign-codex", "mapMarkerOverride") * 18) - 18;
    const NoteClass = CONFIG.Note.objectClass;
    NoteClass.prototype._getCampaignCodexIcon = _getCampaignCodexIcon;
    const originalDrawControlIcon = NoteClass.prototype._drawControlIcon;
    NoteClass.prototype._drawControlIcon = function(...args) {
      const codexIcon = this._getCampaignCodexIcon();
      if (codexIcon) {
        codexIcon.x -= ((this.document.iconSize+customScale) / 2);
        codexIcon.y -= ((this.document.iconSize+customScale) / 2);
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
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.location')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", ShopSheet, {
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.shop')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", NPCSheet, {
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.npc')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", RegionSheet, {
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.region')}`,
    });
    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", GroupSheet, {
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.group')}`,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", TagSheet, {
        canBeDefault: true, 
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.faction') || game.i18n.localize('CAMPAIGN_CODEX.names.tag') || "Faction"}`, 
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, "campaign-codex", QuestSheet, {
        canBeDefault: true,
        makeDefault: false,
        label: `Campaign Codex: ${game.i18n.localize('CAMPAIGN_CODEX.names.quest')}`,
    });
    console.log("Campaign Codex | Sheets registered");
});




Hooks.once("ready", async function () {

    // TEMPLATE MENU BUILD
    templateManager.scanAllTemplates();

    console.log("Campaign Codex | Ready");
    registerMapNoteLinkClickHandler();
    game.campaignCodex = new CampaignManager();
    game.campaignCodex.initialize(); 
    game.campaignCodex.tocSheetInstance = null;
    game.campaignCodex.questBoardInstance = null;

    // Exporter Testing
    game.SimpleCampaignCodexExporter = SimpleCampaignCodexExporter; 
    game.campaignCodex.convertJournalToCCSheet = convertJournalToCCSheet;
 
    //API
    game.modules.get('campaign-codex').api = {
      openTOCSheet: game.campaignCodex.openTOCSheet,
      openQuestBoard: game.campaignCodex.openQuestBoard,
      newJournal: (type) => game.campaignCodex.newJournal(type),
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
    if (game.settings.get("campaign-codex", "themeEnabled")) {
        applyThemeColors();
    }
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
        if (game.settings.get(MODULE_NAME, "runonlyonce185") === false) {
            game.packs.find(i => i.metadata.id === "campaign-codex.macros").render(true)
            await ChatMessage.create(
                {
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker(),
                    content: localize("updateHTML"),
                },
                {},
            );
            await game.settings.set(MODULE_NAME, "runonlyonce185", true);
        }
        if (game.settings.get(MODULE_NAME, "runonlyonce300") === false) {
            game.packs.find(i => i.metadata.id === "campaign-codex.macros").render(true)
            await ChatMessage.create(
                {
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker(),
                    content: localize("updateQUESTS"),
                },
                {},
            );
            await game.settings.set(MODULE_NAME, "runonlyonce300", true);
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
        tag: "campaign-codex.TagSheet",
        group: "campaign-codex.GroupSheet",
        quest: "campaign-codex.QuestSheet",
    };
    const campaignCodexTypes = {
        region: `Campaign Codex: ${localize("names.region")}`,
        location: `Campaign Codex: ${localize("names.location")}`,
        shop: `Campaign Codex: ${localize("names.shop")}`,
        npc: `Campaign Codex: ${localize("names.npc")}`,
        group: `Campaign Codex: ${localize("names.group")}`,
        tag: `Campaign Codex: ${localize("names.faction") || localize("names.tag")}`,
        quest: `Campaign Codex: ${localize("names.quest")}`,
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

function refreshQuestBoardIfOpen(document) {
    const board = foundry.applications.instances.get("campaign-codex-quest-board");
    if (!board) return;
    const type = document?.getFlag?.("campaign-codex", "type");
    if (type === "quest") {
        board.render(true);
    }
}

Hooks.on("createJournalEntry", async (document, options, userId) => {
    refreshQuestBoardIfOpen(document);
    if (game.user.id !== userId || document.pack || options.skipRelationshipUpdates || options.campaignCodexImport || game.campaignCodexImporting) return;

    const journalType = document.getFlag("campaign-codex", "type");
    if (!journalType) return;
    const tag = document.getFlag("campaign-codex", "data")?.tagMode || ["tag"].includes(journalType);
    if (tag) {
        await document.setFlag("campaign-codex", "data", { tagMode: true });
        game.campaignCodex.addTagToCache(document);
    }
    const folderType = (tag && ["npc"].includes(journalType)) ? 'tag' : journalType;
    const folder = getCampaignCodexFolder(folderType, document.folder);
    if (folder) {
        await document.update({ folder: folder.id });
    }
    refreshQuestBoardIfOpen(document);
});

Hooks.on("createScene", async (scene, options, userId) => {
    if (options.campaignCodexImport) {
        return;
    }
});


Hooks.on("preUpdateJournalEntry", async (journal, changed, options, userId) => {
    const sheetClass = changed.flags?.core?.sheetClass;
    if (sheetClass && sheetClass.startsWith('campaign-codex.')) {
        const newType = sheetClass.split('.')[1]?.replace('Sheet', '').toLowerCase();
        const oldType = journal.getFlag("campaign-codex", "type");

        if (newType) {
            console.log(`Campaign Codex | Setting type for '${journal.name}' to '${newType}'`);
            foundry.utils.setProperty(changed, "flags.campaign-codex.type", newType);

            if (newType === "tag") {
                foundry.utils.setProperty(changed, "flags.campaign-codex.data.tagMode", true);
            } else if (oldType === "tag" || journal.getFlag("campaign-codex", "data.tagMode")) {
                foundry.utils.setProperty(changed, "flags.campaign-codex.data.tagMode", false);
            }

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


Hooks.on("ready", () => {
  game.socket.on("module.campaign-codex", async (request) => {
    if ( request.action === "notification" && (request.data.push.includes(game.user.id) || request.data.push.includes("all")) ) {
      ExtraFunctions.notification(request.data.type, request.data.message);
      // console.log("here");
    }
    if (request.action === "updateInventory" && game.user.id === game.users.activeGM?.id) {
        const { docUuid, itemUuid, updates } = request.data;
        const doc = await fromUuid(docUuid);
        if (doc) {
            const currentData = doc.getFlag("campaign-codex", "data") || {};
            const inventory = foundry.utils.deepClone(currentData.inventory || []);
            const itemIndex = inventory.findIndex(i => i.itemUuid === itemUuid);
            if (itemIndex !== -1) {
                inventory[itemIndex] = { ...inventory[itemIndex], ...updates };
                await doc.setFlag("campaign-codex", "data.inventory", inventory);
                // console.log(`Campaign Codex | Updated inventory for ${doc.name} via socket.`);
            }
        }
    }
    if (request.action === "adjustInventoryCash" && game.user.id === game.users.activeGM?.id) {
        const { docUuid, amount } = request.data || {};
        const doc = await fromUuid(docUuid);
        const delta = Number(amount || 0);
        if (!doc || !Number.isFinite(delta) || delta === 0) return;
        const currentData = doc.getFlag("campaign-codex", "data") || {};
        const currentCash = Number(currentData.inventoryCash || 0);
        const nextCash = Math.max(0, currentCash + delta);
        await doc.setFlag("campaign-codex", "data.inventoryCash", nextCash);
    }

    if (request.action === TRADE_IN_SOCKET_ACTION && game.user.id === game.users.activeGM?.id) {
        const result = await processTradeInSocketRequest(request.data || {});
        const targetUserId = request.data?.userId;

        if (targetUserId) {
            game.socket.emit("module.campaign-codex", {
                action: "notification",
                data: {
                    type: result.ok ? "info" : "warning",
                    message: result.message,
                    push: [targetUserId],
                },
            });
        }
    }

    if (request.action === TRANSACTION_LOG_SOCKET_ACTION && game.user.id === game.users.activeGM?.id) {
        const docUuid = request.data?.docUuid;
        const transaction = request.data?.transaction;
        if (!docUuid || !transaction) return;

        const doc = await fromUuid(docUuid).catch(() => null);
        if (!doc) return;
        await appendTransaction(doc, transaction).catch((error) => {
            console.warn("Campaign Codex | Failed to append socket transaction:", error);
        });
    }

  });
})


 
Hooks.on("updateJournalEntry", async (document, changes, options, userId) => {
    refreshQuestBoardIfOpen(document);
    if (canvas.ready){
    const mapMarkerChanged = foundry.utils.hasProperty(changes, "flags.campaign-codex.data.mapMarker");
    if (mapMarkerChanged) {
        const linkedNotes = canvas.notes.placeables.filter(n => n.document.entryId === document.id);
        for (const note of linkedNotes) {
            note.draw(); 
        }
    }
}

  if (
    document._skipRelationshipUpdates ||
    options.skipRelationshipUpdates ||
    game.campaignCodexImporting ||
    game.user.id !== userId
  ) {
    return; 
  }

  const type = document.getFlag("campaign-codex", "type");
  const isTag = (["npc"].includes(type) && !!document.getFlag("campaign-codex", "data")?.tagMode) || ["tag"].includes(type);

  if (type){
    const cleanChanges = foundry.utils.expandObject(changes);
    const newOwnership = cleanChanges.ownership || cleanChanges["==ownership"];
    if (newOwnership) {
        let recipients = [];
        if (newOwnership.default >= 2) {
            recipients = "all";
        } 
        else {
        const targetIds = Object.entries(newOwnership)
            .filter(([id, level]) => id !== "default" && level >= 2)
            .map(([id, level]) => id);
        if (targetIds.length > 0) {
            recipients = game.users.players
                .filter(u => u.active && targetIds.includes(u.id))
                .map(u => u.id);
        }
    }
    if (recipients === "all" || (Array.isArray(recipients) && recipients.length > 0)) {
        ExtraFunctions.notification("info", `"${document.name}" has been shared`, recipients);
    }
    }
}



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

function _isCodexSceneNoteVisibleToUser(noteDocument) {
    if (game.user.isGM) return true;
    const ccFlags = noteDocument?.flags?.["campaign-codex"];
    if (!ccFlags?.noteid || !ccFlags?.widgetid) return true;

    const entryId = noteDocument.entryId;
    const journal = entryId ? game.journal.get(entryId) : null;
    if (!journal) return true;

    const widgetData = journal.getFlag("campaign-codex", `data.widgets.mapnote.${ccFlags.widgetid}`);
    const noteData = widgetData?.notes?.find?.((n) => n.id === ccFlags.noteid);
    if (!noteData) return true;

    return !!noteData.visible;
}

function _isCodexWidgetSceneNote(noteDocument) {
    const ccFlags = noteDocument?.flags?.["campaign-codex"];
    return !!(ccFlags?.noteid && ccFlags?.widgetid);
}

function _isCodexSceneNoteVisibleByVision(note) {
    if (game.user.isGM) return true;
    const visibility = canvas?.effects?.visibility;
    if (!visibility) return true;

    // If token vision is disabled for the scene, LOS/walls do not limit visibility.
    if (visibility.tokenVision === false) return true;

    const point = note?.center ?? { x: note?.document?.x ?? 0, y: note?.document?.y ?? 0 };
    const tolerance = Math.max(2, Number(note?.document?.iconSize ?? 40) / 4);

    try {
        return visibility.testVisibility(point, { tolerance, object: note });
    } catch (err) {
        console.warn("Campaign Codex | Failed map note vision visibility test", err);
        return true;
    }
}

function _applyCodexSceneNoteVisibility(note) {
    if (!note || game.user.isGM) return;
    if (!_isCodexWidgetSceneNote(note.document)) return;
    
    const shouldShow = _isCodexSceneNoteVisibleToUser(note.document);
    const visionVisible = _isCodexSceneNoteVisibleByVision(note);
    const finalVisible = shouldShow && visionVisible;

    // Apply widget visibility as an additional filter without overriding Foundry wall/vision rules.
    note.visible = finalVisible;
    if (note.controlIcon) note.controlIcon.visible = finalVisible;
    if (note.tooltip) note.tooltip.visible = false;
}

Hooks.on("drawNote", (note) => {
    _applyCodexSceneNoteVisibility(note);
});

Hooks.on("refreshNote", (note) => {
    _applyCodexSceneNoteVisibility(note);
});

Hooks.on("canvasReady", () => {
    if (game.user.isGM) return;
    for (const note of canvas?.notes?.placeables || []) {
        _applyCodexSceneNoteVisibility(note);
    }
});

Hooks.on("updateJournalEntry", (journal) => {
    if (game.user.isGM || !canvas?.ready) return;

    for (const note of canvas.notes?.placeables || []) {
        if (note?.document?.entryId !== journal.id) continue;
        _applyCodexSceneNoteVisibility(note);
    }
});

Hooks.on("hoverNote", async (note, hovered) => {
    if (!_isCodexSceneNoteVisibleToUser(note.document)) return;
    if (game.settings.get("campaign-codex", "mapMarkersHover")) {
        const ccFlags = note.document.flags?.["campaign-codex"];
        if (!ccFlags?.noteid || !ccFlags?.widgetid) return;
        const notePosition = note.worldTransform;
        const entryId = note.document.entryId;
        const noteKey = note.id ?? note.document?.id;
        if (!noteKey) return;

        const pendingTimer = hoverNoteTimers.get(noteKey);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            hoverNoteTimers.delete(noteKey);
        }

        if (!hovered) return;

        const hoverDelay = Math.clamp(
            Number(game.settings.get("campaign-codex", "mapMarkersHoverDelay")) || 0,
            0,
            1500
        );

        const timer = setTimeout(async () => {
            hoverNoteTimers.delete(noteKey);
            if (!note.hover) return;
            await hoverCodexNote(entryId, ccFlags.widgetid, ccFlags.noteid, notePosition);
        }, hoverDelay);

        hoverNoteTimers.set(noteKey, timer);
    }
});


Hooks.on("activateNote", (note, options) => {
    if (!_isCodexSceneNoteVisibleToUser(note.document)) return false;
    const ccFlags = note.document.flags?.["campaign-codex"];
    if (!ccFlags?.noteid || !ccFlags?.widgetid) return;
    const notePosition = note.worldTransform;
    const entryId = note.document.entryId; 

    displayCodexNote(entryId, ccFlags.widgetid, ccFlags.noteid, notePosition);
    return false;
});

Hooks.on("preCreateNote", (document, data, options, userId) => {
    const pending = game.user._tempNoteDrop;
    if (pending && pending.uuid.endsWith(document.entryId)) {
        const updateData = {
            text: pending.label, 
            label: pending.label,
            flags: pending.flags
        };
        document.updateSource(updateData);
        delete game.user._tempNoteDrop;
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

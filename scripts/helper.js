import { MODULE_NAME } from "./settings.js";
import { SimpleCampaignCodexExporter } from "./campaign-codex-exporter.js";
import { SimpleCampaignCodexImporter } from "./campaign-codex-importer.js";
import { GroupLinkers } from "./sheets/group-linkers.js";
import { CampaignCodexTOCSheet } from "./campaign-codex-toc.js";
import { sheetConversion } from "./sheet-conversion.js";

/**
 * localization.
 * @type {string}
 */
export const localize = (key) => game.i18n.localize(`CAMPAIGN_CODEX.${key}`);

/**
 * formatted localization.
 * @type {string}
 */
export const format = (key, data) => game.i18n.format(`CAMPAIGN_CODEX.${key}`, data);

export const renderTemplate = foundry.applications.handlebars.renderTemplate;

// export const gameSystemClass = (id) => (id === "dnd5e" ? " dnd5e2-journal" : "");
// export const journalSystemClass = (id) => (id === "dnd5e" ? "dnd5e2-journal journal-page-content" : "journal-page-content"); 
export const gameSystemClass = (id) => {
  switch (id) {
    case "dnd5e": return " dnd5e2-journal";
    case "pf2e":  return " journal-entry-page"; 
    default:      return " journal-entry-page";
  }
};

export const journalSystemClass = (id) => {
  const base = "journal-page-content";
  switch (id) {
    case "dnd5e": return `dnd5e2`;
    case "pf2e":  return ``;
    default:      return base;
  }
};


export const isThemed = () => {
    const themeEnabled = game.settings.get("campaign-codex", "themeEnabled");
    const themeOverride = game.settings.get("campaign-codex", "color-themeOverrideToLight");
    if (themeEnabled) {
        if (themeOverride === "light") return "theme-light";
        if (themeOverride === "dark") return "theme-dark";
    }

    const uiConfig = game.settings.get("core", "uiConfig") || {};
    const colorScheme = uiConfig.colorScheme;
    return colorScheme?.applications ? `theme-${colorScheme.applications}` : "";
}

/**
 * HTML string for the main campaign codex action buttons.
 * @returns {string}
 */
export const getButtonGrouphead = () => `
    <div class="campaign-codex campaign-codex-toc-buttons" >
        <button class="cc-open-toc-btn cc-create-toc-buttons" type="button" title="${format('message.open', {type: localize('names.toc')})}" >
            <i class="fas fa-closed-captioning"></i> ${format('message.open', {type: localize('names.toc')})}
        </button>
    </div>
    <div class="campaign-codex campaign-codex-buttons" >
        <button class="create-group-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.group')})}" >
            <i class="fas fa-folder-tree"></i>
        </button>
        <button class="create-region-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.region')})}" >
            <i class="fas fa-map"></i>
        </button>
        <button class="create-location-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.location')})}" >
            <i class="fas fa-map-marker-alt"></i>
        </button>
        <button class="create-shop-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.shop')})}" >
            <i class="fas fa-book-open"></i>
        </button>
        <button class="create-npc-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.npc')})}" >
            <i class="fas fa-user"></i>
        </button>
        <button class="create-tag-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.tag')})}" >
            <i class="fas fa-tag"></i>
        </button>    
    </div>
`;


/**
 * Handles the conversion of a standard journal to a Campaign Codex sheet.
 * @param {object} journal - The journal entry being updated.
 * @param {object} changed - The data being changed in the update.
 */
export async function handleJournalConversion(journal, changed) {
    const originalSheetClass = foundry.utils.getProperty(journal, "flags.core.sheetClass") || "";
    const newSheetClass = foundry.utils.getProperty(changed, "flags.core.sheetClass") || "";

    if (!newSheetClass || !newSheetClass.startsWith('campaign-codex.') || originalSheetClass.startsWith('campaign-codex.')) {
        const originalType = foundry.utils.getProperty(journal, "flags.campaign-codex.type");
        const changeType = foundry.utils.getProperty(changed, "flags.campaign-codex.type");
        if (originalType && changeType) {
            
            await sheetConversion.updateRelationshipsOnTypeChange(journal, originalType, changeType);
        }
        return;
    }

    if (journal.getFlag("campaign-codex", "converted")) {
        return;
    }
    const textPages = journal.pages.filter(p => p.type === 'text' && p.text.content);
    if (textPages.length === 0) {
        return;
    }
    const proceed = await confirmationDialog(
        `Do you want to import the existing text content from "${journal.name}" into the Campaign Codex description?`
    );
    if (proceed) {
        const combinedContent = textPages.map(p => `<h2>${p.name}</h2>\n${p.text.content}`).join('\n<hr>\n');
        if (!journal.flags["campaign-codex"]) {
            journal.flags["campaign-codex"] = {};
        }
        if (!journal.flags["campaign-codex"].data) {
            journal.flags["campaign-codex"].data = {};
        }
        journal.flags["campaign-codex"].data.description += combinedContent;
    }
    journal.render();
}



export async function confirmationDialog(message = "Are you sure?"){
    const proceed = await foundry.applications.api.DialogV2.confirm({
        content: message,
        rejectClose: false,
        modal: true
    });
    return proceed;
}

/**
 * Handles clicks on elements with data-campaign-codex-handler attributes.
 * Parses the attribute value to determine the action and arguments.
 * @param {Event} event - The click event.
 */
export function handleCampaignCodexClick(event) {
    const target = event.currentTarget;
    const handler = target.dataset.campaignCodexHandler;

    if (!handler) return;

    event.preventDefault();

    const parts = handler.split("|");
    const module = parts[0];
    const action = parts[1];
    const args = parts.slice(2);

    if (module !== MODULE_NAME) {
        console.warn(
            `Campaign Codex | Click handler received for unknown module: ${module}`,
        );
        return;
    }

    switch (action) {
        case "openMenu":
            if (args[0]) {
                game.settings.sheet.render(true, { tab: args[0] });
            }
            break;
        case "openWindow":
            if (args[0]) {
                window.open(args[0], "_blank");
            }
            break;
        default:
            console.warn(
                `Campaign Codex | Unknown action for handler: ${action}`,
            );
            break;
    }
}

/**
 * Generates the HTML for the export/import buttons.
 * @param {boolean} hasCampaignCodex - Whether there is any Campaign Codex content to export.
 * @returns {string} The HTML string containing the buttons.
 */
export function getExportImportButtonsHtml(hasCampaignCodex) {
    return `
        <div class="campaign-codex-export-buttons" style="margin: 8px;display: flex;gap: 4px;flex-direction: column;">
            ${
                hasCampaignCodex
                    ? `
                <button class="campaign-codex cc-export-btn" type="button" title="Export all Campaign Codex content to compendium" >
                    <i class="fas fa-download"></i> Export Campaign Codex
                </button>
            `
                    : ""
            }
            <button class="campaign-codex cc-import-btn" type="button" title="Import Campaign Codex content from compendium">
                <i class="fas fa-upload"></i> Import Campaign Codex
            </button>
        </div>
    `;
}


/**
 * Prompts the user for a name for a new Campaign Codex entry.
 * @param {string} type - The type of entry being created (e.g., "Location", "NPC Journal").
 * @returns {Promise<string|null>} A promise that resolves with the entered name or null if cancelled.
 */
export async function promptForName(type) {
    // console.log(type);
    try {
        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: `Create New ${type}` },
            content: `
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" name="name" placeholder="Enter ${type.toLowerCase()} name..." autofocus style="width: 100%;" />
                </div>
            `,
            ok: {
                icon: '<i class="fas fa-check"></i>',
                label: "Create",
                callback: (event, button) => {
                    const enteredName = button.form.elements.name.value.trim();
                    return enteredName || `New ${type}`; // Provide a default name if input is empty
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel"
            },
            rejectClose: false,
        });
        return name;
    } catch (e) {
     // console.log(e);

        return null;
    }
}


/**
 * Ensures that the Campaign Codex folders exist in the JournalEntry directory.
 * Creates them if they do not.
 */
export async function ensureCampaignCodexFolders() {
    const folderNames = {
        "Campaign Codex - Locations": "location",
        "Campaign Codex - Entries": "shop",
        "Campaign Codex - NPCs": "npc",
        "Campaign Codex - Regions": "region",
        "Campaign Codex - Groups": "group",
        "Campaign Codex - Tags": "tag",
    };

    for (const [folderName, type] of Object.entries(folderNames)) {
        let folder = game.folders.find(
            (f) => f.name === folderName && f.type === "JournalEntry",
        );

        if (!folder) {
            await Folder.create({
                name: folderName,
                type: "JournalEntry",
                color: getFolderColor(type),
                flags: {
                    "campaign-codex": {
                        type: type,
                        autoOrganize: true,
                    },
                },
            });
            console.log(`Campaign Codex | Created folder: ${folderName}`);
        }
    }
}

/**
 * Returns the color code for a given Campaign Codex folder type.
 * @param {string} type - The type of the Campaign Codex entry (e.g., "location", "shop").
 * @returns {string} The hex color code.
 */
export function getFolderColor(type) {
    return "#634c1b";
}

/**
 * Retrieves the Campaign Codex folder for a given type, if organized folders are enabled.
 * @param {string} type - The type of the Campaign Codex entry.
 * @returns {Folder|null} The Foundry Folder object or null if not found/disabled.
 */
export function getCampaignCodexFolder(type, currentFolder =[]) {
    if (!game.settings.get("campaign-codex", "useOrganizedFolders"))
        return null;

    const folderNames = {
        location: "Campaign Codex - Locations",
        shop: "Campaign Codex - Entries",
        npc: "Campaign Codex - NPCs",
        region: "Campaign Codex - Regions",
        group: "Campaign Codex - Groups",
        tag: "Campaign Codex - Tags",
    };

    const folderName = folderNames[type];
    if (!folderName) return null;
        if (currentFolder) {
            const isSelf = currentFolder.name === folderName;
            const isAncestor = currentFolder.ancestors.some(a => a.name === folderName);
            if (isSelf || isAncestor) {
            return null;
            }
    }

    return game.folders.find(
        (f) => f.name === folderName && f.type === "JournalEntry",
    );
}


/**
 * Adds Campaign Codex specific buttons to the Journal Directory UI.
 * @param {HTMLElement} html - The raw HTML element representing the Journal Directory.
 */
export function addJournalDirectoryUI(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;

    if (!game.user.isGM) return;

    const existingExportButtons = nativeHtml.querySelector(
        ".campaign-codex-export-buttons",
    );
    if (existingExportButtons) {
        existingExportButtons.remove();
    }

    const hasCampaignCodex = game.journal.some((j) =>
        j.getFlag("campaign-codex", "type"),
    );
    const buttonContainerHTML = getExportImportButtonsHtml(hasCampaignCodex);

    const footer = nativeHtml.querySelector(".directory-footer");
    if (footer) {
        footer.insertAdjacentHTML("beforeend", buttonContainerHTML);
    } else {
        const directoryList = nativeHtml.querySelector(".directory-list");
        if (directoryList) {
            directoryList.insertAdjacentHTML("afterend", buttonContainerHTML);
        }
    }

    const exportBtn = nativeHtml.querySelector(".cc-export-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            SimpleCampaignCodexExporter.exportCampaignCodexToCompendium();
        });
    }
    const importBtn = nativeHtml.querySelector(".cc-import-btn");
    if (importBtn) {
        importBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            SimpleCampaignCodexImporter.importCampaignCodexFromCompendium();
        });
    }

    const directoryHeader = nativeHtml.querySelector(".directory-header");
    if (directoryHeader) {
        directoryHeader.insertAdjacentHTML("beforeend", getButtonGrouphead());
    }

    nativeHtml
        .querySelector(".cc-open-toc-btn")
        ?.addEventListener("click", async () => {
            if (game.campaignCodex.tocSheetInstance && game.campaignCodex.tocSheetInstance.rendered) {
                game.campaignCodex.tocSheetInstance.close();
            return;
            }
            let savedDimensions = game.settings.get("campaign-codex", "tocSheetDimensions");
            game.campaignCodex.tocSheetInstance = new CampaignCodexTOCSheet({ position: { width: savedDimensions.width, height: savedDimensions.height } });
            game.campaignCodex.tocSheetInstance.render(true);
        });

    nativeHtml
        .querySelector(".create-location-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("Location");
            if (name) {
                const doc =
                    await game.campaignCodex.createLocationJournal(name);
                doc?.sheet.render(true);
            }
        });

    nativeHtml
        .querySelector(".create-shop-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("Entry");
            if (name) {
                const doc = await game.campaignCodex.createShopJournal(name);
                doc?.sheet.render(true);
            }
        });

    nativeHtml
        .querySelector(".create-tag-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("Tag Journal");
            if (name) {
                const doc = await game.campaignCodex.createTagJournal(
                    null,
                    name,
                    true
                );
                doc?.sheet.render(true);
            }
        });


    nativeHtml
        .querySelector(".create-npc-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("NPC Journal");
            if (name) {
                const doc = await game.campaignCodex.createNPCJournal(
                    null,
                    name,
                );
                doc?.sheet.render(true);
            }
        });

    nativeHtml
        .querySelector(".create-region-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("Region");
            if (name) {
                const doc = await game.campaignCodex.createRegionJournal(name);
                doc?.sheet.render(true);
            }
        });

    nativeHtml
        .querySelector(".create-group-btn")
        ?.addEventListener("click", async () => {
            const name = await promptForName("Group Overview");
            if (name) {
                const doc = await game.campaignCodex.createGroupJournal(name);
                doc?.sheet.render(true);
            }
        });
}



export async function mergeDuplicateCodexFolders() {
    console.log("Campaign Codex | Checking for duplicate folders after import...");

    const codexFolderNames = [
        "Campaign Codex - Locations",
        "Campaign Codex - Entries",
        "Campaign Codex - NPCs",
        "Campaign Codex - Regions",
        "Campaign Codex - Groups",
        "Campaign Codex - Tags"
    ];

    const foldersToDelete = [];

    for (const folderName of codexFolderNames) {
        const matchingFolders = game.folders.filter(f => f.name === folderName && f.type === "JournalEntry");

        if (matchingFolders.length <= 1) continue;

        ui.notifications.info(`Merging duplicate "${folderName}" folders...`);
        let primaryFolder = matchingFolders.find(f => f.getFlag("campaign-codex", "autoOrganize")) || matchingFolders[0];
        const duplicateFolders = matchingFolders.filter(f => f.id !== primaryFolder.id);

        for (const folder of duplicateFolders) {
            if (folder.contents.length > 0) {
                const updates = folder.contents.map(j => ({ _id: j.id, folder: primaryFolder.id }));
                await JournalEntry.updateDocuments(updates);
            }
            foldersToDelete.push(folder.id);
        }
    }

    if (foldersToDelete.length > 0) {
        await Folder.deleteDocuments(foldersToDelete);
        ui.notifications.info("Campaign Codex folder cleanup complete.");
    }
}

/**
 * A configuration object mapping document types to their creation logic.
 */
const creationConfig = {
  group: {
    prompt: "Group Overview",
    create: (name) => game.campaignCodex.createGroupJournal(name),
  },
  location: {
    prompt: "Location",
    create: (name) => game.campaignCodex.createLocationJournal(name),
  },
  region: {
    prompt: "Region",
    create: (name) => game.campaignCodex.createRegionJournal(name),
  },
  shop: {
    prompt: "Entry",
    create: (name) => game.campaignCodex.createShopJournal(name),
  },
  npc: {
    prompt: "NPC Journal",
    create: (name) => game.campaignCodex.createNPCJournal(null, name, false),
  },
  tag: {
    prompt: "Tag Journal",
    create: (name) => game.campaignCodex.createTagJournal(null, name),
  },
};

/**
 * Prompts the user for a name and creates a new Campaign Codex document of a given type.
 * @param {string} type - The type of document to create (e.g., 'group', 'location', 'npc').
 */
export async function createFromScene(type) {
  const config = creationConfig[type];
  if (!config) {
    const errorMessage = `Cannot create document of unknown type: "${type}"`;
    console.error(`Campaign Codex | ${errorMessage}`);
    ui.notifications.error(errorMessage);
    return;
  }
  const name = await promptForName(config.prompt);
  if (name) {
    const doc = await config.create(name);
    doc?.sheet.render(true);
  }
}
export function removeThemeColors() {
    const styleId = 'cc-theme-override-style';
    const styleElement = document.getElementById(styleId);
    
    if (styleElement) {
        styleElement.remove();
    }
}

export function applyThemeColors() {
    if (!game.settings.get("campaign-codex", "themeEnabled")) {
        if (game.user.isGM) removeThemeColors(); 
        return;
    }
    const backgroundImageTile = game.settings.get("campaign-codex", "color-backgroundImageTile") ? "auto" : "cover";
    const imageOpacity = game.settings.get("campaign-codex", "color-backgroundOpacity") || 100;
    const bgImage = game.settings.get("campaign-codex", "color-backgroundImage") ? `linear-gradient(color-mix(in srgb, var(--cc-main-bg), transparent ${imageOpacity}%), color-mix(in srgb, var(--cc-main-bg), transparent ${imageOpacity}%)), url("../../../${game.settings.get("campaign-codex", "color-backgroundImage")}")`: "";
    const anchorImage = game.settings.get("campaign-codex", "color-anchorImage") ? "100% 100%" : "0% 50%";

    const colorSettings = {
        '--cc-primary': game.settings.get("campaign-codex", "color-primary"),
        '--cc-slate': game.settings.get("campaign-codex", "color-slate"),
        '--cc-text-muted': game.settings.get("campaign-codex", "color-textMuted"),
        '--cc-sidebar-bg': game.settings.get("campaign-codex", "color-sidebarBg"),
        '--cc-sidebar-text': game.settings.get("campaign-codex", "color-sidebarText"),
        '--cc-success': game.settings.get("campaign-codex", "color-success"),
        '--cc-danger': game.settings.get("campaign-codex", "color-danger"),
        '--cc-accent': game.settings.get("campaign-codex", "color-accent"),
        '--cc-accent80': game.settings.get("campaign-codex", "color-accent80"),
        '--cc-accent30': game.settings.get("campaign-codex", "color-accent30"),
        '--cc-accent10': game.settings.get("campaign-codex", "color-accent10"),
        '--cc-main-bg': game.settings.get("campaign-codex", "color-mainBg"),
        '--cc-main-text': game.settings.get("campaign-codex", "color-mainText"),
        '--cc-border': game.settings.get("campaign-codex", "color-border"),
        '--cc-card-bg': game.settings.get("campaign-codex", "color-cardBg"),
        '--cc-font-heading': game.settings.get("campaign-codex", "color-fontHeading"),
        '--cc-font-body': game.settings.get("campaign-codex", "color-fontBody"),
        '--cc-background-image': bgImage,
        '--cc-background-fit': backgroundImageTile,
        '--cc-image-position':anchorImage,
    };

    const cssOverrides = Object.entries(colorSettings)
        .map(([variable, value]) => `${variable}: ${value} !important;`)
        .join("\n");
    
    const styleId = 'cc-theme-override-style';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    styleElement.innerHTML = `.campaign-codex { ${cssOverrides} }`;
    applyTocButtonStyle();
}

export function applyTocButtonStyle() {
    let useStyled = game.settings.get("campaign-codex", "useStyledTocButton");

    const styleId = 'cc-toc-button-style-override';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    const uiColor = game.settings.get("campaign-codex", "color-accent");
    if (useStyled) {
        styleElement.innerHTML = `
            button.control.ui-control.layer.icon.fas.fa-closed-captioning[data-control="campaign-codex"] {
                background: ${uiColor};
                color: black;
            }
        `;
    } else {
        styleElement.innerHTML = `
            button.control.ui-control.layer.icon.fas.fa-closed-captioning[data-control="campaign-codex"] {
                background: revert-layer;
                color: revert-layer;
            }
        `;
    }
}


/**
 * Refreshes any open application windows that are associated with a
 * document UUID from the provided list.
 *
 * @param {string[]} uuidsToRefresh - An array of document UUIDs to refresh.
 */
export function targetedRefresh(uuidsToRefresh = [], activeUuid = "") {
  //   const activeWindow = ui.activeWindow;
  //     if (!uuidsToRefresh || uuidsToRefresh.length === 0) {
  //       return;
  //     }
  //     const uuidSet = new Set(uuidsToRefresh);
  //     for (const app of foundry.applications.instances.values()) {
  //       if (app.document && uuidSet.has(app.document.uuid)) {
  //         app.render();
  //       }
  //     }
  // if (activeWindow.document && uuidSet.has(activeWindow.document.uuid)) {
  //   activeWindow.render();
  // }
  // console.log("targeted");
}


/**
 * Migrates legacy widget data from 'flags.campaign-codex.data.widgets'
 * to the new 'flags.campaign-codex.sheet-widgets' array.
 *
 * This is non-destructive and will not overwrite or remove any
 * existing widgets in the 'sheet-widgets' array.
 *
 * @param {Document} document The document to migrate.
 */
export async function migrateLegacyWidgets(document) {
  if (!document) return;
  const legacyData = document.getFlag("campaign-codex", "data") || {};

  const legacyWidgets = legacyData.widgets;
  if (!legacyWidgets || typeof legacyWidgets !== "object") {
    return;
  }

  const currentSheetWidgets = document.getFlag("campaign-codex", "sheet-widgets") || [];
  const existingWidgetIds = new Set(currentSheetWidgets.map(w => w.id));
  let widgetsWereAdded = false;
  for (const [widgetName, widgetsById] of Object.entries(legacyWidgets)) {
    for (const id of Object.keys(widgetsById)) {
      if (!existingWidgetIds.has(id)) {
        const newWidget = {
          id: id,
          widgetName: widgetName,
          counter: 0,
          active: false 
        };
        currentSheetWidgets.push(newWidget);
        widgetsWereAdded = true;
      }
    }
  }
  if (widgetsWereAdded) {
    await document.setFlag("campaign-codex", "sheet-widgets", currentSheetWidgets);
    console.log(`Campaign Codex | Migrated ${currentSheetWidgets.length - existingWidgetIds.size} widgets for document: ${document.name}`);
  }
}

/**
* Converts a standard Journal Entry to a Campaign Codex sheet.
* Can be called via the API: game.campaignCodex.convertJournalToCCSheet(uuid, type, pagesToSeparateSheets)
 * @param {string} uuid - The UUID of the Journal Entry to convert.
 * @param {string} type - The target Campaign Codex type (e.g., "location", "npc", "region").
 * @param {boolean} [pagesToSeparateSheets=false] - If true, creates a new sheet for each page instead of combining them.
 * @returns {Promise<JournalEntry|Array<JournalEntry>|null>} The created journal entry (or array of entries), or null if conversion failed.
 */
export async function convertJournalToCCSheet(uuid, type, pagesToSeparateSheets = false) {
    const journal = await fromUuid(uuid);

    if (!journal) {
        ui.notifications.error(`Campaign Codex | Could not find Journal Entry with UUID: ${uuid}`);
        console.error(`Campaign Codex | Could not find Journal Entry with UUID: ${uuid}`);
        return null;
    }

    const validTypes = ["location", "npc", "region", "shop", "group"];
    if (!validTypes.includes(type)) {
        ui.notifications.error(`Campaign Codex | Invalid conversion type "${type}".`);
        console.error(`Campaign Codex | Invalid conversion type "${type}".`);
        return null;
    }

    const textPages = journal.pages.filter(p => p.type === 'text' && p.text.content && p.text.content.trim() !== "");

    const createJournal = async (name) => {
        switch (type) {
            case "location":
                return await game.campaignCodex.createLocationJournal(name);
            case "tag":
                return await game.campaignCodex.createTagJournal(null, name);
            case "npc":
                return await game.campaignCodex.createNPCJournal(null, name);
            case "region":
                return await game.campaignCodex.createRegionJournal(name);
            case "shop":
                return await game.campaignCodex.createShopJournal(name);
            case "group":
                return await game.campaignCodex.createGroupJournal(name);
            default:
                return null;
        }
    };

    if (pagesToSeparateSheets) {
        if (textPages.length === 0) {
            ui.notifications.warn(`Journal "${journal.name}" has no text pages with content to convert.`);
            return [];
        }

        const createdJournals = [];
        for (const page of textPages) {
            const newJournal = await createJournal(page.name);
            if (newJournal) {
                await newJournal.setFlag("campaign-codex", "data", { description: page.text.content });
                createdJournals.push(newJournal);
            }
        }
        ui.notifications.info(`Created ${createdJournals.length} new ${type} sheet(s) from the pages of "${journal.name}".`);
        return createdJournals;
    }

    else {
        const combinedContent = textPages.map(p => `<h2>${p.name}</h2>\n${p.text.content}`).join('\n<hr>\n');
        const newJournal = await createJournal(journal.name);

        if (newJournal) {
            await newJournal.setFlag("campaign-codex", "data", { description: combinedContent });
            ui.notifications.info(`Successfully created a new ${type} sheet from "${journal.name}".`);
            newJournal.sheet.render(true);
            return newJournal;
        }
        return null;
    }
}

/**
 * Retrieves the default tab visibility settings for a specific sheet type.
 * Handles both boolean (legacy) and object {visible, hidden} (new) formats.
 * @param {string} sheetType - The sheet type (e.g., "npc", "location").
 * @returns {object} An object with tab keys and their boolean visibility (e.g., {info: true, locations: false}).
 */
export function getDefaultSheetTabs(sheetType) {
  const allSettings = game.settings.get("campaign-codex", "defaultTabVisibility") || {};
  const sheetSettings = {};
  
  if (allSettings[sheetType]) {
    for (const [key, value] of Object.entries(allSettings[sheetType])) {
        sheetSettings[key] = (typeof value === 'object') ? (value.visible ?? true) : value;
    }
  } else {
    // Fallback to iterating keys if stored flat like "sheetType.tabKey" (Legacy support)
    const prefix = `${sheetType}.`;
    for (const key in allSettings) {
        if (key.startsWith(prefix)) {
            const tabKey = key.substring(prefix.length);
            const value = allSettings[key];
            sheetSettings[tabKey] = (typeof value === 'object') ? (value.visible ?? true) : value;
        }
    }
  }
  return sheetSettings;
}

/**
 * Retrieves the default hidden (from players) settings for a specific sheet type.
 * @param {string} sheetType - The sheet type (e.g., "npc", "location").
 * @returns {object} An object with tab keys and their boolean hidden status.
 */
export function getDefaultSheetHidden(sheetType) {
  const allSettings = game.settings.get("campaign-codex", "defaultTabVisibility") || {};
  const sheetSettings = {};
  
  if (allSettings[sheetType]) {
    for (const [key, value] of Object.entries(allSettings[sheetType])) {
        sheetSettings[key] = (typeof value === 'object') ? (value.hidden ?? false) : false;
    }
  }
  return sheetSettings;
}
// /**
//  * Retrieves the default tab visibility settings for a specific sheet type.
//  * @param {string} sheetType - The sheet type (e.g., "npc", "location").
//  * @returns {object} An object with tab keys and their boolean visibility (e.g., {info: true, locations: false}).
//  */
// export function getDefaultSheetTabs(sheetType) {
//   const allSettings = game.settings.get("campaign-codex", "defaultTabVisibility");
//   const sheetSettings = {};
//   const prefix = `${sheetType}.`;
//   for (const key in allSettings) {
//     if (key.startsWith(prefix)) {
//       const tabKey = key.substring(prefix.length);
//       sheetSettings[tabKey] = allSettings[key];
//     }
//   }
//   return sheetSettings;
// }


export class ExtraFunctions {
  /**
  * @param{string} type            "warning", "info", "error" are supported strings.
  * @param{string} message         content of the noticiation.
  * @param{[array|string]} push    array of ids to push the notification to, if excluded notification is only shown to caller. ["all"] sends to all clients
  */
  static notification(type, message, push=[]){
    if ( push.length ) {
      game.socket.emit(`module.campaign-codex`, { action: "notification", data: {type, message, push} });
    }
    ui.notifications.notify(message,type);
  }
}





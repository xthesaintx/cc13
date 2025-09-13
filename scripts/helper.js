import { MODULE_NAME } from "./settings.js";
import { SimpleCampaignCodexExporter } from "./campaign-codex-exporter.js";
import { SimpleCampaignCodexImporter } from "./campaign-codex-importer.js";
import { GroupLinkers } from "./sheets/group-linkers.js";

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

/**
 * HTML string for the main campaign codex action buttons.
 * @returns {string}
 */
export const getButtonGrouphead = () => `
    <div class="campaign-codex-buttons" style="margin: 8px 0; display: flex; gap: 4px; flex-wrap: wrap;">
        <button class="create-region-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.region')})}" style="background: #20c997;">
            <i class="fas fa-globe"></i>
        </button>
        <button class="create-location-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.location')})}" style="background: #28a745;">
            <i class="fas fa-map-marker-alt"></i>
        </button>
        <button class="create-shop-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.entry')})}" style="background: #6f42c1;">
            <i class="fas fa-book-open"></i>
        </button>
        <button class="create-npc-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.npc')})}" style="background: #fd7e14;">
            <i class="fas fa-user"></i>
        </button>
        <button class="create-group-btn cc-create-buttons" type="button" title="${format('button.title', {type: localize('names.group')})}" style="background: #17a2b8;">
            <i class="fas fa-layer-group"></i>
        </button>
    </div>
`;

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
                <button class="cc-export-btn" type="button" title="Export all Campaign Codex content to compendium" style="flex: 1; padding: 4px 8px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; height: auto">
                    <i class="fas fa-download"></i> Export Campaign Codex
                </button>
            `
                    : ""
            }
            <button class="cc-import-btn" type="button" title="Import Campaign Codex content from compendium" style="flex: 1; padding: 4px 8px; font-size: 11px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; height: auto">
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
    return new Promise((resolve) => {
        new Dialog({
            title: `Create New ${type}`,
            content: `
                <form class="flexcol">
                    <div class="form-group">
                        <label>Name:</label>
                        <input type="text" name="name" placeholder="Enter ${type.toLowerCase()} name..." autofocus style="width: 100%;" />
                    </div>
                </form>
            `,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create",
                    callback: (html) => {
                        const nativeHtml =
                            html instanceof jQuery ? html[0] : html;
                        const name = nativeHtml
                            .querySelector('[name="name"]')
                            .value.trim();
                        resolve(name || `New ${type}`);
                    },
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => resolve(null),
                },
            },
            default: "create",
            render: (html) => {
                const nativeHtml = html instanceof jQuery ? html[0] : html;
                const input = nativeHtml.querySelector('input[name="name"]');
                input.focus();
                input.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        nativeHtml
                            .closest(".dialog")
                            .querySelector(".dialog-button.create")
                            .click();
                    }
                });
            },
        }).render(true);
    });
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
    const colors = {
        location: "#28a745",
        shop: "#6f42c1",
        npc: "#fd7e14",
        region: "#20c997",
        group: "#17a2b8",
    };
    return colors[type] || "#999999";
}

/**
 * Retrieves the Campaign Codex folder for a given type, if organized folders are enabled.
 * @param {string} type - The type of the Campaign Codex entry.
 * @returns {Folder|null} The Foundry Folder object or null if not found/disabled.
 */
export function getCampaignCodexFolder(type) {
    if (!game.settings.get("campaign-codex", "useOrganizedFolders"))
        return null;

    const folderNames = {
        location: "Campaign Codex - Locations",
        shop: "Campaign Codex - Entries",
        npc: "Campaign Codex - NPCs",
        region: "Campaign Codex - Regions",
        group: "Campaign Codex - Groups",
    };

    const folderName = folderNames[type];
    return game.folders.find(
        (f) => f.name === folderName && f.type === "JournalEntry",
    );
}

/**
 * Displays a dialog to add a given journal entry to an existing group overview.
 * @param {JournalEntry} journal - The journal entry to add to a group.
 * @returns {Promise<void>} A promise that resolves when the dialog is closed.
 */
export async function showAddToGroupDialog(journal) {
    const groupJournals = game.journal.filter(
        (j) => j.getFlag("campaign-codex", "type") === "group",
    );

    if (groupJournals.length === 0) {
        ui.notifications.warn("No group overviews found. Create one first.");
        return;
    }

    const options = groupJournals
        .map((group) => `<option value="${group.uuid}">${group.name}</option>`)
        .join("");

    return new Promise((resolve) => {
        new Dialog({
            title: "Add to Group",
            content: `
                <form class="flexcol">
                    <div class="form-group">
                        <label>Select Group:</label>
                        <select name="groupUuid" style="width: 100%;">
                            ${options}
                        </select>
                    </div>
                    <p style="font-size: 12px; color: #666; margin: 8px 0;">
                        This will add "${journal.name}" to the selected group overview.
                    </p>
                </form>
            `,
            buttons: {
                add: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: "Add to Group",
                    callback: async (html) => {
                        const nativeHtml =
                            html instanceof jQuery ? html[0] : html;
                        const groupUuid =
                            nativeHtml.querySelector(
                                '[name="groupUuid"]',
                            ).value;
                        const groupJournal = await fromUuid(groupUuid);

                        if (groupJournal) {
                            const groupData =
                                groupJournal.getFlag(
                                    "campaign-codex",
                                    "data",
                                ) || {};
                            const members = groupData.members || [];

                            if (!members.includes(journal.uuid)) {
                                members.push(journal.uuid);
                                groupData.members = members;
                                await groupJournal.setFlag(
                                    "campaign-codex",
                                    "data",
                                    groupData,
                                );
                                ui.notifications.info(
                                    `Added "${journal.name}" to group "${groupJournal.name}"`,
                                );

                                for (const app of Object.values(ui.windows)) {
                                    if (
                                        app.document &&
                                        app.document.uuid === groupJournal.uuid
                                    ) {
                                        app.render(false);
                                        break;
                                    }
                                }
                            } else {
                                ui.notifications.warn(
                                    `"${journal.name}" is already in this group.`,
                                );
                            }
                        }
                        resolve();
                    },
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => resolve(),
                },
            },
            default: "add",
        }).render(true);
    });
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
        "Campaign Codex - Groups"
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
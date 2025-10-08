export class SimpleCampaignCodexExporter {
    static CONSTANTS = {
        FLAG_SCOPE: "campaign-codex",
        FLAG_TYPE: "type",
        FLAG_DATA: "data",
    };

    /**
     * Recursively builds a flat list of folder options for a select dropdown.
     * @param {string} [type="JournalEntry"] - The folder type to get options for.
     * @returns {string} HTML <option> elements.
     */
    static _getFolderOptions(type = "JournalEntry") {
        let options = '<option value="all">All Folders</option>';
        const buildOptions = (folders, prefix = "") => {
            for (const folder of folders) {
                const label = `${prefix}${folder.name}`;
                options += `<option value="${folder.id}">${label}</option>`;
                // if (folder.children.length) {
                //     buildOptions(folder.children, `${label} / `);
                // }
            }
        };
        buildOptions(game.folders.filter(f => f.type === type && !f.folder));
        return options;
    }

    /**
     * Finds all active modules that have unlocked compendiums for required document types
     * @returns {Array<{id: string, title: string, packs: Object, hasScenes: boolean}>}
     */
    static findCompatibleModules() {
        const requiredTypes = ["JournalEntry", "Actor", "Item"];
        const compatibleModules = [];

        for (const module of game.modules) {
            if (!module.active) continue;

            const modulePacks = {};
            let hasRequiredTypes = true;

            for (const type of requiredTypes) {
                const unlockedPack = game.packs.find((p) => p.metadata.packageName === module.id && p.documentName === type && !p.locked);

                if (unlockedPack) {
                    modulePacks[type] = unlockedPack;
                } else {
                    hasRequiredTypes = false;
                    break;
                }
            }

            if (hasRequiredTypes) {
                const scenePack = game.packs.find((p) => p.metadata.packageName === module.id && p.documentName === "Scene" && !p.locked);

                if (scenePack) {
                    modulePacks["Scene"] = scenePack;
                }

                compatibleModules.push({
                    id: module.id,
                    title: module.title,
                    packs: modulePacks,
                    hasScenes: !!scenePack,
                });
            }
        }

        return compatibleModules;
    }
    static async exportCampaignCodexToCompendium() {
        try {
            const config = await this._getExportConfig();
            if (!config) return;

            if (config.performCleanup) {
                ui.notifications.info("Performing cleanup before export...");
                try {
                    if (typeof CleanUp !== "undefined" && CleanUp.performManualCleanup) {
                        await CleanUp.performManualCleanup();
                    } else if (game.campaignCodexCleanup?.constructor?.performManualCleanup) {
                        await game.campaignCodexCleanup.constructor.performManualCleanup();
                    } else {
                        console.warn("Campaign Codex | Cleanup not available, skipping...");
                        ui.notifications.warn("Cleanup functionality not available, continuing with export...");
                    }
                    ui.notifications.info("Cleanup completed successfully.");
                } catch (error) {
                    console.error("Campaign Codex | Cleanup failed:", error);
                    ui.notifications.warn("Cleanup encountered errors, but export will continue...");
                }
            }

            const compendiums = await this._getOrCreateCompendiums(config);
            if (!compendiums) return;

            ui.notifications.info("Collecting all linked documents...");
            const exportData = await this._collectExportData(config);

            if (exportData.journals.size === 0) {
                ui.notifications.warn("No Campaign Codex documents found to export!");
                return;
            }

            const confirmed = await this._confirmExport(exportData, config.baseName, config.exportScenes, config.exportTarget);
            if (!confirmed) return;

            await this._performExport(exportData, compendiums, config.exportTarget, config.packName, config);

            const targetName = config.exportTarget === "world" ? "World" : game.modules.get(config.exportTarget)?.title || config.exportTarget;
            ui.notifications.info(`Export complete! Documents exported to "${targetName}".`);
        } catch (error) {
            console.error("Campaign Codex | Export Error:", error);
            ui.notifications.error(`Export failed: ${error.message}`);
        }
    }
    /**
     * Gets existing compendiums from a module or creates new ones in the world.
     * @param {Object} config - The export configuration.
     * @returns {Promise<Object|null>}
     */
    static async _getOrCreateCompendiums(config) {
        if (config.exportTarget === "world") {
            return await this._createCompendiumSet(config.baseName, config.exportScenes);
        } else {
            const module = this.findCompatibleModules(config.exportScenes).find((m) => m.id === config.exportTarget);
            if (!module) {
                ui.notifications.error(`Module "${config.exportTarget}" not found or doesn't have required unlocked compendiums!`);
                return null;
            }

            if (config.exportType === "full") {
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: "Overwrite Module Compendiums?" },
                    content: `<p>This will <strong>delete all existing content</strong> in the compendiums within the module "<strong>${module.title}</strong>" before exporting. This cannot be undone.</p><p>Do you want to continue?</p>`,
                    yes: {
                        label: "Overwrite",
                        icon: '<i class="fas fa-trash"></i>',
                    },
                    no: {
                        label: "Cancel",
                        icon: '<i class="fas fa-times"></i>',
                        default: true,
                    },
                });
                if (!confirmed) return null;
            }

            const compendiums = {
                journals: module.packs["JournalEntry"],
                actors: module.packs["Actor"],
                items: module.packs["Item"],
            };

            if (config.exportScenes && module.packs["Scene"]) {
                compendiums.scenes = module.packs["Scene"];
            }

            return compendiums;
        }
    }

    /**
     * Prompts the user for export configuration using DialogV2.
     * @returns {Promise<Object|null>}
     */
    static async _getExportConfig() {
        const compatibleModules = this.findCompatibleModules();
        let moduleOptions = "";
        for (const module of compatibleModules) {
            moduleOptions += `<option value="${module.id}">${module.title}</option>`;
        }
    const journalFolderOptions = this._getFolderOptions("JournalEntry");

        const content = `
        <div class="form-group">
            <label>Export&nbsp;Target:</label>
            <select name="exportTarget">
                <option value="world">World</option>
                ${compatibleModules.length > 0 ? '<option value="module">Module</option>' : ""}
            </select>
        </div>

        <div class="form-group" id="module-target-group" style="display: none;">
            <label>Target Module:</label>
            <select name="moduleTarget">${moduleOptions}</select>
        </div>

        <div class="form-group" id="export-type-group" style="display: none;">
            <label>Export Type:</label>
            <select name="exportType">
                <option value="full">Whole World</option>
                <option value="pack">Pack</option>
            </select>
        </div>

        <div class="form-group" id="set-name-group">
            <label>Compendium Set Name:</label>
            <input type="text" name="setName" placeholder="e.g., My Campaign" />
        </div>

        <div class="form-group" id="pack-name-group" style="display: none;">
            <label>Pack Name:</label>
            <input type="text" name="packName" placeholder="e.g., The Sunless Citadel" />
        </div>

        <div class="form-group" id="folder-select-group" style="display: none;">
            <label>Source Journal Folder:</label>
            <select name="journalFolder">${journalFolderOptions}</select>
        </div>

        <hr/>
        <div class="form-group flexrow">
            <label>
                <input type="checkbox" name="performCleanup" checked />
                Perform cleanup before export
            </label>
        </div>
        <div class="form-group flexrow">
            <label>
                <input type="checkbox" name="exportScenes" id="exportScenesCheckbox" />
                Export linked scenes
            </label>
        </div>
        <div class="form-group flexrow">
            <label>
                <input type="checkbox" name="pruneFolders" id="pruneFoldersCheckbox" />
                Prune empty folders after export
            </label>
        </div>            
    `;

        const data = await foundry.applications.api.DialogV2.wait({
            window: { title: "Export Campaign Codex" },
            content,
            buttons: [
                {
                    action: "export",
                    label: "Export",
                    default: true,
                    callback: (event, button) => Object.fromEntries(new FormData(button.form)),
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    callback: () => null,
                },
            ],
            render: (dialog) => {
                const form = dialog.target.element.querySelector("form");
                const targetSelect = form.querySelector('[name="exportTarget"]');
                const typeSelect = form.querySelector('[name="exportType"]');
                const moduleTargetGroup = form.querySelector("#module-target-group");
                const exportTypeGroup = form.querySelector("#export-type-group");
                const setNameGroup = form.querySelector("#set-name-group");
                const packNameGroup = form.querySelector("#pack-name-group");
                const folderSelectGroup = form.querySelector("#folder-select-group");

                const updateVisibility = () => {
                    const isWorld = targetSelect.value === "world";
                    const isPack = typeSelect.value === "pack";

                    moduleTargetGroup.style.display = isWorld ? "none" : "block";
                    exportTypeGroup.style.display = isWorld ? "none" : "block";
                    setNameGroup.style.display = isWorld ? "block" : "none";
                    packNameGroup.style.display = !isWorld && isPack ? "block" : "none";
                    folderSelectGroup.style.display = !isWorld && isPack ? "block" : "none";
                };

                targetSelect.addEventListener("change", updateVisibility);
                typeSelect.addEventListener("change", updateVisibility);
                updateVisibility();
            },
            rejectClose: true,
        }).catch(() => null);
        if (!data || data === "cancel") return null;

        const performCleanup = data.performCleanup === "on";
        const pruneFolders = data.pruneFolders === "on";
        const exportScenes = data.exportScenes === "on";
        let config = { performCleanup, pruneFolders, exportScenes };

        if (data.exportTarget === "world") {
            let setName = data.setName.trim();
            if (!setName) setName = foundry.utils.randomID(16);
            config = { ...config, exportTarget: "world", baseName: setName, exportType: "full", packName: null, journalFolder: null };
        } else {
            const moduleTarget = data.moduleTarget;
            const exportType = data.exportType;
            config = { ...config, exportTarget: moduleTarget, baseName: null, exportType };

            if (exportType === "pack") {
                let packName = data.packName.trim();
                if (!packName) packName = foundry.utils.randomID(16);
                config.packName = packName;
                config.journalFolder = data.journalFolder;
            } else {
                config.packName = null;
            }
        }

        return config;
    }
    /**
     * Prompts the user to confirm the export details.
     * @param {object} exportData - The collected data to be exported.
     * @param {string} baseName - The name of the compendium set.
     * @param {boolean} exportScenes - Whether scenes are being exported
     * @param {string} exportTarget - The target for export (world or module id)
     * @returns {Promise<boolean>}
     */
    static async _confirmExport(exportData, baseName, exportScenes = false, exportTarget = "world") {
        const targetName =
            exportTarget === "world" ? `"<strong>${baseName}</strong>" compendium set` : `module "<strong>${game.modules.get(exportTarget)?.title || exportTarget}</strong>"`;

        const sceneInfo = exportScenes ? `<li><strong>${exportData.scenes?.size || 0}</strong> linked scenes</li>` : "";

        const content = `
            <div class="campaign-codex-exporter-dialog">
                <p>Ready to export the following to ${targetName}:</p>
                <ul style="margin: 0.5rem 0;">
                    <li><strong>${exportData.journals.size}</strong> Campaign Codex journals</li>
                    <li><strong>${exportData.actors.size}</strong> linked actors</li>
                    <li><strong>${exportData.items.size}</strong> linked items</li>
                    ${sceneInfo}
                </ul>
                <p><em>All relationships and folders will be preserved.</em></p>
                ${exportTarget !== "world" ? '<p class="warning-text"><i class="fas fa-exclamation-triangle"></i> Warning: Existing documents will be overwritten.</p>' : ""}
            </div>
        `;

        return await foundry.applications.api.DialogV2.confirm({
            window: { title: "Confirm Export" },
            content,
            yes: {
                label: "Export Now",
                icon: '<i class="fas fa-check"></i>',
                default: true,
            },
            no: {
                label: "Cancel",
                icon: '<i class="fas fa-times"></i>',
            },
            rejectClose: false,
        });
    }

/**
 * Recursively finds all documents to be exported, starting from world journals.
 * @param {object} config - The export configuration object.
 * @returns {Promise<{journals: Set<JournalEntry>, actors: Set<Actor>, items: Set<Item>}>}
 */
static async _collectExportData(config) {
    const { exportScenes, journalFolder: journalFolderId } = config;
    const documents = {
        journals: new Set(),
        actors: new Set(),
        items: new Set(),
    };
    if (exportScenes) {
        documents.scenes = new Set();
    }
    const processedUuids = new Set();

    let sourceJournals = [];
    if (journalFolderId && journalFolderId !== "all") {
        sourceJournals = game.journal.filter(j => {
            if (!j.folder) return false;
            if (j.folder.id === journalFolderId) return true; 
            return j.folder.ancestors.some(a => a.id === journalFolderId);
        });
    } else {
        sourceJournals = Array.from(game.journal.values());
    }

    const rootJournals = sourceJournals.filter((j) => {
        const type = j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE);
        return type && ["region", "location", "shop", "npc", "group"].includes(type);
    });
    for (const journal of rootJournals) {
        await this._recursivelyFindDocuments(journal.uuid, documents, processedUuids, exportScenes);
    }

    return documents;
}

    static _extractTokenUuidsFromScene(sceneDoc) {
        const uuids = new Set();
        for (const tokenData of sceneDoc.tokens) {
            if (tokenData.actorId) {
                const actor = game.actors.get(tokenData.actorId);
                if (actor) {
                    // Just get the string, not the whole document
                    uuids.add(actor.uuid);
                }
            }
        }
        return [...uuids];
    }

    static _extractJournalUuidsFromScene(sceneDoc) {
        const uuids = new Set();
        for (const noteData of sceneDoc.notes) {
            if (noteData.entryId) {
                const journal = game.journal.get(noteData.entryId);
                if (journal) {
                    // Just get the string, not the whole document
                    uuids.add(journal.uuid);
                }
            }
        }
        return [...uuids];
    }

    /**
     * Given a starting UUID, finds the document and all documents it links to.
     * @param {string} uuid - The UUID of the document to process.
     * @param {object} documents - The main object holding Sets of journals, actors, and items.
     * @param {Set<string>} processedUuids - A set of already-handled UUIDs to avoid redundant work.
     */
    static async _recursivelyFindDocuments(uuid, documents, processedUuids, exportScenes = false) {
        if (!uuid || processedUuids.has(uuid)) {
            return;
        }
        processedUuids.add(uuid);

        const doc = await fromUuid(uuid);
        if (!doc) {
            console.warn(`Campaign Codex | Linked document not found for UUID: ${uuid}`);
            return;
        }

        if (doc.documentName === "JournalEntry") {
            documents.journals.add(doc);
        } else if (doc.documentName === "Actor") {
            documents.actors.add(doc);
        } else if (doc.documentName === "Item") {
            documents.items.add(doc);
        } else if (doc.documentName === "Scene" && exportScenes) {
            documents.scenes.add(doc);
        }
        if (doc.documentName === "Scene" && exportScenes) {
            const sceneActorContentUuids = this._extractTokenUuidsFromScene(doc);
            for (const u of sceneActorContentUuids) {
                const actorDoc = await fromUuid(u);
                if (actorDoc) {
                    documents.actors.add(actorDoc);
                }
            }

            const sceneJournalContentUuids = this._extractJournalUuidsFromScene(doc);
            for (const u of sceneJournalContentUuids) {
                const journalDoc = await fromUuid(u);
                if (journalDoc) {
                    documents.journals.add(journalDoc);
                }
            }
        }
        const linkedUuids = this._extractUuidsFromDocument(doc, exportScenes);

        for (const linkedUuid of linkedUuids) {
            await this._recursivelyFindDocuments(linkedUuid, documents, processedUuids, exportScenes);
        }
    }

    /**
     * Extracts all known UUIDs from a single Campaign Codex document's flags.
     * @param {Document} doc - The document to parse.
     * @returns {string[]} An array of all found UUIDs.
     */
    static _extractUuidsFromDocument(doc, exportScenes = false) {
        if (doc.documentName !== "JournalEntry") {
            return [];
        }

        const codexData = doc.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_DATA) || {};
        const uuids = [];

        const singleLinkFields = [
            "linkedActor",
            "linkedLocation",
            "parentRegion",
        ];
        if (exportScenes) {
            singleLinkFields.push("linkedScene");
        }

        for (const field of singleLinkFields) {
            if (codexData[field]) {
                uuids.push(codexData[field]);
            }
        }

        if (Array.isArray(codexData.linkedStandardJournals)) {
            for (const journalUuid of codexData.linkedStandardJournals) {
                const parentJournalUuid = journalUuid.split(".JournalEntryPage.")[0];
                uuids.push(parentJournalUuid);
            }
        }

        const multiLinkFields = ["linkedNPCs", "linkedShops", "linkedLocations", "linkedRegions", "associates", "members"];
        for (const field of multiLinkFields) {
            if (Array.isArray(codexData[field])) {
                uuids.push(...codexData[field]);
            }
        }

        if (Array.isArray(codexData.inventory)) {
            for (const item of codexData.inventory) {
                if (item.itemUuid) {
                    uuids.push(item.itemUuid);
                }
            }
        }

        return uuids.filter(Boolean);
    }

    /**
     * Creates a data object for updating a scene in the compendium with relinked actor and journal IDs.
     * @param {Scene} scene - The scene *in the compendium* to be updated.
     * @param {Map<string, string>} uuidMap - The map of old UUIDs to new compendium UUIDs.
     * @returns {object} The data object for the update operation.
     */
    static _prepareSceneUpdate(scene, uuidMap) {
        const updateData = { _id: scene.id };

        updateData.tokens = scene.tokens.map((tokenData) => {
            const newData = tokenData.toObject();
            const originalActorUuid = `Actor.${tokenData.actorId}`;
            const newActorUuid = uuidMap.get(originalActorUuid);

            if (newActorUuid) {
                const newActorId = newActorUuid.split(".").pop();
                newData.actorId = newActorId;
            }
            return newData;
        });

        updateData.notes = scene.notes.map((noteData) => {
            const newData = noteData.toObject(); // Use .toObject() here as well
            const originalJournalUuid = `JournalEntry.${noteData.entryId}`;
            const newJournalUuid = uuidMap.get(originalJournalUuid);

            if (newJournalUuid) {
                const newJournalId = newJournalUuid.split(".").pop();
                newData.entryId = newJournalId;
            }
            return newData;
        });
        updateData.active = false;

        return updateData;
    }
    static async _performExport(exportData, compendiums, exportTarget, packName = null, config) {
        const uuidMap = new Map();
        const compendiumFolders = {
            journals: new Map(),
            actors: new Map(),
            items: new Map(),
            scenes: new Map(),
        };

        const COMPENDIUM_MAX_DEPTH = 3;
        const maxRelativeDepth = COMPENDIUM_MAX_DEPTH - (packName ? 1 : 0);

        if (exportTarget !== "world" && !packName) {
            const journalPack = compendiums.journals;
            const content = await journalPack.getDocuments();
            if (content.length > 0) {
                const contentIds = content.map((doc) => doc.id);
                await JournalEntry.deleteDocuments(contentIds, { pack: journalPack.collection });
            }
            if (journalPack.folders.size > 0) {
                await Folder.deleteDocuments(
                    journalPack.folders.map((f) => f.id),
                    { pack: journalPack.collection },
                );
            }
        }

        let journalFolderId = null;
        if (exportTarget !== "world" && packName) {
            const journalPack = compendiums.journals;
            let folder = journalPack.folders.find((f) => f.name === `${packName}-pack`);
            if (!folder) {
                const folderData = { name: `${packName}-pack`, type: "JournalEntry", folder: null };
                folder = await journalPack.importDocument(new Folder(folderData));
            }
            journalFolderId = folder.id;
        }

        for (const actor of exportData.actors) {
            const newDoc = await this._exportOrUpdateDocument(actor, compendiums.actors, compendiumFolders.actors, null, false, false, maxRelativeDepth);
            if (newDoc) uuidMap.set(actor.uuid, newDoc.uuid);
        }

        for (const item of exportData.items) {
            const newDoc = await this._exportOrUpdateDocument(item, compendiums.items, compendiumFolders.items, null, false, false, maxRelativeDepth);
            if (newDoc) uuidMap.set(item.uuid, newDoc.uuid);
        }

        if (exportData.scenes && compendiums.scenes) {
            for (const scene of exportData.scenes) {
                const newDoc = await this._exportOrUpdateDocument(scene, compendiums.scenes, compendiumFolders.scenes, null, false, false, maxRelativeDepth);
                if (newDoc) uuidMap.set(scene.uuid, newDoc.uuid);
            }
        }
        const isPackExport = config.exportType === 'pack';
        const shouldSkipRoot = isPackExport && config.journalFolder && config.journalFolder !== 'all';
        for (const journal of exportData.journals) {
            const newDoc = await this._exportOrUpdateDocument(
                journal,
                compendiums.journals,
                compendiumFolders.journals,
                journalFolderId,
                isPackExport,
                shouldSkipRoot,
                maxRelativeDepth,
            );
            if (newDoc) uuidMap.set(journal.uuid, newDoc.uuid);
        }

        const updates = [];
        for (const journal of exportData.journals) {
            const newJournalUuid = uuidMap.get(journal.uuid);
            if (!newJournalUuid) continue;

            const newJournal = await fromUuid(newJournalUuid);
            if (!newJournal) continue;

            updates.push(this._prepareJournalUpdate(newJournal, uuidMap));
        }

        if (updates.length > 0) {
            await JournalEntry.updateDocuments(updates, {
                pack: compendiums.journals.collection,
            });
        }
        if (exportData.scenes && compendiums.scenes) {
            const sceneUpdates = [];
            for (const scene of exportData.scenes) {
                const newSceneUuid = uuidMap.get(scene.uuid);
                if (!newSceneUuid) continue;

                const newScene = await fromUuid(newSceneUuid);
                if (!newScene) continue;

                sceneUpdates.push(this._prepareSceneUpdate(newScene, uuidMap));
            }

            if (sceneUpdates.length > 0) {
                await Scene.updateDocuments(sceneUpdates, {
                    pack: compendiums.scenes.collection,
                });
            }
        }

        if (config.pruneFolders) {
            ui.notifications.info("Pruning empty folders...");
            for (const pack of Object.values(compendiums)) {
                if (pack) await this._pruneEmptyFolders(pack, journalFolderId);
            }
        }

    }
 

/**
 * Removes all folders from a compendium that contain no documents and no populated subfolders.
 * @param {CompendiumCollection} pack - The compendium pack to prune.
 * @param {string|null} [exemptFolderId=null] - An ID of a folder to exempt from pruning.
 */
static async _pruneEmptyFolders(pack, exemptFolderId = null) {
    if (!pack.folders.size) return;
    const allFolders = Array.from(pack.folders.values());
    allFolders.sort((a, b) => b.depth - a.depth);

    const nonEmptyFolderIds = new Set();
    let foldersToDelete = []; // Changed to let

    for (const folder of allFolders) {
        const hasContent = folder.contents.length > 0;
        const children = allFolders.filter(f => f.folder?.id === folder.id);
        const hasNonEmptyChild = children.some(child => nonEmptyFolderIds.has(child.id));
        if (hasContent || hasNonEmptyChild) {
            nonEmptyFolderIds.add(folder.id);
        } else {
            foldersToDelete.push(folder.id);
        }
    }
    if (exemptFolderId) {
        foldersToDelete = foldersToDelete.filter(id => id !== exemptFolderId);
    }

    if (foldersToDelete.length > 0) {
        ui.notifications.info(`Pruning ${foldersToDelete.length} empty folder(s) from "${pack.metadata.label}".`);
        await Folder.deleteDocuments(foldersToDelete, { pack: pack.collection });
    }
}
    /**
     * Exports a document, creating its folder structure and updating by a smart match if it already exists.
     * @param {Document} doc - The document to export.
     * @param {CompendiumCollection} targetPack - The compendium to export to.
     * @param {Map<string, string>} folderMap - A map to track created folders in the pack.
     * @param {string|null} parentFolderId - Optional ID of a parent folder to export into.
     * @param {boolean} [pack=false] - Whether this is a pack export.
     * @param {boolean} [skipRoot=false] - Whether to skip the root of the source folder path.
     * @param {number} [maxDepth=3] - The maximum folder depth allowed in the compendium.
     * @returns {Promise<Document|null>} The newly created or updated document.
     */
    static async _exportOrUpdateDocument(doc, targetPack, folderMap, parentFolderId = null, pack = false, skipRoot = false, maxDepth = 3) {
        const FLAG_PATH = `flags.${this.CONSTANTS.FLAG_SCOPE}.originalUuid`;

        let existingDocIndex = null;
        if (!(pack && doc.documentName === "JournalEntry")) {
            existingDocIndex = targetPack.index.find((i) => foundry.utils.getProperty(i, FLAG_PATH) === doc.uuid);
            if (!existingDocIndex && doc.documentName !== "JournalEntry") {
                existingDocIndex = targetPack.index.find((i) => i.name === doc.name);
            }
        }

        if (existingDocIndex) {
            if (doc.documentName !== "JournalEntry") {
                return await targetPack.getDocument(existingDocIndex._id);
            }
        }


        const exportData = doc.toObject();
        delete exportData._id;

        foundry.utils.setProperty(exportData, FLAG_PATH, doc.uuid);
        if (doc.documentName === "Scene") {
            exportData.active = false;
        }
        
        let finalFolderId = parentFolderId;
        if (doc.folder) {
            const folderPath = [];
            let currentFolder = doc.folder;
            while (currentFolder) {
                folderPath.unshift(currentFolder);
                currentFolder = currentFolder.folder;
            }
            const relativePath = skipRoot ? folderPath.slice(1) : folderPath;
            const relativeDepth = relativePath.length;

            // Handle renaming for journals in folders deeper than the limit.
            if (doc.documentName === "JournalEntry" && relativeDepth > maxDepth) {
                exportData.name = `${exportData.name} - ${doc.folder.name}`;
            }

            finalFolderId = await this._getOrCreateFolderRecursive(doc.folder, targetPack, folderMap, parentFolderId, skipRoot, maxDepth);
        }

        if (finalFolderId) {
            exportData.folder = finalFolderId;
        }

        // Finalize by either updating the existing journal or importing the new document.
        if (existingDocIndex) { // This condition can now only be met by a Journal.
            exportData._id = existingDocIndex._id;
            const updateResult = await targetPack.documentClass.updateDocuments([exportData], { pack: targetPack.collection });
            return updateResult[0];
        } else { // This handles new documents of any type.
            return await targetPack.importDocument(doc.clone(exportData, { keepId: false }));
        }
    }

    /**
     * Recursively creates a folder hierarchy in a compendium based on a world folder.
     * @param {Folder} worldFolder - The world folder to replicate.
     * @param {CompendiumCollection} targetPack - The compendium to export to.
     * @param {Map<string, string>} folderMap - A map to track created folders in the pack.
     * @param {string|null} parentCompendiumFolderId - The ID of the parent compendium folder.
     * @param {boolean} [skipRoot=false] - If true, skips creating the top-level folder in the path (for pack exports).
     * @param {number} [maxDepth=3] - The maximum folder depth to create.
     * @returns {Promise<string>} The ID of the final folder in the compendium.
     */
    static async _getOrCreateFolderRecursive(worldFolder, targetPack, folderMap, parentCompendiumFolderId = null, skipRoot = false, maxDepth = 3) {
        // Build the folder path from the root down
        const folderPath = [];
        let currentFolder = worldFolder;
        while (currentFolder) {
            folderPath.unshift(currentFolder);
            currentFolder = currentFolder.folder;
        }

        const pathToCreate = skipRoot ? folderPath.slice(1) : folderPath;

        const pathWithinLimit = pathToCreate.slice(0, maxDepth);

        let currentParentId = parentCompendiumFolderId;

        for (const folder of pathWithinLimit) {
            const folderKey = `${currentParentId || "root"}-${folder.name}`;
            let targetFolderId = folderMap.get(folderKey);

            if (!targetFolderId) {
                let existingFolder = targetPack.folders.find(f => f.name === folder.name && f.folder?.id === currentParentId);

                if (existingFolder) {
                    targetFolderId = existingFolder.id;
                } else {
                    const folderData = folder.toObject();
                    delete folderData._id;
                    folderData.folder = currentParentId;

                    const newFolder = await Folder.create(folderData, { pack: targetPack.collection });

                    if (newFolder) {
                        targetFolderId = newFolder.id;
                    }
                }

                if (targetFolderId) {
                    folderMap.set(folderKey, targetFolderId);
                }
            }
            currentParentId = targetFolderId;
        }
        return currentParentId;
    }


    /**
     * Creates a data object for updating a journal in the compendium with relinked UUIDs.
     * @param {JournalEntry} journal - The journal *in the compendium* to be updated.
     * @param {Map<string, string>} uuidMap - The map of old UUIDs to new compendium UUIDs.
     * @returns {object} The data object for the update operation.
     */
    static _prepareJournalUpdate(journal, uuidMap) {
        const updateData = { _id: journal.id };

        const oldCodexData = journal.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_DATA) || {};
        const newCodexData = foundry.utils.deepClone(oldCodexData);

        const relink = (uuid) => uuidMap.get(uuid) || uuid;

        const singleLinkFields = ["linkedActor", "linkedLocation", "parentRegion", "linkedScene"];

        for (const field of singleLinkFields) {
            if (newCodexData[field]) {
                newCodexData[field] = relink(newCodexData[field]);
            }
        }

        if (Array.isArray(newCodexData.linkedStandardJournals)) {
            newCodexData.linkedStandardJournals = newCodexData.linkedStandardJournals.map((oldUuid) => {
                const parts = oldUuid.split(".JournalEntryPage.");
                const oldJournalUuid = parts[0];
                const newJournalUuid = uuidMap.get(oldJournalUuid);

                if (newJournalUuid) {
                    if (parts.length > 1) {
                        const pageIdPart = parts[1];
                        return `${newJournalUuid}.JournalEntryPage.${pageIdPart}`;
                    }
                    return newJournalUuid;
                }
                return oldUuid;
            });
        }

        const multiLinkFields = ["linkedNPCs", "linkedShops", "linkedLocations", "linkedRegions", "associates", "members"];
        for (const field of multiLinkFields) {
            if (Array.isArray(newCodexData[field])) {
                newCodexData[field] = newCodexData[field].map(relink);
            }
        }

        if (Array.isArray(newCodexData.inventory)) {
            newCodexData.inventory.forEach((item) => {
                if (item.itemUuid) item.itemUuid = relink(item.itemUuid);
            });
        }

        foundry.utils.setProperty(updateData, `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_DATA}`, newCodexData);

        const newPages = journal.pages.map((page) => {
            const pageData = page.toObject();
            if (pageData.text?.content) {
                pageData.text.content = pageData.text.content.replace(/@UUID\[([^\]]+)\]/g, (match, oldUuid) => {
                    if (oldUuid.includes(".JournalEntryPage.")) {
                        const parts = oldUuid.split(".JournalEntryPage.");
                        const oldJournalUuid = parts[0];
                        const newJournalUuid = uuidMap.get(oldJournalUuid);

                        if (newJournalUuid) {
                            const pageIdPart = parts[1];
                            return `@UUID[${newJournalUuid}.JournalEntryPage.${pageIdPart}]`;
                        }
                    }

                    const newUuid = uuidMap.get(oldUuid);
                    return newUuid ? `@UUID[${newUuid}]` : match;
                });
            }
            return pageData;
        });
        updateData.pages = newPages;

        return updateData;
    }

    /**
     * Creates a set of three compendiums for the export inside a main folder.
     * @param {string} baseName - The base name for the compendium set.
     * @returns {Promise<Object|null>}
     */
    static async _createCompendiumSet(baseName, exportScenes = false) {
        try {
            const FOLDER_NAME = "Campaign Codex Exports";
            let compendiumFolder = game.folders.find((f) => f.name === FOLDER_NAME && f.type === "Compendium");
            if (!compendiumFolder) {
                compendiumFolder = await Folder.create({
                    name: FOLDER_NAME,
                    type: "Compendium",
                    color: "#198556",
                    sorting: "a",
                });
            }

            const compendiums = {
                journals: await this._createCompendium(`${baseName} - CC Journals`, "JournalEntry", compendiumFolder.id),
                actors: await this._createCompendium(`${baseName} - CC Actors`, "Actor", compendiumFolder.id),
                items: await this._createCompendium(`${baseName} - CC Items`, "Item", compendiumFolder.id),
            };

            if (exportScenes) {
                compendiums.scenes = await this._createCompendium(`${baseName} - CC Scenes`, "Scene", compendiumFolder.id);
            }

            return compendiums;
        } catch (error) {
            ui.notifications.error("Failed to create compendium set!");
            console.error("Campaign Codex |", error);
            return null;
        }
    }

    /**
     * Creates a single compendium pack, overwriting if it already exists.
     * @param {string} name - The user-facing label for the compendium.
     * @param {string} documentType - The type of document.
     * @param {string} folderId - The ID of the parent folder in the compendium sidebar.
     * @returns {Promise<CompendiumCollection>}
     */
    static async _createCompendium(name, documentType, folderId) {
        const slug = name.slugify({ strict: true });
        const packId = `world.${slug}`;
        const existing = game.packs.get(packId);

        if (existing) {
            const confirmed = await Dialog.confirm({
                title: "Overwrite Compendium?",
                content: `<p>A compendium named "<strong>${name}</strong>" already exists. Do you want to delete and recreate it? This cannot be undone.</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: false,
            });
            if (!confirmed) {
                throw new Error(`User cancelled overwrite of compendium: ${name}`);
            }
            await existing.deleteCompendium();
            ui.notifications.info(`Recreating compendium: ${name}`);
        } else {
            ui.notifications.info(`Creating new compendium: ${name}`);
        }

        const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
            type: documentType,
            label: name,
            name: slug,
            pack: packId,
            system: game.system.id,
        });

        if (folderId) {
            await pack.setFolder(folderId);
        }

        return pack;
    }
}

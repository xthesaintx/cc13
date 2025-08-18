export class SimpleCampaignCodexExporter {
    static CONSTANTS = {
        FLAG_SCOPE: "campaign-codex",
        FLAG_TYPE: "type",
        FLAG_DATA: "data",
    };

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
                const unlockedPack = game.packs.find(p =>
                    p.metadata.packageName === module.id &&
                    p.documentName === type &&
                    !p.locked
                );

                if (unlockedPack) {
                    modulePacks[type] = unlockedPack;
                } else {
                    hasRequiredTypes = false;
                    break;
                }
            }

            if (hasRequiredTypes) {
                const scenePack = game.packs.find(p =>
                    p.metadata.packageName === module.id &&
                    p.documentName === "Scene" &&
                    !p.locked
                );

                if (scenePack) {
                    modulePacks["Scene"] = scenePack;
                }

                compatibleModules.push({
                    id: module.id,
                    title: module.title,
                    packs: modulePacks,
                    hasScenes: !!scenePack
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
                    if (typeof CleanUp !== 'undefined' && CleanUp.performManualCleanup) {
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
            const exportData = await this._collectExportData(config.exportScenes);
            if (exportData.journals.size === 0) {
                ui.notifications.warn("No Campaign Codex documents found to export!");
                return;
            }

            const confirmed = await this._confirmExport(exportData, config.baseName, config.exportScenes, config.exportTarget);
            if (!confirmed) return;

            ui.notifications.info(`Exporting ${exportData.journals.size} journals, ${exportData.actors.size} actors, ${exportData.items.size} items${config.exportScenes ? `, ${exportData.scenes?.size || 0} scenes` : ''}...`);
            await this._performExport(exportData, compendiums, config.exportTarget);

            const targetName = config.exportTarget === 'world' ? 'World' : game.modules.get(config.exportTarget)?.title || config.exportTarget;
            ui.notifications.info(`Export complete! Documents exported to "${targetName}".`);

        } catch (error) {
            console.error("Campaign Codex | Export Error:", error);
            ui.notifications.error(`Export failed: ${error.message}`);
        }
    }

    /**
     * Gets existing compendiums from a module or creates new ones in the world
     * @param {Object} config - The export configuration
     * @returns {Promise<Object|null>}
     */
    static async _getOrCreateCompendiums(config) {
        if (config.exportTarget === 'world') {
            return await this._createCompendiumSet(config.baseName, config.exportScenes);
        } else {
            const module = this.findCompatibleModules(config.exportScenes).find(m => m.id === config.exportTarget);
            if (!module) {
                ui.notifications.error(`Module "${config.exportTarget}" not found or doesn't have required unlocked compendiums!`);
                return null;
            }

            const confirmed = await Dialog.confirm({
                title: "Export to Module Compendiums",
                content: `<p>This will create a new folder for all journals within the compendium in module "<strong>${module.title}</strong>" to avoid overwriting existing documents. Existing Actors, Items, and Scenes with the same name will be overwritten.</p><p>Do you want to continue?</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: false
            });

            if (!confirmed) return null;

            const compendiums = {
                journals: module.packs["JournalEntry"],
                actors: module.packs["Actor"],
                items: module.packs["Item"]
            };

            if (config.exportScenes && module.packs["Scene"]) {
                compendiums.scenes = module.packs["Scene"];
            }

            return compendiums;
        }
    }

    /**
     * Prompts the user to enter a base name and select export target
     * @returns {Promise<Object|null>}
     */
    static async _getExportConfig() {
        const compatibleModules = this.findCompatibleModules();
        const hasCompatibleModules = compatibleModules.length > 0;

        let moduleOptions = '<option value="world" data-has-scenes="true">World (Create New Compendiums)</option>';
        for (const module of compatibleModules) {
            moduleOptions += `<option value="${module.id}" data-has-scenes="${module.hasScenes}">${module.title}${!module.hasScenes ? ' (no Scene compendium)' : ''}</option>`;
        }

        return new Promise((resolve) => {
            const dialog = new Dialog({
                title: "Export Campaign Codex",
                content: `
                    <div class="campaign-codex-exporter-dialog">
                        <div class="form-group">
                            <label>Export Target:</label>
                            <select name="exportTarget">
                                ${moduleOptions}
                            </select>
                            ${!hasCompatibleModules ? `
                                <p class="warning-text">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    No active modules found with all required unlocked compendiums (JournalEntry, Actor, Item).
                                </p>
                            ` : `
                                <p class="help-text">
                                    <i class="fas fa-info-circle"></i>
                                    Select "World" to create new compendiums, or choose a module to export to its existing compendiums.
                                </p>
                            `}
                        </div>
                        <div class="form-group" id="baseNameGroup">
                            <label>Compendium Set Name:</label>
                            <input type="text" name="baseName" value="My Campaign" />
                            <p class="help-text">
                                This will create a set of compendiums, e.g., <strong>[Name] - CC Journals</strong>.
                            </p>
                        </div>
                        <div class="form-group flexrow">
                            <label>
                                <input type="checkbox" name="performCleanup" checked />
                                Perform cleanup before export
                            </label>
                            <p class="help-text">
                                <i class="fas fa-info-circle"></i>
                                Removes broken links and fixes orphaned relationships before exporting.
                            </p>
                        </div>
                        <div class="form-group flexrow">
                            <label>
                                <input type="checkbox" name="exportScenes" id="exportScenesCheckbox" />
                                Export linked scenes
                            </label>
                            <p class="help-text" id="scenesHelpText">
                                <i class="fas fa-map"></i>
                                Creates a scenes compendium and exports all scenes linked to Campaign Codex documents.
                            </p>
                            <p class="warning-text" id="scenesWarningText" style="display: none;">
                                <i class="fas fa-exclamation-triangle"></i>
                                Scene export not available - the selected module doesn't have an unlocked Scene compendium.
                            </p>
                        </div>
                    </div>
                `,
                buttons: {
                    export: {
                        icon: '<i class="fas fa-download"></i>',
                        label: "Export",
                        callback: (html) => {
                            const form = html[0] || html;
                            const exportTarget = form.querySelector('select[name="exportTarget"]').value;
                            const baseName = form.querySelector('input[name="baseName"]').value.trim();
                            const performCleanup = form.querySelector('input[name="performCleanup"]').checked;
                            const exportScenes = form.querySelector('input[name="exportScenes"]').checked;

                            resolve({
                                exportTarget: exportTarget,
                                baseName: exportTarget === 'world' ? (baseName || "My Campaign") : null,
                                performCleanup: performCleanup,
                                exportScenes: exportScenes
                            });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve(null)
                    }
                },
                default: "export",
                render: (html) => {
                    const form = html[0] || html;
                    const exportTargetSelect = form.querySelector('select[name="exportTarget"]');
                    const baseNameGroup = form.querySelector('#baseNameGroup');
                    const exportScenesCheckbox = form.querySelector('#exportScenesCheckbox');
                    const scenesHelpText = form.querySelector('#scenesHelpText');
                    const scenesWarningText = form.querySelector('#scenesWarningText');
                    
                    const dialogButtons = form.closest('.app').querySelector('footer.window-footer');

                    function updateFormState() {
                        const selectedOption = exportTargetSelect.options[exportTargetSelect.selectedIndex];
                        const hasScenes = selectedOption.dataset.hasScenes === 'true';
                        const isWorld = exportTargetSelect.value === 'world';

                        const baseNameInput = baseNameGroup.querySelector('input[name="baseName"]');
                        if (isWorld) {
                            baseNameGroup.classList.remove('disabled');
                            baseNameGroup.style.minHeight = 'auto';
                            baseNameInput.disabled = false;
                        } else {
                            baseNameGroup.classList.add('disabled');
                            baseNameGroup.style.minHeight = '0';
                            baseNameInput.disabled = true;
                        }
                        
                        exportScenesCheckbox.disabled = !hasScenes;
                        if (!hasScenes) {
                            exportScenesCheckbox.checked = false;
                            scenesHelpText.style.display = 'none';
                            scenesWarningText.style.display = 'block';
                        } else {
                            scenesHelpText.style.display = 'block';
                            scenesWarningText.style.display = 'none';
                        }

                        if (dialogButtons) {
                            const totalVisibleButtons = dialogButtons.querySelectorAll('button:not([style*="display: none"])').length;
                            dialogButtons.style.width = totalVisibleButtons === 1 ? '50%' : '100%';
                        }
                    }

                    exportTargetSelect.addEventListener('change', updateFormState);
                    updateFormState(); 
                }
            });
            dialog.render(true);
        });
    }

    /**
     * Prompts the user to confirm the export details.
     * @param {object} exportData - The collected data to be exported.
     * @param {string} baseName - The name of the compendium set.
     * @param {boolean} exportScenes - Whether scenes are being exported
     * @param {string} exportTarget - The target for export (world or module id)
     * @returns {Promise<boolean>}
     */
    static async _confirmExport(exportData, baseName, exportScenes = false, exportTarget = 'world') {
        const targetName = exportTarget === 'world'
            ? `"<strong>${baseName}</strong>" compendium set`
            : `module "<strong>${game.modules.get(exportTarget)?.title || exportTarget}</strong>"`;

        return new Promise((resolve) => {
            const sceneInfo = exportScenes ? `<li><strong>${exportData.scenes?.size || 0}</strong> linked scenes</li>` : '';

            new Dialog({
                title: "Confirm Export",
                content: `
                    <div class="campaign-codex-exporter-dialog">
                        <p>Ready to export the following to ${targetName}:</p>
                        <ul style="margin: 0.5rem 0;">
                            <li><strong>${exportData.journals.size}</strong> Campaign Codex journals</li>
                            <li><strong>${exportData.actors.size}</strong> linked actors</li>
                            <li><strong>${exportData.items.size}</strong> linked items</li>
                            ${sceneInfo}
                        </ul>
                        <p><em>All relationships and folders will be preserved.</em></p>
                        ${exportTarget !== 'world' ? '<p class="warning-text"><i class="fas fa-exclamation-triangle"></i> Warning: Existing documents with the same name (except for journals) will be overwritten.</p>' : ''}
                    </div>
                `,
                buttons: {
                    confirm: { icon: '<i class="fas fa-check"></i>', label: "Export Now", callback: () => resolve(true) },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(false) }
                },
                default: "confirm"
            }).render(true);
        });
    }

    /**
     * Recursively finds all documents to be exported, starting from world journals.
     * @returns {Promise<{journals: Set<JournalEntry>, actors: Set<Actor>, items: Set<Item>}>}
     */
    static async _collectExportData(exportScenes = false) {
        const documents = {
            journals: new Set(),
            actors: new Set(),
            items: new Set(),
        };

        if (exportScenes) {
            documents.scenes = new Set();
        }

        const processedUuids = new Set();

        const rootJournals = game.journal.filter(j => {
            const type = j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE);
            return type && ['region', 'location', 'shop', 'npc', 'group'].includes(type);
        });

        for (const journal of rootJournals) {
            await this._recursivelyFindDocuments(journal.uuid, documents, processedUuids, exportScenes);
        }

        return documents;
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

        const singleLinkFields = ["linkedActor", "linkedLocation", "parentRegion", "linkedStandardJournal"];
        if (exportScenes) {
            singleLinkFields.push("linkedScene");
        }

        for (const field of singleLinkFields) {
            if (codexData[field]) {
                uuids.push(codexData[field]);
            }
        }

        const multiLinkFields = ["linkedNPCs", "linkedShops", "linkedLocations", "associates", "members"];
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
     * Exports all collected documents and updates their links.
     * @param {object} exportData - The object containing Sets of documents to export.
     * @param {object} compendiums - The object containing the created compendium packs.
     * @param {string} exportTarget - The target for export (world or module id)
     */
    static async _performExport(exportData, compendiums, exportTarget) {
        const uuidMap = new Map();
        const compendiumFolders = {
            journals: new Map(),
            actors: new Map(),
            items: new Map(),
            scenes: new Map()
        };

        let journalFolderId = null;
        if (exportTarget !== 'world') {
            const now = new Date();
            const folderName = `${game.world.id} - ${now.getHours()}${now.getMinutes()}${now.getSeconds()} - ${now.getMonth() + 1}${now.getDate()}${String(now.getFullYear()).slice(2)}`;
            const journalPack = compendiums.journals;
            const existingFolder = journalPack.folders.find(f => f.name === folderName);
            if (existingFolder) {
                journalFolderId = existingFolder.id;
            } else {
                const newFolder = await Folder.create({ name: folderName, type: "JournalEntry" }, { pack: journalPack.collection });
                journalFolderId = newFolder.id;
            }
        }
// JOURNAL ADDITION
        let linkedJournalsFolderId = null;
        const journalPack = compendiums.journals;
        const linkedFolderName = "Linked Journals";

        const existingLinkedFolder = journalPack.folders.find(f => f.name === linkedFolderName && f.folder?.id === journalFolderId);
        if (existingLinkedFolder) {
            linkedJournalsFolderId = existingLinkedFolder.id;
        } else {
            const newFolder = await Folder.create({
                name: linkedFolderName,
                type: "JournalEntry",
                folder: journalFolderId
            }, { pack: journalPack.collection });
            linkedJournalsFolderId = newFolder.id;
        }
// JOURNAL ADDITION
        for (const actor of exportData.actors) {
            const newDoc = await this._exportOrUpdateDocument(actor, compendiums.actors);
            if (newDoc) uuidMap.set(actor.uuid, newDoc.uuid);
        }

        for (const item of exportData.items) {
            const newDoc = await this._exportOrUpdateDocument(item, compendiums.items);
            if (newDoc) uuidMap.set(item.uuid, newDoc.uuid);
        }

        if (exportData.scenes && compendiums.scenes) {
            for (const scene of exportData.scenes) {
                const newDoc = await this._exportOrUpdateDocument(scene, compendiums.scenes);
                if (newDoc) uuidMap.set(scene.uuid, newDoc.uuid);
            }
        }

        for (const journal of exportData.journals) {
            let exportFolderId = journalFolderId; 
            // JOURNAL ADDITION
            if (!journal.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE)) {
                exportFolderId = linkedJournalsFolderId;
            }
            const newDoc = await this._exportDocument(journal, compendiums.journals, compendiumFolders.journals, exportFolderId);
            // JOURNAL ADDITION
            // const newDoc = await this._exportDocument(journal, compendiums.journals, compendiumFolders.journals, journalFolderId);
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
            await JournalEntry.updateDocuments(updates, { pack: compendiums.journals.collection });
        }
    }
    


    /**
     * Exports a single document to a target compendium, optionally in a specific folder hierarchy.
     * @param {Document} doc - The document to export.
     * @param {CompendiumCollection} targetPack - The compendium to export to.
     * @param {Map<string, string>} folderMap - A map to track created folders in the pack.
     * @param {string|null} parentFolderId - Optional ID of a parent folder to export into.
     * @returns {Promise<Document>} The newly created document in the compendium.
     */
    static async _exportDocument(doc, targetPack, folderMap, parentFolderId = null) {
        const exportData = doc.toObject();
        delete exportData._id;
        foundry.utils.setProperty(exportData, `flags.${this.CONSTANTS.FLAG_SCOPE}.originalUuid`, doc.uuid);

        let finalFolderId = parentFolderId;
        if (doc.folder) {
            finalFolderId = await this._getOrCreateFolderRecursive(doc.folder, targetPack, folderMap, parentFolderId);
        }
        
        if (finalFolderId) {
            exportData.folder = finalFolderId;
        }

        return await targetPack.importDocument(doc.clone(exportData, { "keepId": false }));
    }


    /**
     * Recursively creates a folder hierarchy in a compendium based on a world folder.
     * @param {Folder} worldFolder - The world folder to replicate.
     * @param {CompendiumCollection} targetPack - The compendium to export to.
     * @param {Map<string, string>} folderMap - A map to track created folders in the pack.
     * @param {string|null} parentCompendiumFolderId - The ID of the parent compendium folder.
     * @returns {Promise<string>} The ID of the final folder in the compendium.
     */
    static async _getOrCreateFolderRecursive(worldFolder, targetPack, folderMap, parentCompendiumFolderId = null) {
        // Build the folder path from the root down
        const folderPath = [];
        let currentFolder = worldFolder;
        while (currentFolder) {
            folderPath.unshift(currentFolder);
            currentFolder = currentFolder.folder;
        }
        
        let currentParentId = parentCompendiumFolderId;

        // Iterate through the path to create folders one by one
        for (const folder of folderPath) {
            const folderKey = `${currentParentId || 'root'}-${folder.name}`;
            let targetFolderId = folderMap.get(folderKey);

            if (!targetFolderId) {
                const newFolder = await Folder.create({
                    name: folder.name,
                    type: folder.type,
                    sorting: folder.sorting,
                    color: folder.color,
                    folder: currentParentId 
                }, { pack: targetPack.collection });

                targetFolderId = newFolder.id;
                folderMap.set(folderKey, targetFolderId);
            }
            currentParentId = targetFolderId;
        }

        return currentParentId;
    }

    /**
     * Exports or updates a single document to a module compendium based on name match.
     * @param {Document} doc - The document to export.
     * @param {CompendiumCollection} targetPack - The compendium to export to.
     * @returns {Promise<Document|null>} The newly created or updated document.
     */
    static async _exportOrUpdateDocument(doc, targetPack) {
        const existingDoc = targetPack.index.find(d => d.name === doc.name);
        const exportData = doc.toObject();
        delete exportData._id;

        foundry.utils.setProperty(exportData, `flags.${this.CONSTANTS.FLAG_SCOPE}.originalUuid`, doc.uuid);

        if (existingDoc) {
            // ui.notifications.info(`Updating existing document "${doc.name}" in compendium "${targetPack.metadata.label}".`);
            exportData._id = existingDoc._id;
            const updateResult = await targetPack.documentClass.updateDocuments([exportData], { pack: targetPack.collection });
            return updateResult[0];
        } else {
            // ui.notifications.info(`Importing new document "${doc.name}" into compendium "${targetPack.metadata.label}".`);
            return await targetPack.importDocument(doc.clone(exportData, { "keepId": false }));
        }
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

        const singleLinkFields = ["linkedActor", "linkedLocation", "parentRegion", "linkedScene", "linkedStandardJournal"];
        for (const field of singleLinkFields) {
            if (newCodexData[field]) newCodexData[field] = relink(newCodexData[field]);
        }

        const multiLinkFields = ["linkedNPCs", "linkedShops", "linkedLocations", "associates", "members"];
        for (const field of multiLinkFields) {
            if (Array.isArray(newCodexData[field])) {
                newCodexData[field] = newCodexData[field].map(relink);
            }
        }

        if (Array.isArray(newCodexData.inventory)) {
            newCodexData.inventory.forEach(item => {
                if (item.itemUuid) item.itemUuid = relink(item.itemUuid);
            });
        }

        foundry.utils.setProperty(updateData, `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_DATA}`, newCodexData);

        const newPages = journal.pages.map(page => {
            const pageData = page.toObject();
            if (pageData.text?.content) {
                pageData.text.content = pageData.text.content.replace(/@UUID\[([^\]]+)\]/g, (match, oldUuid) => {
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
            let compendiumFolder = game.folders.find(f => f.name === FOLDER_NAME && f.type === "Compendium");
            if (!compendiumFolder) {
                compendiumFolder = await Folder.create({
                    name: FOLDER_NAME,
                    type: "Compendium",
                    color: "#198556",
                    sorting: "a"
                });
            }

            const compendiums = {
                journals: await this._createCompendium(`${baseName} - CC Journals`, "JournalEntry", compendiumFolder.id),
                actors: await this._createCompendium(`${baseName} - CC Actors`, "Actor", compendiumFolder.id),
                items: await this._createCompendium(`${baseName} - CC Items`, "Item", compendiumFolder.id)
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
                defaultYes: false
            });
            if (!confirmed) {
                throw new Error(`User cancelled overwrite of compendium: ${name}`);
            }
            await existing.deleteCompendium();
            ui.notifications.info(`Recreating compendium: ${name}`);
        } else {
            ui.notifications.info(`Creating new compendium: ${name}`);
        }

        const pack = await CompendiumCollection.createCompendium({
            type: documentType,
            label: name,
            name: slug,
            pack: packId,
            system: game.system.id
        });

        if (folderId) {
            await pack.setFolder(folderId);
        }

        return pack;
    }
}
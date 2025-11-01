export class SimpleCampaignCodexImporter {
    static CONSTANTS = {
        FLAG_SCOPE: "campaign-codex",
        FLAG_TYPE: "type",
        FLAG_DATA: "data",
    };

    static async importCampaignCodexFromCompendium() {
        try {
            const config = await this._getImportConfig();
            if (!config || config === "cancel") return;

            const compendiums = await this._findRelatedCompendiums(config.journalCompendium);
            if (!compendiums) return;

            ui.notifications.info("Collecting documents from compendiums...");
            const importData = await this._collectImportData(compendiums, config.timestampedFolderId);
            if (importData.journals.size === 0) {
                ui.notifications.warn("No Campaign Codex documents found to import!");
                return;
            }

            const confirmed = await this._confirmImport(importData, config.baseName, config.skipExisting);
            if (!confirmed) return;

            ui.notifications.info(`Importing documents from "${config.baseName}"...`);
            const results = await this._performImport(
                importData,
                config.replaceExisting,
                config.skipExisting,
                config.timestampedFolderId,
                config.baseName, // Pass baseName to extract the pack name
            );

            delete this._folderMaps;
            delete this._timestampedRootId;
            delete this._packParentFolderId; // Clean up the new property
            this._showImportResults(results);
        } catch (error) {
            delete this._folderMaps;
            delete this._timestampedRootId;
            delete this._packParentFolderId;
            console.error("Campaign Codex | Import Error:", error);
            ui.notifications.error(`Import failed: ${error.message}`);
        }
    }
    /**
     * Finds potential Campaign Codex journal compendiums and prompts the user for import settings.
     * @returns {Promise<Object|null>} The user's configuration or null if cancelled.
     */
    static async _getImportConfig() {
        const importOptions = [];

        for (const pack of game.packs) {
            if (pack.documentName !== "JournalEntry") continue;

            try {
                const index = await pack.getIndex({ fields: ["flags"] });
                if (!index.some((entry) => foundry.utils.getProperty(entry, `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_TYPE}`))) {
                    continue;
                }

                if (pack.metadata.packageName !== "world") {
                    const moduleName = game.modules.get(pack.metadata.packageName)?.title || pack.metadata.packageName;
                    const adventurePackFolders = pack.folders.filter((f) => !f.folder && f.name.endsWith("-pack"));

                    if (adventurePackFolders.length > 0) {
                        for (const folder of adventurePackFolders) {
                            const packName = folder.name.replace("-pack", "");
                            const displayLabel = `${pack.metadata.label} (From ${moduleName} - ${packName})`;
                            importOptions.push({
                                pack: pack,
                                label: displayLabel,
                                value: `${pack.collection}:${folder.id}`,
                                folderId: folder.id,
                                packName: packName,
                            });
                        }
                    }
                }

                importOptions.push({
                    pack: pack,
                    label: pack.metadata.label,
                    value: pack.collection,
                    folderId: null,
                    packName: null,
                });
            } catch (error) {
                console.warn(`Campaign Codex | Error checking compendium ${pack.metadata.label}:`, error);
            }
        }

        if (importOptions.length === 0) {
            ui.notifications.warn("No Campaign Codex compendiums found!");
            return null;
        }

        const optionsHTML = importOptions
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
            .join("");

        const content = `
        <div class="form-group campaign-codex" style="flex-direction: column;text-align: left;">
            <label>Select Compendium or Adventure Pack to Import:</label>
            <select name="journalSelection" style="width: 100%;">${optionsHTML}</select>
            <p class="notes">The importer will automatically find related actor, item, and scene compendiums.</p>
        </div>
        <div class="form-group campaign-codex" style="flex-direction: column;text-align: left;border: 1px dotted wheat;padding: 6px;gap: 0px;">
            <label style="margin-block-end: unset;"><input type="checkbox" name="skipExisting" checked /> Skip existing documents. </label>
            <p class="notes"><i class="fas fa-info-circle"></i> If checked, existing actors and items with the same name will be used and not be re-imported.</p>
        </div>
        <div class="form-group campaign-codex" style="flex-direction: column;text-align: left;border: 1px dotted wheat;padding: 6px;gap: 0px;">
            <label style="margin-block-end: unset;"><input type="checkbox" name="replaceExisting" /> Replace existing journals</label>
            <p class="notes"><i class="fas fa-exclamation-triangle"></i> If checked, previously imported journals will be overwritten.</p>
        </div>
    `;

        return await foundry.applications.api.DialogV2.wait({
            window: { title: "Import Campaign Codex" },
            content,
            buttons: [
                {
                    action: "import",
                    icon: '<i class="fas fa-upload"></i>',
                    label: "Import",
                    default: true,
                    callback: (event, button) => {
                        const formData = new FormData(button.form);
                        const data = Object.fromEntries(formData);
                        const selectedOption = importOptions.find((opt) => opt.value === data.journalSelection);
                        return {
                            journalCompendium: selectedOption.pack,
                            timestampedFolderId: selectedOption.folderId,
                            baseName: selectedOption.packName || selectedOption.label,
                            replaceExisting: data.replaceExisting === "on",
                            skipExisting: data.skipExisting === "on",
                        };
                    },
                },
                {
                    action: "cancel",
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => null,
                },
            ],
            rejectClose: true,
        }).catch(() => null);
    }

    /**
     * Finds related Actor, Item, and Scene compendiums based on the chosen Journal compendium.
     * @param {CompendiumCollection} journalPack - The selected journal compendium.
     * @returns {Promise<Object>} An object containing the found compendium packs.
     */
    static async _findRelatedCompendiums(journalPack) {
        const compendiums = { journals: journalPack };
        const packageName = journalPack.metadata.packageName;
        const baseName = journalPack.metadata.label.replace(" - CC Journals", "");

        const potentialPacks = game.packs.filter((p) => p.metadata.packageName === packageName || (packageName === "world" && p.metadata.label.startsWith(baseName)));

        for (const pack of potentialPacks) {
            if (pack === journalPack) continue;
            const label = pack.metadata.label;
            const docName = pack.documentName;

            if (packageName === "world") {
                if (label.includes("- CC Actors")) compendiums.actors = pack;
                else if (label.includes("- CC Items")) compendiums.items = pack;
                else if (label.includes("- CC Scenes")) compendiums.scenes = pack;
            } else {
                if (docName === "Actor" && !compendiums.actors) compendiums.actors = pack;
                else if (docName === "Item" && !compendiums.items) compendiums.items = pack;
                else if (docName === "Scene" && !compendiums.scenes) compendiums.scenes = pack;
            }
        }
        return compendiums;
    }
    /**
     * Gathers all documents that are directly or indirectly linked to the core journal entries.
     * @param {Object} compendiums - The compendium packs to process.
     * @param {string|null} rootFolderId - The ID of the specific folder to import from, if any.
     * @returns {Promise<Object>} An object containing sets of documents to import.
     */
    static async _collectImportData(compendiums, rootFolderId = null) {
        const importData = {
            journals: new Set(),
            actors: new Set(),
            items: new Set(),
            compendiums,
        };
        if (compendiums.scenes) importData.scenes = new Set();
        if (compendiums.journals) {
            let journalDocs = await compendiums.journals.getDocuments();
            if (rootFolderId) {
                journalDocs = journalDocs.filter(doc => this._isEntityInRoot(doc, rootFolderId));
            }
            // const journalDocs = await compendiums.journals.getDocuments();
            journalDocs.forEach((doc) => importData.journals.add(doc));
        }
        const hasCodexJournal = [...importData.journals].some((j) => j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE));
        if (!hasCodexJournal) {
            importData.journals.clear();
            return importData; // Return early if no codex journals are found
        }
        const requiredSceneUuids = new Set();
        if (compendiums.scenes) {
            for (const journal of importData.journals) {
                const sceneUuid = journal.getFlag(this.CONSTANTS.FLAG_SCOPE, `${this.CONSTANTS.FLAG_DATA}.linkedScene`);
                if (sceneUuid) requiredSceneUuids.add(sceneUuid);
            }
        }

        for (const uuid of requiredSceneUuids) {
            const scene = await fromUuid(uuid);
            if (scene?.documentName === "Scene") importData.scenes.add(scene);
        }
        const requiredActorUuids = new Set();
        const requiredItemUuids = new Set();

        const addUuid = (uuid) => {
            if (!uuid || typeof uuid !== "string") return;
            if (uuid.includes(".Actor.")) requiredActorUuids.add(uuid);
            else if (uuid.includes(".Item.")) requiredItemUuids.add(uuid);
        };

        for (const journal of importData.journals) {
            const codexData = journal.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_DATA) || {};

            ["linkedActor", "parentRegion"].forEach((field) => addUuid(codexData[field]));

            ["linkedNPCs", "associates", "members"].forEach((field) => {
                if (Array.isArray(codexData[field])) codexData[field].forEach(addUuid);
            });

            if (Array.isArray(codexData.inventory)) {
                codexData.inventory.forEach((item) => addUuid(item.itemUuid));
            }

              if (Array.isArray(codexData.quests)) {
                for (const quest of codexData.quests) {
                  if (Array.isArray(quest.inventory)) {
                    for (const item of quest.inventory) {
                      addUuid(item.itemUuid);
                    }
                  }
                }
              }



            for (const page of journal.pages) {
                const content = page.text?.content;
                if (!content) continue;
                const matches = content.match(/@UUID\[([^\]]+)\]/g) || [];
                for (const match of matches) {
                    const uuid = match.slice(6, -1); 
                    addUuid(uuid);
                }
            }
        }

        if (importData.scenes && compendiums.actors) {
            for (const scene of importData.scenes) {
                for (const token of scene.tokens) {
                    if (token.actorId) {
                        const actorUuid = `Compendium.${compendiums.actors.collection}.Actor.${token.actorId}`;
                        requiredActorUuids.add(actorUuid);
                    }
                }
            }
        }

        const fetchDocs = async (uuids, targetSet, expectedType) => {
            for (const uuid of uuids) {
                try {
                    const doc = await fromUuid(uuid);
                    if (doc?.documentName === expectedType) targetSet.add(doc);
                } catch (e) {
                    console.warn(`Campaign Codex | Could not resolve UUID: ${uuid}`);
                }
            }
        };

        await Promise.all([
            fetchDocs(requiredActorUuids, importData.actors, "Actor"),
            fetchDocs(requiredItemUuids, importData.items, "Item"),
        ]);

        return importData;
    }


    static _relinkSceneData(scene, uuidMap, compendiums) {
        const tokenUpdates = [];
        const noteUpdates = [];

        if (compendiums.actors) {
            for (const token of scene.tokens) {
                const originalActorUuid = `Compendium.${compendiums.actors.collection}.Actor.${token.actorId}`;
                const newActorUuid = uuidMap.get(originalActorUuid);

                if (newActorUuid) {
                    const newActorId = newActorUuid.split(".").pop();
                    if (token.actorId !== newActorId) {
                        tokenUpdates.push({ _id: token.id, actorId: newActorId });
                    }
                }
            }
        }

        if (compendiums.journals) {
            for (const note of scene.notes) {
                const originalJournalUuid = `Compendium.${compendiums.journals.collection}.JournalEntry.${note.entryId}`;
                const newJournalUuid = uuidMap.get(originalJournalUuid);

                if (newJournalUuid) {
                    const newJournalId = newJournalUuid.split(".").pop();
                    if (note.entryId !== newJournalId) {
                        noteUpdates.push({ _id: note.id, entryId: newJournalId });
                    }
                }
            }
        }

        const updateData = { _id: scene.id };
        let needsUpdate = false;
        if (tokenUpdates.length > 0) {
            updateData.tokens = tokenUpdates;
            needsUpdate = true;
        }
        if (noteUpdates.length > 0) {
            updateData.notes = noteUpdates;
            needsUpdate = true;
        }

        return needsUpdate ? updateData : null;
    }

    /**
     * Main import loop that processes all documents.
     */
    static async _performImport(importData, replaceExisting, skipExisting, timestampedFolderId, baseName) {
        const uuidMap = new Map();
        const results = { imported: {}, skipped: {}, replaced: {}, failed: {} };
        ["actors", "items", "scenes", "journals"].forEach((type) => {
            results.imported[type] = 0;
            results.skipped[type] = 0;
            results.replaced[type] = 0;
            results.failed[type] = 0;
        });

        this._timestampedRootId = timestampedFolderId;
        this._packParentFolderId = null;

        if (this._timestampedRootId) {
              const packName = baseName || "Imported Pack";

            let parentFolder = game.folders.find((f) => f.name === packName && f.type === "JournalEntry" && !f.folder);
            if (!parentFolder) {
                parentFolder = await Folder.create({ name: packName, type: "JournalEntry", parent: null });
            }
            this._packParentFolderId = parentFolder.id;
        }

        game.campaignCodexImporting = true;
        try {
            ui.notifications.info("Importing folder structures...");
            await this._importAllFolderStructures(importData);

            const typesToProcess = ["actors", "items", "scenes", "journals"];
            for (const type of typesToProcess) {
                if (!importData[type]) continue;

                for (const doc of importData[type]) {
                    if (this._timestampedRootId && type === "journals" && !this._isEntityInRoot(doc, this._timestampedRootId)) {
                        continue;
                    }

                    const canReplace = type === "journals" && replaceExisting;
                    const shouldSkip = ["actors", "items", "scenes"].includes(type) && skipExisting;

                    const result = await this._importDocument(doc, canReplace, shouldSkip);
                    if (result.document) {
                        uuidMap.set(doc.uuid, result.document.uuid);
                        results[result.action][type]++;
                    } else {
                        results.failed[type]++;
                    }
                }
            }

            ui.notifications.info("Relinking imported documents...");
            const updates = [];
            for (const [oldUuid, newUuid] of uuidMap) {
                const newDoc = await fromUuid(newUuid);
                if (newDoc?.documentName === "JournalEntry") {
                    const updateData = this._prepareJournalUpdate(newDoc, uuidMap);
                    if (updateData) updates.push(updateData);
                }
            }
            if (updates.length > 0) {
                await JournalEntry.updateDocuments(updates);
            }
            if (importData.scenes) {
                ui.notifications.info("Relinking imported scenes...");
                const sceneUpdates = [];
                for (const [oldUuid, newUuid] of uuidMap) {
                    const newDoc = await fromUuid(newUuid);
                    if (newDoc?.documentName === "Scene") {
                        const updateData = this._relinkSceneData(newDoc, uuidMap, importData.compendiums);
                        if (updateData) sceneUpdates.push(updateData);
                    }
                }
                if (sceneUpdates.length > 0) {
                    await Scene.updateDocuments(sceneUpdates);
                }
            }
            return results;
        } finally {
            delete game.campaignCodexImporting;
        }
    }
    /**
     * Recursively checks if an entity (document or folder) is a descendant of the specified root folder.
     * @param {Document|Folder} entity - The document or folder to check.
     * @param {string} rootId - The ID of the root folder.
     * @returns {boolean} True if the entity is in the folder tree.
     */
    static _isEntityInRoot(entity, rootId) {
        if (entity.id === rootId) {
            return true;
        }

        let current = entity.folder;
        while (current) {
            if (current.id === rootId) return true;
            current = current.folder;
        }
        return false;
    }

/**
 * Checks if a compendium folder or any of its subfolders will contain importable documents.
 * @param {Folder} folder         - The compendium folder to check.
 * @param {Set<Document>} docsToImport - The set of documents that will be imported.
 * @returns {boolean}
 */
static _folderContainsImportableDocs(folder, docsToImport) {
    for (const doc of docsToImport) {
        if (this._isEntityInRoot(doc, folder.id)) {
            return true; 
        }
    }
    return false; 
}
    /**
     * Recreates the folder structures, skipping folders that won't contain any imported documents.
     * @param {Object} importData - The full import data object.
     */
    static async _importAllFolderStructures(importData) {
        this._folderMaps = {
            JournalEntry: new Map(),
            Actor: new Map(),
            Item: new Map(),
            Scene: new Map(),
        };

        const { compendiums } = importData;
        const packsToProcess = Object.values(compendiums).filter(
            (p) => p && p.folders?.size > 0,
        );

        for (const pack of packsToProcess) {
            const documentType = pack.documentName;
            const folderMap = this._folderMaps[documentType];
            const documentsToImport = importData[`${documentType.toLowerCase()}s`];

            let compendiumFolders = Array.from(pack.folders.values());

            // Special filtering for adventure packs (only import folders within the selected pack folder)
            if (documentType === "JournalEntry" && this._timestampedRootId) {
                compendiumFolders = compendiumFolders.filter((folder) =>
                    this._isEntityInRoot(folder, this._timestampedRootId),
                );
            }

            const sortedFolders = this._sortFoldersByDepth(compendiumFolders);

            for (const compendiumFolder of sortedFolders) {
                // Don't recreate the root folder of an adventure pack
                if (compendiumFolder.id === this._timestampedRootId) {
                    continue;
                }

                // For selectively imported types, check if the folder will contain anything before creating it.
                if (["Scene", "Actor", "Item"].includes(documentType)) {
                    if (!this._folderContainsImportableDocs(compendiumFolder, documentsToImport)) {
                        continue;
                    }
                }

                await this._importFolder(
                    compendiumFolder,
                    documentType,
                    folderMap,
                );
            }
        }
    }


    static _sortFoldersByDepth(folders) {
        const folderMap = new Map(folders.map((f) => [f.id, f]));
        const getDepth = (folder) => {
            let depth = 0;
            let current = folder;
            while (current.folder) {
                depth++;
                current = folderMap.get(current.folder.id);
                if (!current || depth > 20) break;
            }
            return depth;
        };
        return folders.sort((a, b) => getDepth(a) - getDepth(b));
    }

    static async _importFolder(compendiumFolder, documentType, folderMap) {
        if (folderMap.has(compendiumFolder.id)) {
            return folderMap.get(compendiumFolder.id);
        }

        let parentId = null;
        const compendiumParentId = compendiumFolder.folder?.id;
        if (compendiumParentId) {
            if (compendiumParentId === this._timestampedRootId) {
                // If the parent is the root pack folder, use the new world folder we created.
                parentId = this._packParentFolderId;
            } else {
                // Otherwise, find the parent's new ID from the map of already-created folders.
                parentId = folderMap.get(compendiumParentId);
            }
        }

        let worldFolder = game.folders.find((f) => f.name === compendiumFolder.name && f.type === documentType && (f.folder?.id || null) === parentId);

        if (!worldFolder) {
            worldFolder = await Folder.create({
                name: compendiumFolder.name,
                type: documentType,
                color: compendiumFolder.color,
                sorting: compendiumFolder.sorting,
                folder: parentId,
            });
        }

        folderMap.set(compendiumFolder.id, worldFolder.id);
        return worldFolder.id;
    }

    /**
     * Imports a single document, with special handling for journals to prevent duplicates.
     */
    static async _importDocument(compendiumDoc, canReplace, shouldSkip) {
        try {
            const docType = compendiumDoc.documentName;
            const folderMap = this._folderMaps[docType];
            let targetFolderId = null;

            const compendiumFolderId = compendiumDoc.folder?.id;
            if (compendiumFolderId) {
                if (compendiumFolderId === this._timestampedRootId) {
                    targetFolderId = this._packParentFolderId;
                } else {
                    targetFolderId = folderMap.get(compendiumFolderId);
                }
            }

            const isCodexJournal = docType === "JournalEntry" && compendiumDoc.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE);

            let existingDoc;
            if (docType === "JournalEntry") {
                existingDoc = game.journal.find((j) => j.getFlag(this.CONSTANTS.FLAG_SCOPE, "sourceUuid") === compendiumDoc.uuid);
            } else {
                existingDoc = game.collections.get(docType)?.find((d) => d.name === compendiumDoc.name);
            }

            if (existingDoc) {
                if (shouldSkip) {
                    if (targetFolderId && existingDoc.folder?.id !== targetFolderId) {
                        await existingDoc.update({ folder: targetFolderId });
                    }
                    return { document: existingDoc, action: "skipped" };
                }
                if (canReplace && isCodexJournal) {
                    const newDoc = await this._replaceDocument(existingDoc, compendiumDoc, targetFolderId);
                    return { document: newDoc, action: "replaced" };
                }
                return { document: existingDoc, action: "skipped" };
            }

            const newDoc = await this._createDocument(compendiumDoc, targetFolderId);
            return { document: newDoc, action: "imported" };
        } catch (error) {
            console.error(`Campaign Codex | Failed to import ${compendiumDoc.documentName} "${compendiumDoc.name}":`, error);
            return { document: null, action: "failed" };
        }
    }

    /**
     * Creates a new document, adding a sourceUuid flag for journals.
     */
    static async _createDocument(compendiumDoc, targetFolderId) {
        const docData = compendiumDoc.toObject();
        delete docData._id;
        docData.folder = targetFolderId;

        if (compendiumDoc.documentName === "JournalEntry") {
            foundry.utils.setProperty(docData, `flags.${this.CONSTANTS.FLAG_SCOPE}.sourceUuid`, compendiumDoc.uuid);
        }

        const DocumentClass = getDocumentClass(compendiumDoc.documentName);
        return await DocumentClass.create(docData, {
            campaignCodexImport: true,
        });
    }

    static async _replaceDocument(existingDoc, compendiumDoc, targetFolderId) {
        const updateData = compendiumDoc.toObject();
        updateData._id = existingDoc.id;
        updateData.folder = targetFolderId || existingDoc.folder?.id || null;
        delete updateData.flags?.[this.CONSTANTS.FLAG_SCOPE]?.originalUuid;
        const DocumentClass = getDocumentClass(compendiumDoc.documentName);
        const [updatedDoc] = await DocumentClass.updateDocuments([updateData]);
        return updatedDoc;
    }

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
                return relink(oldUuid);
            });
        }

        ["linkedNPCs", "linkedShops", "linkedLocations", "linkedRegions", "associates", "members"].forEach((field) => {
            if (Array.isArray(newCodexData[field])) newCodexData[field] = newCodexData[field].map(relink);
        });

        if (Array.isArray(newCodexData.inventory)) {
            newCodexData.inventory.forEach((item) => {
                if (item.itemUuid) item.itemUuid = relink(item.itemUuid);
            });
        }
    if (Array.isArray(newCodexData.quests)) {
        newCodexData.quests.forEach((quest) => {
            if (Array.isArray(quest.inventory)) {
                quest.inventory.forEach((item) => {
                    if (item.itemUuid) {
                        item.itemUuid = relink(item.itemUuid);
                    }
                });
            }
        });
    }


        foundry.utils.setProperty(updateData, `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_DATA}`, newCodexData);

        updateData.pages = journal.pages.map((page) => {
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

        return updateData;
    }

    /**
     * Prompts the user to confirm the details of an import.
     * @param {object} importData - The collected data to be imported.
     * @param {string} baseName - The name of the compendium set being imported.
     * @param {boolean} skipExisting - Whether existing documents will be skipped.
     * @returns {Promise<boolean>} - True if the user confirms, false otherwise.
     */
    static async _confirmImport(importData, baseName, skipExisting) {
        const codexJournals = [...importData.journals].filter((j) => j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE));
        const standardJournalsCount = importData.journals.size - codexJournals.length;

        let journalInfo = `<li><strong>${codexJournals.length}</strong> Campaign Codex journals</li>`;
        if (standardJournalsCount > 0) {
            journalInfo += `<li><strong>${standardJournalsCount}</strong> linked standard journals</li>`;
        }
        const sceneInfo = importData.scenes ? `<li><strong>${importData.scenes.size}</strong> scenes</li>` : "";
        const skipInfo = skipExisting ? '<p class="notes"><i class="fas fa-info-circle"></i> Existing actors and items will be skipped.</p>' : "";

        const content = `
        <div class="flexcol">
            <p>Ready to import from "<strong>${baseName}</strong>":</p>
            <ul style="margin: 0.5rem 0;">
                ${journalInfo}
                <li><strong>${importData.actors.size}</strong> actors</li>
                <li><strong>${importData.items.size}</strong> items</li>
                ${sceneInfo}
            </ul>
            ${skipInfo}
            <p><em>All relationships and folder structures will be preserved.</em></p>
        </div>`;

        return await foundry.applications.api.DialogV2.confirm({
            window: { title: "Confirm Import" },
            content: content,
            yes: {
                label: "Import Now",
                icon: '<i class="fas fa-check"></i>',
            },
            no: {
                label: "Cancel",
                icon: '<i class="fas fa-times"></i>',
                default: true,
            },
        });
    }

    static _showImportResults(results) {
        const total = (type) => Object.values(results[type]).reduce((sum, count) => sum + count, 0);
        const totalImported = total("imported");
        const totalSkipped = total("skipped");
        const totalReplaced = total("replaced");
        const totalFailed = total("failed");
        let message = `Import complete!`;
        const details = [];
        if (totalImported > 0) details.push(`✓ Imported: ${totalImported}`);
        if (totalSkipped > 0) details.push(`↻ Skipped/Used Existing: ${totalSkipped}`);
        if (totalReplaced > 0) details.push(`↺ Replaced: ${totalReplaced}`);
        if (totalFailed > 0) details.push(`✗ Failed: ${totalFailed}`);
        if (details.length > 0) message += `\n${details.join("\n")}`;
        console.log("Campaign Codex | Import Results:", results);
        ui.notifications.info(message);
    }
}
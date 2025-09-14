export class SimpleCampaignCodexImporter {
    static CONSTANTS = {
        FLAG_SCOPE: "campaign-codex",
        FLAG_TYPE: "type",
        FLAG_DATA: "data",
    };

    /**
     * Main entry point to start the import process.
     */
    static async importCampaignCodexFromCompendium() {
        try {
            const config = await this._getImportConfig();
            if (!config) return;

            const compendiums = await this._findRelatedCompendiums(
                config.journalCompendium,
            );
            if (!compendiums) return;

            ui.notifications.info("Collecting documents from compendiums...");
            const importData = await this._collectImportData(compendiums);
            if (importData.journals.size === 0) {
                ui.notifications.warn(
                    "No Campaign Codex documents found to import!",
                );
                return;
            }

            const confirmed = await this._confirmImport(
                importData,
                config.baseName,
                config.skipExisting,
            );
            if (!confirmed) return;

            ui.notifications.info(
                `Importing documents from "${config.baseName}"...`,
            );
            const results = await this._performImport(
                importData,
                config.replaceExisting,
                config.skipExisting,
                config.timestampedFolderId,
            );

            delete this._folderMaps;
            delete this._timestampedRootId;
            this._showImportResults(results);
        } catch (error) {
            delete this._folderMaps;
            delete this._timestampedRootId;
            console.error("Campaign Codex | Import Error:", error);
            ui.notifications.error(`Import failed: ${error.message}`);
        }
    }

    /**
     * Finds potential Campaign Codex journal compendiums and prompts the user for import settings.
     * This version correctly lists world compendiums, module compendiums with timestamped folders,
     * and module compendiums without them.
     * @returns {Promise<Object|null>} The user's configuration or null if cancelled.
     */
    static async _getImportConfig() {
        const importOptions = [];

        for (const pack of game.packs) {
            if (pack.documentName !== "JournalEntry") continue;

            try {
                const index = await pack.getIndex({ fields: ["flags"] });
                if (
                    !index.some((entry) =>
                        foundry.utils.getProperty(
                            entry,
                            `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_TYPE}`,
                        ),
                    )
                ) {
                    continue;
                }

                if (pack.metadata.packageName !== "world") {
                    const moduleName =
                        game.modules.get(pack.metadata.packageName)?.title ||
                        pack.metadata.packageName;
                    const timestampedFolders = pack.folders.filter(
                        (f) => !f.folder && / - \d+ - \d+$/.test(f.name),
                    );

                    if (timestampedFolders.length > 0) {
                        for (const folder of timestampedFolders) {
                            const timestamp = folder.name
                                .split(" - ")
                                .slice(1)
                                .join(" - ");
                            const displayLabel = `${pack.metadata.label} (From ${moduleName} - Export: ${timestamp})`;
                            importOptions.push({
                                pack: pack,
                                label: displayLabel,
                                value: `${pack.collection}:${folder.id}`,
                                folderId: folder.id,
                            });
                        }

                        continue;
                    }
                }

                importOptions.push({
                    pack: pack,
                    label: pack.metadata.label,
                    value: pack.collection,
                    folderId: null,
                });
            } catch (error) {
                console.warn(
                    `Campaign Codex | Error checking compendium ${pack.metadata.label}:`,
                    error,
                );
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

        return new Promise((resolve) => {
            new Dialog({
                title: "Import Campaign Codex",
                content: `
                    <form class="flexcol">
                        <div class="form-group" style="flex-direction: column;text-align: left;">
                            <label>Select Compendium or Export to Import:</label>
                            <select name="journalSelection" style="width: 100%;">${optionsHTML}</select>
                            <p class="notes">The importer will automatically find related actor, item, and scene compendiums.</p>
                        </div>
                        <div class="form-group" style="flex-direction: column;text-align: left;">
                            <label><input type="checkbox" name="skipExisting" checked /> Skip existing documents</label>
                            <p class="notes"><i class="fas fa-info-circle"></i> If checked, existing actors and items with the same name will be used and not be re-imported.</p>
                        </div>
                        <div class="form-group" style="flex-direction: column;text-align: left;">
                            <label><input type="checkbox" name="replaceExisting" /> Replace existing journals</label>
                            <p class="notes"><i class="fas fa-exclamation-triangle"></i> If checked, existing Campaign Codex journals with the same name will be overwritten.</p>
                        </div>
                    </form>
                `,
                buttons: {
                    import: {
                        icon: '<i class="fas fa-upload"></i>',
                        label: "Import",
                        callback: (html) => {
                            const form = html[0].querySelector("form");
                            const selectionValue =
                                form.elements.journalSelection.value;
                            const replaceExisting =
                                form.elements.replaceExisting.checked;
                            const skipExisting =
                                form.elements.skipExisting.checked;
                            const selectedOption = importOptions.find(
                                (opt) => opt.value === selectionValue,
                            );

                            resolve({
                                journalCompendium: selectedOption.pack,
                                timestampedFolderId: selectedOption.folderId,
                                baseName: selectedOption.label,
                                replaceExisting,
                                skipExisting,
                            });
                        },
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve(null),
                    },
                },
                default: "import",
            }).render(true);
        });
    }

    /**
     * Finds related Actor, Item, and Scene compendiums based on the chosen Journal compendium.
     * @param {CompendiumCollection} journalPack - The selected journal compendium.
     * @returns {Promise<Object>} An object containing the found compendium packs.
     */
    static async _findRelatedCompendiums(journalPack) {
        const compendiums = { journals: journalPack };
        const packageName = journalPack.metadata.packageName;
        const baseName = journalPack.metadata.label.replace(
            " - CC Journals",
            "",
        );

        const potentialPacks = game.packs.filter(
            (p) =>
                p.metadata.packageName === packageName ||
                (packageName === "world" &&
                    p.metadata.label.startsWith(baseName)),
        );

        for (const pack of potentialPacks) {
            if (pack === journalPack) continue;
            const label = pack.metadata.label;
            const docName = pack.documentName;

            if (packageName === "world") {
                if (label.includes("- CC Actors")) compendiums.actors = pack;
                else if (label.includes("- CC Items")) compendiums.items = pack;
                else if (label.includes("- CC Scenes"))
                    compendiums.scenes = pack;
            } else {
                if (docName === "Actor" && !compendiums.actors)
                    compendiums.actors = pack;
                else if (docName === "Item" && !compendiums.items)
                    compendiums.items = pack;
                else if (docName === "Scene" && !compendiums.scenes)
                    compendiums.scenes = pack;
            }
        }
        return compendiums;
    }

    /**
     * Gathers all documents from the set of compendiums.
     * @param {Object} compendiums - The compendium packs to process.
     * @returns {Promise<Object>} An object containing sets of documents to import.
     */
    static async _collectImportData(compendiums) {
        const importData = {
            journals: new Set(),
            actors: new Set(),
            items: new Set(),
            compendiums,
        };
        if (compendiums.scenes) importData.scenes = new Set();
        const processPack = async (pack, type) => {
            if (!pack) return;
            const docs = await pack.getDocuments();
            docs.forEach((doc) => importData[type].add(doc));
        };
        await Promise.all([
            processPack(compendiums.journals, "journals"),
            processPack(compendiums.actors, "actors"),
            processPack(compendiums.items, "items"),
            processPack(compendiums.scenes, "scenes"),
        ]);
        // JOURNAL ADDITION
        const hasCodexJournal = [...importData.journals].some((j) =>
            j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE),
        );
        if (!hasCodexJournal) {
            importData.journals.clear();
        }
        // JOURNAL ADDITION
        return importData;
    }

    /**
     * Main import loop that processes all documents.
     * @param {Object} importData - The data to import.
     * @param {boolean} replaceExisting - Whether to overwrite existing journals.
     * @param {boolean} skipExisting - Whether to skip existing actors/items.
     * @param {string|null} timestampedFolderId - The specific folder ID of the export to process.
     * @returns {Promise<Object>} The results of the import.
     */
    static async _performImport(
        importData,
        replaceExisting,
        skipExisting,
        timestampedFolderId,
    ) {
        const uuidMap = new Map();
        const results = { imported: {}, skipped: {}, replaced: {}, failed: {} };
        ["actors", "items", "scenes", "journals"].forEach((type) => {
            results.imported[type] = 0;
            results.skipped[type] = 0;
            results.replaced[type] = 0;
            results.failed[type] = 0;
        });

        this._timestampedRootId = timestampedFolderId;

        game.campaignCodexImporting = true;
        try {
            ui.notifications.info("Importing folder structures...");
            await this._importAllFolderStructures(importData.compendiums);

            const typesToProcess = ["actors", "items", "scenes", "journals"];

            for (const type of typesToProcess) {
                if (!importData[type]) continue;

                for (const doc of importData[type]) {
                    if (
                        this._timestampedRootId &&
                        type === "journals" &&
                        !this._isEntityInRoot(doc, this._timestampedRootId)
                    ) {
                        continue;
                    }

                    const canReplace = type === "journals" && replaceExisting;
                    const shouldSkip =
                        ["actors", "items"].includes(type) && skipExisting;

                    const result = await this._importDocument(
                        doc,
                        canReplace,
                        shouldSkip,
                    );
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
                    const updateData = this._prepareJournalUpdate(
                        newDoc,
                        uuidMap,
                    );
                    if (updateData) updates.push(updateData);
                }
            }
            if (updates.length > 0) {
                await JournalEntry.updateDocuments(updates);
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
     * Recreates the folder structures from all compendiums into the world. If a specific timestamped
     * export is chosen, it will strictly only create the folders belonging to that export.
     * @param {Object} compendiums - The compendium packs.
     */
    static async _importAllFolderStructures(compendiums) {
        this._folderMaps = {
            JournalEntry: new Map(),
            Actor: new Map(),
            Item: new Map(),
            Scene: new Map(),
        };
        const packsToProcess = Object.values(compendiums).filter(
            (p) => p && p.folders?.size > 0,
        );

        for (const pack of packsToProcess) {
            const documentType = pack.documentName;
            const folderMap = this._folderMaps[documentType];
            let compendiumFolders = Array.from(pack.folders.values());

            if (documentType === "JournalEntry" && this._timestampedRootId) {
                compendiumFolders = compendiumFolders.filter((folder) =>
                    this._isEntityInRoot(folder, this._timestampedRootId),
                );
            }

            const sortedFolders = this._sortFoldersByDepth(compendiumFolders);

            for (const compendiumFolder of sortedFolders) {
                if (compendiumFolder.id === this._timestampedRootId) {
                    continue;
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

        if (
            compendiumParentId &&
            compendiumParentId !== this._timestampedRootId
        ) {
            parentId = folderMap.get(compendiumParentId);
        }

        let worldFolder = game.folders.find(
            (f) =>
                f.name === compendiumFolder.name &&
                f.type === documentType &&
                (f.folder?.id || null) === parentId,
        );

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

    static async _importDocument(compendiumDoc, canReplace, shouldSkip) {
        try {
            const docType = compendiumDoc.documentName;
            const existingDoc = game.collections
                .get(docType)
                ?.find((d) => d.name === compendiumDoc.name);
            const folderMap = this._folderMaps[docType];
            let targetFolderId = null;

            const compendiumFolderId = compendiumDoc.folder?.id;
            if (compendiumFolderId) {
                if (compendiumFolderId === this._timestampedRootId) {
                    targetFolderId = null;
                } else {
                    targetFolderId = folderMap.get(compendiumFolderId);
                }
            }
            // JOURNAL ADDITION
            const isCodexJournal =
                compendiumDoc.documentName === "JournalEntry" &&
                compendiumDoc.getFlag(
                    this.CONSTANTS.FLAG_SCOPE,
                    this.CONSTANTS.FLAG_TYPE,
                );

            if (existingDoc) {
                if (shouldSkip) {
                    if (
                        targetFolderId &&
                        existingDoc.folder?.id !== targetFolderId
                    ) {
                        await existingDoc.update({ folder: targetFolderId });
                    }
                    return { document: existingDoc, action: "skipped" };
                }
                // JOURNAL ADDITION
                if (canReplace && isCodexJournal) {
                    const newDoc = await this._replaceDocument(
                        existingDoc,
                        compendiumDoc,
                        targetFolderId,
                    );
                    return { document: newDoc, action: "replaced" };
                }
                return { document: existingDoc, action: "skipped" };
            }

            const newDoc = await this._createDocument(
                compendiumDoc,
                targetFolderId,
            );
            return { document: newDoc, action: "imported" };
        } catch (error) {
            console.error(
                `Campaign Codex | Failed to import ${compendiumDoc.documentName} "${compendiumDoc.name}":`,
                error,
            );
            return { document: null, action: "failed" };
        }
    }

    static async _createDocument(compendiumDoc, targetFolderId) {
        const docData = compendiumDoc.toObject();
        delete docData._id;
        delete docData.flags?.[this.CONSTANTS.FLAG_SCOPE]?.originalUuid;
        docData.folder = targetFolderId;
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
        const oldCodexData =
            journal.getFlag(
                this.CONSTANTS.FLAG_SCOPE,
                this.CONSTANTS.FLAG_DATA,
            ) || {};
        const newCodexData = foundry.utils.deepClone(oldCodexData);
        const relink = (uuid) => uuidMap.get(uuid) || uuid;

        const singleLinkFields = [
            "linkedActor",
            "linkedLocation",
            "parentRegion",
            "linkedScene",
            // "linkedStandardJournal",
        ];

        for (const field of singleLinkFields) {
            if (newCodexData[field]) {
                newCodexData[field] = relink(newCodexData[field]);
            }
        }

        // HANDLE LINKED STANDARD JOURNALS ARRAY
        if (Array.isArray(newCodexData.linkedStandardJournals)) {
            newCodexData.linkedStandardJournals = newCodexData.linkedStandardJournals.map(oldUuid => {
                // Relink the whole UUID, whether it's a page or a journal
                return relink(oldUuid);
            });
        }


        [
            "linkedNPCs",
            "linkedShops",
            "linkedLocations",
            "associates",
            "members",
        ].forEach((field) => {
            if (Array.isArray(newCodexData[field]))
                newCodexData[field] = newCodexData[field].map(relink);
        });

        if (Array.isArray(newCodexData.inventory)) {
            newCodexData.inventory.forEach((item) => {
                if (item.itemUuid) item.itemUuid = relink(item.itemUuid);
            });
        }

        foundry.utils.setProperty(
            updateData,
            `flags.${this.CONSTANTS.FLAG_SCOPE}.${this.CONSTANTS.FLAG_DATA}`,
            newCodexData,
        );

        updateData.pages = journal.pages.map((page) => {
            const pageData = page.toObject();
            if (pageData.text?.content) {
                pageData.text.content = pageData.text.content.replace(
                    /@UUID\[([^\]]+)\]/g,
                    (match, oldUuid) => {
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
                    },
                );
            }
            return pageData;
        });

        return updateData;
    }

    static async _confirmImport(importData, baseName, skipExisting) {
        return new Promise((resolve) => {
            // JOURNAL ADDITION
            const codexJournals = [...importData.journals].filter((j) =>
                j.getFlag(this.CONSTANTS.FLAG_SCOPE, this.CONSTANTS.FLAG_TYPE),
            );
            const standardJournalsCount =
                importData.journals.size - codexJournals.length;

            let journalInfo = `<li><strong>${codexJournals.length}</strong> Campaign Codex journals</li>`;
            if (standardJournalsCount > 0) {
                journalInfo += `<li><strong>${standardJournalsCount}</strong> linked standard journals</li>`;
            }
            //
            const sceneInfo = importData.scenes
                ? `<li><strong>${importData.scenes.size}</strong> scenes</li>`
                : "";
            const skipInfo = skipExisting
                ? '<p class="notes"><i class="fas fa-info-circle"></i> Existing actors and items will be skipped.</p>'
                : "";
            new Dialog({
                title: "Confirm Import",
                content: `
                    <div class="flexcol">
                        <p>Ready to import from "<strong>${baseName}</strong>":</p>
                        <ul style="margin: 0.5rem 0;">
                            ${journalInfo}
                            <li><strong>${importData.journals.size}</strong> Campaign Codex journals</li>
                            <li><strong>${importData.actors.size}</strong> actors</li>
                            <li><strong>${importData.items.size}</strong> items</li>
                            ${sceneInfo}
                        </ul>
                        ${skipInfo}
                        <p><em>All relationships and folder structures will be preserved.</em></p>
                    </div>`,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Import Now",
                        callback: () => resolve(true),
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve(false),
                    },
                },
                default: "confirm",
            }).render(true);
        });
    }

    static _showImportResults(results) {
        const total = (type) =>
            Object.values(results[type]).reduce((sum, count) => sum + count, 0);
        const totalImported = total("imported");
        const totalSkipped = total("skipped");
        const totalReplaced = total("replaced");
        const totalFailed = total("failed");
        let message = `Import complete!`;
        const details = [];
        if (totalImported > 0) details.push(`✓ Imported: ${totalImported}`);
        if (totalSkipped > 0)
            details.push(`↻ Skipped/Used Existing: ${totalSkipped}`);
        if (totalReplaced > 0) details.push(`↺ Replaced: ${totalReplaced}`);
        if (totalFailed > 0) details.push(`✗ Failed: ${totalFailed}`);
        if (details.length > 0) message += `\n${details.join("\n")}`;
        console.log("Campaign Codex | Import Results:", results);
        ui.notifications.info(message);
    }
}

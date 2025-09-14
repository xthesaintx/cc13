import { CampaignCodexLinkers } from "./linkers.js";
import { TemplateComponents } from "./template-components.js";
import { localize, format } from "../helper.js";

export class CampaignCodexBaseSheet extends foundry.appv1.sheets.JournalSheet {
  // =========================================================================
  // Static Methods & Configuration
  // =========================================================================

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "journal-sheet", "campaign-codex"],
      width: 1000,
      height: 700,
      resizable: true,
      minimizable: true,
    });
  }

  /**
   * Checks if the current user is an Observer, Owner, or GM for a document.
   * @param {Document} doc - The document to check.
   * @returns {boolean}
   */
  static isObserverOrHigher(doc) {
    if (!doc) return false;
    return doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
  }

  /**
   * Checks if the current user is an Owner or GM for a document.
   * @param {Document} doc - The document to check.
   * @returns {boolean}
   */
  static isOwnerOrHigher(doc) {
    if (!doc) return false;
    return doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  }

  /**
   * Checks if the current user has Observer permission or higher for a document from its UUID.
   * @param {string} uuid The UUID of the document to check.
   * @returns {Promise<boolean>} True if the user can view, otherwise false.
   */
  static async canUserView(uuid) {
    if (game.user.isGM) return true;
    if (!uuid) return false;

    try {
      const doc = await fromUuid(uuid);
      if (!doc) return false;
      return doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
    } catch (error) {
      console.warn(`Campaign Codex | Could not resolve UUID for permission check: ${uuid}`, error);
      return false;
    }
  }

  /**
   * Generates the HTML for the GM Notes tab.
   * @param {Document} doc - The document entity.
   * @param {object} data - The sheet's prepared data.
   * @returns {string}
   */
  static generateNotesTab(doc, data) {
    return `
      ${TemplateComponents.contentHeader("fas fa-sticky-note", "GM Notes")}
      ${TemplateComponents.richTextSection(doc, data.sheetData.enrichedNotes, "notes", data.isOwnerOrHigher)}
    `;
  }

  // =========================================================================
  // Core Application Lifecycle
  // =========================================================================

  constructor(document, options = {}) {
    super(document, options);
    this._currentTab = "info";
    this._processedData = null;
    this.secrets = new foundry.applications.ux.HTMLSecret({
      parentSelector: ".cc-enriched",
      callbacks: {
        content: this._getSecretContent.bind(this),
        update: this._updateSecret.bind(this),
      },
    });
  }

async _render(force, options) {
  if (force) {
    this._processedData = null;
  }
  return super._render(force, options);
}

  async getData() {
    const data = await super.getData();
    const sheetData = this.document.getFlag("campaign-codex", "data") || {};
    data.isGM = game.user.isGM;
    data.isObserver = this.constructor.isObserverOrHigher(this.document);
    data.isOwnerOrHigher = this.constructor.isOwnerOrHigher(this.document);

    data.sheetData = {
      description: sheetData.description || "",
      notes: sheetData.notes || "",
    };

    // Enrich Description
    let description = data.sheetData.description;
    if (Array.isArray(description)) {
      description = description[0] || "";
    }
    data.sheetData.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(description, { async: true, secrets: this.document.isOwner });

    // Enrich Notes
    let notes = data.sheetData.notes;
    if (Array.isArray(notes)) {
      notes = notes[0] || "";
    }
    data.sheetData.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(notes, { async: true, secrets: this.document.isOwner });

    data.canEdit = this.document.canUserModify(game.user, "update");
    data.currentTab = this._currentTab;

    // Process Linked Journal
  data.linkedStandardJournals = []; // Plural
  if (sheetData.linkedStandardJournals && Array.isArray(sheetData.linkedStandardJournals)) {
    const journalPromises = sheetData.linkedStandardJournals.map(async (uuid) => {
        try {
            const document = await fromUuid(uuid);
            if (!document) {
                console.warn(`Campaign Codex | Linked standard journal not found: ${uuid}`);
                return null;
            }

            let journal;
            let displayName;

            if (document instanceof JournalEntryPage) {
                journal = document.parent;
                displayName = `${journal.name}: ${document.name}`;
            } else {
                journal = document; // Assume it's a Journal Entry
                displayName = journal.name;
            }

            if (journal) {
                return {
                    uuid: document.uuid,
                    name: displayName,
                    img: journal.img || "icons/svg/book.svg",
                    canView: await this.constructor.canUserView(document.uuid),
                };
            }
            return null;
        } catch (error) {
            console.warn(`Campaign Codex | Error processing linked journal ${uuid}:`, error);
            return null;
        }
    });

    const resolvedJournals = await Promise.all(journalPromises);
    data.linkedStandardJournals = resolvedJournals.filter(j => j && j.canView);
  }
    return data;
  }

  activateListeners(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;
    super.activateListeners(html);

    // Bind all listeners
    this.secrets.bind(nativeHtml);
    this._activateTabs(nativeHtml);
    this._setupDropZones(nativeHtml);
    this._setupNameEditing(nativeHtml);
    this._setupImageChange(nativeHtml);
    this._activateJournalListeners(nativeHtml);
    this._activateEditorListeners(nativeHtml);
    this._addClassToEditorContent(nativeHtml);
    this._activateSheetSpecificListeners(nativeHtml); 

    nativeHtml.querySelectorAll(".npcs-to-map-button").forEach((element) => element.addEventListener("click", this._onDropNPCsToMapClick.bind(this)));

    // Handle non-GM permissions
    if (!game.user.isGM) {
      const safeButtons = nativeHtml.querySelectorAll('[class*="open-"], .btn-expand-all, .btn-collapse-all, [class*="toggle-tree-"], .filter-btn');
      safeButtons.forEach((button) => {
        button.disabled = false;
      });
      nativeHtml.querySelectorAll("button.reveal").forEach((btn) => {
        btn.style.display = "none";
      });
    }
  }

  async close(options = {}) {
    if (this._forceClose) {
      return super.close(options);
    }

    const documentExists = this.document && game.journal.get(this.document.id);

    if (documentExists && !this.document._pendingDeletion) {
      await this._saveFormData();
    }

    return super.close(options);
  }

  // =========================================================================
  // Listener Activation & Setup
  // =========================================================================

  _activateTabs(html) {
    html.querySelectorAll(".sidebar-tabs .tab-item").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        const tabName = event.currentTarget.dataset.tab;
        this._currentTab = tabName;
        this._showTab(tabName, html);
      });
    });
    this._showTab(this._currentTab, html);
  }

  _setupDropZones(html) {
    html.addEventListener("drop", this._onDrop.bind(this));
    html.addEventListener("dragover", this._onDragOver.bind(this));
  }

  _setupNameEditing(html) {
    if (game.user.isGM) {
      const titleElement = html.querySelector(".sheet-title");
      titleElement?.addEventListener("click", this._onNameEdit.bind(this));
      html.addEventListener("blur", this._onNameSave.bind(this), true);
      html.addEventListener("keypress", this._onNameKeypress.bind(this));
    }
  }

  _setupImageChange(html) {
    const imageButton = html.querySelector(".image-change-btn");
    if (imageButton) {
      imageButton.removeEventListener("click", this._onImageClick.bind(this));
      imageButton.addEventListener("click", this._onImageClick.bind(this));
    }
  }

  _activateJournalListeners(html) {
    html.querySelectorAll(".remove-standard-journal")?.forEach(el => el.addEventListener("click", this._onRemoveStandardJournal.bind(this)));
    html.querySelectorAll(".open-journal")?.forEach((element) => element.addEventListener("click", async (e) => await this._onOpenDocument(e, "journal")));
  }

  _activateEditorListeners(html) {
    html.querySelectorAll("prose-mirror").forEach((editor) => {
      if (editor.dataset.listenerAttached) return;
      editor.dataset.listenerAttached = "true";

      editor.addEventListener("save", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget;
        let valueToSave = Array.isArray(target.value) ? target.value[0] : target.value;
        const fieldName = target.name.split(".").pop();

        const currentData = this.document.getFlag("campaign-codex", "data") || {};
        if (currentData[fieldName] !== valueToSave) {
          currentData[fieldName] = valueToSave;
          await this.document.setFlag("campaign-codex", "data", currentData);
        }
        this.render();
      });
    });
  }

  _addClassToEditorContent(html) {
    html.querySelectorAll("prose-mirror").forEach((editor) => {
      editor.addEventListener("open", () => {
        const containerDiv = editor.querySelector(".editor-container");
        const journalClassString = game.system.id === "dnd5e" ? "dnd5e2-journal journal-page-content" : "journal-page-content";
        if (containerDiv && journalClassString) {
          containerDiv.classList.add(...journalClassString.split(" "));
        }
      });
    });
  }

  // =========================================================================
  // Event Handlers (_on... methods)
  // =========================================================================


  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  }

  async _onDrop(event) {
    event.preventDefault();
    if (this._dropping) return;
    this._dropping = true;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      this._dropping = false;
      return;
    }

    try {
      await this._saveFormData();
      await this._handleDrop(data, event);

      const sheetsToRefresh = new Set([this]);
      const myDocUuid = this.document.uuid;

      for (const app of Object.values(ui.windows)) {
        if (!app.document?.getFlag || app === this) continue;
        if (app._isRelatedDocument && (await app._isRelatedDocument(myDocUuid))) {
          sheetsToRefresh.add(app);
        }
      }

      for (const app of sheetsToRefresh) {
        const isCurrentlyActive = (ui.activeWindow === app);
        app.render(true, { focus: isCurrentlyActive });
      }
      // for (const app of sheetsToRefresh) {
      //   app.render(false);
      // }
    } catch (error) {
      console.error("Campaign Codex | Error handling drop:", error);
    } finally {
      this._dropping = false;
    }
  }

  async _onNameEdit(event) {
    const nameElement = event.currentTarget;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "name-input";
    input.value = nameElement.textContent;
    input.style.cssText = `
      background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white;
      padding: 4px 8px; border-radius: 4px; font-family: 'Modesto Condensed', serif;
      font-size: 28px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 2px; width: 100%;
    `;
    nameElement.replaceWith(input);
    input.focus();
    input.select();
  }

  async _onNameSave(event) {
    if (!event.target.classList.contains("name-input")) return;

    const input = event.target;
    const newName = input.value.trim();

    if (newName && newName !== this.document.name) {
      await this.document.update({ name: newName });
    }

    const nameElement = document.createElement("h1");
    nameElement.className = "sheet-title";
    nameElement.textContent = this.document.name;
    input.replaceWith(nameElement);
    nameElement.addEventListener("click", this._onNameEdit.bind(this));
  }

  async _onNameKeypress(event) {
    if (event.key === "Enter" && event.target.classList.contains("name-input")) {
      event.preventDefault();
      event.target.blur();
    }
  }

  async _onImageClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const current = this.document.getFlag("campaign-codex", "image") || this.document.img;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: current,
      callback: async (path) => {
        try {
          await this.document.setFlag("campaign-codex", "image", path);
          this.render(false);
          ui.notifications.info("Image updated successfully!");
        } catch (error) {
          console.error("Failed to update image:", error);
          ui.notifications.error("Failed to update image");
        }
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    });
    return fp.browse();
  }

  async _onOpenDocument(event, type) {
    if (event.target.closest(".entity-image, .shop-icon, .card-image-clickable")) {
        return; 
    }

    event.stopPropagation();
    const uuid = event.currentTarget.dataset[`${type}Uuid`] || event.currentTarget.closest(`[data-${type}-uuid]`)?.dataset[`${type}Uuid`];
    if (!uuid) return console.warn(`Campaign Codex | No UUID found for ${type}`);

    try {
      const doc = await fromUuid(uuid);
      if (doc) {
        if (doc instanceof JournalEntryPage) {
          doc.parent.sheet.render(true, { pageId: doc.id });
        } else {
          doc.sheet.render(true);
        }
      } else {
        ui.notifications.warn(`${type} document not found`);
      }
    } catch (error) {
      console.error(`Campaign Codex | Error opening ${type}:`, error);
      ui.notifications.error(`Failed to open ${type}`);
    }
  }

  async _onRemoveFromList(event, listName) {
    await this._saveFormData();

    const itemUuid = event.currentTarget.dataset[Object.keys(event.currentTarget.dataset)[0]];
    const myDoc = this.document;
    const myData = myDoc.getFlag("campaign-codex", "data") || {};
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (!myData[listName]) return;

    // Remove the item from the source document's list
    const originalLength = Array.isArray(myData[listName]) ? myData[listName].length : myData[listName] ? 1 : 0;
    if (Array.isArray(myData[listName])) {
      myData[listName] = myData[listName].filter((uuid) => uuid !== itemUuid);
    } else {
      myData[listName] = null;
    }
    const newLength = Array.isArray(myData[listName]) ? myData[listName].length : myData[listName] ? 1 : 0;
    if (originalLength === newLength) {
      this.render(true);
      return;
    }
    await myDoc.setFlag("campaign-codex", "data", myData);

    let targetDoc;
    try {
      targetDoc = await fromUuid(itemUuid);
      if (!targetDoc) return;

      const targetType = targetDoc.getFlag("campaign-codex", "type");
      const targetData = targetDoc.getFlag("campaign-codex", "data") || {};
      let reverseField = null;
      let isArray = false;
      let needsUpdate = false;

      // Special handling for the multi-type "linkedLocations" field on NPCs
      if (myType === "npc" && listName === "linkedLocations" && (targetType === "location" || targetType === "region")) {
        reverseField = "linkedNPCs";
        isArray = true;
      } else {
        // Fallback to the relationshipMap for all other standard, single-type links
        const relationshipMap = {
          "npc:linkedShops": { targetType: "shop", reverseField: "linkedNPCs", isArray: true },
          "npc:associates": { targetType: "npc", reverseField: "associates", isArray: true },
          "region:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "region:linkedShops": { targetType: "shop", reverseField: "linkedLocation", isArray: false },
          "location:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "location:linkedShops": { targetType: "shop", reverseField: "linkedLocation", isArray: false },
          "shop:linkedNPCs": { targetType: "npc", reverseField: "linkedShops", isArray: true },
        };
        const relationship = relationshipMap[`${myType}:${listName}`];
        if (relationship && relationship.targetType === targetType) {
          reverseField = relationship.reverseField;
          isArray = relationship.isArray;
        }
      }

      if (reverseField) {
        if (isArray) {
          const originalTargetLength = (targetData[reverseField] || []).length;
          targetData[reverseField] = (targetData[reverseField] || []).filter((uuid) => uuid !== myDoc.uuid);
          if (targetData[reverseField].length < originalTargetLength) {
            needsUpdate = true;
          }
        } else {
          if (targetData[reverseField] === myDoc.uuid) {
            targetData[reverseField] = null;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await targetDoc.setFlag("campaign-codex", "data", targetData);
      }
    } catch (error) {
      console.error("Campaign Codex | Error in bidirectional cleanup:", error);
    }

    this.render(true);
    // if (targetDoc) {
      // for (const app of Object.values(ui.windows)) {
      //   if (app.document && app.document.uuid === targetDoc.uuid) {
      //     app.render(false);
      //     break;
      //   }
      // }
    // }
  }

  async _onRemoveStandardJournal(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent the card's open listener from firing
    await this._saveFormData();

    const journalUuid = event.currentTarget.dataset.journalUuid;
    if (!journalUuid) return;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    if (currentData.linkedStandardJournals && Array.isArray(currentData.linkedStandardJournals)) {
        currentData.linkedStandardJournals = currentData.linkedStandardJournals.filter(uuid => uuid !== journalUuid);
        await this.document.setFlag("campaign-codex", "data", currentData);
        this.render(true);
        ui.notifications.info("Unlinked journal.");
    }
}

  async _onRemoveFromRegion(event) {
    event.preventDefault();
    event.stopPropagation();
    await this._saveFormData();

    const myType = this.getSheetType();
    let locationDoc, regionDoc;

    if (myType === "location") {
      locationDoc = this.document;
      const regionUuid = locationDoc.getFlag("campaign-codex", "data")?.parentRegion;
      if (regionUuid) regionDoc = await fromUuid(regionUuid);
    } else if (myType === "region") {
      regionDoc = this.document;
      const locationUuid = event.currentTarget.dataset.locationUuid;
      if (locationUuid) locationDoc = await fromUuid(locationUuid);
    }

    if (!locationDoc || !regionDoc) {
      ui.notifications.warn("Could not find the linked region or location.");
      return this.render(false);
    }

    // Update region and location documents
    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};
    if (regionData.linkedLocations) {
      regionData.linkedLocations = regionData.linkedLocations.filter((uuid) => uuid !== locationDoc.uuid);
      await regionDoc.setFlag("campaign-codex", "data", regionData);
    }
    await locationDoc.unsetFlag("campaign-codex", "data.parentRegion");

    ui.notifications.info(`Removed "${locationDoc.name}" from region "${regionDoc.name}"`);

    // Render affected sheets
    for (const app of Object.values(ui.windows)) {
      if (app.document && (app.document.uuid === regionDoc.uuid || app.document.uuid === locationDoc.uuid)) {
        app.render(false);
      }
    }
  }

  async _onDropNPCsToMap(npcs, options = {}) {
    if (!npcs || npcs.length === 0) {
      return ui.notifications.warn(localize("warn.nonpcfound"));
    }
    try {
      const result = await game.campaignCodexNPCDropper.dropNPCsToScene(npcs, options);
      if (result && result.success > 0) {
        console.log(`Campaign Codex | Successfully dropped ${result.success} NPCs to scene`);
      }
      return result;
    } catch (error) {
      console.error("Campaign Codex | Error dropping NPCs to map:", error);
      ui.notifications.error(localize("warn.failedtodrop"));
    }
  }

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();
    const sheetType = this.getSheetType();
    ui.notifications.warn(`Drop to map not implemented for ${sheetType} sheets`);
  }

  _showTab(tabName, html) {
    html.querySelectorAll(".sidebar-tabs .tab-item").forEach((tab) => tab.classList.remove("active"));
    html.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    html.querySelector(`.sidebar-tabs .tab-item[data-tab="${tabName}"]`)?.classList.add("active");
    html.querySelector(`.tab-panel[data-tab="${tabName}"]`)?.classList.add("active");
  }

  // =========================================================================
  // Core Logic & Data Handling
  // =========================================================================

  async _saveFormData() {
    const nativeElement = this.element instanceof jQuery ? this.element[0] : this.element;
    const form = nativeElement?.querySelector("form");
    if (form) {
      try {
        const formData = new foundry.applications.ux.FormDataExtended(form);
        const data = formData.object;
        const currentData = this.document.getFlag("campaign-codex", "data") || {};
        const updatedData = { ...currentData, ...data.flags?.["campaign-codex"]?.data };
        await this.document.setFlag("campaign-codex", "data", updatedData);
      } catch (error) {
        console.warn("Campaign Codex | Could not auto-save form data:", error);
      }
    }
  }

  async _handleActorDrop(data, event) {
    const actor = await fromUuid(data.uuid);
    if (!actor) return ui.notifications.warn("Could not find the dropped actor.");

    await this._saveFormData();
    const sheetType = this.getSheetType();

    switch (sheetType) {
      case "region": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkRegionToNPC(this.document, npcJournal);
          ui.notifications.info(`Linked "${actor.name}" to "${this.document.name}"`);
        }
        break;
      }
      case "location": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
          ui.notifications.info(`Linked "${actor.name}" to "${this.document.name}"`);
        }
        break;
      }
      case "shop": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
          ui.notifications.info(`Linked "${actor.name}" to "${this.document.name}"`);
        }
        break;
      }
      case "npc": {
        const dropType = event.target.closest(".tab-panel")?.dataset.tab;
        if (dropType === "info") {
          const myData = this.document.getFlag("campaign-codex", "data") || {};
          myData.linkedActor = actor.uuid;
          await this.document.setFlag("campaign-codex", "data", myData);
          ui.notifications.info(`Linked actor "${actor.name}" to this journal.`);
        } else if (dropType === "associates") {
          const associateJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
          if (associateJournal && associateJournal.uuid !== this.document.uuid) {
            await game.campaignCodex.linkNPCToNPC(this.document, associateJournal);
            ui.notifications.info(`Linked "${actor.name}" as an associate.`);
          } else if (associateJournal.uuid === this.document.uuid) {
            ui.notifications.warn("Cannot link an NPC to itself as an associate.");
          }
        }
        break;
      }
      default:
        return ui.notifications.warn(`Actor drop not configured for "${sheetType}" sheets.`);
    }
    this.render(true);
  }

  _getSecretContent(secret) {
    const editor = secret.closest(".cc-enriched");
    const fieldElement = editor?.querySelector('prose-mirror[name*="flags.campaign-codex.data."]');
    if (!fieldElement) return null;
    const fieldName = fieldElement.getAttribute("name").split(".").pop();
    const data = this.document.getFlag("campaign-codex", "data") || {};
    return data[fieldName];
  }

  async _updateSecret(secret, modifiedContent) {
    const editor = secret.closest(".cc-enriched");
    const fieldElement = editor?.querySelector('prose-mirror[name*="flags.campaign-codex.data."]');
    if (!fieldElement) return;
    const fieldName = fieldElement.getAttribute("name").split(".").pop();
    const data = foundry.utils.deepClone(this.document.getFlag("campaign-codex", "data") || {});
    data[fieldName] = modifiedContent;
    return this.document.setFlag("campaign-codex", "data", data);
  }

  async _isRelatedDocument(changedDocUuid) {
    if (!this.document.getFlag) return false;

    const data = this.document.getFlag("campaign-codex", "data") || {};
    const myDocUuid = this.document.uuid;
    const myType = this.document.getFlag("campaign-codex", "type");

    const directLinkedUuids = [
      ...(data.linkedNPCs || []),
      ...(data.linkedShops || []),
      ...(data.linkedLocations || []),
      ...(data.associates || []),
      data.linkedLocation,
      data.linkedActor,
    ].filter(Boolean);

    if (directLinkedUuids.includes(changedDocUuid)) {
      return true;
    }

    try {
      const changedDoc = await fromUuid(changedDocUuid);
      if (changedDoc) {
        const changedData = changedDoc.getFlag("campaign-codex", "data") || {};
        const changedType = changedDoc.getFlag("campaign-codex", "type");
        const changedLinkedUuids = [
          ...(changedData.linkedNPCs || []),
          ...(changedData.linkedShops || []),
          ...(changedData.linkedLocations || []),
          ...(changedData.associates || []),
          changedData.linkedLocation,
          changedData.linkedActor,
        ].filter(Boolean);

        if (changedLinkedUuids.includes(myDocUuid)) {
          return true;
        }

        if (myType === "location" && changedType === "region") {
          const regionLocations = changedData.linkedLocations || [];
          if (regionLocations.includes(myDocUuid)) {
            return true;
          }
        }

        if (myType === "region" && changedType === "location") {
          const myLinkedLocations = data.linkedLocations || [];
          if (myLinkedLocations.includes(changedDocUuid)) {
            return true;
          }
        }
      }
    } catch (error) {
      console.warn(`Campaign Codex | Could not resolve UUID ${changedDocUuid}:`, error);
      return false;
    }

    if (myType === "location") {
      const allRegions = game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "region");
      for (const region of allRegions) {
        if (region.uuid === changedDocUuid) {
          const regionData = region.getFlag("campaign-codex", "data") || {};
          const linkedLocations = regionData.linkedLocations || [];
          if (linkedLocations.includes(myDocUuid)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // =========================================================================
  // Methods for Subclass Overrides
  // =========================================================================

  /**
   * Placeholder for activating listeners specific to a subclass.
   * @param {HTMLElement} html - The sheet's HTML element.
   */
  _activateSheetSpecificListeners(html) {}

  /**
   * Placeholder for handling drop data specific to a subclass.
   * @param {object} data - The parsed drop data.
   * @param {DragEvent} event - The drop event.
   */
  async _handleDrop(data, event) {}

  /**
   * Returns the type of the sheet, to be overridden by subclasses.
   * @returns {string}
   */
  getSheetType() {
    return "base";
  }
}

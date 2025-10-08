import { CampaignCodexLinkers } from "./linkers.js";
import { TemplateComponents } from "./template-components.js";
import { localize, format, promptForName } from "../helper.js";

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
    data.showStats = game.settings.get("campaign-codex", "showStats");
    data.sheetTypeLabelOverride = sheetData.sheetTypeLabelOverride;

    const allTags = await game.campaignCodex.getTagCache();
    const linkedTagUuids = this.object.getFlag("campaign-codex", "data")?.associates || this.object.getFlag("campaign-codex", "data")?.linkedNPCs || [];
    const isThisDocATag = this.object.getFlag("campaign-codex", "data")?.tagMode;
    data.existingTags = allTags.filter(tag => {
      if (linkedTagUuids.includes(tag.uuid)) return false;
      if (isThisDocATag && tag.uuid === this.document.uuid) return false;
      return true;
    });

    data.sheetData = {
      description: sheetData.description || "",
      notes: sheetData.notes || "",
      quests: sheetData.quests || [],
    };

    if (data.sheetData.quests.length > 0) {
        for (const quest of data.sheetData.quests) {
            quest.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(quest.description || "", { async: true, secrets: this.document.isOwner });
        }
    }
    let description = data.sheetData.description;
    if (Array.isArray(description)) {
      description = description[0] || "";
    }
    data.sheetData.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(description, { async: true, secrets: this.document.isOwner });

    let notes = data.sheetData.notes;
    if (Array.isArray(notes)) {
      notes = notes[0] || "";
    }
    data.sheetData.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(notes, { async: true, secrets: this.document.isOwner });

    data.canEdit = this.document.canUserModify(game.user, "update");
    data.currentTab = this._currentTab;

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
    this._activateQuestListeners(nativeHtml);
    this._activateObjectiveListeners(nativeHtml);
    this.secrets.bind(nativeHtml);
    this._activateTabs(nativeHtml);
    this._setupDropZones(nativeHtml);
    this._setupNameEditing(nativeHtml);
    this._setupTagChange(nativeHtml);
    this._setupImageChange(nativeHtml);
    this._activateJournalListeners(nativeHtml);
    this._activateEditorListeners(nativeHtml);
    this._addClassToEditorContent(nativeHtml);
    this._activateSheetSpecificListeners(nativeHtml); 
    this._activateCollapsibleListeners(nativeHtml);
    this._setupTypeEditing(nativeHtml); 

    nativeHtml.querySelectorAll(".npcs-to-map-button").forEach((element) => element.addEventListener("click", this._onDropNPCsToMapClick.bind(this)));
    nativeHtml.querySelectorAll(".existing-tag").forEach(card => {
            card.addEventListener('click', (event) => {
                const tagUuid = event.currentTarget.dataset.npcUuid;
                this._linkTagToSheet(tagUuid);
        });
    });

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
      this._saveFormData();
    }

    return super.close(options);
  }

  // =========================================================================
  // Listener Activation & Setup
  // =========================================================================


   _activateCollapsibleListeners(html) {
    const headers = html.querySelectorAll('.collapsible-quicklinks');

    headers.forEach(header => {
      header.addEventListener('click', event => {
        event.preventDefault();
        header.classList.toggle('active');
      });
    });
  }


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

  _setupTypeEditing(html) {
        if (game.user.isGM) {
            const typeElement = html.querySelector(".sheet-type");
            if (typeElement) {
                typeElement.addEventListener("click", this._onTypeEdit.bind(this));
                html.addEventListener("blur", this._onTypeSave.bind(this), true);
                html.addEventListener("keypress", this._onTypeKeypress.bind(this));
            }
        }
    }


  _setupImageChange(html) {
    const imageButton = html.querySelector(".image-change-btn");
    if (imageButton) {
      imageButton.removeEventListener("click", this._onImageClick.bind(this));
      imageButton.addEventListener("click", this._onImageClick.bind(this));
    }
  }

   _setupTagChange(html) {
      const createTagButton = html.querySelector(".create-tag-btn");
      if (createTagButton) {
          createTagButton.addEventListener("click", this._onCreateTag.bind(this));
      }
     const toggleTagsButton = html.querySelector(".toggletags");
        if (toggleTagsButton) {
      toggleTagsButton.addEventListener("click", this._onToggleTags.bind(this));
      }
    }

  /**
   * Activates event listeners for quest objectives.
   * @param {HTMLElement} html The sheet's HTML element.
   */
  _activateObjectiveListeners(html) {
    if (!game.user.isGM) return;

    html.querySelectorAll('.add-objective').forEach(el => {
      el.addEventListener('click', this._onAddObjective.bind(this));
    });

    html.querySelectorAll('.remove-objective').forEach(el => {
      el.addEventListener('click', this._onRemoveObjective.bind(this));
    });

    html.querySelectorAll('.objective-toggle-icon').forEach(el => {
      el.addEventListener('click', this._onUpdateObjective.bind(this));
    });
    
    html.querySelectorAll('.objective-text.editable').forEach(el => {
      el.addEventListener('click', this._onObjectiveTextEdit.bind(this));
    });

    html.querySelectorAll('.objective-list').forEach(list => {
      list.addEventListener('blur', this._onObjectiveTextSave.bind(this), true);
      list.addEventListener('keypress', this._onObjectiveTextSave.bind(this), true);
    });
  }


  _activateQuestListeners(html) {
    if (game.user.isGM) {
      html.querySelectorAll('.quest-toggle-icon').forEach(el => el.addEventListener('click', this._onUpdateQuest.bind(this)));
      html.querySelector('.add-quest')?.addEventListener('click', this._onAddQuest.bind(this));
      html.querySelectorAll('.remove-quest').forEach(el => el.addEventListener('click', this._onRemoveQuest.bind(this)));
      html.querySelectorAll('.quest-input-title').forEach(el => el.addEventListener('change', this._onUpdateQuest.bind(this)));
      html.querySelectorAll('prose-mirror.quest-description-editor').forEach(editor => {
        if (editor.dataset.listenerAttached) return;
        editor.dataset.listenerAttached = "true";
        editor.addEventListener('save', this._onUpdateQuest.bind(this));
      });
      html.querySelectorAll('.quest-input-title').forEach(el => el.addEventListener('pointerup', event => event.stopPropagation()));

      html.querySelectorAll('.quest-input-title[data-editable="true"]').forEach(el => {
            el.addEventListener('click', this._onQuestTitleEdit.bind(this));
        });
      html.querySelectorAll('.quest-list')?.forEach(el => el.addEventListener('blur', this._onQuestTitleSave.bind(this), true));
      html.querySelectorAll('.quest-list')?.forEach(el => el.addEventListener('keypress', (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.target.blur();
          }
      }));
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

  async _onCreateTag(event) {
    event.preventDefault();
    const name = await promptForName("Tag");
    if (name) {
        const tagJournal = await game.campaignCodex.createNPCJournal(null, name, true);
        if (tagJournal) {
            await this._linkTagToSheet(tagJournal.uuid);
        }
    }
  }

_onToggleTags(event) {
    event.preventDefault();
    const sheetElement = event.currentTarget.closest('.campaign-codex');
    sheetElement.classList.toggle('hide-existing-tags');
    const icon = event.currentTarget;
    icon.classList.toggle('fa-eye-slash');
    icon.classList.toggle('fa-eye');
}

  async _linkTagToSheet(tagUuid) {
    const myDoc = this.document;
    const myData = myDoc.getFlag("campaign-codex", "data") || {};
    const myType = myDoc.getFlag("campaign-codex", "type");
    let listName;

    switch (myType) {
        case 'npc':
            listName = 'associates';
            break;
        case 'location':
        case 'region':
        case 'shop':
            listName = 'linkedNPCs';
            break;
        default:
            return;
    }

    if (!myData[listName]) {
        myData[listName] = [];
    }
    if (!myData[listName].includes(tagUuid)) {
        myData[listName].push(tagUuid);
        await myDoc.setFlag("campaign-codex", "data", myData);
        this.render(false);
    }
  }


  /**
   * Handle adding a new objective to a quest.
   * @param {MouseEvent} event The triggering click event.
   */
  async _onAddObjective(event) {
    event.preventDefault();
    const questId = event.currentTarget.dataset.questId;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    quest.objectives = quest.objectives || [];
    quest.objectives.push({
      id: foundry.utils.randomID(),
      text: "New Objective",
      completed: false,
      visible: false,
    });

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true);
  }

  /**
   * Handle removing an objective from a quest.
   * @param {MouseEvent} event The triggering click event.
   */
  async _onRemoveObjective(event) {
    event.preventDefault();
    event.stopPropagation();
    const { questId, objectiveId } = event.currentTarget.dataset;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest || !quest.objectives) return;

    quest.objectives = quest.objectives.filter(o => o.id !== objectiveId);

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true);
  }

  /**
   * Handle updating a boolean field on an objective (e.g., 'completed' or 'visible').
   * @param {MouseEvent} event The triggering click event.
   */
  async _onUpdateObjective(event) {
    event.preventDefault();
    const { questId, objectiveId, field } = event.currentTarget.dataset;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest || !quest.objectives) return;
    const objective = quest.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    // Toggle the boolean value
    objective[field] = !objective[field];

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true);
  }

  /**
   * Handle clicking on an objective's text to make it editable.
   * @param {MouseEvent} event The triggering click event.
   */
  _onObjectiveTextEdit(event) {
    const span = event.currentTarget;
    const { questId, objectiveId } = span.dataset;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "objective-text-input";
    input.value = span.textContent.trim();
    input.dataset.questId = questId;
    input.dataset.objectiveId = objectiveId;

    span.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Handle saving the edited objective text when the input loses focus or Enter is pressed.
   * @param {FocusEvent|KeyboardEvent} event The triggering event.
   */
  async _onObjectiveTextSave(event) {
    if (event.type === 'keypress' && event.key !== 'Enter') return;
    if (!event.target.classList.contains("objective-text-input")) return;
    
    const input = event.target;
    const { questId, objectiveId } = input.dataset;
    const newText = input.value.trim();

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;
    const objective = quest.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    // Only update if the text has changed
    if (newText && objective.text !== newText) {
      objective.text = newText;
      await this.document.setFlag("campaign-codex", "data.quests", quests);
    }

    // We must re-render to replace the input with a span correctly
    this.render();
  }


  _onQuestTitleEdit(event) {
    const titleElement = event.currentTarget;
    const input = document.createElement("input");
      input.addEventListener('blur', this._onQuestTitleSave.bind(this));
      input.addEventListener('keypress', event => {
      if (event.key === "Enter") {
       event.preventDefault();
       event.target.blur(); 
      }
      });
    input.type = "text";
    input.className = "quest-title-input"; // Use a specific class for the input
    input.value = titleElement.textContent.trim();
    input.dataset.questId = titleElement.dataset.questId; // Carry over the ID

    titleElement.replaceWith(input);
    input.focus();
    input.select();
  }

  async _onQuestTitleSave(event) {
    if (!event.target.classList.contains("quest-title-input")) return;

    const input = event.target;
    const newTitle = input.value.trim();
    const questId = input.dataset.questId;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);

    if (quest && newTitle && quest.title !== newTitle) {
        quest.title = newTitle;
        await this.document.setFlag("campaign-codex", "data.quests", quests);
    }
    
    const titleElement = document.createElement("h4");
    titleElement.className = "quest-title quest-input-title";
    titleElement.dataset.questId = questId;
    titleElement.dataset.editable = "true";
    titleElement.textContent = quest ? quest.title : 'New Quest'; // Fallback text

    input.replaceWith(titleElement);
    titleElement.addEventListener('click', this._onQuestTitleEdit.bind(this));
  }


  async _onAddQuest(event) {
    event.preventDefault();
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = currentData.quests || [];
    quests.push({
      id: foundry.utils.randomID(),
      title: "New Quest",
      description: "",
      completed: false,
      visible: false,
      pinned: false,
      objectives: [],
    });
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true);
  }

  async _onRemoveQuest(event) {
    event.preventDefault();
    event.stopPropagation();
    const questId = event.currentTarget.dataset.questId;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    let quests = currentData.quests || [];
    quests = quests.filter(q => q.id !== questId);
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true);
  }

  async _onUpdateQuest(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const questId = element.dataset.questId;
    const isProseMirror = element.tagName === 'PROSE-MIRROR';
    const isIconToggle = element.classList.contains('quest-toggle-icon');
    const field = isProseMirror ? 'description' : element.dataset.field;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;
    let value;
    if (isIconToggle) {
        if (field === 'completed' || game.user.isGM) {
            value = !quest[field]; 
        } else {
            return; 
        }
    } else if (isProseMirror) {
        value = (Array.isArray(element.value) ? element.value[0] : element.value);
    } else { 
        value = element.value;
    }
    quest[field] = value;
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render(true); 
  }

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
    } catch (error) {
      console.error("Campaign Codex | Error handling drop:", error);
    } finally {
      this._dropping = false;
    }
    if (foundry.applications.instances.get("campaign-codex-toc-sheet")){foundry.applications.instances.get("campaign-codex-toc-sheet").render();}
  }


    _onTypeEdit(event) {
        const typeElement = event.currentTarget;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "type-input"; 
        input.value = typeElement.textContent;
        typeElement.replaceWith(input);
        input.focus();
        input.select();
    }

    async _onTypeSave(event) {
        if (!event.target.classList.contains("type-input")) return;
        const input = event.target;
        const newType = input.value.trim();
        await this.document.setFlag("campaign-codex", "data.sheetTypeLabelOverride", newType);
        this.render(false);
    }

    async _onTypeKeypress(event) {
        if (event.key === "Enter" && event.target.classList.contains("type-input")) {
            event.preventDefault();
            event.target.blur();
        }
    }

  async _onNameEdit(event) {
    const nameElement = event.currentTarget;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "name-input";
    input.value = nameElement.textContent;
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
      if (myType === "npc" && listName === "linkedLocations" && (targetType === "location" || targetType === "region")) {
        reverseField = "linkedNPCs";
        isArray = true;
      } else {
        const relationshipMap = {
          "npc:linkedShops": { targetType: "shop", reverseField: "linkedNPCs", isArray: true },
          "npc:associates": { targetType: "npc", reverseField: "associates", isArray: true },
          "region:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "region:linkedShops": { targetType: "shop", reverseField: "linkedLocation", isArray: false },
          "location:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "region:linkedRegions": { targetType: "region", reverseField: "parentRegion", isArray: false },
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
    // Render affected sheets
    for (const app of Object.values(ui.windows)) {
      if (app.document && (app.document.uuid === targetDoc.uuid || app.document.uuid === myDoc.uuid)) {
        app.render(true);
      }
    }
    // this.render(true);
  }

  async _onRemoveStandardJournal(event) {
    event.preventDefault();
    event.stopPropagation(); 
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

  async _onRemoveParentFromRegion(event) {
    event.preventDefault();
    event.stopPropagation();
    await this._saveFormData();

    const myType = this.getSheetType();
    let regionDoc, regionParentDoc;

    regionDoc = this.document;
    const regionUuid = regionDoc.getFlag("campaign-codex", "data")?.parentRegion;
    if (regionUuid) regionParentDoc = await fromUuid(regionUuid);

    if (!regionParentDoc || !regionDoc) {
      ui.notifications.warn("Could not find the linked region or parent region.");
      return this.render(true);
    }

    const regionData = regionParentDoc.getFlag("campaign-codex", "data") || {};
    if (regionData.linkedRegions) {
      regionData.linkedRegions = regionData.linkedRegions.filter((uuid) => uuid !== regionDoc.uuid);
      await regionDoc.setFlag("campaign-codex", "data", regionData);
    }
    await regionDoc.unsetFlag("campaign-codex", "data.parentRegion");

    ui.notifications.info(`Removed "${regionDoc.name}" from region "${regionParentDoc.name}"`);

    // Render affected sheets
    for (const app of Object.values(ui.windows)) {
      if (app.document && (app.document.uuid === regionParentDoc.uuid || app.document.uuid === regionDoc.uuid)) {
        app.render(true);
      }
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
        app.render(true);
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
      ...(data.linkedRegions || []), 
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
          ...(changedData.linkedRegions || []),
          ...(changedData.associates || []),
          changedData.linkedLocation,
          changedData.parentRegion, 
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

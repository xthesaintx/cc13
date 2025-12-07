import { CampaignCodexLinkers } from "./linkers.js";
import { TemplateComponents } from "./template-components.js";
import { localize, format, promptForName, confirmationDialog, renderTemplate, targetedRefresh, getDefaultSheetTabs } from "../helper.js";
import { widgetManager } from "../widgets/WidgetManager.js";
import { tabPicker } from "../tab-picker.js";
const DragDrop = foundry.applications.ux.DragDrop.implementation;
// =========================================================================
// BASE CLASS SETUP
// =========================================================================
const { DocumentSheetV2 } = foundry.applications.api;
// var DocumentSheetV2 = foundry.applications.api.DocumentSheetV2;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const baseSheetApp = HandlebarsApplicationMixin(DocumentSheetV2);

// =========================================================================
// MAIN CLASS DEFINITION
// =========================================================================

export class CampaignCodexBaseSheet extends baseSheetApp {
  
  // =========================================================================
  // STATIC CONFIGURATION
  // =========================================================================

  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "themed theme-light"],
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    window: {
      frame: true,
      title: 'Campaign Codex',
      icon: 'fas fa-closed-captioning',
      minimizable: true,
      resizable: true,
    },
    position: {
      width: 960,
      height: 800
    },
    actions: {
      showPlayers:this.#_onShowPlayers,
      toggleQuicklinks: this.#_onToggleQuicklinks,
      toggleTags: this.#_onToggleTags,
      toggleWidgets: this.#_onToggleWidgets,
      addWidget: this.#_onAddWidget,
      activateWidget: this.#_onActivateWidget,
      deleteWidget: this.#_onDeleteWidget,
      deactivateWidget: this.#_onDeactivateWidget,
      editTabs: this.#_onEditTabs,
      imageChange: this.#_onImageClick,
      ccChangeTab: this.#_onChangeTab,
      membersToMapButton: this.#_onDropMembersToMapClick,
      npcsToMapButton: this.#_onDropNPCsToMapClick,
      sendToPlayer: this.#_onSendToPlayer,
      // ICON
      editIcon: this.#_onEditIcon,
      // CREATE
      createTag: this.#_onCreateTag,
      linkTag: this.#_onClickTag,
      createNPCJournal: this.#_onCreateNPCJournal,
      createShopJournal: this.#_onCreateShopJournal,
      createRegionJournal: this.#_onCreateRegionJournal,
      createLocationJournal: this.#_onCreateLocationJournal,
      // OPEN
      openItem: this.#_onOpenItem,
      openScene: this.#_onOpenScene,
      openActor: this.#_openActor,
      openNPC: this.#_openNPC,
      openNpc: this.#_openNPC,
      openShop: this.#_openShop,
      openLocation: this.#_openLocation,
      openGroup: this.#_openGroup,
      openRegion: this.#_openRegion,
      openParentregion: this.#_openRegion,
      openJournal: this.#_openJournal,
      openAssociate: this.#_openAssociate,
      // REMOVE
      removeParentregion: this.#_onRemoveParentRegion,
      removeQuestItem: this.#_onRemoveQuestItem,
      removeImage: this.#_onRemoveImage,
      removeScene: this.#_onRemoveScene,
      removeLocationFromRegion:this.#_onRemoveLocation,
      // removeParentRegion: this.#_onRemoveParentFromRegion,
      removeLocation: this.#_onRemoveLocation,
      removeShop: this.#_onRemoveShop,
      removeAssociate: this.#_onRemoveNPC,
      removeNPC: this.#_onRemoveNPC,
      removeNpc: this.#_onRemoveNPC,
      removeRegion: this.#_onRemoveRegion,
      removeJournal:this.#_onRemoveStandardJournal,
      // Quests
      questToggle: this.#_questToggle,
      objectiveToggle: this.#_objectiveToggle,
    }
  };

  static PARTS = {
    main: {
      template: "modules/campaign-codex/templates/base-sheet.html",
      scrollable: ["",".scrollable", ".tab-panel.info", ".tab-panel.locations", ".tab-panel.shops", ".tab-panel.associates",".tab-panel.inventory",".tab-panel.widgets", ".tab-panel.quests", ".tab-panel.journals", ".tab-panel.notes", ".tab-panel.npcs", ".tab-panel.regions"]
    }
  }

  // =========================================================================
  // INSTANCE PROPERTIES
  // =========================================================================

  #showTags = false;
  #showWidgets = false;
  #showQuicklinks = false;

  // =========================================================================
  // STATIC PERMISSION UTILITIES
  // =========================================================================

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

  // =========================================================================
  // STATIC TAB GENERATION METHODS
  // =========================================================================

  /**
   * Generates the HTML for the GM Notes tab.
   * @param {Document} doc - The document entity.
   * @param {object} data - The sheet's prepared data.
   * @returns {string}
   */
  static async generateNotesTab(doc, context, labelOverride=null) {
    const templateData = {
      labelOverride:labelOverride,
      richTextDescription: TemplateComponents.richTextSection(doc, context.sheetData.enrichedNotes, "notes", context.isOwnerOrHigher)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-notes.hbs", templateData);
  }

  static async generateWidgetsTab(doc, context, labelOverride=null) {
    const templateData = {
      labelOverride: labelOverride,
      widgetsToRender: context.widgetsToRender,
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-widgets.hbs", templateData);
  }

  // =========================================================================
  // CONSTRUCTOR & LIFECYCLE METHODS
  // =========================================================================

  constructor(document, options = {}) {
    super(document, options);
    this._currentTab = "info";
    this._processedData = null;
    this.#dragDrop = this.#createDragDropHandlers();
  }

  static #_onShowPlayers() {
    foundry.documents.collections.Journal.showDialog(this.document);
  }

  _canDragStart(selector) {
    return game.user.isGM; 
  }

  _canDragDrop(selector) {
    return game.user.isGM;
  }

  _onDragStart(event) {
  }

  #createDragDropHandlers() {
    // console.log(this.options.dragDrop);
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this),
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this),
      };
      return new DragDrop(d);
    });
  }

  #dragDrop;

  get dragDrop() {
    return this.#dragDrop;
  }

  /** @inheritDoc */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: "fas fa-eye",
      label: "JOURNAL.ActionShow",
      visible: game.user.isGM,
      action: "showPlayers"
    });
    return controls;
  }


  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (options.force) {
      this._processedData = null;
    }
    foundry.utils.mergeObject(context, {
      document: this.document,
      showTags: this.#showTags,
      showWidgets: this.#showWidgets,
      showQuicklinks: this.#showQuicklinks,
    });

    const sheetData = this.document.getFlag("campaign-codex", "data") || {};
    context.isGM = game.user.isGM;
    context.isObserver = this.constructor.isObserverOrHigher(this.document);
    context.isOwnerOrHigher = this.constructor.isOwnerOrHigher(this.document);
    context.showStats = game.settings.get("campaign-codex", "showStats");
    context.sheetTypeLabelOverride = sheetData.sheetTypeLabelOverride;
    context.mapMarker = sheetData.mapMarker || "";
    // ICON OVERRIDE
    const iconOverride = this.document.getFlag("campaign-codex", "icon-override");
    if (iconOverride) {
      context.customIcon = iconOverride;
    }

    // IMAGE CONFIGURATION
    const allOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];
    const mapMarkerOverride = allOverrides.find(override => override.key === "mapMarker");
    context.mapMarkerOverride = mapMarkerOverride?.visible ?? true;
    const imageAreaOverride = allOverrides.find(override => override.key === "imageArea");
    context.showImage = imageAreaOverride?.visible ?? true;
    const imagePath = this.document.getFlag("campaign-codex", "image") || null;
    context.userImage = !!imagePath && typeof imagePath === "string" && imagePath.trim() !== "";
    
    // TAGS CONFIGURATION
    let allTags = [];
    if (typeof game.campaignCodex?.getTagCache === "function") {
      allTags = await game.campaignCodex.getTagCache();
    } else {
      console.warn("Campaign Codex | getTagCache() was not available during _prepareContext. Proceeding with empty tags.");
    }
    const linkedTagUuids =
      this.document.getFlag("campaign-codex", "data")?.associates ||
      this.document.getFlag("campaign-codex", "data")?.linkedNPCs ||
      [];
    const isThisDocATag = this.document.getFlag("campaign-codex", "data")?.tagMode;
    context.existingTags = allTags.filter((tag) => {
      if (linkedTagUuids.includes(tag.uuid)) return false;
      if (isThisDocATag && tag.uuid === this.document.uuid) return false;
      return true;
    });

    // WIDGETS CONFIGURATION
    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || []; 
    context.activewidget = sheetWidgets.filter(w => w.active);
    context.inactivewidgets = sheetWidgets.filter(w => !w.active);
    const allAvailable = Array.from(widgetManager.widgetRegistry.keys());
    context.addedWidgetNames = sheetWidgets.map(w => w.widgetName);
    context.availableWidgets = allAvailable.map(name => ({ name: name }));
    // context.widgetsToRender = await widgetManager.instantiateActiveWidgets(this.document);

    // Only instantiate widgets if the 'widgets' tab is active
    if (this._currentTab === "widgets") {
        context.widgetsToRender = await widgetManager.instantiateActiveWidgets(this.document);
    } else {
        context.widgetsToRender = [];
    }
    
    // SHEET DATA PREPARATION
    context.sheetData = {
      description: sheetData.description || "",
      notes: sheetData.notes || "",
      quests: sheetData.quests || [],
    };

    // ENRICH QUEST DESCRIPTIONS
    if (context.sheetData.quests.length > 0) {
      for (const quest of context.sheetData.quests) {
        quest.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          quest.description || "",
          { async: true, secrets: this.document.isOwner },
        );
      }
    }

    // ENRICH MAIN DESCRIPTION
    let description = context.sheetData.description;
    if (Array.isArray(description)) {
      description = description[0] || "";
    }
    context.sheetData.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      description,
      { async: true, secrets: this.document.isOwner },
    );

    if (this._currentTab === "notes") {
        let notes = context.sheetData.notes;
        if (Array.isArray(notes)) {
          notes = notes[0] || "";
        }
        context.sheetData.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(notes, {
          async: true,
          secrets: this.document.isOwner,
        });
    } else {
        context.sheetData.enrichedNotes = "";
    }

    context.canEdit = this.document.canUserModify(game.user, "update");
    context.currentTab = this._currentTab;

    // STANDARD JOURNALS PREPARATION
    context.linkedStandardJournals = []; 
    if (sheetData.linkedStandardJournals && Array.isArray(sheetData.linkedStandardJournals)) {
      const journalPromises = sheetData.linkedStandardJournals.map(async (uuid) => {
        try {
          const document = await fromUuid(uuid);
          if (!document) {

          if (sheetData.linkedStandardJournals && Array.isArray(sheetData.linkedStandardJournals)) {
            sheetData.linkedStandardJournals = sheetData.linkedStandardJournals.filter(u => u !== uuid);
            await this.document.setFlag("campaign-codex", "data", sheetData);
            console.warn(`Campaign Codex | Linked standard journal not found: ${uuid}`);
            console.warn("Unlinked journal.");
          }

            return null;
          }

          let journal;
          let displayName;

          if (document instanceof JournalEntryPage) {
            journal = document.parent;
            displayName = `${journal.name}: ${document.name}`;
          } else {
            journal = document; 
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
      context.linkedStandardJournals = resolvedJournals.filter((j) => j && j.canView);
    }
    return context;
  }

  async close(options = {}) {
    if (this._forceClose) {
      return super.close(options);
    }

    const documentExists = this.document && game.journal.get(this.document.id);

    if (documentExists && !this.document._pendingDeletion) {
      // this._saveFormData();
    }
    
    try {
      const widgetInstances = Array.from(widgetManager.widgetInstances.keys());
      for (const widgetId of widgetInstances) {
        widgetManager.widgetInstances.delete(widgetId);
      }
    } catch (error) {
      console.error("Campaign Codex | Error while deleting widget instances on sheet close:", error);
    }

    return super.close(options);
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
      this._createContextMenus();

    this.element.addEventListener("click", (event) => {
      const clickedImage = event.target.closest("img:not(.nopopout)");
      if (!clickedImage) {
      return; 
    }
    const inEditor = clickedImage.closest("div.editor-content.ProseMirror");
    if (inEditor) {
      return;
    }
    event.stopPropagation();
    this._onClickImage.call(this, event);
  });
  }


  /**
   * Register context menu entries and fire hooks.
   * @protected
   */
  _createContextMenus() {
    this._createContextMenu(this._getEntryContextOptions, ".scene-name[data-scene-uuid]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false
    });
  }


  /** @inheritDoc */
  _getEntryContextOptions() {
    return [{
      name: "SCENE.View",
      icon: '<i class="fa-solid fa-eye"></i>',
      condition: span => !canvas.ready || (span.dataset.sceneUuid !== canvas.scene.uuid),
      callback: span => game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.view()
    }, {
      name: "SCENE.Activate",
      icon: '<i class="fa-solid fa-bullseye"></i>',
      condition: span => game.user.isGM && !game.scenes.get(span.dataset.sceneUuid)?.active,
      callback: span => game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.activate()
    }, {
      name: "SCENE.Configure",
      icon: '<i class="fa-solid fa-gears"></i>',
      callback: span => game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.sheet.render({ force: true })
    },
    {
      name: "SCENE.ToggleNav",
      icon: '<i class="fa-solid fa-compass"></i>',
      condition: span => game.user.isGM && !game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.active,
      callback: span => {
        const scene = game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id);
        scene?.update({ navigation: !scene.navigation });
      }
    }].concat();
  }


  async _onRender(context, options) {
    await super._onRender(context, options);
    const nativeHtml = this.element;
    if (this.dragDrop && Array.isArray(this.dragDrop)) {
        this.dragDrop.forEach((d) => d.bind(this.element));
    }

    // BIND ALL LISTENERS
    this._activateQuestListeners(nativeHtml);
    this._activateObjectiveListeners(nativeHtml);
    this._setupNameEditing(nativeHtml);
    this._activateEditorListeners(nativeHtml);
    this._addClassToEditorContent(nativeHtml);
    this._activateSheetSpecificListeners(nativeHtml); 
    this._setupTypeEditing(nativeHtml); 
    this._setupMarkerEditing(nativeHtml);
    this._showTab(this._currentTab, nativeHtml);
    
    // INVENTORY & QUEST INVENTORY LISTENERS
    nativeHtml.querySelector(".shop-loot-toggle")?.addEventListener("change", this._onLootToggle.bind(this));
    nativeHtml.querySelector(".cash-input")?.addEventListener("change", this._onCashChange.bind(this));
    nativeHtml.querySelector(".markup-input")?.addEventListener("change", this._onMarkupChange.bind(this));
    nativeHtml.querySelectorAll(".quantity-input")?.forEach((el) => el.addEventListener("change", this._onQuantityChange.bind(this)));
    nativeHtml.querySelectorAll(".price-input")?.forEach((el) => el.addEventListener("change", this._onPriceChange.bind(this)));
    nativeHtml.querySelectorAll(".inventory-item")?.forEach((el) => {
      el.addEventListener("dragstart", this._onItemDragStart.bind(this));
      el.addEventListener("dragend", this._onItemDragEnd.bind(this));
    });

    // SINGLE ACTION LISTENERS
    const singleActionMap = {
      ".sort-inventory-alpha": this._onSortInventory,
    };

    for (const [selector, handler] of Object.entries(singleActionMap)) {
      nativeHtml.querySelector(selector)?.addEventListener("click", handler.bind(this));
    }

    // MULTI ACTION LISTENERS
    const multiActionMap = {
      ".remove-item": this._onRemoveItem,
      ".quantity-decrease": this._onQuantityDecrease,
      ".quantity-increase": this._onQuantityIncrease,      
    };

    for (const [selector, handler] of Object.entries(multiActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await handler.call(this, e);
        });
      });
    }

    // WIDGET LISTENERS
    const widgetPromises = [];

    nativeHtml.querySelectorAll('.cc-widget-container').forEach(container => {
      widgetPromises.push(widgetManager.renderAndActivateWidget(container));
    });

    await Promise.all(widgetPromises);

    if (this._pendingScrollRestorations) {
      this.element.querySelectorAll('[data-preserve-scroll]').forEach((el, i) => {
        const state = this._pendingScrollRestorations[i];
        if (state) {
          el.scrollTop = state.top;
          el.scrollLeft = state.left;
        }
      });
      this._pendingScrollRestorations = null; // Cleanup
    }

    // MARK BUTTONS AS SAFE FOR NON-GM USERS
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


  /** @inheritdoc */
  _replaceHTML(result, content, options) {
    this._pendingScrollRestorations = Array.from(
      content.querySelectorAll('[data-preserve-scroll]'),
      el => ({ top: el.scrollTop, left: el.scrollLeft })
    );
  
    super._replaceHTML(result, content, options);
  }



  // =========================================================================
  // TAB MANAGEMENT
  // =========================================================================

  _showTab(tabName, html) {
    this._currentTab = tabName;
    html.querySelectorAll(".sidebar-tabs .tab-item").forEach((tab) => tab.classList.remove("active"));
    html.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    html.querySelector(`.sidebar-tabs .tab-item[data-tab="${tabName}"]`)?.classList.add("active");
  
    const activePanel = html.querySelector(`.tab-panel[data-tab="${tabName}"]`);
    activePanel?.classList.add("active");

    if (activePanel && activePanel.innerHTML.trim() === "") {
        this.render(false);
    }
  }

  // _showTab(tabName, html) {
  //   html.querySelectorAll(".sidebar-tabs .tab-item").forEach((tab) => tab.classList.remove("active"));
  //   html.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  //   html.querySelector(`.sidebar-tabs .tab-item[data-tab="${tabName}"]`)?.classList.add("active");
  //   html.querySelector(`.tab-panel[data-tab="${tabName}"]`)?.classList.add("active");
  // }

  static async #_onChangeTab(event) {
    event.preventDefault();
    const target = event.target;
    const tabElement = target.closest('[data-tab]');
    if (!tabElement) return;
    const tabName = tabElement.dataset.tab;
    if (!tabName) return;
    this._currentTab = tabName;
    if (this.getSheetType() === "group" && this._selectedSheet) {
      this._selectedSheet = null;
      this.render(); 
    } else {
      this._showTab(tabName, this.element);
    }
  }

  /**
   * Provides the default tab definitions for the sheet.
   * Subclasses are expected to override this method to provide their specific tabs.
   * @returns {Array<object>} An array of tab definition objects {key, label, icon}.
   * @protected
   */
  _getTabDefinitions() {
    const tabs = [
      {
        key: "info",
        label: localize("names.info") || "Info",
        icon: "fas fa-info-circle",
      }
    ];

    if (this.constructor.isOwnerOrHigher(this.document)) {
      tabs.push({
        key: "notes",
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note",
      });
    }
    return tabs;
  }

  // =========================================================================
  // LISTENER ACTIVATION & SETUP
  // =========================================================================

  // _setupDropZones(html) {
  //   html.addEventListener("drop", this._onDrop.bind(this));
  //   html.addEventListener("dragover", this._onDragOver.bind(this));
  // }

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

  _setupMarkerEditing(html) {
    if (game.user.isGM) {
      const typeElement = html.querySelector(".sheet-marker");
      if (typeElement) {
        typeElement.addEventListener("click", this._onMarkerEdit.bind(this));
        html.addEventListener("blur", this._onMarkerSave.bind(this), true);
        html.addEventListener("keypress", this._onMarkerKeypress.bind(this));
      }
    }
  }

  _activateObjectiveListeners(html) {
    if (!game.user.isGM) return;

    html.querySelectorAll('.add-objective, .add-sub-objective').forEach(el => {
      el.addEventListener('click', this._onAddObjective.bind(this));
    });

    html.querySelectorAll('.remove-objective').forEach(el => {
      el.addEventListener('click', this._onRemoveObjective.bind(this));
    });

    
    html.querySelectorAll('.objective-text.editable').forEach(el => {
      el.addEventListener('click', this._onObjectiveTextEdit.bind(this));
    });

    html.querySelectorAll('.objective-list').forEach(list => {
      list.addEventListener('blur', this._onObjectiveTextSave.bind(this), true);
      list.addEventListener('keypress', this._onObjectiveTextSave.bind(this), true);
    });

    html.querySelectorAll('.objective-item').forEach(el => {
      el.setAttribute('draggable', true);
      el.addEventListener('dragstart', this._onObjectiveDragStart.bind(this));
      el.addEventListener('dragenter', this._onObjectiveDragEnter.bind(this));
      el.addEventListener('dragleave', this._onObjectiveDragLeave.bind(this));
      el.addEventListener('dragover', this._onObjectiveDragOver.bind(this));
      el.addEventListener('drop', this._onObjectiveDrop.bind(this));
      el.addEventListener('dragend', this._onObjectiveDragEnd.bind(this));
    });
  }

  _activateQuestListeners(html) {
    if (game.user.isGM) {
      // html.querySelectorAll('.quest-toggle-icon').forEach(el => el.addEventListener('click', this._onUpdateQuest.bind(this)));
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

  /**
   * Handle clicking an image to pop it out for fullscreen view.
   * @param {PointerEvent} event  The triggering click event.
   * @protected
   */
  _onClickImage(event) {
    if ( !event.target.matches("img:not(.nopopout)") ) return;
    const target = event.target;
    const page = this.document._id;
    const title = this.document.name;
    const ip = new foundry.applications.apps.ImagePopout({
      src: target.getAttribute("src"),
      window: { title }
    });
    // if ( page ) ip.shareImage = () => console.log(this.document);
    // if ( page ) ip.shareImage = () => foundry.documents.collections.Journal.showDialog(page);
    ip.render({ force: true });
  }

_labelOverride(selectedDoc, sheetKey) {
  if (!selectedDoc || !sheetKey) {
    return false;
  }
  const tabOverrides = selectedDoc.getFlag("campaign-codex", "tab-overrides");
  if (!Array.isArray(tabOverrides)) {
    return false;
  }
  const override = tabOverrides.find(tab => tab.key === sheetKey);
  return (override && override.label) ? override.label : false;
}

  // =========================================================================
  // STATIC ACTION HANDLERS - IMAGE MANAGEMENT
  // =========================================================================

  static async #_onRemoveImage(event) {
    const proceed = await confirmationDialog("Are you sure you want to remove this image?");
    if (proceed) {
      await this.document.setFlag("campaign-codex", "image", null);
    }
    this.render();
  }

  static async #_onImageClick(event) {
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

/**
   * Opens a dialog to select an override icon for the document using a radio button grid.
   * This can be bound as a static action 'editIcon'.
   * @param {Event} event The triggering event.
   * @protected
   */
  static async #_onEditIcon(event) {
    event.preventDefault();

    const ASSET_MAP = [
      { key: "default", label: "Default", icon: "fas fa-map-pin" },
      // --- Default Tags ---
      { key: "region", label: "Region", icon: "fas fa-globe" },
      { key: "atlas", label: "Atlas", icon: "fas fa-book-atlas" },
      { key: "location", label: "Location", icon: "fas fa-map-marker-alt" },
      { key: "shop", label: "Shop", icon: "fas fa-house" },
      { key: "npc", label: "NPC", icon: "fas fa-user" },
      { key: "item", label: "Item", icon: "fas fa-box" },
      { key: "group", label: "Group", icon: "fas fa-sitemap" },
      { key: "tag", label: "Tag", icon: "fas fa-tag" },
      // --- Places & Structures ---
      { key: "camp", label: "Camp", icon: "fas fa-campground" },
      { key: "castle", label: "Castle", icon: "fas fa-chess-rook" },
      { key: "dungeon", label: "Dungeon", icon: "fas fa-dungeon" },
      { key: "gopuram", label: "Gopuram", icon: "fas fa-gopuram" },
      { key: "landmark", label: "Landmark", icon: "fas fa-landmark" },
      { key: "monument", label: "Monument", icon: "fas fa-monument" },
      { key: "portal", label: "Portal", icon: "fas fa-portal-enter" },
      { key: "store", label: "Store", icon: "fas fa-store" },
      { key: "tavern", label: "Tavern", icon: "fas fa-beer" },
      { key: "temple", label: "Temple", icon: "fas fa-place-of-worship" },
      { key: "tents", label: "Tents", icon: "fas fa-tents" },
      // --- Nature & Geography ---
      { key: "forest", label: "Forest", icon: "fas fa-tree" },
      { key: "mountain", label: "Mountain", icon: "fas fa-mountain" },
      { key: "world", label: "World", icon: "fas fa-earth-africa" },
      // --- Creatures & People ---
      { key: "animal", label: "Animal", icon: "fas fa-paw" },
      { key: "guard", label: "Guard", icon: "fas fa-user-shield" },
      { key: "horse", label: "Horse", icon: "fas fa-horse" },
      { key: "pet", label: "Pet", icon: "fas fa-shield-dog" },
      { key: "spider", label: "Spider", icon: "fas fa-spider" },
      { key: "users", label: "Users", icon: "fas fa-users-viewfinder" },
      // --- Items & Objects ---
      { key: "boat", label: "Boat", icon: "fas fa-sailboat" },
      { key: "coins", label: "Coins", icon: "fas fa-coins" },
      { key: "crown", label: "Crown", icon: "fas fa-crown" },
      { key: "flask", label: "Flask", icon: "fas fa-flask" },
      { key: "food", label: "Food", icon: "fas fa-utensils" },
      { key: "quest", label: "Quest", icon: "fas fa-scroll" },
      { key: "shield", label: "Shield", icon: "fas fa-shield" },
      { key: "treasure", label: "Treasure", icon: "fas fa-gem" },
      { key: "bed", label: "Bed", icon: "fas fa-bed" },
      // --- Concepts & Symbols ---
      { key: "danger", label: "Danger", icon: "fas fa-skull-crossbones" },
      { key: "magic", label: "Magic", icon: "fas fa-magic" },
      { key: "puzzle", label: "Puzzle", icon: "fas fa-puzzle-piece" }
    ];

    const currentIcon = this.document.getFlag("campaign-codex", "icon-override");

    // --- HTML for the "Reset" radio button ---
    const resetHtml = `
      <div class="cc-icon-radio reset">
        <input 
          type="radio" 
          id="cc-icon-reset" 
          name="icon-override" 
          value="reset" 
          ${!currentIcon ? "checked" : ""}
        >
        <label for="cc-icon-reset" title="Reset to Default">
          <i class="fas fa-ban fa-fw"></i>
        </label>
      </div>
    `;

    // --- HTML for the icon grid radio buttons ---
    const iconGridHtml = ASSET_MAP.map(item => {
      const isChecked = currentIcon === item.icon;
      return `
        <div class="cc-icon-radio">
          <input 
            type="radio" 
            id="cc-icon-${item.key}" 
            name="icon-override" 
            value="${item.icon}" 
            ${isChecked ? "checked" : ""}
          >
          <label for="cc-icon-${item.key}" title="${item.label}">
            <i class="${item.icon}"></i>
          </label>
        </div>
      `;
    }).join("");

    const content = `
      <div class="cc-icon-picker-grid">
        ${resetHtml}
        ${iconGridHtml}
      </div>
    `;

    const dialog = foundry.applications.api.DialogV2.wait({
      window: { title: "Choose Icon Override" },
      id: this.document.id+"_iconPicker",
      classes: ["cc-icon-picker-dialog campaign-codex"],
      content,
      form: {
        closeOnSubmit: false 
      },
      buttons: [
        {
          action: "cancel",
          label: "Cancel",
          type: "button",
          default: false
        },
        {
          action: "save",
          label: "Save",
          type: "submit",
          default: true,
          callback: (event, button) => Object.fromEntries(new FormData(button.form))
        }
      ],
      submit: async (result, dialog) => {
        const selectedValue = result["icon-override"];

        if (selectedValue === "reset") {
          await this.document.unsetFlag("campaign-codex", "icon-override");
        } else if (selectedValue) {
          await this.document.setFlag("campaign-codex", "icon-override", selectedValue);
        }
        
        dialog.close();
      },
      close: () => {
        this.render();
      }
    })
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - TAB CONFIGURATION
  // =========================================================================

  /**
   * Opens a dialog to configure tab visibility and labels.
   * This is bound as a static action 'editTabs'.
   * @param {Event} event The triggering event.
   * @protected
   */
  static async #_onEditTabs(event) {
    event.preventDefault();
    const defaultTabVis = getDefaultSheetTabs(this.getSheetType()); 
    if (this.getSheetType() === "npc" && defaultTabVis.hasOwnProperty('npcs') && !defaultTabVis.hasOwnProperty('associates')) {
      defaultTabVis.associates = defaultTabVis.npcs;
      delete defaultTabVis.npcs;
    }
    const defaultTabs = this._getTabDefinitions();
    const currentOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];

    // Create data for the dialog, merging defaults with overrides
    const dialogTabs = defaultTabs.map(defaultTab => {
      const override = currentOverrides.find(o => o.key === defaultTab.key);
      const defaultVisibility = defaultTabVis[defaultTab.key] ?? true;
      return {
        key: defaultTab.key,
        originalLabel: defaultTab.label,
        overrideLabel: override?.label || "",
        visible: override?.visible ?? defaultVisibility,
        defaultVisibility: defaultVisibility
      };
    });

    const imageAreaOverride = currentOverrides.find(o => o.key === "imageArea");
    dialogTabs.push({
      key: "imageArea",
      originalLabel: "Sidebar Image",
      overrideLabel: "",
      hideLabel: true,
      visible: imageAreaOverride?.visible ?? true,
      defaultVisibility: true
    });
    const mapMarkerOverride = currentOverrides.find(o => o.key === "mapMarker");
    dialogTabs.push({
      key: "mapMarker",
      originalLabel: "Map Marker",
      overrideLabel: "",
      hideLabel: true,
      visible: mapMarkerOverride?.visible ?? true,
      defaultVisibility: true
    });

    const content = await renderTemplate(
      "modules/campaign-codex/templates/partials/tab-config-dialog.hbs", 
      { tabs: dialogTabs } 
    );
    
    new foundry.applications.api.DialogV2({
      window: { title: "Configure Tabs" },
      classes: ["cc-tab-config"],
      content,
      form: {
        closeOnSubmit: false 
      },
      buttons: [
        {
          action: "edit",
          label: "Edit Defaults",
          type: "button", 
          default: false,
          callback: () => "configure",
        },
        {
          label: "Reset",
          action: "reset",
          type: "button", 
          default: false,
          icon: "fas fa-undo",
          callback: () => "reset",
        },
        {
          action: "save",
          label: "Save",
          type: "submit", 
          default: true,
          callback: (event, button) => Object.fromEntries(new FormData(button.form)),
        },
      ],
      
      submit: async (result, dialog) => {
        if (result === "configure") {
          const tb = new tabPicker();
          const tabPickerClosed = new Promise((resolve) => {
            tb.addEventListener("close", () => resolve());
          });
          tb.render(true);
          await tabPickerClosed;
          await dialog.close();
          CampaignCodexBaseSheet.#_onEditTabs.call(this, event); 
          
          return;
        }
        if (result === "reset") {
          const proceed = await confirmationDialog("Are you sure you want to reset?");
          if (proceed) {
            this.document.unsetFlag("campaign-codex", "tab-overrides");
            // console.log("Tabs reset");
            dialog.close(); 
          }
          return;
        }

        const updates = result; 
        const newOverrides = [];
        
        for (const tab of dialogTabs) {
          const key = tab.key;
          const labelKey = `${key}.label`;
          const visibleKey = `${key}.visible`;
          const label = String(updates[labelKey] ?? "").trim();
          const visible = updates[visibleKey] === "on";
          newOverrides.push({
            key: key,
            label: label,
            visible: visible 
          });
        }
        const filteredOverrides = newOverrides.filter(o => {
          const originalTab = dialogTabs.find(d => d.key === o.key); 
          if (!originalTab) return false; 
          const isLabelOverridden = o.label && o.label !== originalTab.originalLabel;
          const isVisibilityOverridden = o.visible !== originalTab.defaultVisibility;
          return isLabelOverridden || isVisibilityOverridden;
        });

        if (filteredOverrides.length > 0) {
          this.document.setFlag("campaign-codex", "tab-overrides", filteredOverrides);
        } else {
          this.document.unsetFlag("campaign-codex", "tab-overrides");
        }
        
        dialog.close(); 
      },
      
      close: () => { this.render(); }
      
    }).render(true); 
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - UI TOGGLES
  // =========================================================================

  static #_onToggleQuicklinks(event) {
    event.preventDefault();
    this.#showQuicklinks = !this.#showQuicklinks;
    this.render(); 
  }

  static #_onToggleWidgets(event) {
    event.preventDefault();
    this.#showWidgets = !this.#showWidgets;
    this.render(); 
  }

  static #_onToggleTags(event) {
    event.preventDefault();
    this.#showTags = !this.#showTags;
    this.render();
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - WIDGET MANAGEMENT
  // =========================================================================
  

  static async #_onRemoveShop(event) {
    await this._onRemoveFromList(event,"linkedShops");
  }  

  static async #_onRemoveNPC(event) {
    const myType = this.getSheetType();
    if (myType && myType === "npc"){
      await this._onRemoveFromList(event,"associates");
    } else {
      await this._onRemoveFromList(event,"linkedNPCs");
    }
  }  

  static async #_onRemoveAssociate(event) {
    await this._onRemoveFromList(event,"associates");
  }  

  static async #_onRemoveParentRegion(event) {
    await this._onRemoveFromList(event,"parentRegions");
  }  


  static async #_onRemoveRegion(event) {
    await this._onRemoveFromList(event,"linkedRegions");
  }  


  static async #_openActor(event) {
    await this._onOpenDocument(event,"actor");
  }

  static async #_openAssociate(event) {
    await this._onOpenDocument(event,"associate");
  }

  static async #_openGroup(event) {
    await this._onOpenDocument(event,"group");
  }

  static async #_openRegion(event) {
    await this._onOpenDocument(event,"region");
  }

  static async #_openShop(event) {
    await this._onOpenDocument(event,"shop");
  }

  static async #_openLocation(event) {
    await this._onOpenDocument(event, "location");
  }

  static async #_openNPC(event) {
    await this._onOpenDocument(event,"npc");
  }

  static async #_openJournal(event) {
    await this._onOpenDocument(event,"journal");
  }


  static async #_onAddWidget(event) {
    event.preventDefault();
    event.stopPropagation();
    const widgetName = event.target.dataset.name;
    if (!widgetName) return;
    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const existingCounters = sheetWidgets
      .filter(w => w.widgetName === widgetName)
      .map(w => w.counter || 0);
    const maxCounter = existingCounters.length > 0 ? Math.max(...existingCounters) : 0;
    const newCounter = maxCounter + 1;
    const newWidget = {
      id: foundry.utils.randomID(),
      widgetName: widgetName,
      counter: newCounter,  
      active: true
    };
    if (sheetWidgets.some(w => w.id === newWidget.id)) {
      return ui.notifications.warn("A random ID collision occurred. Please try again.");
    }

    await this.document.setFlag("campaign-codex", "sheet-widgets", [...sheetWidgets, newWidget]);
  }

  static async #_onActivateWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const widget = sheetWidgets.find(w => w.id === widgetId);

    if (widget) {
      widget.active = true;
      await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
    }
  }

  static async #_onDeactivateWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const widget = sheetWidgets.find(w => w.id === widgetId);

    if (widget) {
      widget.active = false;
      await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
    }
  }

  static async #_onDeleteWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    const widgetType = event.target.dataset.type; // This is the 'widgetName'
    if (!widgetId || !widgetType) return;

    const proceed = await confirmationDialog("Are you sure you want to delete this widget?");
    if (!proceed) return;

    try {
      const currentWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];

      const newWidgets = currentWidgets.filter(w => w.id !== widgetId);

      const parentPath = `flags.campaign-codex.data.widgets.${widgetType.toLowerCase()}`;
      console.log(`Campaign Codex | Removing widget ${widgetId} and its data.`);

      return await this.document.update({
        "flags.campaign-codex.sheet-widgets": newWidgets, // Set the new array
        [parentPath]: {
          [`-=${widgetId}`]: null
        }
      });

    } catch (error) {
      console.error(`Campaign Codex | Error deleting widget ${widgetType} (ID: ${widgetId}):`, error);
      return undefined;
    }
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - TAG & SCENE MANAGEMENT
  // =========================================================================

  static async #_onClickTag(event) {
    event.preventDefault();
     const uuid = event.target.closest('[data-uuid]').dataset.uuid;
     if (!uuid) return;
     await this._linkTagToSheet(event, uuid);
    }
  

  static async #_onCreateTag(event) {
    event.stopPropagation();
    event.preventDefault();
    // console.log(event);
    const name = await promptForName("Tag");
    if (name) {
      const tagJournal = await game.campaignCodex.createNPCJournal(null, name, true);
      if (tagJournal) {
        await this._linkTagToSheet(event, tagJournal.uuid);
      }
    }
  }

  static async #_onRemoveScene(event) {
    event.preventDefault();
    // await this._saveFormData();
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.linkedScene = null;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
    ui.notifications.info("Unlinked scene");
  }

  static async #_onOpenScene(event) {
    event.preventDefault();
    await game.campaignCodex.openLinkedScene(this.document);
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - ITEM MANAGEMENT
  // =========================================================================

  static async #_onOpenItem(event) {
    event.stopPropagation();
    const itemUuid = event.target.closest('[data-uuid]').dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (item) {
      item.sheet.render(true);
    } else {
      ui.notifications.warn("Item not found in world items");
    }
  }

  static async #_onSendToPlayer(event) {
    event.stopPropagation();
    const target = event.target.closest('[data-uuid]');
    const questId = (target.dataset?.type === "quest" && target.dataset.questId)
      ? target.dataset.questId
      : null;
    const itemUuid = target.dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);

    if (!item) {
      ui.notifications.warn("Item not found");
      return;
    }

    let sourceDoc = this.document;
    if (this.document.getFlag("campaign-codex", "type") ==="group")
    {
      const sourceUuid = event.target.closest('[data-doc-uuid]')?.dataset.docUuid;
      if (!sourceUuid) {
        ui.notifications.warn("No source document set");
      return;
      }
      sourceDoc = await fromUuid(sourceUuid);
    }

    TemplateComponents.createPlayerSelectionDialog(item.name, async (targetActor) => {
      await this._transferItemToActor(item, targetActor, sourceDoc, questId);
    });
  }

  static async #_onRemoveQuestItem(event) {
    event.stopPropagation();
    const target = event.target.closest('[data-uuid]');
    const { questId, itemUuid } = target.dataset;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);

    if (quest) {
      quest.inventory = (quest.inventory || []).filter((i) => i.itemUuid !== itemUuid);
      await this.document.setFlag("campaign-codex", "data.quests", quests);
      this.render();
    }
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - CREATION
  // =========================================================================

  static async #_onCreateNPCJournal(event) {
    event.preventDefault();
    const name = await promptForName("NPC");
    const myDoc = this.document;
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (name) {
      const npcJournal = await game.campaignCodex.createNPCJournal(null, name);
      if (npcJournal) {
        switch (myType) {
          case 'npc':
            await game.campaignCodex.linkNPCToNPC(this.document, npcJournal);
            break;
          case 'location':
            await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
            break;
          case 'region':
            await game.campaignCodex.linkRegionToNPC(this.document, npcJournal);
            break;
          case 'shop':
            await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
            break;
          default:
            return;
        }
        this.render(true);
        npcJournal.sheet.render(true);
      }
    }
  }

    static async #_onCreateShopJournal(event) {
    event.preventDefault();
    const myDoc = this.document;
    const name = await promptForName(localize("names.shop"));
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (name) {
      const shopJournal = await game.campaignCodex.createShopJournal(name);
      if (shopJournal) {
        switch (myType) {
          case 'npc':
            await game.campaignCodex.linkShopToNPC(shopJournal, this.document);
            break;
          case 'location':
            await game.campaignCodex.linkLocationToShop(this.document, shopJournal);
            break;
          case 'region':
            await game.campaignCodex.linkRegionToShop(this.document, shopJournal);
            break;
          default:
            return;
        }
        this.render(true);
        shopJournal.sheet.render(true);
      }
    }
  }



  static async #_onCreateRegionJournal(event) {
    event.preventDefault();
    const name = await promptForName(localize("names.region"));
    const myDoc = this.document;
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (name) {
      const regionJournal = await game.campaignCodex.createRegionJournal(name);
      if (regionJournal) {
        switch (myType) {
          case 'npc':
             await game.campaignCodex.linkRegionToNPC(regionJournal, this.document);
             break;
          // case 'location':
          //   await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
          //   break;
          case 'region':
            await game.campaignCodex.linkRegionToRegion(this.document, regionJournal);
            break;
          // case 'shop':
          //   await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
          //   break;
          default:
            return;
        }
        this.render(true);
        regionJournal.sheet.render(true);
      }
    }
  }

    static async #_onCreateLocationJournal(event) {
    event.preventDefault();
    const name = await promptForName(localize("names.location"));
    const myDoc = this.document;
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (name) {
      const locationJournal = await game.campaignCodex.createLocationJournal(name);
      if (locationJournal) {
        switch (myType) {
          case 'npc':
             await game.campaignCodex.linkLocationToNPC(locationJournal, this.document);
          //   break;
          // case 'location':
          //   await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
          //   break;
          case 'region':
            await game.campaignCodex.linkRegionToLocation(this.document, locationJournal);
            break;
          // case 'shop':
          //   await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
          //   break;
          default:
            return;
        }
        this.render(true);
        locationJournal.sheet.render(true);
      }
    }
  }


 
  // =========================================================================
  // STATIC ACTION HANDLERS - REMOVE OBJECTS
  // =========================================================================

  static async #_onRemoveStandardJournal(event) {
    event.preventDefault();
    event.stopPropagation(); 
    // await this._saveFormData();

    const journalUuid = event.target.closest(".remove-standard-journal").dataset.journalUuid;
    if (!journalUuid) return;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    if (currentData.linkedStandardJournals && Array.isArray(currentData.linkedStandardJournals)) {
      currentData.linkedStandardJournals = currentData.linkedStandardJournals.filter(uuid => uuid !== journalUuid);
      await this.document.setFlag("campaign-codex", "data", currentData);
      this.render();
      ui.notifications.info("Unlinked journal.");
    }
  }

  // static async #_onRemoveLocationFromRegion(event) {

  // }

  static async #_onRemoveLocation(event) {
    const docType = this.document.getFlag("campaign-codex", "type");
    if (docType){
      if (docType === "region" || docType === "location" ){
        // console.log(event);
        this._onRemoveFromRegion(event);
      }
    }

    event.stopPropagation();      
    const myType = this.getSheetType();
    if (myType && myType === "npc"){
      const locationCard = event.target.closest(".entity-card");
      if (locationCard?.getAttribute("data-source") === "shop") {
        ui.notifications.warn(format("warn.directly", { type: localize("names.location") }));
        return;
      }
      await this._onRemoveFromList(event, "linkedLocations");
      return;
    }
    const shopDoc = this.document;
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const locationUuid = shopData.linkedLocation;

    if (!locationUuid) return;

    try {
      const locationDoc = await fromUuid(locationUuid);
      if (locationDoc) {
        const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
        if (locationData.linkedShops) {
          locationData.linkedShops = locationData.linkedShops.filter((uuid) => uuid !== shopDoc.uuid);

          locationDoc._skipRelationshipUpdates = true;
          await locationDoc.setFlag("campaign-codex", "data", locationData);
          delete locationDoc._skipRelationshipUpdates;

          for (const app of foundry.applications.instances.values()) {
          // for (const app of Object.values(ui.windows)) {
            if (app.document?.uuid === locationDoc.uuid) {
              if (app.rendered) app.render(true);
            }
          }
        }
      }

      shopDoc._skipRelationshipUpdates = true;
      await shopDoc.update({
        "flags.campaign-codex.data.linkedLocation": null,
      });
      delete shopDoc._skipRelationshipUpdates;
    } catch (error) {
      console.error("Campaign Codex | Error removing location link:", error);
      ui.notifications.error("Failed to remove location link.");
    } finally {
      this.render(true);
    }
  }


  static async #_onRemoveParentFromRegion(event) {
    event.preventDefault();
    event.stopPropagation();
    // await this._saveFormData();

    const myType = this.getSheetType();
    let regionDoc, regionParentDoc;

    regionDoc = this.document;
    const regionUuid = regionDoc.getFlag("campaign-codex", "data")?.parentRegion;
    if (regionUuid) regionParentDoc = await fromUuid(regionUuid);

    if (!regionParentDoc || !regionDoc) {
      ui.notifications.warn("Could not find the linked region or parent region.");
      return this.render();
    }

    const regionData = regionParentDoc.getFlag("campaign-codex", "data") || {};
    if (regionData.linkedRegions) {
      regionData.linkedRegions = regionData.linkedRegions.filter((uuid) => uuid !== regionDoc.uuid);
      await regionParentDoc.setFlag("campaign-codex", "data", regionData);
    }
    await regionDoc.unsetFlag("campaign-codex", "data.parentRegion");

    ui.notifications.info(`Removed "${regionDoc.name}" from region "${regionParentDoc.name}"`);
    targetedRefresh([regionParentDoc.uuid, regionDoc.uuid], this.document.uuid);
  }

  async _onRemoveFromRegion(event) {
    event.preventDefault();
    event.stopPropagation();
    // await this._saveFormData();

    const myType = this.getSheetType();
    let locationDoc, regionDoc;

    if (myType === "location") {
      locationDoc = this.document;
      const regionUuid = locationDoc.getFlag("campaign-codex", "data")?.parentRegion;
      if (regionUuid) regionDoc = await fromUuid(regionUuid);
    } else if (myType === "region") {
      regionDoc = this.document;
      const locationUuid = event.target.closest('[data-uuid]').dataset.uuid;
      if (locationUuid) locationDoc = await fromUuid(locationUuid);
    }

    if (!locationDoc || !regionDoc) {
      ui.notifications.warn("Could not find the linked region or location.");
      return this.render(false);
    }

    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};
    if (regionData.linkedLocations) {
      regionData.linkedLocations = regionData.linkedLocations.filter((uuid) => uuid !== locationDoc.uuid);
      await regionDoc.setFlag("campaign-codex", "data", regionData);
    }
    await locationDoc.unsetFlag("campaign-codex", "data.parentRegion");

    ui.notifications.info(`Removed "${locationDoc.name}" from region "${regionDoc.name}"`);
    targetedRefresh([regionDoc.uuid, locationDoc.uuid], this.document.uuid);
  }




  // =========================================================================
  // STATIC ACTION HANDLERS - DROP TO MAP
  // =========================================================================

  static async #_onDropNPCsToMapClick(event) {
    event.preventDefault();
    console.log(event);
    const sheetType = this.getSheetType();
    if (sheetType === "npc") {
      this._onDropNPCsToMapNPCSheet(event);
    } else if (sheetType === "location") {
      this._onDropNPCsToMapLocationSheet(event);
    } else if (sheetType === "region") {
      this._onDropNPCsToMapLocationSheet(event);
    } else if (sheetType === "shop") {
      this._onDropNPCsToMapShopSheet(event);
    } else {
      ui.notifications.warn(`Drop to map not implemented for ${sheetType} sheets`);
    }
  }

  static async #_onDropMembersToMapClick(event) {
    event.preventDefault();

    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    const associates = await CampaignCodexLinkers.getAssociates(this.document, npcData.associates || []);
    const taggedNPCs = associates.filter((npc) => npc.tag === true);
    const associatesWithoutTaggedNPCs = associates.filter((npc) => npc.tag !== true);

    if (associatesWithoutTaggedNPCs.length > 0) {
      await this._onDropNPCsToMap(associatesWithoutTaggedNPCs, {
        title: format("message.droptomap", { type: this.document.name }),
      });
    } else {
      ui.notifications.warn(localize("warn.invaliddrop"));
    }
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - DROP TO MAP (SHEET-SPECIFIC)
  // =========================================================================

  async _onDropNPCsToMapNPCSheet(event) {
    event.preventDefault();
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    if (!npcData.linkedActor) return ui.notifications.warn("This NPC has no linked actor to drop!");
    try {
      const linkedActor = await fromUuid(npcData.linkedActor);
      if (!linkedActor) return ui.notifications.warn(localize("warn.actornotfound"));
      const npcForDrop = {
        id: this.document.id,
        uuid: this.document.uuid,
        name: this.document.name,
        img: this.document.getFlag("campaign-codex", "image") || linkedActor.img,
        actor: linkedActor,
      };
      await this._onDropNPCsToMap([npcForDrop], {
        title: `Drop ${this.document.name} to Map`,
        showHiddenToggle: true,
      });
    } catch (error) {
      console.error("Campaign Codex | Error dropping NPC to map:", error);
      ui.notifications.error(localize("warn.failedtodrop"));
    }
  }

  async _onDropNPCsToMapLocationSheet(event) {
    event.preventDefault();
    const locationData = this.document.getFlag("campaign-codex", "data") || {};
    const rawDirectNPCs = await CampaignCodexLinkers.getDirectNPCs(this.document, locationData.linkedNPCs || []);
    const directNPCs = rawDirectNPCs.filter((npc) => npc.tag !== true);

    if (directNPCs?.length > 0) {
      await this._onDropNPCsToMap(directNPCs, { title: format("message.droptomap", { type: this.document.name }) });
    } else {
      ui.notifications.warn(localize("warn.invaliddrop"));
    }
  }

  async _onDropNPCsToMapShopSheet(event) {
    event.preventDefault();

    const shopData = this.document.getFlag("campaign-codex", "data") || {};
    const rawLinkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(this.document, shopData.linkedNPCs || []);
    const linkedNPCs = rawLinkedNPCs.filter((npc) => npc.tag !== true);

    if (linkedNPCs && linkedNPCs.length > 0) {
      await this._onDropNPCsToMap(linkedNPCs, {
        title: `Drop ${this.document.name} NPCs to Map`,
      });
    } else {
      ui.notifications.warn("No NPCs with linked actors found to drop!");
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

  // =========================================================================
  // INSTANCE EVENT HANDLERS - INVENTORY MANAGEMENT
  // =========================================================================

  async _onLootToggle(event) {
    const isLoot = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.isLoot = isLoot;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render();
  }

  async _onCashChange(event) {
    const inventoryCash = parseFloat(event.target.value) || 0;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.inventoryCash = inventoryCash;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
  }

  async _onMarkupChange(event) {
    const markup = parseFloat(event.target.value) || 1.0;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.markup = markup;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
  }

  async _onQuantityChange(event) {
    let quantity = parseInt(event.target.value);
    if (isNaN(quantity) || quantity < 0) {
      quantity = 0;
    }
    const itemUuid = event.currentTarget.dataset.uuid;
    await this._updateInventoryItem(itemUuid, { quantity });
  }

  async _onQuantityDecrease(event) {
    const itemUuid = event.currentTarget.dataset.uuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const item = inventory.find((i) => i.itemUuid === itemUuid);
    if (item && item.quantity > 0) {
      await this._updateInventoryItem(itemUuid, {
        quantity: item.quantity - 1,
      });
    }
  }

  async _onQuantityIncrease(event) {
    const itemUuid = event.currentTarget.dataset.uuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const item = inventory.find((i) => i.itemUuid === itemUuid);

    if (item) {
      await this._updateInventoryItem(itemUuid, {
        quantity: item.quantity + 1,
      });
    }
  }

  async _onPriceChange(event) {
    const price = parseFloat(event.target.value) || null;
    const itemUuid = event.currentTarget.dataset.uuid;
    await this._updateInventoryItem(itemUuid, { customPrice: price });
  }

  async _onRemoveItem(event) {
    const itemUuid = event.currentTarget.dataset.uuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};

    currentData.inventory = (currentData.inventory || []).filter((i) => i.itemUuid !== itemUuid);
    await this.document.setFlag("campaign-codex", "data", currentData);

    this.render(true);
  }

  async _onSortInventory(event) {
    event.preventDefault();

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = await CampaignCodexLinkers.getInventory(this.document, currentData.inventory || []);

    inventory.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const sortedMinimalInventory = inventory.map((item) => ({
      customPrice: item.customPrice,
      itemUuid: item.itemUuid,
      quantity: item.quantity,
    }));

    await this.document.setFlag("campaign-codex", "data", {
      ...currentData,
      inventory: sortedMinimalInventory,
    });

    this.render(false);
  }

  _onItemDragStart(event) {
    const itemUuid = event.currentTarget.dataset.uuid;

    const dragData = {
      type: "Item",
      uuid: itemUuid,
      source: "shop",
      shopId: this.document.id,
    };

    event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));

    event.currentTarget.style.opacity = "0.5";
  }

  _onItemDragEnd(event) {
    event.currentTarget.style.opacity = "1";
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - TAG MANAGEMENT
  // =========================================================================

  async _linkTagToSheet(event, tagUuid) {
    const myDoc = this.document;
    const myType = myDoc.getFlag("campaign-codex", "type");
    const tagDoc = await fromUuid(tagUuid);

    if (!tagDoc) {
      ui.notifications.warn("Could not find the tag to link.");
      return;
    }

    switch (myType) {
      case 'npc':
        await game.campaignCodex.linkNPCToNPC(myDoc, tagDoc);
        break;
      case 'location':
        await game.campaignCodex.linkLocationToNPC(myDoc, tagDoc);
        break;
      case 'region':
        await game.campaignCodex.linkRegionToNPC(myDoc, tagDoc);
        break;
      case 'shop':
        await game.campaignCodex.linkShopToNPC(myDoc, tagDoc);
        break;
      default:
        return;
    }
    // targetedRefresh([tagDoc.uuid, myDoc.uuid], this.document.uuid);
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - OBJECTIVE MANAGEMENT
  // =========================================================================

  async _onAddObjective(event) {
    event.preventDefault();
    event.stopPropagation();
    const questId = event.currentTarget.dataset.questId;
    const parentId = event.currentTarget.dataset.parentId; // Will be undefined for top-level objectives
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    const newObjective = {
      id: foundry.utils.randomID(),
      text: "New Objective",
      completed: false,
      visible: false,
      objectives: [] // For sub-objectives
    };

    if (parentId) {
      // This is a sub-objective
      const findParent = (objectives) => {
        for (const obj of objectives) {
          if (obj.id === parentId) return obj;
          const found = findParent(obj.objectives || []);
          if (found) return found;
        }
        return null;
      };
      const parentObjective = findParent(quest.objectives || []);
      if (parentObjective) {
        parentObjective.objectives = parentObjective.objectives || [];
        parentObjective.objectives.push(newObjective);
      }
    } else {
      // This is a top-level objective
      quest.objectives = quest.objectives || [];
      quest.objectives.push(newObjective);
    }

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render();
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

    const findAndRemove = (objectives) => {
      for (let i = 0; i < objectives.length; i++) {
        if (objectives[i].id === objectiveId) {
          objectives.splice(i, 1);
          return true;
        }
        if (findAndRemove(objectives[i].objectives || [])) return true;
      }
      return false;
    };

    findAndRemove(quest.objectives);

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }


  //   static async #_questToggle(event, target){
  //   if (!game.user.isGM) return;

  //   const field = target.dataset.field;
  //   const fields = ["completed", "visible", "pinned"];
  //   if (!fields.includes(field)) return;

  //   const docUuid = target.dataset.uuid;
    
  //   let currentData;
  //   let currentDoc;
  //   let value;
    
  //   if (!docUuid) return;
  //   if (docUuid === this.document.uuid){
  //     currentDoc = this.document;
  //   }
  //   else
  //   {
  //     currentDoc = await fromUuid(docUuid);

  //   }
  //   if (!currentDoc) return;
  //   currentData = currentDoc.getFlag("campaign-codex", "data") || {};
  //   const questId = target.dataset.questId;
  //   const quests = foundry.utils.deepClone(currentData.quests || []);
  //   const quest = quests.find(q => q.id === questId);
  //   if (!quest) return;
    
  //   value = !quest[field]; 
  //   quest[field] = value;
  //   await currentDoc.setFlag("campaign-codex", "data.quests", quests);
  //   if (field === "completed"){
  //     target.classList.toggle('fa-circle-xmark', !quest[field]);
  //     target.classList.toggle('fa-circle-check', quest[field]);
  //   } else if (field === "visible"){
  //     target.classList.toggle('fa-eye-slash', !quest[field]);
  //     target.classList.toggle('fa-eye', quest[field]);
  //   } else if (field === "pinned"){
  //     target.classList.toggle('fa-thumbtack-slash', !quest[field]);
  //     target.classList.toggle('fa-thumbtack', quest[field]);
  //   }
  // }    

static async #_objectiveToggle (event, target) {
    event.preventDefault();
    const { questId, objectiveId, field, uuid } = target.dataset;
    console.log(field);
    let currentData;
    let currentDoc;

    if (!uuid) return;
    if (uuid === this.document.uuid){
      currentDoc = this.document;
    }
    else
    {
      currentDoc = await fromUuid(uuid);

    }
    if (!currentDoc) return;
    console.log(currentDoc);
    currentData = currentDoc.getFlag("campaign-codex", "data") || {};

    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest || !quest.objectives) return;

    const findAndUpdate = (objectives) => {
      for (const obj of objectives) {
        if (obj.id === objectiveId) {
          obj[field] = !obj[field];
          return true;
        }
        if (findAndUpdate(obj.objectives || [])) return true;
        // target.classList.toggle('fa-circle', !obj[field]);
        // target.classList.toggle('fa-circle-check', obj[field]);
      }
      return false;
    };

    findAndUpdate(quest.objectives);

    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
}


  // /**
  //  * Handle updating a boolean field on an objective (e.g., 'completed' or 'visible').
  //  * @param {MouseEvent} event The triggering click event.
  //  */
  // async _onUpdateObjective(event) {
  //   event.preventDefault();
  //   const { questId, objectiveId, field } = event.currentTarget.dataset;
  //   const currentData = this.document.getFlag("campaign-codex", "data") || {};
  //   const quests = foundry.utils.deepClone(currentData.quests || []);
  //   const quest = quests.find(q => q.id === questId);
  //   if (!quest || !quest.objectives) return;

  //   const findAndUpdate = (objectives) => {
  //     for (const obj of objectives) {
  //       if (obj.id === objectiveId) {
  //         obj[field] = !obj[field];
  //         return true;
  //       }
  //       if (findAndUpdate(obj.objectives || [])) return true;
  //     }
  //     return false;
  //   };

  //   findAndUpdate(quest.objectives);

  //   await this.document.setFlag("campaign-codex", "data.quests", quests);
  //   this.render();
  // }

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

    const findAndUpdate = (objectives) => {
      for (const obj of objectives) {
        if (obj.id === objectiveId) {
          obj.text = newText;
          return true;
        }
        if (findAndUpdate(obj.objectives || [])) return true;
      }
      return false;
    };

    if (newText) {
      findAndUpdate(quest.objectives);
      await this.document.setFlag("campaign-codex", "data.quests", quests);
    }

    this.render();
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - OBJECTIVE DRAG & DROP
  // =========================================================================

  _onObjectiveDragStart(event) {
    event.stopPropagation(); 
    const questId = event.currentTarget.dataset.questId;
    const objectiveId = event.currentTarget.dataset.objectiveId;
    event.dataTransfer.setData("text/plain", JSON.stringify({ questId, objectiveId }));
    event.currentTarget.classList.add("dragging");
  }

  _onObjectiveDragEnter(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + (rect.height / 2);
    if (event.clientY < midY) {
      target.classList.add("drag-over-top");
    } else {
      target.classList.add("drag-over-bottom");
    }
  }

  _onObjectiveDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over-top", "drag-over-bottom");
  }

  _onObjectiveDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const target = event.currentTarget;
    target.classList.remove("drag-over-top", "drag-over-bottom");
    const rect = target.getBoundingClientRect();
    const midY = rect.top + (rect.height / 2);
    if (event.clientY < midY) {
      target.classList.add("drag-over-top");
    } else {
      target.classList.add("drag-over-bottom");
    }
  }

  async _onObjectiveDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const dragData = JSON.parse(event.dataTransfer.getData("text/plain"));
    const dropTarget = event.currentTarget;
    const insertBefore = dropTarget.classList.contains("drag-over-top");
    dropTarget.classList.remove("drag-over-top", "drag-over-bottom");

    const questId = dropTarget.dataset.questId;
    const targetId = dropTarget.dataset.objectiveId;

    if (dragData.questId !== questId || dragData.objectiveId === targetId) return;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    let draggedObjective = null;
    const findAndRemove = (objectives) => {
      for (let i = 0; i < objectives.length; i++) {
        if (objectives[i].id === dragData.objectiveId) {
          [draggedObjective] = objectives.splice(i, 1);
          return true;
        }
        if (findAndRemove(objectives[i].objectives || [])) return true;
      }
      return false;
    };
    findAndRemove(quest.objectives);

    if (!draggedObjective) return;

    const findAndInsert = (objectives) => {
      for (let i = 0; i < objectives.length; i++) {
        if (objectives[i].id === targetId) {
          const insertIndex = insertBefore ? i : i + 1;
          objectives.splice(insertIndex, 0, draggedObjective);
          return true;
        }
        if (findAndInsert(objectives[i].objectives || [])) return true;
      }
      return false;
    };

    if (!findAndInsert(quest.objectives)) {
      quest.objectives.push(draggedObjective);
    }

    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }

  _onObjectiveDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    document.querySelectorAll('.objective-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - QUEST MANAGEMENT
  // =========================================================================

  static async #_questToggle(event, target){
    if (!game.user.isGM) return;

    const field = target.dataset.field;
    const fields = ["completed", "visible", "pinned"];
    if (!fields.includes(field)) return;

    const docUuid = target.dataset.uuid;
    
    let currentData;
    let currentDoc;
    let value;
    
    if (!docUuid) return;
    if (docUuid === this.document.uuid){
      currentDoc = this.document;
    }
    else
    {
      currentDoc = await fromUuid(docUuid);

    }
    if (!currentDoc) return;
    currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const questId = target.dataset.questId;
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;
    
    value = !quest[field]; 
    quest[field] = value;
    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    if (field === "completed"){
      target.classList.toggle('fa-circle-xmark', !quest[field]);
      target.classList.toggle('fa-circle-check', quest[field]);
    } else if (field === "visible"){
      target.classList.toggle('fa-eye-slash', !quest[field]);
      target.classList.toggle('fa-eye', quest[field]);
    } else if (field === "pinned"){
      target.classList.toggle('fa-thumbtack-slash', quest[field]);
      target.classList.toggle('fa-thumbtack', !quest[field]);
    }
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
    this.render();
  }

  async _onRemoveQuest(event) {
    event.preventDefault();
    event.stopPropagation();
    const questId = event.currentTarget.dataset.questId;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const proceed = await confirmationDialog("Are you sure you want to delete this quest?");
    if (proceed) {
      let quests = currentData.quests || [];
      quests = quests.filter(q => q.id !== questId);
      await this.document.setFlag("campaign-codex", "data.quests", quests);
      this.render();
    }
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
    // if (isIconToggle) {
    //   if (field === 'completed' || game.user.isGM) {
    //     value = !quest[field]; 
    //   } else {
    //     return; 
    //   }
    // } else 
    if (isProseMirror) {
      value = (Array.isArray(element.value) ? element.value[0] : element.value);
    } else { 
      value = element.value;
    }
    quest[field] = value;
    await this.document.setFlag("campaign-codex", "data.quests", quests);
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
    input.className = "quest-title-input"; 
    input.value = titleElement.textContent.trim();
    input.dataset.questId = titleElement.dataset.questId; 

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
    titleElement.textContent = quest ? quest.title : 'New Quest'; 

    input.replaceWith(titleElement);
    titleElement.addEventListener('click', this._onQuestTitleEdit.bind(this));
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - DRAG & DROP
  // =========================================================================

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  }

  async _onDrop(event) {
    event.stopPropagation();
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
      await this._handleDrop(data, event);

    } catch (error) {
      console.error("Campaign Codex | Error handling drop:", error);
    } finally {
      this._dropping = false;
    }
    if (foundry.applications.instances.get("campaign-codex-toc-sheet")) {
      foundry.applications.instances.get("campaign-codex-toc-sheet").render();
    }
  }

  async _handleItemDrop(data, event) {
    if (!data.uuid) {
      ui.notifications.warn("Could not find item to add to entry");
      return;
    }
    event.stopPropagation();

    const item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications.warn("Could not find item to add to entry");
      return;
    }
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    
    // QUEST DROP
    const dropOnQuest = event.target.closest('.quest-item');
    if (dropOnQuest) {
      const questId = dropOnQuest.dataset.questId;
      const quests = foundry.utils.deepClone(currentData.quests || []);
      const quest = quests.find(q => q.id === questId);
      if (quest) {
        quest.inventory = quest.inventory || [];
        const existingItem = quest.inventory.find((i) => i.itemUuid === item.uuid);
        if (existingItem) {
          existingItem.quantity = (existingItem.quantity || 0) + 1;
        } else {
          quest.inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
        }
        await this.document.setFlag("campaign-codex", "data.quests", quests);
        this.render();
        ui.notifications.info(`Added "${item.name}" to quest "${quest.title}"`);
      }
    } else {
      // INVENTORY DROP
      const inventory = currentData.inventory || [];
      // if (inventory.find((i) => i.itemUuid === item.uuid)) {
      //   ui.notifications.warn("Item already exists in inventory!");
      //   return;
      // }
      await game.campaignCodex.addItemToShop(this.document, item, 1);
      this.render();
      ui.notifications.info(format("inventory.added", { type: item.name }));
    }
  }

  async _handleActorDrop(context, event) {
    const actor = await fromUuid(context.uuid);
    if (!actor) return ui.notifications.warn("Could not find the dropped actor.");

    // await this._saveFormData();
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
            return;
          }
        }
        break;
      }
      default:
        return ui.notifications.warn(`Actor drop not configured for "${sheetType}" sheets.`);
    }
    this.render();
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - NAME & TYPE EDITING
  // =========================================================================



_onMarkerEdit(event) {
    const typeElement = event.currentTarget;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "marker-input"; 
    input.maxLength = 4; // Limits input to 4 characters
    input.value = typeElement.textContent;

    input.addEventListener("input", function() {
      this.value = this.value.replace(/[^a-zA-Z0-9]/g, "");
    });

    typeElement.replaceWith(input);
    input.focus();
    input.select();
  }

  async _onMarkerSave(event) {
    if (!event.target.classList.contains("marker-input")) return;
    const input = event.target;
    const newType = input.value.trim();
    await this.document.setFlag("campaign-codex", "data.mapMarker", newType);
    this.render(false);
  }

  async _onMarkerKeypress(event) {
    if (event.key === "Enter" && event.target.classList.contains("marker-input")) {
      event.preventDefault();
      event.target.blur();
    }
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
    if (this.document.getFlag("campaign-codex", "data")?.tagMode) {
      game.campaignCodex.updateTagInCache(this.document);
    }
  }

  async _onNameKeypress(event) {
    if (event.key === "Enter" && event.target.classList.contains("name-input")) {
      event.preventDefault();
      event.target.blur();
    }
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - DOCUMENT MANAGEMENT
  // =========================================================================



  async _onOpenDocument(event, type) {
    if (event.target.closest(".entity-image, .shop-icon, .card-image-clickable")) {
      return; 
    }
    event.stopPropagation();

    const uuid = event.target.closest('[data-uuid]').dataset.uuid;
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
    event.stopPropagation();
    // await this._saveFormData();
    const itemUuid = event.target.closest('[data-uuid]').dataset.uuid;
    const myDoc = this.document;
    const myData = myDoc.getFlag("campaign-codex", "data") || {};
    const myType = myDoc.getFlag("campaign-codex", "type");
    if (!myData[listName]) return;

    const originalLength = Array.isArray(myData[listName]) ? myData[listName].length : myData[listName] ? 1 : 0;
    if (Array.isArray(myData[listName])) {
      myData[listName] = myData[listName].filter((uuid) => uuid !== itemUuid);
    } else {
      myData[listName] = null;
    }
    const newLength = Array.isArray(myData[listName]) ? myData[listName].length : myData[listName] ? 1 : 0;
    if (originalLength === newLength) {
      this.render();
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
          "region:linkedRegions": { targetType: "region", reverseField: "parentRegions", isArray: true },
          "region:parentRegions": { targetType: "region", reverseField: "linkedRegions", isArray: true },
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
    // console.log("remove targeted");
    targetedRefresh([targetDoc.uuid, myDoc.uuid], this.document.uuid);
  }





  // =========================================================================
  // DATA MANAGEMENT UTILITIES
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
/**
 * Updates an inventory item's data in the specified document's flag.
 * @param {string} itemUuid - The UUID of the item to update.
 * @param {object} updates - The key/value pairs to update on the item.
 * @param {Document|null} [doc=null] - The document to update. If null, defaults to this.document.
 */
async _updateInventoryItem(itemUuid, updates, doc = null) {
  let currentDoc;
  if (doc instanceof foundry.abstract.Document) {
    currentDoc = doc;
  } else {
    currentDoc = this.document;
  }
  if (!currentDoc || typeof currentDoc.getFlag !== 'function') {
    console.error("Campaign Codex | _updateInventoryItem called with no valid document.");
    return;
  }
  const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
  const inventory = foundry.utils.deepClone(currentData.inventory || []);
  
  const itemIndex = inventory.findIndex((i) => i.itemUuid === itemUuid);

  if (itemIndex !== -1) {
    inventory[itemIndex] = { ...inventory[itemIndex], ...updates };

    await currentDoc.setFlag("campaign-codex", "data.inventory", inventory);


  }
}
// /**
//    * Updates an inventory item's data in the specified document's flag.
//    * @param {string} itemUuid - The UUID of the item to update.
//    * @param {object} updates - The key/value pairs to update on the item.
//    * @param {Document|null} [doc=null] - The document to update. If null, defaults to this.document.
//    */
//   async _updateInventoryItem(itemUuid, updates, doc = null) {
//     let currentDoc;
//     if (doc instanceof foundry.abstract.Document) {
//       currentDoc = doc;
//     } else {
//       currentDoc = this.document;
//     }
    
//     if (!currentDoc || typeof currentDoc.getFlag !== 'function') {
//       console.error("Campaign Codex | _updateInventoryItem called with no valid document.");
//       return;
//     }

//     const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
//     const inventory = foundry.utils.deepClone(currentData.inventory || []);
    
//     const itemIndex = inventory.findIndex((i) => i.itemUuid === itemUuid);

//     if (itemIndex !== -1) {
//       // 1. Update the Database (Flag)
//       inventory[itemIndex] = { ...inventory[itemIndex], ...updates };
      
//       // 2. Update the Local Cache (Memory) to prevent "Loading..." spinner on render
//       if (currentDoc === this.document && this._inventoryCache) {
//         const cachedItem = this._inventoryCache.find(i => i.itemUuid === itemUuid);
//         if (cachedItem) {
//           foundry.utils.mergeObject(cachedItem, updates);
//         }
//       }

//       // 3. Save Flag (Triggers Render)
//       await currentDoc.setFlag("campaign-codex", "data.inventory", inventory);
//     }
//   }

  async _transferItemToActor(item, targetActor, document, questId = "") {
    try {
      const itemData = item.toObject();
      delete itemData._id;
      const currentData = document.getFlag("campaign-codex", "data") || {};

      if (questId) {
        const quests = foundry.utils.deepClone(currentData.quests || []);
        const quest = quests.find(q => q.id === questId);
        quest.inventory = quest.inventory || [];
        const existingItem = quest.inventory.find((i) => i.itemUuid === item.uuid);
        if (existingItem) {
          if (existingItem.quantity > 0) {
            existingItem.quantity -= 1; 
            await document.setFlag("campaign-codex", "data.quests", quests);
          }
        }
      } else {
        const inventory = currentData.inventory || [];
        const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
        const quantity = shopItem ? shopItem.quantity : 1;
        itemData.system.quantity = Math.min(quantity, 0);
        await targetActor.createEmbeddedDocuments("Item", [itemData]);
        if (shopItem && shopItem.quantity > 0) {
          await this._updateInventoryItem(item.uuid, {
            quantity: shopItem.quantity - 1,
          }, document);
        }
      }
      ui.notifications.info(format("title.send.item.typetoplayer", { type: item.name, player: targetActor.name }));

      const targetUser = game.users.find((u) => u.character?.id === targetActor.id);
      if (targetUser && targetUser.active) {
        ChatMessage.create({
          content: `<p><strong>${game.user.name}</strong> sent you <strong>${item.name}</strong> from ${document.name}!</p>`,
          whisper: [targetUser.id],
        });
      }
    } catch (error) {
      console.error("Error transferring item:", error);
      ui.notifications.error(localize("error.faileditem"));
    }
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
  // TEMPLATE GENERATION
  // =========================================================================

  _generateInventoryTab(data) {
    // if (data.loadingInventory) {
    //     return `
    //     <div style="padding: 20px; text-align: center; color: var(--color-text-light-highlight);">
    //         <i class="fas fa-spinner fa-spin fa-2x"></i>
    //         <p style="margin-top: 10px;">Loading Inventory...</p>
    //     </div>`;
    // }

    let defaultLabel = localize("names.inventory")
    if (data.isLoot) defaultLabel = localize("names.loot"); 
    const label = this._labelOverride(this.document, "inventory") || defaultLabel;
    const cashSection = !game.user.isGM ? "": TemplateComponents.cashControl(data.inventoryCash);
    const markupSection = data.isLoot ? "" : TemplateComponents.markupControl(data.markup);

    return `
    ${TemplateComponents.contentHeader("fas fa-boxes", label)}
    ${
      game.user.isGM
        ? `<div class="shop-toggles">
      <span class="stat-label">Loot Mode</span>
      <label class="toggle-control">
        <input type="checkbox" class="shop-loot-toggle" ${data.isLoot ? "checked" : ""} style="margin: 0;"><span class="slider"></span>
      </label></div>`
        : ""
    }
    ${game.user.isGM ? `${TemplateComponents.dropZone("item", "fas fa-clone", "Drop items to add", "")}` : ""}
    ${markupSection || cashSection ? `<div class="markup-control">`:""}${markupSection}${cashSection}${markupSection || cashSection ? `</div>`:""}
    ${TemplateComponents.inventoryTable(data.inventory, data.isLoot)}
  `;
  }

  // async _fetchInventoryBackground(rawInventory) {
  //   if (this._fetchingInventory || !rawInventory) return;
  //   this._fetchingInventory = true;
    
  //   try {
  //       const result = await CampaignCodexLinkers.getInventory(this.document, rawInventory);
  //       this._inventoryCache = result;
  //   } catch (err) {
  //       console.error("Campaign Codex | Background inventory fetch failed:", err);
  //       this._inventoryCache = [];
  //   } finally {
  //       this._fetchingInventory = false;
  //       if (this._currentTab === "inventory") {
  //            // this.render();
  //       }
  //   }
  // }


  // =========================================================================
  // SUBCLASS OVERRIDE METHODS
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






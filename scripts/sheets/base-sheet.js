import { EconomyHelper } from "../economy-helper.js";
import { appendTransaction, TRANSACTION_LOG_SOCKET_ACTION } from "../transaction-log.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { TemplateComponents } from "./template-components.js";
import {
  localize,
  format,
  promptForName,
  confirmationDialog,
  renderTemplate,
  targetedRefresh,
  getDefaultSheetTabs,
  getDefaultSheetHidden,
  journalSystemClass,
  isThemed,
  getItemQuantityPath,
} from "../helper.js";
import { widgetManager } from "../widgets/WidgetManager.js";
import { tabPicker } from "../tab-picker.js";
import { iconPicker } from "../ui/IconPicker.js";
var SearchFilter = foundry.applications.ux.SearchFilter;

const DragDrop = foundry.applications.ux.DragDrop.implementation;
// =========================================================================
// BASE CLASS SETUP
// =========================================================================
const { DocumentSheetV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const baseSheetApp = HandlebarsApplicationMixin(DocumentSheetV2);

// =========================================================================
// MAIN CLASS DEFINITION
// =========================================================================

export class CampaignCodexBaseSheet extends baseSheetApp {
  static PLAYER_NOTES_FLAG = "playerNotesBySheet";
  // static ITEM_QUANTITY_PATHS = {
  //   default: "system.quantity",
  //   "custom-system-builder": "system.props.item_quantity",
  //   "starwarsffg": "system.quantity.value"
  // };
  // =========================================================================
  // STATIC CONFIGURATION
  // =========================================================================

  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "base-sheet"],
    dragDrop: [{ dragSelector: "[data-drag], .draggable", dropSelector: null }],
    window: {
      frame: true,
      title: "Campaign Codex",
      icon: "fas fa-closed-captioning",
      minimizable: true,
      resizable: true,
    },
    position: {
      width: 960,
      height: 800,
    },
    actions: {
      showPlayers: this.#_onShowPlayers,
      changeDefaultOwnership: this.#_onChangeDefaultOwnership,
      toggleQuicklinks: this.#_onToggleQuicklinks,
      toggleTags: this.#_onToggleTags,
      toggleWidgets: this.#_onToggleWidgets,
      addWidget: this.#_onAddWidget,
      activateWidget: this.#_onActivateWidget,
      deleteWidget: this.#_onDeleteWidget,
      deactivateWidget: this.#_onDeactivateWidget,
      moveWidgetUp: this.#_onMoveWidgetUp,
      moveWidgetDown: this.#_onMoveWidgetDown,
      swapWidgetTab: this.#_onSwapWidgetTab,
      editTabs: this.#_onEditTabs,
      imageChange: this.#_onImageClick,
      ccChangeTab: this.#_onChangeTab,
      membersToMapButton: this.#_onDropMembersToMapClick,
      npcsToMapButton: this.#_onDropNPCsToMapClick,
      playerPurchase: this.#_playerPurchase,
      playerLoot: this.#_playerLoot,
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
      createQuestJournal: this.#_onCreateQuestJournal,
      // OPEN
      openItem: this.#_onOpenItem,
      openScene: this.#_onOpenScene,
      openActor: this.#_openActor,
      openFaction: this.#_openTag,
      openTag: this.#_openTag,
      openNPC: this.#_openNPC,
      openNpc: this.#_openNPC,
      openShop: this.#_openShop,
      openLocation: this.#_openLocation,
      openGroup: this.#_openGroup,
      openRegion: this.#_openRegion,
      openParentregion: this.#_openRegion,
      openJournal: this.#_openJournal,
      openAssociate: this.#_openAssociate,
      openQuest: this.#_openQuest,
      // REMOVE
      removeItem: this.#_onRemoveItem,
      removeParentregion: this.#_onRemoveParentRegion,
      // removeQuestItem: this.#_onRemoveQuestItem,
      removeImage: this.#_onRemoveImage,
      removeScene: this.#_onRemoveScene,
      removeLocationFromRegion: this.#_onRemoveLocation,
      removeLocation: this.#_onRemoveLocation,
      removeShop: this.#_onRemoveShop,
      removeAssociate: this.#_onRemoveNPC,
      removeNPC: this.#_onRemoveNPC,
      removeNpc: this.#_onRemoveNPC,
      removeRegion: this.#_onRemoveRegion,

      // Quests
      // questToggle: this.#_questToggle,
      // objectiveToggle: this.#_objectiveToggle,
      // toggle collapse
      toggleSidebar: this.#toggleSidebar,
      toggleWidgetTray: this.#_onToggleWidgetTray,
      toggleInfoWidgetTray: this.#_onToggleInfoWidgetTray,
      toggleWidgetPosition: this.#_ontoggleWidgetPosition,
      infiniteToggle: this.#_infiniteToggle,
      clearPlayerNote: this.#_onClearPlayerNote,
    },
  };

  static PARTS = {
    main: {
      template: "modules/campaign-codex/templates/base-sheet.html",
      scrollable: [
        "",
        ".scrollable",
        ".tab-panel.info",
        ".tab-panel.locations",
        ".tab-panel.shops",
        ".tab-panel.associates",
        ".tab-panel.inventory",
        ".tab-panel.widgets",
        ".tab-panel.quests",
        ".tab-panel.journals",
        ".tab-panel.notes",
        ".tab-panel.npcs",
        ".tab-panel.regions",
      ],
    },
  };

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
  // CONSTRUCTOR & LIFECYCLE METHODS
  // =========================================================================

  constructor(document, options = {}) {
    super(document, options);
    this._currentTab = "info";
    this._processedData = null;
    this._isWidgetTrayOpen = false;
    this._isWidgetInfoTrayOpen = false;
    this._widgetPostion = false;
    this.#dragDrop = this.#createDragDropHandlers();
  }

  static #_onShowPlayers() {
    foundry.documents.collections.Journal.showDialog(this.document);
  }

  static async #_onChangeDefaultOwnership(event, target) {
    if (!game.user.isGM || !this.document) return;
    const currentOwnership = Number(this.document.ownership?.default || 0);
    const nextOwnership = currentOwnership > 0 ? 0 : 2;
    await this.document.update({ ownership: { default: nextOwnership } });

    const button = target || event?.currentTarget;
    if (button?.classList) {
      button.classList.toggle("fa-eye", nextOwnership >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
      button.classList.toggle("fa-eye-slash", nextOwnership < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
    }
  }

  async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!game.user.isGM ||  !this.hasFrame) return frame;

        const ownershipLevel = Number(this.document?.ownership?.default || 0);
        const ownershipIcon = ownershipLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? "fa-eye" : "fa-eye-slash";
        const ownershipControl = `
        <button type="button" class="header-control fa-solid ${ownershipIcon} icon" data-action="changeDefaultOwnership"
                data-tooltip="Toggle Player Visibility" aria-label="Toggle Player Visibility"></button>
      `;

        const copyId = `
        <button type="button" class="header-control fa-solid fa-cog icon" data-action="editTabs"
                data-tooltip="${localize('ui.customiseTabs')}" aria-label="${localize('ui.customiseTabs')}"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", ownershipControl);
        this.window.close.insertAdjacentHTML("beforebegin", copyId);
        return frame;
    }



  _canDragStart(selector) {
    return game.user.isGM;
  }

  _canDragDrop(selector) {
    return game.user.isGM;
  }




  async _onDragStart(event) {
    const el = event.currentTarget;
    console.log(event);
    if ("link" in event.target.dataset) return;
    let journalID = event.target.dataset.entryId;
    let journalData = game.journal.get(journalID);

    if (!journalData) return;
    let dragDataB = journalData.toDragData();
    if (!dragDataB) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(dragDataB));
  }

  #createDragDropHandlers() {
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
      action: "showPlayers",
    });
    return controls;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (options.force) {
      this._processedData = null;
    }



    context.showTags = this.#showTags;
    context.showWidgets = this.#showWidgets;
    context.showQuicklinks = this.#showQuicklinks;



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
    const mapMarkerOverride = allOverrides.find((override) => override.key === "mapMarker");
    const defaultTabVis = getDefaultSheetTabs(this.getSheetType());
    const defaultTabHidden = getDefaultSheetHidden(this.getSheetType());
    const defaultMapMarkerVisible = defaultTabVis.mapMarker ?? true;
    const defaultMapMarkerHidden = defaultTabHidden.mapMarker ?? false;
    const mapMarkerVisible = mapMarkerOverride?.visible ?? defaultMapMarkerVisible;
    const mapMarkerHidden = mapMarkerOverride?.hidden ?? defaultMapMarkerHidden;
    context.mapMarkerOverride = !game.user.isGM && mapMarkerHidden ? false : mapMarkerVisible;

    const imageAreaOverride = allOverrides.find((override) => override.key === "imageArea");
    context.showImage = !game.user.isGM && imageAreaOverride?.hidden ? false : (imageAreaOverride?.visible ?? true);

    const imagePath = this.document.getFlag("campaign-codex", "image") || null;
    context.userImage = !!imagePath && typeof imagePath === "string" && imagePath.trim() !== "";

    // TAGS CONFIGURATION
    let allTags = [];
    if (typeof game.campaignCodex?.getTagCache === "function") {
      allTags = await game.campaignCodex.getTagCache();
    } else {
      console.warn(
        "Campaign Codex | getTagCache() was not available during _prepareContext. Proceeding with empty tags.",
      );
    }
    const linkedTagUuids =
      this.document.getFlag("campaign-codex", "data")?.associates ||
      this.document.getFlag("campaign-codex", "data")?.linkedNPCs ||
      [];
    const isThisDocATag =
      this.document.getFlag("campaign-codex", "data")?.tagMode ||
      this.document.getFlag("campaign-codex", "type") === "tag";
    context.existingTags = allTags.filter((tag) => {
      if (linkedTagUuids.includes(tag.uuid)) return false;
      if (isThisDocATag && tag.uuid === this.document.uuid) return false;
      return true;
    });

    // WIDGETS CONFIGURATION
    this._widgetPostion = this.document.getFlag("campaign-codex", "widgets-position");
    context.widgetsPosition = this._widgetPostion;

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const allAvailable = Array.from(widgetManager.widgetRegistry.keys())
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    context.availableWidgets = allAvailable.map((name) => ({ name: name }));

    const widgetsTabWidgets = sheetWidgets.filter((w) => !w.tab || w.tab === "widgets");
    const infoTabWidgets = sheetWidgets.filter((w) => w.tab === "info");

    context.activewidget = widgetsTabWidgets.filter((w) => w.active);
    context.inactivewidgets = widgetsTabWidgets
      .filter((w) => !w.active)
      .sort((a, b) => String(a.widgetName || "").localeCompare(String(b.widgetName || ""), undefined, { numeric: true }));
    context.addedWidgetNames = widgetsTabWidgets.map((w) => w.widgetName);

    context.activewidgetInfo = infoTabWidgets.filter((w) => w.active);
    context.inactivewidgetsInfo = infoTabWidgets
      .filter((w) => !w.active)
      .sort((a, b) => String(a.widgetName || "").localeCompare(String(b.widgetName || ""), undefined, { numeric: true }));
      context.addedWidgetNamesInfo = infoTabWidgets.map((w) => w.widgetName);

    if (this._currentTab === "widgets") {
      context.widgetsToRender = await widgetManager.instantiateActiveWidgets(this.document, "widgets");
    } else if (this._currentTab === "info") {
      context.infoWidgetsToRender = await widgetManager.instantiateActiveWidgets(this.document, "info");
    } else {
      context.widgetsToRender = [];
      context.infoWidgetsToRender = "";
    }


    context.sheetData = {
      description: sheetData.description || "",
      notes: sheetData.notes || "",
    };

    const rawSheetTags = Array.isArray(sheetData.tags)
      ? sheetData.tags
      : (typeof sheetData.tags === "string" ? sheetData.tags.split(",") : []);
    context.sheetTagList = rawSheetTags
      .map((tag) => String(tag ?? "").trim())
      .filter((tag) => tag.length > 0);
    const worldTagMap = new Map();
    const codexDocs = game.journal.filter((j) => j.getFlag("campaign-codex", "type"));
    for (const doc of codexDocs) {
      const docData = doc.getFlag("campaign-codex", "data") || {};
      const docTags = Array.isArray(docData.tags)
        ? docData.tags
        : (typeof docData.tags === "string" ? docData.tags.split(",") : []);
      for (const rawTag of docTags) {
        const tag = String(rawTag ?? "").trim();
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (!worldTagMap.has(key)) worldTagMap.set(key, tag);
      }
    }
    context.worldTags = Array.from(worldTagMap.values()).sort((a, b) => a.localeCompare(b));
    context.sheetTagsDatalistId = `cc-sheet-tags-${this.document.id}`;


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


    context.linkedStandardJournals = [];
    const missingUuids = new Set();

    if (sheetData.linkedStandardJournals && Array.isArray(sheetData.linkedStandardJournals)) {
      const journalPromises = sheetData.linkedStandardJournals.map(async (uuid) => {
        try {
          const document = await fromUuid(uuid);
          if (!document) {
            missingUuids.add(uuid);
            console.warn(`Campaign Codex | Linked standard journal not found: ${uuid}`);
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
      if (missingUuids.size) {
        const cleaned = (sheetData.linkedStandardJournals || []).filter((u) => !missingUuids.has(u));
        await this.document.setFlag("campaign-codex", "data.linkedStandardJournals", cleaned);
      }
    }
    context.allowPlayerPurchasing = game.settings.get("campaign-codex", "allowPlayerPurchasing") || false;
    context.allowPlayerLooting = game.settings.get("campaign-codex", "allowPlayerLooting") || false;

    return context;
  }

  async close(options = {}) {
    if (this._forceClose) {
      return super.close(options);
    }

    const documentExists = this.document && game.journal.get(this.document.id);

    if (documentExists && !this.document._pendingDeletion) {

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
   * Configure plugins for the ProseMirror instance.
   * @param {ProseMirrorPluginsEvent} event
   * @protected
   */
  _onConfigurePlugins(event) {
    event.plugins.highlightDocumentMatches = ProseMirror.ProseMirrorHighlightMatchesPlugin.build(
      ProseMirror.defaultSchema,
    );
  }

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener("plugins", this._onConfigurePlugins.bind(this));
  }

  /**
   * Register context menu entries and fire hooks.
   * @protected
   */
  _createContextMenus() {


    this._createContextMenu(this._getQuestContextOptions, ".quest-card[data-uuid]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });

    this._createContextMenu(this._getEntityContextOptions, ".journal-card[data-uuid]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });
    this._createContextMenu(this._getImageContextOptions, ".sheet-image", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });
    if (this.getSheetType() === "npc") {
      this._createContextMenu(this._getActorContextOptions, ".linked-actor", {
        fixed: true,
        hookName: `get${this.documentName}ContextOptions`,
        parentClassHooks: false,
      });
    }
    if (this.getSheetType() === "tag") {
      this._createContextMenu(this._getTagSheetContextOptions, ".tree-node", {
        fixed: true,
        hookName: `get${this.documentName}ContextOptions`,
        parentClassHooks: false,
      });
    }

    this._createContextMenu(
      this._getAssociateContextOptions,
      ".region-card[data-uuid],.location-card[data-uuid],.shop-card[data-uuid],.npc-card[data-uuid],.faction-card[data-uuid],.associate-card[data-uuid],.group-card[data-uuid],.parentregion-card[data-uuid]",
      {
        fixed: true,
        hookName: `get${this.documentName}ContextOptions`,
        parentClassHooks: false,
      },
    );
    this._createContextMenu(this._getEntryContextOptions, ".scene-name[data-scene-uuid]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });
    this._createContextMenu(this._getTagContextOptions, ".tag-card[data-uuid]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });
    this._createContextMenu(this._getPlayerNoteContextOptions, ".cc-gm-player-note[data-user-id]", {
      fixed: true,
      hookName: `get${this.documentName}ContextOptions`,
      parentClassHooks: false,
    });
  }
  
  _suppressSelectedSheetCardContextMenu() {
    return ["group", "tag"].includes(this.getSheetType()) && !!this._selectedSheet;
  }

  _suppressGroupNPCPanelContextMenu(span) {
    if (this.getSheetType() !== "group") return false;
    const panel = span?.closest?.(".group-tab-panel");
    if (!panel) return false;
    return panel.dataset.tab === "npcs" && panel.classList.contains("active");
  }

  /** @inheritDoc */
  _getTagSheetContextOptions() {
    return [
      {
        name: localize("context.removeLink"),
        icon: '<i class="fa-solid fa-link-slash"></i>',
        condition: (span) =>
          game.user.isGM && span.dataset.uuid && this.getSheetType() === "tag" && span.dataset.context,
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.removeLink(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getAssociateContextOptions() {
    return [
      {
        name: "Edit Card Note",
        icon: '<i class="fa-solid fa-note-sticky"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          !this._suppressGroupNPCPanelContextMenu(span) &&
          game.user.isGM &&
          !!span.dataset.uuid,
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          const forcedField = ["associate", "faction"].includes(span?.dataset?.type) ? "associates" : null;
          this.editLinkCardNote(syntheticEvent, forcedField);
        },
      },
      {
        name: localize("context.hideAssociate"),
        icon: '<i class="fa-solid fa-eye-slash"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          !this._suppressGroupNPCPanelContextMenu(span) &&
          game.user.isGM &&
          !span.classList.contains("hidden-associate"),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.hideAssociate(syntheticEvent);
        },
      },
      {
        name: localize("context.showAssociate"),
        icon: '<i class="fa-solid fa-eye"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          !this._suppressGroupNPCPanelContextMenu(span) &&
          game.user.isGM &&
          span.classList.contains("hidden-associate"),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.hideAssociate(syntheticEvent);
        },
      },
      {
        name: localize("context.removeLink"),
        icon: '<i class="fa-solid fa-link-slash"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          !this._suppressGroupNPCPanelContextMenu(span) &&
          game.user.isGM &&
          span.dataset.uuid &&
          !span.dataset.removeDisabled,
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.removeLink(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getQuestContextOptions() {
    return [
      {
        name: localize("context.hideAssociate"),
        icon: '<i class="fa-solid fa-eye-slash"></i>',
        condition: (span) => !this._suppressSelectedSheetCardContextMenu() && game.user.isGM && !span.classList.contains("hidden-associate"),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.hideAssociate(syntheticEvent);
        },
      }, 
      {
        name: localize("context.showAssociate"),
        icon: '<i class="fa-solid fa-eye"></i>',
        condition: (span) => !this._suppressSelectedSheetCardContextMenu() && game.user.isGM && span.classList.contains("hidden-associate"),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.hideAssociate(syntheticEvent);
        },
      },           
      {
        name: localize("context.removeLink"),
        icon: '<i class="fa-solid fa-link-slash"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          game.user.isGM &&
          span.dataset.uuid,
          // && ((this.getSheetType() !== "group")),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this._onRemoveQuest(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getEntityContextOptions() {
    return [
      // {
      //   name: "Edit Card Note",
      //   icon: '<i class="fa-solid fa-note-sticky"></i>',
      //   condition: (span) =>
      //     !this._suppressSelectedSheetCardContextMenu() &&
      //     !this._suppressGroupNPCPanelContextMenu(span) &&
      //     game.user.isGM &&
      //     !!span.dataset.uuid,
      //   callback: (span) => {
      //     const syntheticEvent = {
      //       currentTarget: span,
      //       target: span,
      //       preventDefault: () => { },
      //       stopPropagation: () => { },
      //     };
      //     this.editLinkCardNote(syntheticEvent);
      //   },
      // },
      {
        name: localize("context.removeLink"),
        icon: '<i class="fa-solid fa-link-slash"></i>',
        condition: (span) =>
          !this._suppressSelectedSheetCardContextMenu() &&
          !this._suppressGroupNPCPanelContextMenu(span) &&
          game.user.isGM &&
          span.dataset.uuid &&
          ((this.getSheetType() !== "group" && this.getSheetType() !== "tag") || span.dataset.removable),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.removeLink(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getTagContextOptions() {
    return [
      {
        name: localize("context.removeTag"),
        icon: '<i class="fa-solid fa-link-slash"></i>',
        condition: (span) => !this._suppressSelectedSheetCardContextMenu() && game.user.isGM && span.dataset.uuid,
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this.removeTag(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getImageContextOptions() {
    return [
      {
        name: localize("context.changeImage"),
        icon: '<i class="fa-solid fa-image"></i>',
        condition: (span) => game.user.isGM,
        callback: (span) => this.changeImage(),
      },
      {
        name: localize("context.removeImage"),
        icon: '<i class="fa-solid fa-circle-xmark"></i>',
        condition: (span) => game.user.isGM && this.document.getFlag("campaign-codex", "image"),
        callback: (span) => this.removeImage(),
      },
      {
        name: localize("context.showImage"),
        icon: '<i class="fa-solid fa-eye"></i>',
        condition: (span) => game.user.isGM && this.document.getFlag("campaign-codex", "image"),
        callback: (span) => {
          const src = this.document.getFlag("campaign-codex", "image");
          const ip = new ImagePopout(src, {
            title: "Context Image",
            uuid: this.document.uuid,
          });
          ip.render(true);
          ip.shareImage();
        },
      },
    ].concat();
  }
  _getPlayerNoteContextOptions() {
    return [
      {
        name: "Clear Player Note",
        icon: '<i class="fa-solid fa-trash-can"></i>',
        condition: (span) => game.user.isGM && !!span?.dataset?.userId,
        callback: async (span) => {
          const userId = span?.dataset?.userId;
          const userName = span?.dataset?.userName || "player";
          await this._clearPlayerNoteForUser(userId, userName);
        },
      },
    ].concat();
  }
  /** @inheritDoc */
  _getActorContextOptions() {
    return [
      {
        name: localize("context.removeLink"),
        icon: '<i class="fa-solid fa-circle-xmark"></i>',
        condition: (span) => game.user.isGM && this.document.getFlag("campaign-codex", "data.linkedActor"),
        callback: (span) => this._onRemoveActor(),
      },
      {
        name: localize("message.drop"),
        icon: '<i class="fa-solid fa-street-view"></i>',
        condition: (span) =>
          canvas.scene && game.user.isGM && this.document.getFlag("campaign-codex", "data.linkedActor"),
        callback: (span) => {
          const syntheticEvent = {
            currentTarget: span,
            target: span,
            preventDefault: () => { },
            stopPropagation: () => { },
          };
          this._onDropNPCsToMapNPCSheet(syntheticEvent);
        },
      },
    ].concat();
  }

  /** @inheritDoc */
  _getEntryContextOptions() {
    return [
      {
        name: "SCENE.View",
        icon: '<i class="fa-solid fa-eye"></i>',
        condition: (span) => !canvas.ready || span.dataset.sceneUuid !== canvas.scene.uuid,
        callback: (span) => game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.view(),
      },
      {
        name: "SCENE.Activate",
        icon: '<i class="fa-solid fa-bullseye"></i>',
        condition: (span) => game.user.isGM && !game.scenes.get(span.dataset.sceneUuid)?.active,
        callback: (span) => game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.activate(),
      },
      {
        name: "SCENE.Configure",
        icon: '<i class="fa-solid fa-gears"></i>',
        callback: (span) =>
          game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.sheet.render({ force: true }),
      },
      {
        name: "SCENE.ToggleNav",
        icon: '<i class="fa-solid fa-compass"></i>',
        condition: (span) =>
          game.user.isGM && !game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id)?.active,
        callback: (span) => {
          const scene = game.scenes.get(foundry.utils.parseUuid(span.dataset.sceneUuid).id);
          scene?.update({ navigation: !scene.navigation });
        },
      },
    ].concat();
  }

  #filterableItems = [];
  #search = new SearchFilter({
    inputSelector: "input[name=filter]",
    contentSelector: "section",
    callback: this._onSearchFilter.bind(this),
  });

  _onSearchFilter(event, query, rgx) {
    for (const item of this.#filterableItems) {
      const match = rgx.test(item.name);
      item.element.style.display = match ? "" : "none";
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (isThemed()) {
      this.element.classList.add("themed", isThemed());
      this.element.classList.add(isThemed(), isThemed());
    }

    const nativeHtml = this.element;
    if (this.dragDrop && Array.isArray(this.dragDrop)) {
      this.dragDrop.forEach((d) => d.bind(this.element));
    }

    const isCollapsed = game.user.getFlag("campaign-codex", "sidebarCollapsed") || false;
    if (this.element) {
      this.element.classList.toggle("sidebar-collapsed", isCollapsed);
      const icon = this.element.querySelector(".sidebar-collapser i");
      if (icon) {
        icon.classList.remove("fa-caret-left", "fa-caret-right");
        icon.classList.add(`fa-caret-${isCollapsed ? "right" : "left"}`);
      }
    }
    const content = nativeHtml.querySelector(".inventory");
    if (content) {
      this.#filterableItems = [];
      for (const element of content.querySelectorAll(".inventory-item")) {
        const name = element.dataset.itemName;
        if (name) {
          this.#filterableItems.push({
            element: element,
            name: SearchFilter.cleanQuery(name),
          });
        }
      }

      this.#search.bind(content);
    }

    // this._activateQuestListeners(nativeHtml);
    // this._activateObjectiveListeners(nativeHtml);
    this._setupNameEditing(nativeHtml);
    this._activateEditorListeners(nativeHtml);

    this._activateSheetSpecificListeners(nativeHtml);
    this._setupTypeEditing(nativeHtml);
    this._setupMarkerEditing(nativeHtml);
    this._activateWidgetTrayListeners(nativeHtml);
    this._showTab(this._currentTab, nativeHtml);

    nativeHtml.querySelector(".shop-loot-toggle")?.addEventListener("change", this._onLootToggle.bind(this));
    nativeHtml.querySelector(".cash-input")?.addEventListener("change", this._onCashChange.bind(this));
    nativeHtml.querySelector(".markup-input")?.addEventListener("change", this._onMarkupChange.bind(this));
    nativeHtml
      .querySelectorAll(".quantity-input")
      ?.forEach((el) => el.addEventListener("change", this._onQuantityChange.bind(this)));
    nativeHtml
      .querySelectorAll(".price-input")
      ?.forEach((el) => el.addEventListener("change", this._onPriceChange.bind(this)));
    nativeHtml
      .querySelectorAll(".price-input")
      ?.forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));
    nativeHtml
      .querySelectorAll(".quantity-input")
      ?.forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));
    nativeHtml.querySelectorAll(".inventory-item")?.forEach((el) => {
      el.addEventListener("dragstart", this._onItemDragStart.bind(this));
      el.addEventListener("dragend", this._onItemDragEnd.bind(this));
    });
    nativeHtml.querySelectorAll(".sheet-tag-add-input")?.forEach((el) => {
      el.addEventListener("keydown", this._onSheetTagInputKeydown.bind(this));
      el.addEventListener("change", this._onSheetTagInputCommit.bind(this));
      el.addEventListener("blur", this._onSheetTagInputCommit.bind(this));
    });
    nativeHtml.querySelectorAll(".sheet-tag-toggle-add")?.forEach((el) => {
      el.addEventListener("click", this._onSheetTagToggleClick.bind(this));
    });
    nativeHtml.querySelectorAll(".sheet-tag-remove")?.forEach((el) => {
      el.addEventListener("click", this._onSheetTagRemoveClick.bind(this));
    });
    nativeHtml.querySelectorAll(".sheet-tag-name")?.forEach((el) => {
      el.addEventListener("click", this._onSheetTagOpenToc.bind(this));
    });

    const multiActionMap = {
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

    const widgetPromises = [];

    nativeHtml.querySelectorAll(".cc-widget-container").forEach((container) => {
      widgetPromises.push(widgetManager.renderAndActivateWidget(container));
    });

const pendingRestorations = this._pendingScrollRestorations;
    if (pendingRestorations) {
      this._applyPreservedScroll(pendingRestorations);
      this._pendingScrollRestorations = null;
    }

    // Re-apply after widgets finish hydrating; top-positioned widget height changes can shift scroll.
    void Promise.allSettled(widgetPromises)
      .then(() => {
        if (!pendingRestorations || !this.element?.isConnected) return;
        requestAnimationFrame(() => {
          if (!this.element?.isConnected) return;
          this._applyPreservedScroll(pendingRestorations);
        });
      })
      .catch((error) => {
        console.warn("Campaign Codex | Widget render task failed:", error);
      });

    if (!game.user.isGM) {
      const safeButtons = nativeHtml.querySelectorAll(
        '[class*="open-"], .btn-expand-all, .btn-collapse-all, [class*="toggle-tree-"], .filter-btn, .cc-player-notes-panel button, prose-mirror[data-player-note-editor] button',
        // '[class*="open-"], .btn-expand-all, .btn-collapse-all, [class*="toggle-tree-"], .filter-btn',
      );
      safeButtons.forEach((button) => {
        button.disabled = false;
      });
      nativeHtml.querySelectorAll("button.reveal").forEach((btn) => {
        btn.style.display = "none";
      });
      if (game.settings.get("campaign-codex", "allowPlayerNotes")) {
        nativeHtml.querySelectorAll('prose-mirror[data-player-note-editor]').forEach((editor) => {
          editor.disabled = false;
          editor.removeAttribute("disabled");
        });
      }      
    }
  }

  /** @inheritdoc */
  _replaceHTML(result, content, options) {
    const restorationsByKey = {};
    content.querySelectorAll("[data-preserve-scroll]").forEach((el) => {
      const key = this._getPreserveScrollKey(el);
      if (!restorationsByKey[key]) restorationsByKey[key] = [];
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const fromBottom = Math.max(0, maxTop - el.scrollTop);
      restorationsByKey[key].push({
        top: el.scrollTop,
        left: el.scrollLeft,
        fromBottom,
        anchorBottom: fromBottom <= 4,
      });
    });
    this._pendingScrollRestorations = restorationsByKey;

    super._replaceHTML(result, content, options);
  }

  _getPreserveScrollKey(el) {
    if (!el) return "unknown";
    const tab = el.dataset?.tab || "";
    const panelType = el.classList.contains("group-tab-panel-selected-sheet")
      ? "group-selected"
      : el.classList.contains("group-tab-panel")
        ? "group"
        : el.classList.contains("tab-panel")
          ? "base"
          : "other";
    return `${panelType}:${tab}`;
  }

  _applyPreservedScroll(restorationsByKey) {
    if (!this.element || !restorationsByKey) return;

    const seenByKey = {};
    this.element.querySelectorAll("[data-preserve-scroll]").forEach((el) => {
      const key = this._getPreserveScrollKey(el);
      const index = seenByKey[key] || 0;
      seenByKey[key] = index + 1;
      const state = restorationsByKey[key]?.[index];
      if (!state) return;

      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const desiredTop = state.anchorBottom
        ? Math.max(0, maxTop - state.fromBottom)
        : Math.min(Math.max(0, state.top), maxTop);

      el.scrollTop = desiredTop;
      el.scrollLeft = state.left;
    });
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
  static async generateNotesTab(doc, context, labelOverride = null) {
    const allowPlayerNotes = game.settings.get("campaign-codex", "allowPlayerNotes") === true;
    const getUserNoteForSheet = (user, sheetUuid) => {
      if (!user || !sheetUuid) return "";
      const bySheet = user.getFlag("campaign-codex", CampaignCodexBaseSheet.PLAYER_NOTES_FLAG) || {};
      const entry = foundry.utils.getProperty(bySheet, sheetUuid) ?? bySheet[sheetUuid];
      if (!entry) return "";
      if (typeof entry === "string") return entry;
      if (typeof entry?.note === "string") return entry.note;
      return "";
    };

    const myPlayerNote = getUserNoteForSheet(game.user, doc.uuid);
    const myPlayerNoteEnriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(myPlayerNote || "", {
      async: true,
      secrets: false,
    });
    const escapedPlayerNote = foundry.utils.escapeHTML(myPlayerNote || "");
    const playerNotesRichText = `
      <article class="cc-enriched ${isThemed() ? "themed" : ""} ${isThemed()} ${journalSystemClass(game.system.id)}">
        <section class="journal-entry-content">
          <prose-mirror
            name="flags.campaign-codex.player-note"
            value="${escapedPlayerNote}"
            document-uuid="${doc.uuid}"
            data-player-note-editor="true"
            toggled
            class="journal-page-content cc-prosemirror ${journalSystemClass(game.system.id)} ${isThemed() ? "themed" : ""} ${isThemed()}"
          >
            ${myPlayerNoteEnriched}
          </prose-mirror>
        </section>
      </article>
    `;

    const gmPlayerNotes = game.user.isGM
      ? (
        await Promise.all(
          game.users
            .filter((u) => !u.isGM)
            .map(async (u) => {
              const note = getUserNoteForSheet(u, doc.uuid).trim();
              if (!note) return null;
              const enrichedNote = await foundry.applications.ux.TextEditor.implementation.enrichHTML(note, {
                async: true,
                secrets: false,
              });
              return { userId: u.id, userName: u.name, enrichedNote };
            }),
        )
      ).filter(Boolean)
      : [];

    const templateData = {
      labelOverride: labelOverride,
      richTextDescription: (game.user.isGM || !allowPlayerNotes)
        ? TemplateComponents.richTextSection(
          doc,
          context.sheetData.enrichedNotes,
          "notes",
          context.isOwnerOrHigher,
        )
        : playerNotesRichText,
      isGM: game.user.isGM,
      allowPlayerNotes,
      gmPlayerNotes,
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-notes.hbs", templateData);
  }

  async generateWidgetsTab(doc, context, labelOverride = null) {
    const templateData = {
      labelOverride: labelOverride,
      widgetsToRender: context.widgetsToRender,
      activewidget: context.activewidget,
      inactivewidgets: context.inactivewidgets,
      addedWidgetNames: context.addedWidgetNames,
      availableWidgets: context.availableWidgets,
      isGM: context.isGM,
      isWidgetTrayOpen: this._isWidgetTrayOpen,
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-widgets.hbs", templateData);
  }

  // =========================================================================
  // Widget Tabw
  // =========================================================================

  static #_onToggleWidgetTray(event) {
    event.preventDefault();
    const widgetTarget = event.target;
    const container = widgetTarget.closest('[data-tab="widgets"]');
    const tray = container?.querySelector(".widget-tray");
    this._isWidgetTrayOpen = !this._isWidgetTrayOpen;

    if (tray) {
      tray.classList.toggle("collapsed", !this._isWidgetTrayOpen);
    }
  }

  static #_onToggleInfoWidgetTray(event) {
    event.preventDefault();
    const widgetTarget = event.target;
    const container = widgetTarget.closest('[data-tab="info"]');
    const tray = container?.querySelector(".widget-tray");
    this._isWidgetInfoTrayOpen = !this._isWidgetInfoTrayOpen;

    if (tray) {
      tray.classList.toggle("collapsed", !this._isWidgetInfoTrayOpen);
    }
  }

  static #_ontoggleWidgetPosition(event, target) {
    this._widgetPostion = !this._widgetPostion;
    this.document.setFlag("campaign-codex", "widgets-position", this._widgetPostion);
    this.render();
  }

  // =========================================================================
  // SIDE BAR
  // =========================================================================

  static #toggleSidebar(event, target) {
    const collapsed = this._toggleSidebar();
    game.user.setFlag("campaign-codex", "sidebarCollapsed", collapsed);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the sidebar collapsed state.
   * @param {boolean} [collapsed]  Force a particular collapsed state.
   * @returns {boolean}            The new collapsed state.
   * @protected
   */
  _toggleSidebar(collapsed) {
    this.element.classList.toggle("sidebar-collapsed", collapsed);
    const isCollapsed = this.element.classList.contains("sidebar-collapsed");
    const icon = this.element.querySelector(".sidebar-collapser i");
    if (icon) {
      icon.classList.remove("fa-caret-left", "fa-caret-right");
      icon.classList.add(`fa-caret-${isCollapsed ? "right" : "left"}`);
    }

    return isCollapsed;
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

  static async #_onChangeTab(event) {
    event.preventDefault();
    const target = event.target;
    const tabElement = target.closest("[data-tab]");
    if (!tabElement) return;
    const tabName = tabElement.dataset.tab;
    if (!tabName) return;
    this._currentTab = tabName;
    if ((this.getSheetType() === "group" || this.getSheetType() === "tag") && this._selectedSheet) {
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
      },
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

    html.querySelectorAll(".add-objective, .add-sub-objective").forEach((el) => {
      el.addEventListener("click", this._onAddObjective.bind(this));
    });

    html.querySelectorAll(".remove-objective").forEach((el) => {
      el.addEventListener("click", this._onRemoveObjective.bind(this));
    });

    html.querySelectorAll(".objective-text.editable").forEach((el) => {
      el.addEventListener("click", this._onObjectiveTextEdit.bind(this));
    });

    html.querySelectorAll(".objective-list").forEach((list) => {
      list.addEventListener("blur", this._onObjectiveTextSave.bind(this), true);
      list.addEventListener("keydown", this._onObjectiveTextSave.bind(this), true);
    });

    html.querySelectorAll(".objective-item").forEach((el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", this._onObjectiveDragStart.bind(this));
      el.addEventListener("dragenter", this._onObjectiveDragEnter.bind(this));
      el.addEventListener("dragleave", this._onObjectiveDragLeave.bind(this));
      el.addEventListener("dragover", this._onObjectiveDragOver.bind(this));
      el.addEventListener("drop", this._onObjectiveDrop.bind(this));
      el.addEventListener("dragend", this._onObjectiveDragEnd.bind(this));
    });
  }

  _activateWidgetTrayListeners(html) {
    if (!game.user.isGM) return;

    html.querySelectorAll(".widget-tag.active[data-widget-id]").forEach((el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", this._onWidgetTagDragStart.bind(this));
      el.addEventListener("dragend", this._onWidgetTagDragEnd.bind(this));
    });

    html.querySelectorAll(".widget-drop-slot[data-widget-tab]").forEach((el) => {
      el.addEventListener("dragenter", this._onWidgetSlotDragEnter.bind(this));
      el.addEventListener("dragleave", this._onWidgetSlotDragLeave.bind(this));
      el.addEventListener("dragover", this._onWidgetSlotDragOver.bind(this));
      el.addEventListener("drop", this._onWidgetSlotDrop.bind(this));
    });
  }

  _onWidgetTagDragStart(event) {
    const tag = event.currentTarget.closest(".widget-tag.active[data-widget-id]");
    if (!tag) return;
    const widgetId = tag.dataset.widgetId;
    const { typeKey, data: widgetData } = this._getWidgetStorageRecord(widgetId);

    const payload = {
      type: "cc-widget-reorder",
      id: widgetId,
      tab: tag.dataset.widgetTab || "widgets",
      sourceDocumentUuid: this.document?.uuid || null,
      sourceWidgetTypeKey: typeKey || null,
      widgetData: widgetData ?? null,
    };
    this._draggingWidgetTag = payload;
    this._draggingWidgetTagElement = tag;
    this.element?.querySelectorAll(".widget-tray")?.forEach((tray) => tray.classList.add("widget-dragging"));

    tag.classList.add("dragging");
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-cc-widget", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
  }

  _hasWidgetDragType(event) {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes("application/x-cc-widget");
  }

  _readWidgetDragPayload(event) {
    if (this._draggingWidgetTag?.type === "cc-widget-reorder") return this._draggingWidgetTag;
    try {
      const raw =
        event?.dataTransfer?.getData("application/x-cc-widget") ||
        event?.dataTransfer?.getData("text/plain");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.type === "cc-widget-reorder" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  _isWidgetLocalDrag(payload) {
    if (!payload) return false;
    const sourceDocUuid = payload.sourceDocumentUuid;
    if (!sourceDocUuid) return !!this._draggingWidgetTag && payload.id === this._draggingWidgetTag?.id;
    return sourceDocUuid === this.document?.uuid;
  }

  _getWidgetStorageRecord(widgetId, sourceDoc = this.document) {
    if (!widgetId || !sourceDoc) return { typeKey: null, data: null };
    const widgetsByType = sourceDoc.getFlag("campaign-codex", "data.widgets") || {};
    for (const [typeKey, typeMap] of Object.entries(widgetsByType)) {
      if (!typeMap || typeof typeMap !== "object") continue;
      if (Object.prototype.hasOwnProperty.call(typeMap, widgetId)) {
        return {
          typeKey,
          data: foundry.utils.deepClone(typeMap[widgetId]),
        };
      }
    }
    return { typeKey: null, data: null };
  }

  _onWidgetSlotDragEnter(event) {
    const slot = event.currentTarget.closest(".widget-drop-slot[data-widget-tab]");
    if (!slot) return;
    const payload = this._readWidgetDragPayload(event);
    if (payload?.type !== "cc-widget-reorder" && !this._hasWidgetDragType(event)) return;
    if (!payload) {
      event.preventDefault();
      slot.classList.add("is-hover");
      return;
    }
    const localDrag = this._isWidgetLocalDrag(payload);
    if (localDrag && (payload.tab || "widgets") !== (slot.dataset.widgetTab || "widgets")) return;
    event.preventDefault();
    slot.classList.add("is-hover");
  }

  _onWidgetSlotDragLeave(event) {
    const slot = event.currentTarget.closest(".widget-drop-slot[data-widget-tab]");
    if (!slot) return;
    if (slot.contains(event.relatedTarget)) return;
    slot.classList.remove("is-hover");
  }

  _onWidgetSlotDragOver(event) {
    const slot = event.currentTarget.closest(".widget-drop-slot[data-widget-tab]");
    if (!slot) return;
    const payload = this._readWidgetDragPayload(event);
    if (payload?.type !== "cc-widget-reorder" && !this._hasWidgetDragType(event)) return;
    if (!payload) {
      event.preventDefault();
      event.stopPropagation();
      slot.classList.add("is-hover");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      return;
    }
    const localDrag = this._isWidgetLocalDrag(payload);
    if (localDrag && (payload.tab || "widgets") !== (slot.dataset.widgetTab || "widgets")) return;
    event.preventDefault();
    event.stopPropagation();
    slot.classList.add("is-hover");
    if (event.dataTransfer) event.dataTransfer.dropEffect = localDrag ? "move" : "copy";
  }

  _getWidgetSlotInsertActiveIndex(slot) {
    if (slot.dataset.widgetInsertPos != null) return Number(slot.dataset.widgetInsertPos);
    if (slot.dataset.widgetAfterIndex != null) return Number(slot.dataset.widgetAfterIndex) + 1;
    return null;
  }

  _getWidgetActiveCount(tab = "widgets") {
    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    return sheetWidgets.filter((w) => w?.active && (w.tab || "widgets") === tab).length;
  }

  _resolveWidgetDropTab(event) {
    const explicitTab = event.target?.closest?.("[data-widget-tab]")?.dataset?.widgetTab;
    if (explicitTab) return explicitTab;
    const tabPanel = event.target?.closest?.("[data-tab]");
    const activeTab = tabPanel?.dataset?.tab || this._currentTab || "widgets";
    return activeTab === "info" ? "info" : "widgets";
  }

  _resolveWidgetDropInsertPos(event, tab) {
    const slot = event.target?.closest?.(".widget-drop-slot[data-widget-tab]");
    if (slot) {
      const slotPos = this._getWidgetSlotInsertActiveIndex(slot);
      if (slotPos != null && !Number.isNaN(slotPos)) return Number(slotPos);
    }
    return this._getWidgetActiveCount(tab);
  }

  async _reorderWidgetInTab(draggedId, tab, insertActivePosRaw) {
    const sheetWidgets = [...(this.document.getFlag("campaign-codex", "sheet-widgets") || [])];
    const draggedIndex = sheetWidgets.findIndex((w) => w.id === draggedId);
    if (draggedIndex < 0) return;

    const draggedWidget = sheetWidgets[draggedIndex];
    if (!draggedWidget?.active) return;
    if ((draggedWidget.tab || "widgets") !== tab) return;

    const sameTabActiveIndices = [];
    for (let i = 0; i < sheetWidgets.length; i++) {
      const w = sheetWidgets[i];
      if (w?.active && (w.tab || "widgets") === tab) sameTabActiveIndices.push(i);
    }

    const currentActivePos = sameTabActiveIndices.findIndex((i) => i === draggedIndex);
    if (currentActivePos < 0) return;

    const insertActivePos = Math.max(0, Math.min(Number(insertActivePosRaw), sameTabActiveIndices.length));
    if (insertActivePos === currentActivePos || insertActivePos === currentActivePos + 1) return;

    const [moved] = sheetWidgets.splice(draggedIndex, 1);

    const remainingActiveIndices = [];
    for (let i = 0; i < sheetWidgets.length; i++) {
      const w = sheetWidgets[i];
      if (w?.active && (w.tab || "widgets") === tab) remainingActiveIndices.push(i);
    }

    let insertIndex;
    if (remainingActiveIndices.length === 0) insertIndex = sheetWidgets.length;
    else if (insertActivePos <= 0) insertIndex = remainingActiveIndices[0];
    else if (insertActivePos >= remainingActiveIndices.length) insertIndex = remainingActiveIndices[remainingActiveIndices.length - 1] + 1;
    else insertIndex = remainingActiveIndices[insertActivePos];

    sheetWidgets.splice(insertIndex, 0, moved);
    await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
  }

  async _handleWidgetTrayDrop(payload, event) {
    if (payload?.type !== "cc-widget-reorder") return false;
    const draggedId = payload.id;
    if (!draggedId) return false;

    const targetTab = this._resolveWidgetDropTab(event);
    const insertActivePos = this._resolveWidgetDropInsertPos(event, targetTab);
    const localDrag = this._isWidgetLocalDrag(payload);

    if (localDrag) {
      if ((payload.tab || "widgets") !== targetTab) return true;
      await this._reorderWidgetInTab(draggedId, targetTab, insertActivePos);
      return true;
    }

    await this._copyWidgetToSlot(payload, targetTab, insertActivePos);
    return true;
  }

  _onWidgetSlotDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const slot = event.currentTarget.closest(".widget-drop-slot[data-widget-tab]");
    if (!slot) return;
    slot.classList.remove("is-hover");

    const payload = this._readWidgetDragPayload(event);
    if (payload?.type !== "cc-widget-reorder") return;
    const insertActivePos = this._getWidgetSlotInsertActiveIndex(slot);
    if (insertActivePos == null || Number.isNaN(insertActivePos)) return;
    const tab = slot.dataset.widgetTab || "widgets";
    const localDrag = this._isWidgetLocalDrag(payload);
    if (localDrag && (payload.tab || "widgets") !== tab) return;
    if (!localDrag) {
      void this._copyWidgetToSlot(payload, tab, Number(insertActivePos));
      return;
    }
    this._reorderWidgetInTab(payload.id, tab, Number(insertActivePos)).catch((error) => {
      console.error("Campaign Codex | Failed to reorder widget", error);
    });
  }

  async _copyWidgetToSlot(payload, targetTab, insertActivePosRaw) {
    const sourceDocUuid = payload?.sourceDocumentUuid;
    const draggedId = payload?.id;
    if (!sourceDocUuid || !draggedId) return;

    const sourceRaw = await fromUuid(sourceDocUuid).catch(() => null);
    const sourceDoc = sourceRaw?.documentName === "JournalEntryPage" ? sourceRaw.parent : sourceRaw;
    if (!sourceDoc || sourceDoc.documentName !== "JournalEntry") return;

    const sourceWidgets = sourceDoc.getFlag("campaign-codex", "sheet-widgets") || [];
    const sourceWidget = sourceWidgets.find((w) => w?.id === draggedId && w?.active);
    if (!sourceWidget) return;

    const sheetWidgets = [...(this.document.getFlag("campaign-codex", "sheet-widgets") || [])];
    const existingCounters = sheetWidgets
      .filter((w) => w?.widgetName === sourceWidget.widgetName)
      .map((w) => Number(w?.counter || 0));
    const nextCounter = (existingCounters.length ? Math.max(...existingCounters) : 0) + 1;
    const newWidgetId = foundry.utils.randomID();
    const copiedWidget = {
      ...foundry.utils.deepClone(sourceWidget),
      id: newWidgetId,
      counter: nextCounter,
      active: true,
      tab: targetTab || "widgets",
    };

    const sameTabActiveIndices = [];
    for (let i = 0; i < sheetWidgets.length; i++) {
      const w = sheetWidgets[i];
      if (w?.active && (w.tab || "widgets") === copiedWidget.tab) sameTabActiveIndices.push(i);
    }

    const insertActivePos = Math.max(0, Math.min(Number(insertActivePosRaw), sameTabActiveIndices.length));
    let insertIndex;
    if (sameTabActiveIndices.length === 0) insertIndex = sheetWidgets.length;
    else if (insertActivePos <= 0) insertIndex = sameTabActiveIndices[0];
    else if (insertActivePos >= sameTabActiveIndices.length) insertIndex = sameTabActiveIndices[sameTabActiveIndices.length - 1] + 1;
    else insertIndex = sameTabActiveIndices[insertActivePos];

    sheetWidgets.splice(insertIndex, 0, copiedWidget);

    const typeKey = payload.sourceWidgetTypeKey || this._getWidgetStorageRecord(draggedId, sourceDoc).typeKey;
    const sourceWidgetData = payload.widgetData ?? this._getWidgetStorageRecord(draggedId, sourceDoc).data;

    const update = {
      "flags.campaign-codex.sheet-widgets": sheetWidgets,
    };
    if (typeKey && sourceWidgetData !== undefined && sourceWidgetData !== null) {
      update[`flags.campaign-codex.data.widgets.${typeKey}.${newWidgetId}`] = foundry.utils.deepClone(sourceWidgetData);
    }

    try {
      await this.document.update(update);
    } catch (error) {
      console.error("Campaign Codex | Failed to copy widget between sheets", error);
    }
  }

  _onWidgetTagDragEnd(event) {
    this._draggingWidgetTag = null;
    this._draggingWidgetTagElement = null;
    this.element?.querySelectorAll(".widget-tray.widget-dragging")?.forEach((tray) => tray.classList.remove("widget-dragging"));
    this.element?.querySelectorAll(".widget-drop-slot.is-hover")?.forEach((slot) => slot.classList.remove("is-hover"));
    event.currentTarget?.classList?.remove("dragging");
    this.element?.querySelectorAll(".widget-tag.active.dragging")?.forEach((el) => el.classList.remove("dragging"));
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

        if (target.dataset.playerNoteEditor === "true") {
          const sheetUuid = this.document?.uuid;
          if (!sheetUuid) return;
          const flagPath = `${CampaignCodexBaseSheet.PLAYER_NOTES_FLAG}.${sheetUuid}`;
          const trimmed = String(valueToSave || "").trim();
          if (trimmed) {
            await game.user.setFlag("campaign-codex", flagPath, { note: valueToSave, updatedAt: Date.now() });
          } else {
            await game.user.unsetFlag("campaign-codex", flagPath);
          }
          this.render();
          return;
        }

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

  /**
   * Handle clicking an image to pop it out for fullscreen view.
   * @param {PointerEvent} event  The triggering click event.
   * @protected
   */
  _onClickImage(event) {
    if (!event.target.matches("img:not(.nopopout)")) return;
    const target = event.target;
    const page = this.document._id;
    const title = this.document.name;
    const ip = new foundry.applications.apps.ImagePopout({
      src: target.getAttribute("src"),
      window: { title },
    });

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
    const override = tabOverrides.find((tab) => tab.key === sheetKey);
    return override && override.label ? override.label : false;
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - IMAGE MANAGEMENT
  // =========================================================================

  async removeImage() {
    const proceed = await confirmationDialog("Are you sure you want to remove this image?");
    if (proceed) {
      await this.document.setFlag("campaign-codex", "image", null);
    }
    this.render();
  }

  static async #_onRemoveImage(event) {
    this.removeImage();
  }
  async changeImage() {
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
          ui.notifications.error(localize('notify.failedToUpdateImage'));
        }
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    });
    return fp.browse();
  }

  static async #_onImageClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.changeImage();
  }

  static async #_onClearPlayerNote(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const targetUserId = target?.dataset?.userId;
    const targetUserName = target?.dataset?.userName || "player";
    await this._clearPlayerNoteForUser(targetUserId, targetUserName);
  }

  async _clearPlayerNoteForUser(targetUserId, targetUserName = "player") {
    if (!game.user.isGM) return;
    if (!targetUserId) return;

    const proceed = await confirmationDialog(`Delete ${targetUserName}'s player note for this sheet?`);
    if (!proceed) return;

    const targetUser = game.users.get(targetUserId);
    if (!targetUser) return;

    const sheetUuid = this.document?.uuid;
    if (!sheetUuid) return;

    const flagPath = `${CampaignCodexBaseSheet.PLAYER_NOTES_FLAG}.${sheetUuid}`;
    await targetUser.unsetFlag("campaign-codex", flagPath);
    this.render();
  }

  /**
   * Opens a dialog to select an override icon for the document using presets and searchable icon lists.
   * This can be bound as a static action 'editIcon'.
   * @param {Event} event The triggering event.
   * @protected
   */
  static async #_onEditIcon(event) {
    event.preventDefault();
    new iconPicker({}, this, { stat: { id: "icon-override" } }).render(true);
  }

  async setIcon(_id, iconValue) {
    const icon = String(iconValue || "").trim();
    if (!icon) {
      await this.document.unsetFlag("campaign-codex", "icon-override");
    } else {
      await this.document.setFlag("campaign-codex", "icon-override", `fa-solid ${icon}`);
    }
    this.render();
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
    const defaultTabHidden = getDefaultSheetHidden(this.getSheetType());

    if (
      ["npc", "tag"].includes(this.getSheetType()) &&
      defaultTabVis.hasOwnProperty("npcs") &&
      !defaultTabVis.hasOwnProperty("associates")
    ) {
      defaultTabVis.associates = defaultTabVis.npcs;
      if (defaultTabHidden.hasOwnProperty("npcs")) {
        defaultTabHidden.associates = defaultTabHidden.npcs;
      }
      delete defaultTabVis.npcs;
    }
    const defaultTabs = this._getTabDefinitions();
    const currentOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];

    const dialogTabs = defaultTabs.map((defaultTab) => {
      const override = currentOverrides.find((o) => o.key === defaultTab.key);
      const defaultVisibility = defaultTabVis[defaultTab.key] ?? true;
      const defaultHidden = defaultTabHidden[defaultTab.key] ?? false;
      return {
        key: defaultTab.key,
        originalLabel: defaultTab.label,
        overrideLabel: override?.label || "",
        visible: override?.visible ?? defaultVisibility,
        hidden: override?.hidden ?? defaultHidden,
        defaultVisibility: defaultVisibility,
        defaultHidden: defaultHidden,
      };
    });

    const imageAreaOverride = currentOverrides.find((o) => o.key === "imageArea");
    dialogTabs.push({
      key: "imageArea",
      originalLabel: "Sidebar Image",
      overrideLabel: "",
      hideLabel: true,
      hidden: imageAreaOverride?.hidden || false,
      visible: imageAreaOverride?.visible ?? true,
      defaultVisibility: true,
    });
    const mapMarkerOverride = currentOverrides.find((o) => o.key === "mapMarker");
    const defaultMapMarkerVisibility = defaultTabVis.mapMarker ?? true;
    const defaultMapMarkerHidden = defaultTabHidden.mapMarker ?? false;
    dialogTabs.push({
      key: "mapMarker",
      originalLabel: "Map Marker",
      overrideLabel: "",
      hideLabel: true,
      hidden: mapMarkerOverride?.hidden ?? defaultMapMarkerHidden,
      visible: mapMarkerOverride?.visible ?? defaultMapMarkerVisibility,
      defaultVisibility: defaultMapMarkerVisibility,
      defaultHidden: defaultMapMarkerHidden,
    });

    const content = await renderTemplate("modules/campaign-codex/templates/partials/tab-config-dialog.hbs", {
      tabs: dialogTabs,
    });

    new foundry.applications.api.DialogV2({
      window: { title: "Configure Tabs" },
      classes: ["cc-tab-config"],
      content,
      form: {
        closeOnSubmit: false,
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
          const hiddenKey = `${key}.hidden`;
          const label = String(updates[labelKey] ?? "").trim();
          const visible = updates[visibleKey] === "on";
          const hidden = updates[hiddenKey] === "on";
          newOverrides.push({
            key: key,
            label: label,
            visible: visible,
            hidden: hidden,
          });
        }
        const filteredOverrides = newOverrides.filter((o) => {
          const originalTab = dialogTabs.find((d) => d.key === o.key);
          if (!originalTab) return false;
          const isLabelOverridden = o.label && o.label !== originalTab.originalLabel;
          const isVisibilityOverridden = o.visible !== originalTab.defaultVisibility;
          const isHiddenOverridden = o.hidden !== originalTab.defaultHidden;
          return isLabelOverridden || isVisibilityOverridden || isHiddenOverridden;
        });

        if (filteredOverrides.length > 0) {
          this.document.setFlag("campaign-codex", "tab-overrides", filteredOverrides);
        } else {
          this.document.unsetFlag("campaign-codex", "tab-overrides");
        }

        dialog.close();
      },

      close: () => {
        this.render();
      },
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
    await this._onRemoveFromList(event, "linkedShops");
  }

  static async #_onRemoveNPC(event) {
    const myType = this.getSheetType();
    if (myType && ["npc", "tag"].includes(myType)) {
      await this._onRemoveFromList(event, "associates");
    } else {
      await this._onRemoveFromList(event, "linkedNPCs");
    }
  }

  static async #_onRemoveAssociate(event) {
    await this._onRemoveFromList(event, "associates");
  }

  static async #_onRemoveParentRegion(event) {
    await this._onRemoveFromList(event, "parentRegions");
  }

  static async #_onRemoveRegion(event) {
    await this._onRemoveFromList(event, "linkedRegions");
  }

  static async #_openActor(event) {
    await this._onOpenDocument(event, "actor");
  }

  static async #_openAssociate(event) {
    await this._onOpenDocument(event, "associate");
  }

  static async #_openGroup(event) {
    await this._onOpenDocument(event, "group");
  }

  static async #_openRegion(event) {
    await this._onOpenDocument(event, "region");
  }

  static async #_openShop(event) {
    await this._onOpenDocument(event, "shop");
  }

  static async #_openLocation(event) {
    await this._onOpenDocument(event, "location");
  }

  static async #_openNPC(event) {
    await this._onOpenDocument(event, "npc");
  }

  static async #_openQuest(event) {
    await this._onOpenDocument(event, "quest");
  }

  static async #_openTag(event) {
    await this._onOpenDocument(event, "tag");
  }

  static async #_openJournal(event) {
    await this._onOpenDocument(event, "journal");
  }

  static async #_onAddWidget(event) {
    event.preventDefault();
    event.stopPropagation();
    const widgetName = event.target.dataset.name;
    if (!widgetName) return;

    const tabContainer =
      event.target.closest(".tab-panel") ||
      event.target.closest(".group-tab-panel") ||
      event.target.closest("[data-tab]");
    const targetTab = tabContainer?.dataset?.tab || "widgets";

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const existingCounters = sheetWidgets.filter((w) => w.widgetName === widgetName).map((w) => w.counter || 0);
    const maxCounter = existingCounters.length > 0 ? Math.max(...existingCounters) : 0;
    const newCounter = maxCounter + 1;
    const newWidget = {
      id: foundry.utils.randomID(),
      widgetName: widgetName,
      counter: newCounter,
      active: true,
      tab: targetTab,
    };
    if (sheetWidgets.some((w) => w.id === newWidget.id)) {
      return ui.notifications.warn(localize('notify.idCollision'));
    }

    await this.document.setFlag("campaign-codex", "sheet-widgets", [...sheetWidgets, newWidget]);
  }

  static async #_onActivateWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const tabContainer =
      event.target.closest(".tab-panel") ||
      event.target.closest(".group-tab-panel") ||
      event.target.closest("[data-tab]");
    const targetTab = tabContainer?.dataset?.tab || "widgets";

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const widget = sheetWidgets.find((w) => w.id === widgetId);

    if (widget) {
      widget.active = true;
      widget.tab = targetTab;
      await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
    }
  }

  static async #_onDeactivateWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const widget = sheetWidgets.find((w) => w.id === widgetId);

    if (widget) {
      widget.active = false;
      await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
    }
  }

  static async #_moveActiveWidget(event, direction = "up") {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const tabContainer =
      event.target.closest(".tab-panel") ||
      event.target.closest(".group-tab-panel") ||
      event.target.closest("[data-tab]");
    const targetTab = event.target.dataset.tab || tabContainer?.dataset?.tab || "widgets";

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const activeIndices = [];

    for (let i = 0; i < sheetWidgets.length; i++) {
      const widget = sheetWidgets[i];
      const widgetTab = widget?.tab || "widgets";
      if (widget?.active && widgetTab === targetTab) activeIndices.push(i);
    }

    const currentActivePos = activeIndices.findIndex((index) => sheetWidgets[index]?.id === widgetId);
    if (currentActivePos < 0) return;

    const swapActivePos = direction === "down" ? currentActivePos + 1 : currentActivePos - 1;
    if (swapActivePos < 0 || swapActivePos >= activeIndices.length) return;

    const currentIndex = activeIndices[currentActivePos];
    const swapIndex = activeIndices[swapActivePos];
    [sheetWidgets[currentIndex], sheetWidgets[swapIndex]] = [sheetWidgets[swapIndex], sheetWidgets[currentIndex]];

    await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
  }

  static async #_onMoveWidgetUp(event) {
    return this.#_moveActiveWidget(event, "up");
  }

  static async #_onMoveWidgetDown(event) {
    return this.#_moveActiveWidget(event, "down");
  }

  static async #_onSwapWidgetTab(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    if (!widgetId) return;

    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];
    const widget = sheetWidgets.find((w) => w.id === widgetId);
    if (!widget || widget.active) return;

    const currentTab = widget.tab || "widgets";
    widget.tab = currentTab === "info" ? "widgets" : "info";
    await this.document.setFlag("campaign-codex", "sheet-widgets", sheetWidgets);
  }

  static async #_onDeleteWidget(event) {
    event.preventDefault();
    const widgetId = event.target.dataset.id;
    const widgetType = event.target.dataset.type;
    if (!widgetId || !widgetType) return;

    const proceed = await confirmationDialog("Are you sure you want to delete this widget?");
    if (!proceed) return;

    try {
      const currentWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || [];

      const newWidgets = currentWidgets.filter((w) => w.id !== widgetId);

      const parentPath = `flags.campaign-codex.data.widgets.${widgetType.toLowerCase()}`;
      console.log(`Campaign Codex | Removing widget ${widgetId} and its data.`);

      return await this.document.update({
        "flags.campaign-codex.sheet-widgets": newWidgets,
        [parentPath]: {
          [`-=${widgetId}`]: null,
        },
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
    const uuid = event.target.closest("[data-uuid]").dataset.uuid;
    if (!uuid) return;
    await this._linkTagToSheet(event, uuid);
  }

  static async #_onCreateTag(event) {
    event.stopPropagation();
    event.preventDefault();
    const name = await promptForName(localize("names.faction") || "Faction");
    if (name) {
      const tagJournal = await game.campaignCodex.createTagJournal(null, name, true);
      if (tagJournal) {
        await this._linkTagToSheet(event, tagJournal.uuid);
      }
    }
  }

  static async #_onRemoveScene(event) {
    event.preventDefault();

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.linkedScene = null;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
    ui.notifications.info(localize('notify.unlinkedScene'));
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
    const itemUuid = event.target.closest("[data-uuid]").dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (item) {
      item.sheet.render(true);
    } else {
      ui.notifications.warn(localize('notify.itemNotFound'));
    }
  }

  static async #_playerLoot(event) {
    event.stopPropagation();
    const playerCharacter = game.user?.character;
    if (!playerCharacter) return;

    let sourceDoc = this.document;
    if (["group", "tag"].includes(this.document.getFlag("campaign-codex", "type"))) {
      const sourceUuid = event.target.closest("[data-doc-uuid]")?.dataset.docUuid;
      if (!sourceUuid) {
        ui.notifications.warn(localize('notify.noSourceDocument'));
        return;
      }
      sourceDoc = await fromUuid(sourceUuid);
    }

    const target = event.target.closest("[data-uuid]");
    const itemUuid = target.dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (!item) {
      ui.notifications.warn(localize('notify.itemNotFound'));
      return;
    }
    const currentData = sourceDoc.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
    const maxQuantity = shopItem?.infinite ? null : Math.max(Number(shopItem?.quantity || 0), 0);
    const quantity = await this._promptForItemQuantity(item.name, maxQuantity);
    if (!quantity) return;
     await this._handlePurchase(item, playerCharacter, sourceDoc, quantity, true);
  }


  static async #_playerPurchase(event) {
    event.stopPropagation();
    const playerCharacter = game.user?.character;
    if (!playerCharacter) return;

    let sourceDoc = this.document;
    if (["group", "tag"].includes(this.document.getFlag("campaign-codex", "type"))) {
      const sourceUuid = event.target.closest("[data-doc-uuid]")?.dataset.docUuid;
      if (!sourceUuid) {
        ui.notifications.warn(localize('notify.noSourceDocument'));
        return;
      }
      sourceDoc = await fromUuid(sourceUuid);
    }

    const target = event.target.closest("[data-uuid]");
    const itemUuid = target.dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (!item) {
      ui.notifications.warn(localize('notify.itemNotFound'));
      return;
    }
    const currentData = sourceDoc.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
    const maxQuantity = shopItem?.infinite ? null : Math.max(Number(shopItem?.quantity || 0), 0);
    const quantity = await this._promptForItemQuantity(item.name, maxQuantity);
    if (!quantity) return;
    await this._handlePurchase(item, playerCharacter, sourceDoc, quantity);
  }

  static async #_onSendToPlayer(event) {
    event.stopPropagation();
    const target = event.target.closest("[data-uuid]");
    if (!target) return;

    const isQuestSend = target.dataset?.type === "quest";
    const itemUuid = target.dataset.uuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);

    if (!item) {
      ui.notifications.warn(localize('notify.itemNotFound'));
      return;
    }
    let sourceDoc = this.document;
    if (["group", "tag"].includes(this.document.getFlag("campaign-codex", "type"))) {
      const sourceUuid = event.target.closest("[data-doc-uuid]")?.dataset.docUuid;
      if (!sourceUuid) {
        ui.notifications.warn(localize('notify.noSourceDocument'));
        return;
      }
      sourceDoc = await fromUuid(sourceUuid);
    }

    const sourceData = sourceDoc.getFlag("campaign-codex", "data") || {};
    let maxQuantity = null;
      const shopItem = (sourceData.inventory || []).find((i) => i.itemUuid === item.uuid);
      maxQuantity = shopItem?.infinite ? null : Math.max(Number(shopItem?.quantity || 0), 0);

    const quantity = await this._promptForItemQuantity(item.name, maxQuantity);
    if (!quantity) return;

    TemplateComponents.createPlayerSelectionDialog(item.name, async (targetActor, deductFunds) => {
      if (deductFunds && !isQuestSend) {
        await this._handlePurchase(item, targetActor, sourceDoc, quantity);
      } else {
        await this._transferItemToActor(item, targetActor, sourceDoc, null, quantity);
      }
    }, { showDeductFunds: !isQuestSend });
  }


  // =========================================================================
  // Player Purchasing
  // =========================================================================

  async _handlePurchase(item, targetActor, document, quantity = 1, lootMode=false) {
    try {
      const qtyToBuy = Math.max(1, Number(quantity || 1));
      const currentData = document.getFlag("campaign-codex", "data") || {};
      const inventory = currentData.inventory || [];
      const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
      const markup = currentData.markup || 1;
      const currentQty = shopItem ? shopItem.quantity : 0;
      const infinite = shopItem ? shopItem?.infinite : false;
      const addFundsToHeldCurrency = game.settings.get("campaign-codex", "addPurchaseFundsToInventoryCash");
      const purchaseDetails = EconomyHelper._calculateFinalPrice(item, shopItem, markup, qtyToBuy) || null;
      const purchaseCost = Number(purchaseDetails?.cost || 0);
      const purchaseCurrency = String(
        purchaseDetails?.currency || CampaignCodexLinkers.getCurrency() || "gp",
      ).toLowerCase();

      if ((currentQty <= 0 || currentQty < qtyToBuy) && !infinite) {
        ui.notifications.warn(localize('notify.outOfStock'));
        return;
      }
      if (!lootMode) {
        const hasPaid = await EconomyHelper.removeCost(item, targetActor, shopItem, markup, qtyToBuy);
        if (!hasPaid) return;
        if (addFundsToHeldCurrency && purchaseCost > 0) {
          const inventoryCurrency = String(CampaignCodexLinkers.getCurrency() || purchaseCurrency || "gp").toLowerCase();
          const purchaseCostForInventory = EconomyHelper.convertCurrencyAmount(
            purchaseCost,
            purchaseCurrency,
            inventoryCurrency,
          );
          const roundedDelta = Math.round(Number(purchaseCostForInventory || 0) * 10000) / 10000;
          await this._adjustInventoryCash(document, roundedDelta);
        }
      }

      await this._addItemToActorInventory(item, targetActor, qtyToBuy);

      if (!infinite) {
        const newQuantity = Math.max(currentQty - qtyToBuy, 0);

        if (shopItem) {
          if (game.user.isGM) {
            await this._updateInventoryItem(item.uuid, { quantity: newQuantity }, document);
          } else {
            game.socket.emit("module.campaign-codex", {
              action: "updateInventory",
              data: {
                docUuid: document.uuid,
                itemUuid: item.uuid,
                updates: { quantity: newQuantity },
              },
            });
          }
          if (["group", "tag"].includes(this.document.getFlag("campaign-codex", "type")) && game.user.isGM)
            document.render();
        }
      }

      if (!lootMode && purchaseCost > 0) {
        const transactionData = {
          type: "buy",
          itemName: item.name,
          amount: purchaseCost,
          currency: purchaseCurrency,
          actorName: targetActor.name,
          actorUuid: targetActor.uuid,
          userId: game.user.id,
          userName: game.user.name,
          source: "Inventory Purchase",
          sourceUuid: document.uuid,
        };

        if (game.user.isGM) {
          await appendTransaction(document, transactionData).catch((error) => {
            console.warn("Campaign Codex | Failed to append transaction record:", error);
          });
        } else {
          game.socket.emit("module.campaign-codex", {
            action: TRANSACTION_LOG_SOCKET_ACTION,
            data: {
              docUuid: document.uuid,
              transaction: transactionData,
            },
          });
        }
      }

      ui.notifications.info(format("title.send.item.typetoplayer", { type: item.name, player: targetActor.name }));

      const targetUser = game.users.find((u) => u.character?.id === targetActor.id);
      if (targetUser && targetUser.active) {
        ChatMessage.create({
          content: `<p><strong>${game.user.name}</strong> ${lootMode ? "took" : "purchased"} <strong>${qtyToBuy}x ${item.name}</strong> from ${this.document.name}!</p>`,
          whisper: game.users.activeGM?.id,
        });
      }
    } catch (error) {
      console.error("Error transferring item:", error);
      ui.notifications.error(localize("error.faileditem"));
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
          case "npc":
            await game.campaignCodex.linkNPCToNPC(this.document, npcJournal);
            break;
          case "location":
            await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
            break;
          case "region":
            await game.campaignCodex.linkRegionToNPC(this.document, npcJournal);
            break;
          case "shop":
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
          case "npc":
            await game.campaignCodex.linkShopToNPC(shopJournal, this.document);
            break;
          case "location":
            await game.campaignCodex.linkLocationToShop(this.document, shopJournal);
            break;
          case "region":
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
          case "npc":
            await game.campaignCodex.linkRegionToNPC(regionJournal, this.document);
            break;

          case "region":
            await game.campaignCodex.linkRegionToRegion(this.document, regionJournal);
            break;

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
          case "npc":
            await game.campaignCodex.linkLocationToNPC(locationJournal, this.document);

          case "region":
            await game.campaignCodex.linkRegionToLocation(this.document, locationJournal);
            break;

          default:
            return;
        }
        this.render(true);
        locationJournal.sheet.render(true);
      }
    }
  }

  static async #_onCreateQuestJournal(event) {
    return this._onAddQuest(event);
  }

  // =========================================================================
  // hide Cards
  // =========================================================================

  _getLinkCardFieldForElement(element) {
    const card = element?.closest?.(".entity-card") || element;
    if (!card?.dataset) return null;
    if (card.dataset.linkField) return card.dataset.linkField;

    switch (card.dataset.type) {
      case "npc":
        return "linkedNPCs";
      case "location":
        return "linkedLocations";
      case "associate":
      case "faction":
        return "associates";
      case "shop":
        return "linkedShops";
      case "region":
        return "linkedRegions";
      case "parentregion":
        return "parentRegions";
      case "group":
        return "linkedGroups";
      default:
        return null;
    }
  }

  async editLinkCardNote(event, forcedFieldName = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const card = event?.target?.closest?.("[data-uuid]") || event?.currentTarget?.closest?.("[data-uuid]") || event?.currentTarget;
    const uuid = card?.dataset?.uuid;
    const fieldName = forcedFieldName || this._getLinkCardFieldForElement(card);
    if (!uuid || !fieldName) return;

    const data = foundry.utils.deepClone(this.document.getFlag("campaign-codex", "data") || {});
    data.linkCardNotes ||= {};

    const rawEntries = data.linkCardNotes[fieldName];
    const entries = Array.isArray(rawEntries)
      ? rawEntries.filter((entry) => entry?.uuid)
      : (rawEntries && typeof rawEntries === "object"
        ? Object.entries(rawEntries).map(([entryUuid, note]) => ({ uuid: entryUuid, note }))
        : []);

    const currentEntry = entries.find((entry) => entry.uuid === uuid);
    const currentNote = typeof currentEntry?.note === "string" ? currentEntry.note : "";
    const cardName = card.querySelector(".entity-name")?.textContent?.trim() || "card";
    const nextValue = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Card Note: ${cardName}` },
      content: `
        <div class="form-group">
          <label>Note:</label>
          <input type="text" name="cardNote" value="${foundry.utils.escapeHTML(currentNote)}" autofocus style="width:100%;" />
        </div>
      `,
      ok: {
        label: localize("dialog.save"),
        callback: (event, button) => String(button.form.elements.cardNote.value || ""),
      },
      cancel: { label: localize("dialog.cancel") },
      rejectClose: false,
    }).catch(() => null);
    if (nextValue === null) return;

    const note = String(nextValue).trim();
    const filtered = entries.filter((entry) => entry.uuid !== uuid);
    if (note) filtered.push({ uuid, note });

    if (filtered.length > 0) {
      data.linkCardNotes[fieldName] = filtered;
    } else {
      delete data.linkCardNotes[fieldName];
      if (Object.keys(data.linkCardNotes).length === 0) delete data.linkCardNotes;
    }

    await this.document.setFlag("campaign-codex", "data", data);
    this.render(true);
  }

  async hideAssociate(event) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target.closest("[data-uuid]");
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const hiddenAssociates = currentData.hiddenAssociates || [];

    if (hiddenAssociates.includes(uuid)) {
      const newHidden = hiddenAssociates.filter((u) => u !== uuid);
      await this.document.setFlag("campaign-codex", "data.hiddenAssociates", newHidden);
    } else {
      hiddenAssociates.push(uuid);
      await this.document.setFlag("campaign-codex", "data.hiddenAssociates", hiddenAssociates);
    }
    this.render();
  }

  // =========================================================================
  // Context remove forwarder
  // =========================================================================

  async removeLink(event) {
    if (!event && !event.target?.dataset?.type) return;
    const type = event.target.dataset.type;
    if (type === "location") {
      this._removeLocation(event);
    } else if (type === "shop") {
      await this._onRemoveFromList(event, "linkedShops");
    } else if (type === "associate") {
      await this._onRemoveFromList(event, "associates");
    } else if (type === "faction") {
      await this._onRemoveFromList(event, "associates");
    } else if (["npc", "tag"].includes(type)) {
      await this._onRemoveFromList(event, "linkedNPCs");
    } else if (type === "shop") {
      await this._onRemoveFromList(event, "linkedShops");
    } else if (type === "region") {
      if (this.getSheetType() === "tag") {
        this._removeLocation(event);
      } else {
        await this._onRemoveFromList(event, "linkedRegions");
      }
    } else if (type === "group") {
      await this._onRemoveFromList(event, "linkedGroups");
    } else if (type === "parentregion") {
      await this._onRemoveFromList(event, "parentRegions");
    } else if (type === "journal") {
      await this._removeJournal(event);
    }
  }

  async removeTag(event) {
    const myType = this.getSheetType();
    if (myType && ["npc", "tag"].includes(myType)) {
      await this._onRemoveFromList(event, "associates");
    } else {
      await this._onRemoveFromList(event, "linkedNPCs");
    }
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - REMOVE OBJECTS
  // =========================================================================

  async _onRemoveActor(event) {
    await this.document.setFlag("campaign-codex", "data.linkedActor", null);
    this.render(true);
  }

  async _removeJournal(event) {
    event.preventDefault();
    event.stopPropagation();
    const journalUuid = event.target.dataset.uuid;
    if (!journalUuid) return;

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    if (currentData.linkedStandardJournals && Array.isArray(currentData.linkedStandardJournals)) {
      currentData.linkedStandardJournals = currentData.linkedStandardJournals.filter((uuid) => uuid !== journalUuid);
      await this.document.setFlag("campaign-codex", "data", currentData);
      this.render();
      ui.notifications.info(localize('notify.unlinkedJournal'));
    }
  }

  static async #_onRemoveLocation(event) {
    this._removeLocation(event);
  }

  async _removeLocation(event) {
    const docType = this.document.getFlag("campaign-codex", "type");
    if (docType) {
      if (docType === "region" || docType === "location") {
        this._onRemoveFromRegion(event);
      }
    }

    event.stopPropagation();
    const myType = this.getSheetType();
    if (myType && ["npc", "tag"].includes(myType)) {
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
      ui.notifications.error(localize('notify.failedToRemoveLocationLink'));
    } finally {
      this.render(true);
    }
  }

  async _onRemoveFromRegion(event) {
    event.preventDefault();
    event.stopPropagation();

    const myType = this.getSheetType();
    let locationDoc, regionDoc;

    if (myType === "location") {
      locationDoc = this.document;
      const regionUuid = locationDoc.getFlag("campaign-codex", "data")?.parentRegion;
      if (regionUuid) regionDoc = await fromUuid(regionUuid);
    } else if (myType === "region") {
      regionDoc = this.document;
      const locationUuid = event.target.closest("[data-uuid]").dataset.uuid;
      if (locationUuid) locationDoc = await fromUuid(locationUuid);
    }

    if (!locationDoc || !regionDoc) {
      ui.notifications.warn(localize('notify.linkedRegionOrLocationNotFound'));
      return this.render(false);
    }

    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};
    if (regionData.linkedLocations) {
      regionData.linkedLocations = regionData.linkedLocations.filter((uuid) => uuid !== locationDoc.uuid);
      await regionDoc.setFlag("campaign-codex", "data", regionData);
    }
    await locationDoc.unsetFlag("campaign-codex", "data.parentRegion");

    ui.notifications.info(format('notify.removedFromRegion', { location: locationDoc.name, region: regionDoc.name }));
    targetedRefresh([regionDoc.uuid, locationDoc.uuid], this.document.uuid);
  }

  // =========================================================================
  // STATIC ACTION HANDLERS - DROP TO MAP
  // =========================================================================

  static async #_onDropNPCsToMapClick(event) {
    event.preventDefault();
    const sheetType = this.getSheetType();
    if (["npc", "tag"].includes(sheetType)) {
      this._onDropNPCsToMapNPCSheet(event);
    } else if (sheetType === "location") {
      this._onDropNPCsToMapLocationSheet(event);
    } else if (sheetType === "region") {
      this._onDropNPCsToMapLocationSheet(event);
    } else if (sheetType === "shop") {
      this._onDropNPCsToMapShopSheet(event);
    } else {
      ui.notifications.warn(format('notify.dropToMapNotImplemented', { type: sheetType }));
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
    if (!npcData.linkedActor) return ui.notifications.warn(localize('notify.npcNoLinkedActor'));
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
      ui.notifications.warn(localize('notify.noNPCsWithActors'));
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
    event.stopPropagation();
    const inventoryCash = parseFloat(event.target.value) || 0;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.inventoryCash = inventoryCash;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
  }

  async _adjustInventoryCash(doc, amount = 0) {
    const delta = Number(amount || 0);
    if (!Number.isFinite(delta) || delta === 0) return;
    const targetDoc = doc instanceof foundry.abstract.Document ? doc : this.document;
    if (!targetDoc) return;

    if (game.user.isGM) {
      const currentData = targetDoc.getFlag("campaign-codex", "data") || {};
      const currentCash = Number(currentData.inventoryCash || 0);
      const nextCash = Math.max(0, currentCash + delta);
      await targetDoc.setFlag("campaign-codex", "data.inventoryCash", nextCash);
      return;
    }

    game.socket.emit("module.campaign-codex", {
      action: "adjustInventoryCash",
      data: { docUuid: targetDoc.uuid, amount: delta },
    });
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

  static async #_infiniteToggle(event) {
    const itemUuid = event.target.dataset.uuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const item = inventory.find((i) => i.itemUuid === itemUuid);
    const isInfinite = item?.infinite || false;
    event.target.classList.toggle("enabled", !isInfinite);
    await this._updateInventoryItem(itemUuid, { infinite: !isInfinite });
  }

  static async #_onRemoveItem(event) {
    const itemUuid = event.target.dataset.uuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.inventory = (currentData.inventory || []).filter((i) => i.itemUuid !== itemUuid);
    await this.document.setFlag("campaign-codex", "data", currentData);
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
      infinite: item.infinite,
    }));

    await this.document.setFlag("campaign-codex", "data", {
      ...currentData,
      inventory: sortedMinimalInventory,
    });

    this.render();
  }

  _onItemDragStart(event) {
    const el = event.currentTarget;
    if ("link" in event.target.dataset) return;
    let itemUuid = event.target.dataset.uuid;
    if (!itemUuid) return;
    const dragData = {
      type: "Item",
      uuid: itemUuid,
      source: "shop",
      shopId: this.document.id,
    };

    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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
      ui.notifications.warn(localize('notify.tagNotFound'));
      return;
    }

    switch (myType) {
      case "tag":
        await game.campaignCodex.linkNPCToNPC(myDoc, tagDoc);
        break;
      case "npc":
        await game.campaignCodex.linkNPCToNPC(myDoc, tagDoc);
        break;
      case "location":
        await game.campaignCodex.linkLocationToNPC(myDoc, tagDoc);
        break;
      case "region":
        await game.campaignCodex.linkRegionToNPC(myDoc, tagDoc);
        break;
      case "shop":
        await game.campaignCodex.linkShopToNPC(myDoc, tagDoc);
        break;
      case "group":
        await game.campaignCodex.linkGroupToTag(myDoc, tagDoc);
        break;
      default:
        return;
    }
  }


  async _onAddQuest(event) {
    event.preventDefault();
    const actionEl = event.currentTarget?.closest?.("[data-doc-uuid]") || event.currentTarget;
    const targetRaw = actionEl?.dataset?.docUuid ? await fromUuid(actionEl.dataset.docUuid).catch(() => null) : null;
    const targetDoc = targetRaw?.documentName === "JournalEntryPage" ? targetRaw.parent : (targetRaw || this.document);
    const targetSheetType = targetDoc?.getFlag("campaign-codex", "type") || this.getSheetType();

    if (targetSheetType !== "quest") {
      const name = await promptForName(localize("names.quest"));
      if (!name) return;
      const questDoc = await game.campaignCodex.createQuestJournal(name);
      if (!questDoc) return;
      await this._linkQuestJournal(questDoc, targetDoc);
      return;
    }
    const currentData = targetDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(Array.isArray(currentData.quests) ? currentData.quests : []);
    const createQuest = game.campaignCodex?.createDefaultQuestData;
    if (typeof createQuest !== "function") {
      console.error("Campaign Codex | createDefaultQuestData is unavailable.");
      return;
    }
    if (quests[0]?.id) {
      ui.notifications.warn("Quest sheets currently support one quest entry.");
      return;
    }
    const newQuest = createQuest.call(game.campaignCodex, localize("names.quest") || "New Quest");
    quests[0] = newQuest;
    await targetDoc.setFlag("campaign-codex", "data.quests", quests.slice(0, 1));
    this.render(true);
  }

  async _onRemoveQuest(event) {
    event.preventDefault();
    event.stopPropagation();
    const questUuid = event.currentTarget.dataset.uuid;
    if (questUuid !== this.document.uuid) {
      const currentData = this.document.getFlag("campaign-codex", "data") || {};
      const linkedQuests = Array.isArray(currentData.linkedQuests) ? [...currentData.linkedQuests] : [];
      currentData.linkedQuests = linkedQuests.filter((uuid) => uuid !== questUuid);
      await this.document.setFlag("campaign-codex", "data", currentData);

      const questDoc = await fromUuid(questUuid).catch(() => null);
      if (questDoc?.documentName === "JournalEntry" && questDoc.getFlag("campaign-codex", "type") === "quest") {
        const questData = questDoc.getFlag("campaign-codex", "data") || {};
        const quests = foundry.utils.deepClone(questData.quests || []);
        let changed = false;

        const isCurrentSheetRef = async (uuid) => {
          if (!uuid) return false;
          const raw = await fromUuid(uuid).catch(() => null);
          const doc = raw?.documentName === "JournalEntryPage" ? raw.parent : raw;
          return doc?.documentName === "JournalEntry" && doc.uuid === this.document.uuid;
        };

        for (const quest of quests) {
          if (!quest) continue;
          let questChanged = false;

          if (quest.questGiverUuid && await isCurrentSheetRef(quest.questGiverUuid)) {
            quest.questGiverUuid = "";
            changed = true;
            questChanged = true;
          }

          if (Array.isArray(quest.relatedUuids) && quest.relatedUuids.length) {
            const nextRelated = [];
            for (const uuid of quest.relatedUuids) {
              if (await isCurrentSheetRef(uuid)) {
                changed = true;
                questChanged = true;
                continue;
              }
              nextRelated.push(uuid);
            }
            quest.relatedUuids = nextRelated;
          }

          if (questChanged) quest.updatedAt = Date.now();
        }

        if (changed) {
          await questDoc.setFlag("campaign-codex", "data.quests", quests);
        }
      }

      this.render();
      return;
    }
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - DRAG & DROP
  // =========================================================================

  _onDragOver(event) {
    event.preventDefault();
    if (this._hasWidgetDragType(event)) {
      event.dataTransfer.dropEffect = "copy";
      return;
    }
    event.dataTransfer.dropEffect = "link";
  }

  async _onDrop(event) {
    event.stopPropagation();
    event.preventDefault();
    if (this._dropping) return;
    this._dropping = true;
    const rawDropData = event.dataTransfer?.getData("text/plain") || "";
    let data = null;
    try {
      data = rawDropData ? JSON.parse(rawDropData) : null;
    } catch (err) {
      data = null;
    }
    try {
      const handledImageDrop = await this._handleImageDrop(event, data, rawDropData);
      if (handledImageDrop) {
        return;
      }

      if (!data) {
        return;
      }

      if (data?.type === "cc-widget-reorder") {
        await this._handleWidgetTrayDrop(data, event);
        return;
      }
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

  _isImageDropTarget(event) {
    return !!event.target?.closest?.(".sheet-image");
  }

  _looksLikeImagePath(value) {
    if (typeof value !== "string") return false;
    const path = value.trim();
    if (!path) return false;
    return /\.(apng|avif|bmp|gif|jpe?g|jfif|png|svg|webp)(\?.*)?$/i.test(path);
  }

  async _extractDroppedImagePath(data, rawDropData) {
    if (this._looksLikeImagePath(rawDropData)) return rawDropData.trim();
    if (!data || typeof data !== "object") return null;

    const candidates = [
      data.path,
      data.img,
      data.src,
      data.url,
      data.file,
      data.image,
      data.imagePath,
      data?.texture?.src,
    ];

    for (const candidate of candidates) {
      if (this._looksLikeImagePath(candidate)) return candidate.trim();
    }

    if (data.uuid) {
      const droppedDoc = await fromUuid(data.uuid).catch(() => null);
      if (!droppedDoc) return null;

      const uuidCandidates = [
        droppedDoc?.src,
        droppedDoc?.img,
        droppedDoc?.image?.src,
        droppedDoc?.texture?.src,
      ];
      for (const candidate of uuidCandidates) {
        if (this._looksLikeImagePath(candidate)) return candidate.trim();
      }
    }

    return null;
  }

  async _handleImageDrop(event, data, rawDropData) {
    if (!this._isImageDropTarget(event)) return false;
    const imagePath = await this._extractDroppedImagePath(data, rawDropData);
    if (!imagePath) return false;

    const existingImage = this.document.getFlag("campaign-codex", "image");
    if (existingImage && existingImage !== imagePath) {
      const replace = await confirmationDialog("This sheet already has an image. Replace it?");
      if (!replace) return true;
    }

    await this.document.setFlag("campaign-codex", "image", imagePath);
    this.render(false);
    return true;
  }

  async _handleItemDrop(data, event) {
    const items = await this._resolveDroppedItems(data);
    if (!items.length) {
      return;
    }

    event.stopPropagation();
    const dropOnQuest = event.target.closest(".quest-item");
    if (dropOnQuest) {
      const questId = dropOnQuest.dataset.questId;
      const questDocUuid = dropOnQuest.dataset.docUuid || this.document.uuid;
      const questDoc = questDocUuid === this.document.uuid ? this.document : await fromUuid(questDocUuid);
      if (!questDoc) return;
      const currentData = questDoc.getFlag("campaign-codex", "data") || {};
      const quests = foundry.utils.deepClone(currentData.quests || []);
        const quest = quests[0];
      if (quest) {
        quest.inventory = quest.inventory || [];
        for (const item of items) {
          const existingItem = quest.inventory.find((i) => i.itemUuid === item.uuid);
          if (existingItem) {
            existingItem.quantity = (existingItem.quantity || 0) + 1;
          } else {
            quest.inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
          }
        }
        quest.updatedAt = Date.now();
        await questDoc.setFlag("campaign-codex", "data.quests", quests);
        this.render();
        if (items.length === 1) {
          ui.notifications.info(format('notify.addedToQuest', { item: items[0].name, quest: quest.title }));
        } else {
          ui.notifications.info(`Added ${items.length} items to ${quest.title}.`);
        }
      }
    } else {
      for (const item of items) {
        await game.campaignCodex.addItemToShop(this.document, item, 1);
      }
      this.render();
      if (items.length === 1) {
        ui.notifications.info(format("inventory.added", { type: items[0].name }));
      } else {
        ui.notifications.info(format("inventory.added", { type: `${items.length} items` }));
      }
    }
  }

  async _resolveDroppedItems(data) {
    if (!data?.uuid) {
      ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
      return [];
    }

    const dropped = await fromUuid(data.uuid).catch(() => null);
    if (!dropped) {
      ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
      return [];
    }

    if (dropped.documentName === "Item") {
      return [dropped];
    }

    const isItemFolder = data.type === "Folder" && dropped.documentName === "Folder" && dropped.type === "Item";
    if (!isItemFolder) {
      ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
      return [];
    }

    const folderItems = Array.from(dropped.contents || []).filter((doc) => doc?.documentName === "Item");
    if (!folderItems.length) {
      ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
      return [];
    }

    return folderItems;
  }
  // async _handleItemDrop(data, event) {
  //   if (!data.uuid) {
  //     ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
  //     return;
  //   }
  //   event.stopPropagation();

  //   const item = await fromUuid(data.uuid);
  //   if (!item) {
  //     ui.notifications.warn(localize('notify.itemNotFoundToAdd'));
  //     return;
  //   }
  //   const dropOnQuest = event.target.closest(".quest-item");
  //   if (dropOnQuest) {
  //     const questId = dropOnQuest.dataset.questId;
  //     const questDocUuid = dropOnQuest.dataset.docUuid || this.document.uuid;
  //     const questDoc = questDocUuid === this.document.uuid ? this.document : await fromUuid(questDocUuid);
  //     if (!questDoc) return;
  //     const currentData = questDoc.getFlag("campaign-codex", "data") || {};
  //     const quests = foundry.utils.deepClone(currentData.quests || []);
  //     const quest = quests.find((q) => q.id === questId);
  //     if (quest) {
  //       quest.inventory = quest.inventory || [];
  //       const existingItem = quest.inventory.find((i) => i.itemUuid === item.uuid);
  //       if (existingItem) {
  //         existingItem.quantity = (existingItem.quantity || 0) + 1;
  //       } else {
  //         quest.inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
  //       }
  //       quest.updatedAt = Date.now();
  //       await questDoc.setFlag("campaign-codex", "data.quests", quests);
  //       this.render();
  //       ui.notifications.info(format('notify.addedToQuest', { item: item.name, quest: quest.title }));
  //     }
  //   } else {
  //     const currentData = this.document.getFlag("campaign-codex", "data") || {};
  //     const inventory = currentData.inventory || [];

  //     await game.campaignCodex.addItemToShop(this.document, item, 1);
  //     this.render();
  //     ui.notifications.info(format("inventory.added", { type: item.name }));
  //   }
  // }

  async _handleActorDrop(context, event) {
    const actor = await fromUuid(context.uuid);
    if (!actor) return ui.notifications.warn(localize('notify.actorNotFound'));

    const sheetType = this.getSheetType();

    switch (sheetType) {
      case "region": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkRegionToNPC(this.document, npcJournal);
          ui.notifications.info(format('notify.linkedActorToDocument', { actor: actor.name, document: this.document.name }));
        }
        break;
      }
      case "location": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkLocationToNPC(this.document, npcJournal);
          ui.notifications.info(format('notify.linkedActorToDocument', { actor: actor.name, document: this.document.name }));
        }
        break;
      }
      case "shop": {
        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (npcJournal) {
          await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
          ui.notifications.info(format('notify.linkedActorToDocument', { actor: actor.name, document: this.document.name }));
        }
        break;
      }
      case "npc": {
        const dropType = event.target.closest(".tab-panel")?.dataset.tab;
        if (dropType === "info") {
          const myData = this.document.getFlag("campaign-codex", "data") || {};
          myData.linkedActor = actor.uuid;
          await this.document.setFlag("campaign-codex", "data", myData);
          ui.notifications.info(format('notify.linkedActorToJournal', { name: actor.name }));
        } else if (dropType === "associates") {
          const associateJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
          if (associateJournal && associateJournal.uuid !== this.document.uuid) {
            await game.campaignCodex.linkNPCToNPC(this.document, associateJournal);
            ui.notifications.info(format('notify.linkedAsAssociate', { name: actor.name }));
          } else if (associateJournal.uuid === this.document.uuid) {
            ui.notifications.warn(localize('notify.cannotLinkSelf'));
            return;
          }
        }
        break;
      }
      case "tag": {
        const associateJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (!associateJournal) return;
        if (associateJournal.uuid === this.document.uuid) {
          ui.notifications.warn(localize('notify.cannotLinkSelf'));
          return;
        }
        await game.campaignCodex.linkNPCToNPC(this.document, associateJournal);
        ui.notifications.info(format('notify.linkedAsAssociate', { name: actor.name }));
        break;
      }
      default:
        return ui.notifications.warn(format('notify.actorDropNotConfigured', { type: sheetType }));
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
    input.maxLength = 4;
    input.value = typeElement.textContent;

    input.addEventListener("input", function () {
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
    if (
      this.document.getFlag("campaign-codex", "data")?.tagMode ||
      this.document.getFlag("campaign-codex", "type") === "tag"
    ) {
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

    const uuid = event.target.closest("[data-uuid]").dataset.uuid;
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
        ui.notifications.warn(format('notify.documentNotFoundType', { type: type }));
      }
    } catch (error) {
      console.error(`Campaign Codex | Error opening ${type}:`, error);
      ui.notifications.error(format('notify.failedToOpenType', { type: type }));
    }
  }

  async _onRemoveFromList(event, listName) {
    event.stopPropagation();
    const itemUuid = event.target.closest("[data-uuid]").dataset.uuid;

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
    if (myData.linkCardNotes?.[listName]) {
      const rawEntries = myData.linkCardNotes[listName];
      const entries = Array.isArray(rawEntries)
        ? rawEntries.filter((entry) => entry?.uuid && entry.uuid !== itemUuid)
        : (rawEntries && typeof rawEntries === "object"
          ? Object.fromEntries(Object.entries(rawEntries).filter(([uuid]) => uuid !== itemUuid))
          : rawEntries);

      const hasEntries = Array.isArray(entries) ? entries.length > 0 : !!(entries && Object.keys(entries).length);
      if (hasEntries) myData.linkCardNotes[listName] = entries;
      else delete myData.linkCardNotes[listName];
      if (myData.linkCardNotes && Object.keys(myData.linkCardNotes).length === 0) delete myData.linkCardNotes;
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
      if (
        ["npc", "tag"].includes(myType) &&
        listName === "linkedLocations" &&
        (targetType === "location" || targetType === "region")
      ) {
        reverseField = "linkedNPCs";
        isArray = true;
      } else {
        const relationshipMap = {
          "npc:linkedShops": { targetType: "shop", reverseField: "linkedNPCs", isArray: true },
          "npc:associates": { targetType: "npc", reverseField: "associates", isArray: true },
          "npc:associates": { targetType: "tag", reverseField: "associates", isArray: true },
          "tag:associates": { targetType: "npc", reverseField: "associates", isArray: true },
          "region:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "region:linkedShops": { targetType: "shop", reverseField: "linkedLocation", isArray: false },
          "location:linkedNPCs": { targetType: "npc", reverseField: "linkedLocations", isArray: true },
          "region:linkedRegions": { targetType: "region", reverseField: "parentRegions", isArray: true },
          "region:parentRegions": { targetType: "region", reverseField: "linkedRegions", isArray: true },
          "location:linkedShops": { targetType: "shop", reverseField: "linkedLocation", isArray: false },
          "shop:linkedNPCs": { targetType: "npc", reverseField: "linkedShops", isArray: true },
          "tag:linkedGroups": { targetType: "group", reverseField: "linkedNPCs", isArray: true },
          "group:linkedNPCs": { targetType: "tag", reverseField: "linkedGroups", isArray: true },
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

  _extractTagsFromInput(rawValue) {
    return String(rawValue ?? "")
      .split(/[\n,]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  async _addSheetTags(tagsToAdd) {
    if (!Array.isArray(tagsToAdd) || tagsToAdd.length === 0) return;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const existingTags = (Array.isArray(currentData.tags) ? currentData.tags : [])
      .map((tag) => String(tag ?? "").trim())
      .filter(Boolean);
    const existingSet = new Set(existingTags.map((tag) => tag.toLowerCase()));
    let changed = false;
    for (const rawTag of tagsToAdd) {
      const tag = String(rawTag ?? "").trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (existingSet.has(key)) continue;
      existingSet.add(key);
      existingTags.push(tag);
      changed = true;
    }
    if (!changed) return;
    currentData.tags = existingTags;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render();
  }

  async _removeSheetTag(tagToRemove) {
    const tagKey = String(tagToRemove ?? "").trim().toLowerCase();
    if (!tagKey) return;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const existingTags = (Array.isArray(currentData.tags) ? currentData.tags : [])
      .map((tag) => String(tag ?? "").trim())
      .filter(Boolean);
    const filteredTags = existingTags.filter((tag) => tag.toLowerCase() !== tagKey);
    if (filteredTags.length === existingTags.length) return;
    currentData.tags = filteredTags;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render();
  }

  async _onSheetTagInputCommit(event) {
    const input = event?.currentTarget;
    if (!input || !this.constructor.isOwnerOrHigher(this.document)) return;
    const tags = this._extractTagsFromInput(input.value);
    if (tags.length === 0) {
      input.value = "";
      if (event?.type === "blur") this._setSheetTagInputVisibility(input, false);
      return;
    }
    await this._addSheetTags(tags);
    input.value = "";
  }

  async _onSheetTagInputKeydown(event) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    await this._onSheetTagInputCommit(event);
  }

  async _onSheetTagRemoveClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.constructor.isOwnerOrHigher(this.document)) return;
    const target = event.currentTarget;
    const tag = target?.dataset?.tag;
    if (!tag) return;
    await this._removeSheetTag(tag);
  }

  async _onSheetTagOpenToc(event) {
    event.preventDefault();
    event.stopPropagation();
    const rawTag = event.currentTarget?.dataset?.tag ?? event.currentTarget?.textContent;
    const tagName = String(rawTag || "").trim();
    if (!tagName) return;
    try {
      await game.campaignCodex.openTOCSheet();
      const tocSheet =
        game.campaignCodex.tocSheetInstance ||
        foundry.applications.instances.get("campaign-codex-toc-sheet");
      if (tocSheet?.setTagFilterByName) {
        tocSheet.setTagFilterByName(tagName, { state: 1, clear: true });
      }
    } catch (error) {
      console.error("Campaign Codex | Failed to open TOC for tag selection:", error);
    }
  }

  _setSheetTagInputVisibility(input, visible) {
    const editor = input?.closest(".sheet-tags-editor");
    if (!editor) return;
    const wrap = editor.querySelector(".sheet-tag-add-wrap");
    const toggle = editor.querySelector(".sheet-tag-toggle-add");
    if (!wrap || !toggle) return;
    wrap.classList.toggle("is-hidden", !visible);
    toggle.setAttribute("aria-expanded", visible ? "true" : "false");
    if (visible) input.focus();
  }

  async _onSheetTagToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.constructor.isOwnerOrHigher(this.document)) return;
    const toggle = event.currentTarget;
    const editor = toggle?.closest(".sheet-tags-editor");
    if (!editor) return;
    const wrap = editor.querySelector(".sheet-tag-add-wrap");
    const input = editor.querySelector(".sheet-tag-add-input");
    if (!wrap || !input) return;
    const isHidden = wrap.classList.contains("is-hidden");
    this._setSheetTagInputVisibility(input, isHidden);
  }

  async _promptForItemQuantity(itemName, maxQuantity = null) {
    if (Number.isFinite(maxQuantity) && maxQuantity <= 0) {
      ui.notifications.warn(localize("notify.outOfStock"));
      return null;
    }

    const maxAttr = Number.isFinite(maxQuantity) ? `max="${Math.max(1, maxQuantity)}"` : "";
    const quantity = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("dialog.sendItemToPlayer") },
      content: `
        <div class="form-group">
          <label>${localize("inventory.quantity")} ${itemName}</label>
          <input type="number" name="quantity" min="1" ${maxAttr} step="1" value="1" autofocus />
        </div>
      `,
      ok: {
        icon: '<i class="fas fa-check"></i>',
        label: localize("dialog.confirm"),
        callback: (event, button) => {
          let parsed = Math.floor(Number(button.form.elements.quantity.value));
          if (!Number.isFinite(parsed) || parsed < 1) return null;
          if (Number.isFinite(maxQuantity)) parsed = Math.min(parsed, maxQuantity);
          return parsed;
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: localize("dialog.cancel"),
      },
      rejectClose: false,
    }).catch(() => null);

    if (!quantity || quantity < 1) return null;
    return quantity;
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
    if (!currentDoc || typeof currentDoc.getFlag !== "function") {
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

  _getItemQuantityPath(systemId = game.system?.id) {
    // const quantityPaths = this.constructor.ITEM_QUANTITY_PATHS || {};
    // return quantityPaths[systemId] || quantityPaths.default || "system.quantity";
    return getItemQuantityPath(systemId);
  }

  async _addItemToActorInventory(item, targetActor, quantity = 1) {
    const addQty = Math.max(0, Number(quantity || 0));
    if (addQty <= 0) return;
    const quantityPath = this._getItemQuantityPath();

    const existingItem = targetActor.items.find(
      (i) =>
        i.getFlag("core", "_stats.compendiumSource") === item.uuid ||
        (i.name === item.name && i.type === item.type && i.img === item.img),
    );
    const canStackExistingItem = existingItem && foundry.utils.hasProperty(existingItem, quantityPath);

    if (canStackExistingItem) {
      const currentQty = Number(foundry.utils.getProperty(existingItem, quantityPath) || 0);
      await existingItem.update({ [quantityPath]: currentQty + addQty });
      return;
    }

    const itemData = item.toObject();
    delete itemData._id;
    foundry.utils.setProperty(itemData, quantityPath, addQty);
    await targetActor.createEmbeddedDocuments("Item", [itemData]);
  }

  async _transferItemToActor(item, targetActor, document, questId = "", quantity = 1) {
    try {
      const qtyToTransfer = Math.max(1, Number(quantity || 1));
      const currentData = document.getFlag("campaign-codex", "data") || {};

      if (questId) {
        const quests = foundry.utils.deepClone(currentData.quests || []);
        const quest = quests[0];
        if (!quest) return;
        quest.inventory = quest.inventory || [];
        const existingItem = quest.inventory.find((i) => i.itemUuid === item.uuid);
        if (!existingItem || existingItem.quantity <= 0) {
          ui.notifications.warn(localize("notify.outOfStock"));
          return;
        }
        const addQty = Math.min(Number(existingItem.quantity || 0), qtyToTransfer);
        if (addQty <= 0) {
          ui.notifications.warn(localize("notify.outOfStock"));
          return;
        }
        existingItem.quantity -= addQty;
        quest.updatedAt = Date.now();
        await document.setFlag("campaign-codex", "data.quests", quests);
        await this._addItemToActorInventory(item, targetActor, addQty);
      } else {
        const inventory = currentData.inventory || [];
        const shopItem = inventory.find((i) => i.itemUuid === item.uuid);

        const quantityAvailable = Number(shopItem?.quantity || 0);
        const addQty = shopItem?.infinite ? qtyToTransfer : Math.min(quantityAvailable, qtyToTransfer);


        if (addQty > 0 || shopItem?.infinite) {
          await this._addItemToActorInventory(item, targetActor, addQty);
        }

        if (shopItem && shopItem.quantity > 0 && !shopItem.infinite) {
          await this._updateInventoryItem(
            item.uuid,
            {
              quantity: Math.max(shopItem.quantity - addQty, 0),
            },
            document,
          );
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
          ...(changedData.parentRegions || []),
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

  static async resolveLinkedQuestEntries(questUuids = []) {
    const entries = [];
    for (const uuid of questUuids) {
      const questDoc = await fromUuid(uuid);
      if (questDoc) { 
        if (questDoc.getFlag("campaign-codex", "type") !== "quest") continue;
        if (!(await this.canUserView(questDoc.uuid))) continue;
        entries.push(uuid);
      }
    }
    return entries;
  }

  _extractQuestFromDoc(questDoc) {
    const data = questDoc.getFlag("campaign-codex", "data") || {};
    const list = Array.isArray(data.quests) ? data.quests : [];
    const firstQuest = list[0];
    if (!firstQuest || typeof firstQuest !== "object") return {};
    return foundry.utils.deepClone(firstQuest);
    }

  async _linkQuestJournal(questDoc, targetDoc = this.document) {
    const ownerDoc = targetDoc?.documentName === "JournalEntryPage" ? targetDoc.parent : targetDoc;
    if (!ownerDoc || ownerDoc.documentName !== "JournalEntry") return;
    if (!questDoc) return;
    const questType = questDoc.getFlag("campaign-codex", "type");
    if (questType !== "quest") return;
    const data = ownerDoc.getFlag("campaign-codex", "data") || {};
    const linkedQuests = Array.isArray(data.linkedQuests) ? [...data.linkedQuests] : [];
    if (linkedQuests.includes(questDoc.uuid)) {
      ui.notifications.warn(format("notify.journalAlreadyLinked", { name: questDoc.name }));
      return;
    }
    linkedQuests.push(questDoc.uuid);
    data.linkedQuests = linkedQuests;
    await ownerDoc.setFlag("campaign-codex", "data", data);
    const ownerType = ownerDoc.getFlag("campaign-codex", "type");
    if (ownerType !== "quest" && ownerDoc.uuid !== questDoc.uuid) {
      const questData = questDoc.getFlag("campaign-codex", "data") || {};
      const questList = foundry.utils.deepClone(Array.isArray(questData.quests) ? questData.quests : []);
      const quest = questList[0];
      if (quest && typeof quest === "object") {
        quest.relatedUuids = Array.isArray(quest.relatedUuids) ? [...quest.relatedUuids] : [];

        const questGiverRaw = quest.questGiverUuid ? await fromUuid(quest.questGiverUuid).catch(() => null) : null;
        const questGiverDoc = questGiverRaw?.documentName === "JournalEntryPage" ? questGiverRaw.parent : questGiverRaw;
        const questGiverOwnerUuid = questGiverDoc?.documentName === "JournalEntry" ? questGiverDoc.uuid : null;

        if (questGiverOwnerUuid !== ownerDoc.uuid && !quest.relatedUuids.includes(ownerDoc.uuid)) {
          quest.relatedUuids.push(ownerDoc.uuid);
          quest.updatedAt = Date.now();
          await questDoc.setFlag("campaign-codex", "data.quests", questList);
        }
      }
    }
    ui.notifications.info(format("notify.linkedJournal", { name: questDoc.name }));
    this.render();
  }

  async _generateInventoryTab(data) {
    const label = this._labelOverride(this.document, "inventory");
    const hideByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const currency = CampaignCodexLinkers.getCurrency();
    const rawInventory = data.inventory || [];

    const groups = rawInventory.reduce((acc, item) => {
      const rawType = item.type ? String(item.type) : "General";
      const typeLabel = rawType.charAt(0).toUpperCase() + rawType.slice(1);
      if (!acc[typeLabel]) acc[typeLabel] = [];
      acc[typeLabel].push(item);
      return acc;
    }, {});

    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    const sections = sortedKeys.map((key) => {
      return {
        label: key,
        items: groups[key].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    CampaignCodexLinkers.getInventory(data.inventory);
    const showHeaders = sections.length > 1;
    const templateData = {
      labelOverride: label,
      allowPlayerLooting: data.allowPlayerLooting,
      allowPlayerPurchasing: data.allowPlayerPurchasing,
      currency: currency,
      hideByPermission: hideByPermission,
      isLoot: data.isLoot,
      markup: data.markup,
      inventoryCash: data.inventoryCash,
      inventory: data.inventory,
      isGM: game.user.isGM,
      inventorySections: sections,
      showHeaders: showHeaders,
      sourceDoc: this.document.uuid,
      inventorySourceType: this.getSheetType() === "quest" ? "quest" : "inventory",
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-inventory.hbs", templateData);
  }

  // =========================================================================
  // SUBCLASS OVERRIDE METHODS
  // =========================================================================

  /**
   * Placeholder for activating listeners specific to a subclass.
   * @param {HTMLElement} html - The sheet's HTML element.
   */
  _activateSheetSpecificListeners(html) { }

  /**
   * Placeholder for handling drop data specific to a subclass.
   * @param {object} data - The parsed drop data.
   * @param {DragEvent} event - The drop event.
   */
  async _handleDrop(data, event) { }

  /**
   * Returns the type of the sheet, to be overridden by subclasses.
   * @returns {string}
   */
  getSheetType() {
    return "base";
  }
}

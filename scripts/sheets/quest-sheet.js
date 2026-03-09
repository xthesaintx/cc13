import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { localize, format, renderTemplate, getDefaultSheetTabs, getDefaultSheetHidden } from "../helper.js";
import { buildQuestCompletionChatContent } from "../quest-chat.js";
import { QuestAwards } from "../quest-awards.js";

export class QuestSheet extends CampaignCodexBaseSheet {
  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "quest-sheet"],
    window: {
      title: "Campaign Codex Quest Sheet",
      icon: "fas fa-scroll",
    },
    actions: {
      setQuestStatus: this._onSetQuestStatus,
      cycleQuestStatus: this._onCycleQuestStatus,
      toggleQuestActive: this._onToggleQuestActive,
      toggleQuestCompleted: this._onToggleQuestCompleted,
      toggleQuestFailed: this._onToggleQuestFailed,
      cycleQuestUrgency: this._onCycleQuestUrgency,
      removeQuestLink: this._onRemoveQuestLink,
      clearQuestGiver: this._onClearQuestGiver,
      executeQuestMacro: this._onExecuteQuestMacro,
      questToggle: this.#_questToggle,
      objectiveToggle: this.#_objectiveToggle,
      openQuestBoard: () => game.campaignCodex.openQuestBoard(),
      distributeAwards: this._onDistributeAwards,
    },
  };

  _getTabDefinitions() {
    return [
      { key: "info", label: localize("names.quest"), icon: "fas fa-scroll" },
      { key: "inventory", label: localize("names.inventory"), icon: "fas fa-boxes" },
      {
        key: "notes",
        label: localize("names.note"),
      },
      {
        key: "journals",
        label: localize("names.journals"),
      },
    ];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.sheetType = "quest";
    context.sheetTypeLabel = localize("names.quest");
    context.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "quest");

    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quest = Array.isArray(data.quests) && data.quests.length > 0
      ? foundry.utils.deepClone(data.quests[0])
      : this._extractQuestFromDoc(this.document);
    quest.title = this.document.name;
    quest.inactive = Boolean(quest.inactive);
    quest.completed = Boolean(quest.completed);
    quest.failed = Boolean(quest.failed);
    quest.statusClass = quest.failed ? "failed" : (quest.completed ? "completed" : (quest.inactive ? "inactive" : "active"));
    quest.activityClass = quest.inactive ? "inactive" : "active";
    quest.urgency = quest.urgency || "medium";
    quest.rewardXP = Number.isFinite(Number(quest.rewardXP)) ? Number(quest.rewardXP) : 0;
    quest.rewardCurrency = Number.isFinite(Number(quest.rewardCurrency)) ? Number(quest.rewardCurrency) : 0;
    quest.rewardReputation = Number.isFinite(Number(quest.rewardReputation)) ? Number(quest.rewardReputation) : 0;
    quest.messageOnCompleted = Boolean(quest.messageOnCompleted);
    quest.linkedMacros = Array.isArray(quest.linkedMacros) ? quest.linkedMacros : [];
    const sheetInventory = Array.isArray(data.inventory) ? foundry.utils.deepClone(data.inventory) : [];
    const rewardInventorySource = sheetInventory;
    quest.inventory = await CampaignCodexLinkers.getInventory(this.document, rewardInventorySource);
    quest.dependencies = Array.isArray(quest.dependencies) ? quest.dependencies : [];
    quest.unlocks = Array.isArray(quest.unlocks) ? quest.unlocks : [];
    quest.relatedUuids = Array.isArray(quest.relatedUuids) ? quest.relatedUuids : [];
    const hasVisibleObjectives = (objectives = []) => objectives.some((obj) => {
      if (obj?.visible) return true;
      return Array.isArray(obj?.objectives) && hasVisibleObjectives(obj.objectives);
    });
    quest.hasVisibleObjectives = hasVisibleObjectives(Array.isArray(quest.objectives) ? quest.objectives : []);

    const resolveVisibleJournal = async (uuid) => {
      if (!uuid) return null;
      const raw = await fromUuid(uuid);
      if (!raw) return null;
      const doc = raw.documentName === "JournalEntryPage" ? raw.parent : raw;
      if (!doc || doc.documentName !== "JournalEntry") return null;
      if (!context.isGM && !doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return null;
      return {
        uuid: raw.uuid,
        name: raw.documentName === "JournalEntryPage" ? `${doc.name}: ${raw.name}` : doc.name,
      };
    };

    quest.questGiver = await resolveVisibleJournal(quest.questGiverUuid);
    quest.relatedDocs = (await Promise.all(quest.relatedUuids.map((uuid) => resolveVisibleJournal(uuid)))).filter(Boolean);

    const questIndex = new Map();
    for (const questDoc of game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "quest")) {
      const qData = questDoc.getFlag("campaign-codex", "data") || {};
      const q = Array.isArray(qData.quests) && qData.quests.length > 0 ? qData.quests[0] : null;
      if (!q?.id) continue;
      const statusClass = q.failed ? "failed" : (q.completed ? "completed" : (q.inactive ? "inactive" : "active"));
      questIndex.set(`${questDoc.uuid}::${q.id}`, {
        key: `${questDoc.uuid}::${q.id}`,
        title: questDoc.name,
        statusClass,
        uuid: questDoc.uuid,
        completed: Boolean(q.completed),
        unlocks: Array.isArray(q.unlocks) ? [...q.unlocks] : [],
      });
    }
    quest.dependencyItems = quest.dependencies.map((key) => questIndex.get(key)).filter(Boolean);
    quest.unlockItems = quest.unlocks.map((key) => questIndex.get(key)).filter(Boolean);
    quest.macroItems = (await Promise.all(quest.linkedMacros.map(async (macroUuid) => {
      const macro = await fromUuid(macroUuid).catch(() => null);
      if (!macro || macro.documentName !== "Macro") return null;
      return {
        uuid: macro.uuid,
        name: macro.name,
      };
    }))).filter(Boolean);
    quest.isBlocked = quest.dependencyItems.some((dep) => dep?.statusClass !== "completed");
    const currentRefKey = `${this.document.uuid}::${quest.id}`;
    const unlockRequirements = Array.from(questIndex.values()).filter((entry) => Array.isArray(entry.unlocks) && entry.unlocks.includes(currentRefKey));
    quest.hasUnlockRequirements = unlockRequirements.length > 0;
    quest.isLocked = unlockRequirements.some((entry) => !entry.completed);
    quest.isUnlocked = quest.hasUnlockRequirements && !quest.isLocked;

    context.inventory = quest.inventory;
    context.isLoot = true;
    context.markup = 1;
    context.inventoryCash = Number(data.inventoryCash || 0);
    context.questSheetQuest = quest;
    const awardSupport = QuestAwards.getSupport();
    const hasAwardValues = Number(quest.rewardXP || 0) > 0 || Number(quest.rewardCurrency || 0) > 0;
    context.canDistributeAwards = Boolean(context.isGM && awardSupport.canDistribute && hasAwardValues);

    context.customFooterContent = await renderTemplate(
      "modules/campaign-codex/templates/partials/quest-sidebar-admin.hbs",
      {
        quest,
        doc: this.document,
        isGM: context.isGM,
        currencyLabel: String(CampaignCodexLinkers.getCurrency() || "gp").toUpperCase(),
        canDistributeAwards: context.canDistributeAwards,
        linkedSheets: await this._getQuestLinkedSheets(context.isGM),
      },
    );

    const tabOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];
    let defaultTabs = this._getTabDefinitions();
    const gmOnlyTabs = game.settings.get("campaign-codex", "allowPlayerNotes") ? [] : ["notes"];
    if (!game.user.isGM) {
      defaultTabs = defaultTabs.filter(tab => !gmOnlyTabs.includes(tab.key));
    }
    const renderIfActive = async (key, generatorPromise) => {
      if (this._currentTab === key) {
        return await generatorPromise;
      }
      return "";
    };

    const tabContext = [
      {
        key: "info",
        active: this._currentTab === "info",
        content: await renderIfActive("info", this._generateInfoTab(context)),
        label: localize("names.quest"),
        icon: "fas fa-scroll",
      },
      {
        key: "inventory",
        active: this._currentTab === "inventory",
        content: await renderIfActive("inventory", this._generateInventoryTab(context)),
        label: localize("names.inventory"),
        icon: "fas fa-boxes",
        statistic: { value: context.inventory.length, view: context.inventory.length > 0 },
      },
      {
        key: "journals",
        statistic: { value: context.linkedStandardJournals.length, view: context.linkedStandardJournals.length > 0 },
        active: this._currentTab === "journals",
        content: this._currentTab === "journals"
          ? `${TemplateComponents.contentHeader("fas fa-book", this._labelOverride(this.document, "journals") || localize("names.journals"))}${TemplateComponents.standardJournalGrid(context.linkedStandardJournals)}`
          : "",
        label: localize("names.journals"),
        icon: "fas fa-book",
      },
      {
        key: "notes",
        active: this._currentTab === "notes",
        content: await renderIfActive("notes", CampaignCodexBaseSheet.generateNotesTab(this.document, context, this._labelOverride(this.document, "notes"))),
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note",
      },
    ];

    const defaultTabVis = getDefaultSheetTabs("quest");
    const defaultTabHidden = getDefaultSheetHidden("quest");

    context.tabs = defaultTabs
      .map((tab) => {
        if (!game.user.isGM && tab.key === "inventory" && quest.hideRewards) return null;
        const override = tabOverrides.find((o) => o.key === tab.key);
        const isVisibleByDefault = defaultTabVis[tab.key] ?? true;
        const isVisible = override?.visible ?? isVisibleByDefault;
        if (!isVisible) return null;

        const isHiddenByDefault = defaultTabHidden[tab.key] ?? false;
        const isHidden = override?.hidden ?? isHiddenByDefault;
        if (!game.user.isGM && isHidden) return null;

        const dynamicTab = tabContext.find((t) => t.key === tab.key);
        if (!dynamicTab) return null;
        return {
          ...tab,
          ...dynamicTab,
          label: override?.label || tab.label,
        };
      })
      .filter(Boolean);

    if (context.tabs.length > 0) {
      const availableKeys = context.tabs.map((t) => t.key);
      if (!this._currentTab || !availableKeys.includes(this._currentTab)) {
        this._currentTab = context.tabs[0].key;
      }
    }

    return context;
  }


  async _onRender(context, options) {
    await super._onRender(context, options);
    this._activateObjectiveListeners(this.element);
    this._activateQuestFieldListeners(this.element);
  }


    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;
        const copyId = `
        <button type="button" class="header-control fa-solid fa-scroll icon" data-action="openQuestBoard"
                data-tooltip="Open Quest Board" aria-label="Open Quest Board"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", copyId);
        return frame;
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

  _activateQuestFieldListeners(html) {
    if (!game.user.isGM) return;

    html.querySelectorAll(".quest-field").forEach((el) => {
      el.addEventListener("change", this._onQuestFieldChange.bind(this));
    });
  }

  async _onQuestFieldChange(event) {
    if (!game.user.isGM) return;
    const target = event.currentTarget;
    const field = target.dataset.field;
    const questId = target.dataset.questId;
    const docUuid = target.dataset.docUuid || this.document.uuid;
    if (!field || !questId) return;

    const currentDoc = docUuid === this.document.uuid ? this.document : await fromUuid(docUuid);
    if (!currentDoc) return;

    const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;

    let value = target.value;
    if (target.type === "checkbox") value = target.checked;
    if (["rewardXP", "rewardCurrency", "rewardReputation"].includes(field)) value = Number(value || 0);

    quest[field] = value;
    quest.updatedAt = Date.now();
    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }

  static async _onDistributeAwards(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const questId = target?.dataset?.questId;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = Array.isArray(currentData.quests) ? currentData.quests : [];
    const quest = questId ? quests.find((q) => q.id === questId) : quests[0];
    if (!quest) return;

    await QuestAwards.openDistributionDialog({
      quest,
      currencyKey: CampaignCodexLinkers.getCurrency(),
    });
    this.render();
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - OBJECTIVE MANAGEMENT
  // =========================================================================

  async _onAddObjective(event) {
    event.preventDefault();
    event.stopPropagation();
    const questId = event.currentTarget.dataset.questId;
    const parentId = event.currentTarget.dataset.parentId;
    const docUuid = event.currentTarget.dataset.docUuid || this.document.uuid;
    const currentDoc = docUuid === this.document.uuid ? this.document : await fromUuid(docUuid);
    if (!currentDoc) return;
    const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;

    const newObjective = {
      id: foundry.utils.randomID(),
      text: "New Objective",
      completed: false,
      failed: false,
      visible: false,
      objectives: [],
    };

    if (parentId) {
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
      quest.objectives = quest.objectives || [];
      quest.objectives.push(newObjective);
    }
    quest.updatedAt = Date.now();

    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
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
    const docUuid = event.currentTarget.dataset.docUuid || this.document.uuid;
    const currentDoc = docUuid === this.document.uuid ? this.document : await fromUuid(docUuid);
    if (!currentDoc) return;
    const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
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
    quest.updatedAt = Date.now();

    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }

  static async #_objectiveToggle(event, target) {
    event.preventDefault();
    const { questId, objectiveId, field, uuid } = target.dataset;

    let currentData;
    let currentDoc;

    if (!uuid) return;
    if (uuid === this.document.uuid) {
      currentDoc = this.document;
    } else {
      currentDoc = await fromUuid(uuid);
    }
    if (!currentDoc) return;

    currentData = currentDoc.getFlag("campaign-codex", "data") || {};

    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest || !quest.objectives) return;

    const findAndUpdate = (objectives) => {
      for (const obj of objectives) {
        if (obj.id === objectiveId) {
          if (field === "completed") {
            if (obj.completed) {
              obj.completed = false;
              obj.failed = true;
            } else if (obj.failed) {
              obj.failed = false;
              obj.completed = false;
            } else {
              obj.completed = true;
              obj.failed = false;
            }
          } else if (field === "visible") {
            obj.visible = !obj.visible;
          } else {
            obj[field] = !obj[field];
          }
          return true;
        }
        if (findAndUpdate(obj.objectives || [])) return true;
      }
      return false;
    };

    findAndUpdate(quest.objectives);
    quest.updatedAt = Date.now();

    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    this.render();
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
    input.dataset.docUuid = span.dataset.docUuid || this.document.uuid;

    span.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Handle saving the edited objective text when the input loses focus or Enter is pressed.
   * @param {FocusEvent|KeyboardEvent} event The triggering event.
   */
  async _onObjectiveTextSave(event) {
    if (!event.target.classList.contains("objective-text-input")) return;
    if (event.type === "keydown") {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      event.target.blur();
      return;
    }
    const input = event.target;
    const { questId, objectiveId } = input.dataset;
    const newText = input.value.trim();

    const docUuid = input.dataset.docUuid || this.document.uuid;
    const currentDoc = docUuid === this.document.uuid ? this.document : await fromUuid(docUuid);
    if (!currentDoc) return;
    const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
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
      quest.updatedAt = Date.now();
      await currentDoc.setFlag("campaign-codex", "data.quests", quests);
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
    const docUuid = event.currentTarget.dataset.docUuid || this.document.uuid;
    event.dataTransfer.setData("text/plain", JSON.stringify({ questId, objectiveId, docUuid }));
    event.currentTarget.classList.add("dragging");
  }

  _onObjectiveDragEnter(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
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
    const midY = rect.top + rect.height / 2;
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

    const docUuid = dropTarget.dataset.docUuid || this.document.uuid;
    if (dragData.docUuid && dragData.docUuid !== docUuid) return;
    if (dragData.questId !== questId || dragData.objectiveId === targetId) return;

    const currentDoc = docUuid === this.document.uuid ? this.document : await fromUuid(docUuid);
    if (!currentDoc) return;
    const currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
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
    quest.updatedAt = Date.now();

    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }

  _onObjectiveDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    document
      .querySelectorAll(".objective-item")
      .forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom"));
  }

  // =========================================================================
  // INSTANCE EVENT HANDLERS - QUEST MANAGEMENT
  // =========================================================================

  static async #_questToggle(event, target) {
    if (!game.user.isGM) return;

    const field = target.dataset.field;
    const fields = ["completed", "visible", "pinned", "hideRewards", "notifyPlayers", "messageOnCompleted"];
    if (!fields.includes(field)) return;

    const docUuid = target.dataset.uuid;

    let currentData;
    let currentDoc;
    let value;

    if (!docUuid) return;
    if (docUuid === this.document.uuid) {
      currentDoc = this.document;
    } else {
      currentDoc = await fromUuid(docUuid);
    }
    if (!currentDoc) return;
    currentData = currentDoc.getFlag("campaign-codex", "data") || {};
    const questId = target.dataset.questId;
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;
    const previousQuest = foundry.utils.deepClone(quest);

    if (field === "completed") {
      quest.completed = !Boolean(quest.completed);
      if (quest.completed) quest.failed = false;
    } else {
      value = !quest[field];
      quest[field] = value;
    }
    quest.updatedAt = Date.now();
    await currentDoc.setFlag("campaign-codex", "data.quests", quests);
    if (field === "completed") await this._refreshRelatedQuestSheets(previousQuest, quest);
    this.render();
  }

  async _generateInfoTab(context) {
    const label = this._labelOverride(this.document, "quests");
    const richTextDescription = TemplateComponents.richTextSection(
      this.document,
      context.sheetData.enrichedDescription,
      "description",
      context.isOwnerOrHigher,
    );

    return renderTemplate("modules/campaign-codex/templates/partials/quest-sheet-editor.hbs", {
      doc: this.document,
      quest: context.questSheetQuest,
      widgetsPosition: context.widgetsPosition,
      widgetsToRender: context.infoWidgetsToRender,
      activewidget: context.activewidgetInfo,
      inactivewidgets: context.inactivewidgetsInfo,
      addedWidgetNames: context.addedWidgetNamesInfo,
      availableWidgets: context.availableWidgets,
      isWidgetTrayOpen: this._isWidgetInfoTrayOpen,
      isGM: context.isGM,
      labelOverride: label,
      richTextDescription,
    });
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');


    // Journal
    if (((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage")) {
      const locationData = this.document.getFlag("campaign-codex", "data") || {};
      locationData.linkedStandardJournals = locationData.linkedStandardJournals || [];

      // Avoid adding duplicates
      if (!locationData.linkedStandardJournals.includes(journal.uuid)) {
        locationData.linkedStandardJournals.push(journal.uuid);
        await this.document.setFlag("campaign-codex", "data", locationData);
        ui.notifications.info(format('notify.linkedJournal', { name: journal.name }));
      } else {
        ui.notifications.warn(format('notify.journalAlreadyLinked', { name: journal.name }));
      }
    }



    // if (journalType === "location") {
    //   await game.campaignCodex.linkLocationToNPC(journal, this.document);
    // } else if (journalType === "shop") {
    //   await game.campaignCodex.linkShopToNPC(journal, this.document);
    // } else if (["npc", "tag"].includes(journalType)) {
    //   await game.campaignCodex.linkNPCToNPC(this.document, journal);
    // } else if (journalType === "region") {
    //   await game.campaignCodex.linkRegionToNPC(journal, this.document);
    // } else {
    //   return; // Not a valid drop type
    // }
    this.render(true);
  }



  async _handleDrop(data, event) {
    event.preventDefault();
    event.stopPropagation();
    const linkZone = event.target.closest(".cc-quest-link-dropzone");
    if (linkZone) {
      await this._handleQuestLinkDrop(data, linkZone);
      return;
    }
    if (data.type === "Item" || data.type === "Folder") {
      await this._handleItemDrop(data, event);
      return;
    }
    if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      const dropped = await fromUuid(data.uuid);
      const journal = dropped?.documentName === "JournalEntryPage" ? dropped.parent : dropped;
      const journalType = journal?.getFlag("campaign-codex", "type");
      if (journalType === "quest" && journal?.uuid !== this.document.uuid) {
        await this._linkQuestJournal(journal);
        return;
      }
      await this._handleJournalDrop(data, event);

    }
  }

  async _handleQuestLinkDrop(data, zone) {
    if (!game.user.isGM) return;
    const role = zone.dataset.linkRole;
    const targetQuestId = zone.dataset.questId;
    if (!role || !targetQuestId) return;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === targetQuestId);
    if (!quest) return;
    const previousQuest = foundry.utils.deepClone(quest);

    if (role === "macro") {
      if (data.type !== "Macro" || !data.uuid) {
        ui.notifications.warn(localize("notify.dropMacro"));
        return;
      }
      quest.linkedMacros = Array.isArray(quest.linkedMacros) ? quest.linkedMacros : [];
      if (!quest.linkedMacros.includes(data.uuid)) quest.linkedMacros.push(data.uuid);
      quest.updatedAt = Date.now();
      await this.document.setFlag("campaign-codex", "data.quests", quests);
      this.render();
      return;
    }

    if (role === "dependency" || role === "unlock") {
      let refKey = null;
      let refDocUuid = null;
      if (data.type === "CampaignCodexQuestRef" && data.docUuid && data.questId) {
        refDocUuid = data.docUuid;
        refKey = `${data.docUuid}::${data.questId}`;
      } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
        const dropped = await fromUuid(data.uuid);
        const droppedDoc = dropped?.documentName === "JournalEntryPage" ? dropped.parent : dropped;
        if (droppedDoc?.getFlag("campaign-codex", "type") === "quest") {
          refDocUuid = droppedDoc.uuid;
          const droppedData = droppedDoc.getFlag("campaign-codex", "data") || {};
          const droppedQuestId = Array.isArray(droppedData.quests) && droppedData.quests.length > 0 ? droppedData.quests[0].id : null;
          if (droppedQuestId) refKey = `${droppedDoc.uuid}::${droppedQuestId}`;
        }
      }
      if (!refKey) return;
      const targetRefKey = `${this.document.uuid}::${targetQuestId}`;
      if (refKey === targetRefKey) {
        ui.notifications.warn("A quest cannot depend on or unlock itself.");
        return;
      }
      if (refDocUuid === this.document.uuid) {
        ui.notifications.warn("A quest sheet cannot link to itself.");
        return;
      }
      const field = role === "dependency" ? "dependencies" : "unlocks";
      quest[field] = Array.isArray(quest[field]) ? quest[field] : [];
      if (!quest[field].includes(refKey)) quest[field].push(refKey);
      quest.updatedAt = Date.now();
      await this.document.setFlag("campaign-codex", "data.quests", quests);
      await this._refreshRelatedQuestSheets(previousQuest, quest);
      this.render();
      return;
    }

    if (data.type !== "JournalEntry" && data.type !== "JournalEntryPage") return;
    const dropped = await fromUuid(data.uuid);
    const droppedDoc = dropped?.documentName === "JournalEntryPage" ? dropped : dropped;
    const droppedJournal = dropped?.documentName === "JournalEntryPage" ? dropped.parent : dropped;
    if (!droppedDoc || !droppedJournal) return;

    if (role === "giver") {
      if (droppedJournal.uuid === this.document.uuid) {
        ui.notifications.warn("A quest sheet cannot link to itself.");
        return;
      }
      quest.relatedUuids = Array.isArray(quest.relatedUuids) ? quest.relatedUuids : [];
      const filteredRelated = [];
      for (const uuid of quest.relatedUuids) {
        const ownerDocUuid = await this._resolveQuestLinkOwnerDocUuid(uuid);
        if (ownerDocUuid !== droppedJournal.uuid) filteredRelated.push(uuid);
      }
      quest.relatedUuids = filteredRelated;
      quest.questGiverUuid = droppedDoc.uuid;
    } else if (role === "related") {
      if (droppedJournal.uuid === this.document.uuid) {
        ui.notifications.warn("A quest sheet cannot link to itself.");
        return;
      }
      const giverOwnerDocUuid = await this._resolveQuestLinkOwnerDocUuid(quest.questGiverUuid);
      if (giverOwnerDocUuid && giverOwnerDocUuid === droppedJournal.uuid) {
        ui.notifications.warn("A sheet cannot be both a quest giver and a related sheet.");
        return;
      }
      quest.relatedUuids = Array.isArray(quest.relatedUuids) ? quest.relatedUuids : [];
      if (!quest.relatedUuids.includes(droppedDoc.uuid)) quest.relatedUuids.push(droppedDoc.uuid);
    } else {
      return;
    }
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await this._syncQuestSheetBacklinks(previousQuest, quest);
    this.render();
  }

  async _collectQuestBacklinkDocUuids(quest) {
    const docUuids = new Set();
    if (!quest) return docUuids;

    const refs = [];
    if (quest.questGiverUuid) refs.push(quest.questGiverUuid);
    if (Array.isArray(quest.relatedUuids)) refs.push(...quest.relatedUuids);

    for (const uuid of refs) {
      if (!uuid) continue;
      try {
        const raw = await fromUuid(uuid);
        const doc = raw?.documentName === "JournalEntryPage" ? raw.parent : raw;
        if (!doc || doc.documentName !== "JournalEntry") continue;
        if (doc.uuid === this.document.uuid) continue;
        docUuids.add(doc.uuid);
      } catch (error) {
        console.warn(`Campaign Codex | Failed to resolve quest linked sheet for backlink sync: ${uuid}`, error);
      }
    }

    return docUuids;
  }

  async _resolveQuestLinkOwnerDocUuid(uuid) {
    if (!uuid) return null;
    const raw = await fromUuid(uuid).catch(() => null);
    const doc = raw?.documentName === "JournalEntryPage" ? raw.parent : raw;
    if (!doc || doc.documentName !== "JournalEntry") return null;
    return doc.uuid;
  }

  async _setQuestBacklinkOnSheet(sheetUuid, shouldLink) {
    if (!sheetUuid || sheetUuid === this.document.uuid) return;

    const targetDoc = await fromUuid(sheetUuid).catch(() => null);
    if (!targetDoc || targetDoc.documentName !== "JournalEntry") return;

    const targetData = foundry.utils.deepClone(targetDoc.getFlag("campaign-codex", "data") || {});
    const linkedQuests = Array.isArray(targetData.linkedQuests) ? [...targetData.linkedQuests] : [];
    const hasLink = linkedQuests.includes(this.document.uuid);

    if (shouldLink) {
      if (hasLink) return;
      linkedQuests.push(this.document.uuid);
    } else {
      if (!hasLink) return;
      targetData.linkedQuests = linkedQuests.filter((uuid) => uuid !== this.document.uuid);
      await targetDoc.setFlag("campaign-codex", "data", targetData);
      return;
    }

    targetData.linkedQuests = linkedQuests;
    await targetDoc.setFlag("campaign-codex", "data", targetData);
  }

  async _syncQuestSheetBacklinks(previousQuest, nextQuest) {
    const [before, after] = await Promise.all([
      this._collectQuestBacklinkDocUuids(previousQuest),
      this._collectQuestBacklinkDocUuids(nextQuest),
    ]);

    for (const uuid of after) {
      if (!before.has(uuid)) {
        await this._setQuestBacklinkOnSheet(uuid, true);
      }
    }
    for (const uuid of before) {
      if (!after.has(uuid)) {
        await this._setQuestBacklinkOnSheet(uuid, false);
      }
    }
  }

  _collectQuestRelationDocUuidsFromQuest(quest) {
    const docUuids = new Set();
    if (!quest) return docUuids;
    const refs = [
      ...(Array.isArray(quest.dependencies) ? quest.dependencies : []),
      ...(Array.isArray(quest.unlocks) ? quest.unlocks : []),
    ];
    for (const ref of refs) {
      const refKey = String(ref || "");
      if (!refKey.includes("::")) continue;
      const docUuid = refKey.split("::")[0];
      if (docUuid && docUuid !== this.document.uuid) docUuids.add(docUuid);
    }
    return docUuids;
  }

  async _collectIncomingQuestRelationDocUuids(currentRefKey) {
    const docUuids = new Set();
    if (!currentRefKey) return docUuids;

    for (const questDoc of game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "quest")) {
      if (questDoc.uuid === this.document.uuid) continue;
      const qData = questDoc.getFlag("campaign-codex", "data") || {};
      const q = Array.isArray(qData.quests) && qData.quests.length > 0 ? qData.quests[0] : null;
      if (!q) continue;
      const deps = Array.isArray(q.dependencies) ? q.dependencies : [];
      const unlocks = Array.isArray(q.unlocks) ? q.unlocks : [];
      if (deps.includes(currentRefKey) || unlocks.includes(currentRefKey)) {
        docUuids.add(questDoc.uuid);
      }
    }

    return docUuids;
  }

  async _refreshRelatedQuestSheets(previousQuest = null, nextQuest = null) {
    if (!game.campaignCodex?.scheduleSheetRefresh) return;
    const currentQuest = nextQuest || previousQuest || this._extractQuestFromDoc(this.document);
    const currentQuestId = currentQuest?.id;
    if (!currentQuestId) return;
    const currentRefKey = `${this.document.uuid}::${currentQuestId}`;

    const targets = new Set([
      ...this._collectQuestRelationDocUuidsFromQuest(previousQuest),
      ...this._collectQuestRelationDocUuidsFromQuest(nextQuest),
      ...this._collectQuestRelationDocUuidsFromQuest(currentQuest),
    ]);
    const incomingTargets = await this._collectIncomingQuestRelationDocUuids(currentRefKey);
    for (const uuid of incomingTargets) targets.add(uuid);

    for (const uuid of targets) {
      await game.campaignCodex.scheduleSheetRefresh(uuid);
    }
  }

  static async _onRemoveQuestLink(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const field = target?.dataset?.field;
    const value = target?.dataset?.value;
    const questId = target?.dataset?.questId;
    if (!field || !value || !questId) return;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;
    const previousQuest = foundry.utils.deepClone(quest);
    quest[field] = Array.isArray(quest[field]) ? quest[field].filter((v) => v !== value) : [];
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    if (field === "dependencies" || field === "unlocks") {
      await this._refreshRelatedQuestSheets(previousQuest, quest);
    }
    if (field === "relatedUuids") {
      await this._syncQuestSheetBacklinks(previousQuest, quest);
    }
    this.render();
  }

  static async _onClearQuestGiver(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const questId = target?.dataset?.questId;
    if (!questId) return;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;
    const previousQuest = foundry.utils.deepClone(quest);
    quest.questGiverUuid = "";
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await this._syncQuestSheetBacklinks(previousQuest, quest);
    this.render();
  }

  getSheetType() {
    return "quest";
  }

  static async _onSetQuestStatus(event, target) {
    if (!game.user.isGM) return;
    event.preventDefault();
    const actionEl = target?.closest?.('[data-action="setQuestStatus"]') || target;
    const status = String(actionEl?.dataset?.status || "").trim().toLowerCase();
    if (!status) return;
    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(data.quests || []);
    if (!quests.length) return;
    const quest = quests[0];
    const previousQuest = foundry.utils.deepClone(quest);
    QuestSheet._applyQuestStatusFlags(quest, status);
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await QuestSheet._postQuestStatusChat(previousQuest, quest, this.document.name, this.document);
    await this._refreshRelatedQuestSheets(previousQuest, quest);
    this.render();
  }

  static _applyQuestStatusFlags(quest, status) {
    if (!quest) return;
    if (status === "inactive") {
      quest.inactive = true;
      return;
    }
    if (status === "active") {
      quest.inactive = false;
      return;
    }
    if (status === "completed") {
      quest.completed = true;
      quest.failed = false;
      return;
    }
    if (status === "failed") {
      quest.failed = true;
      quest.completed = false;
    }
  }

  static async _onCycleQuestStatus(event, target) {
    return QuestSheet._onToggleQuestActive.call(this, event, target);
  }

  static async _onToggleQuestActive(event, target) {
    if (!game.user.isGM) return;
    event.preventDefault();
    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(data.quests || []);
    if (!quests.length) return;
    const quest = quests[0];
    const previousQuest = foundry.utils.deepClone(quest);
    quest.inactive = !Boolean(quest.inactive);
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await QuestSheet._postQuestStatusChat(previousQuest, quest, this.document.name, this.document);
    this.render();
  }

  static async _onToggleQuestCompleted(event, target) {
    if (!game.user.isGM) return;
    event.preventDefault();
    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(data.quests || []);
    if (!quests.length) return;
    const quest = quests[0];
    const previousQuest = foundry.utils.deepClone(quest);
    quest.completed = !Boolean(quest.completed);
    if (quest.completed) quest.failed = false;
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await QuestSheet._postQuestStatusChat(previousQuest, quest, this.document.name, this.document);
    await this._refreshRelatedQuestSheets(previousQuest, quest);
    this.render();
  }

  static async _onToggleQuestFailed(event, target) {
    if (!game.user.isGM) return;
    event.preventDefault();
    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(data.quests || []);
    if (!quests.length) return;
    const quest = quests[0];
    const previousQuest = foundry.utils.deepClone(quest);
    quest.failed = !Boolean(quest.failed);
    if (quest.failed) quest.completed = false;
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    await QuestSheet._postQuestStatusChat(previousQuest, quest, this.document.name, this.document);
    await this._refreshRelatedQuestSheets(previousQuest, quest);
    this.render();
  }

  static async _postQuestStatusChat(previousQuest, nextQuest, questTitle = "", questDoc = null) {
    const title = questTitle || nextQuest?.title || localize("names.quest");
    const becameCompleted = !Boolean(previousQuest?.completed) && Boolean(nextQuest?.completed);
    if (becameCompleted && Boolean(nextQuest?.messageOnCompleted)) {
      const content = await buildQuestCompletionChatContent({
        quest: nextQuest,
        questDoc,
        fallbackTitle: title,
      });
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content,
      });
      return;
    }
    if (Boolean(nextQuest?.notifyPlayers)) {
      const safeTitle = foundry.utils.escapeHTML(String(title || localize("names.quest")));
      const docUuid = questDoc?.uuid ? String(questDoc.uuid) : "";
      const linkedQuestTitle = docUuid
        ? `<span class="cc-service-link-name">@UUID[${docUuid}]{${safeTitle}}</span>`
        : `<span class="cc-service-link-name">${safeTitle}</span>`;
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: `<p>${linkedQuestTitle}: ${localize("quest.updatedForPlayers")}</p>`,
      });
    }
  }

  static async _onExecuteQuestMacro(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const macroUuid = target?.dataset?.macroUuid;
    if (!macroUuid) return;
    const macro = await fromUuid(macroUuid).catch(() => null);
    if (!macro || macro.documentName !== "Macro") {
      ui.notifications.warn(localize("notify.macroNotFound"));
      return;
    }
    await macro.execute();
    ui.notifications.info(format("notify.macroExecuted", { name: macro.name }));
  }

  static async _onCycleQuestUrgency(event, target) {
    if (!game.user.isGM) return;
    event.preventDefault();
    const actionEl = target?.closest?.('[data-action="cycleQuestUrgency"]') || target;
    if (!actionEl) return;
    const data = this.document.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(data.quests || []);
    if (!quests.length) return;
    const quest = quests[0];
    const order = ["low", "medium", "high"];
    const current = order.includes(quest.urgency) ? quest.urgency : "medium";
    const next = order[(order.indexOf(current) + 1) % order.length];
    quest.urgency = next;
    quest.updatedAt = Date.now();
    await this.document.setFlag("campaign-codex", "data.quests", quests);
    this.render();
  }

  async _getQuestLinkedSheets(isGM = false) {
    const links = new Map();
    const addLink = async (uuid, relation) => {
      if (!uuid || uuid === this.document.uuid) return;
      try {
        const rawDoc = await fromUuid(uuid);
        if (!rawDoc) return;
        const doc = rawDoc.documentName === "JournalEntryPage" ? rawDoc.parent : rawDoc;
        if (!doc || doc.documentName !== "JournalEntry") return;
        if (!isGM && !doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return;

        const key = doc.uuid;
        if (!links.has(key)) {
          const docType = doc.getFlag("campaign-codex", "type") || "journal";
          links.set(key, {
            uuid: doc.uuid,
            name: doc.name,
            type: docType,
            icon: doc.getFlag("campaign-codex", "icon-override") || TemplateComponents.getAsset("icon", docType),
            relations: new Set(),
          });
        }
        links.get(key).relations.add(relation);
      } catch (error) {
        console.warn(`Campaign Codex | Failed to resolve linked sheet for quest sidebar: ${uuid}`, error);
      }
    };

    const allCodexDocs = game.journal.filter((doc) => !!doc.getFlag("campaign-codex", "type"));
    for (const doc of allCodexDocs) {
      if (doc.uuid === this.document.uuid) continue;
      const data = doc.getFlag("campaign-codex", "data") || {};
      const linkedQuests = Array.isArray(data.linkedQuests) ? data.linkedQuests : [];
      if (linkedQuests.includes(this.document.uuid)) {
        await addLink(doc.uuid, "linked");
      }
    }

    const questData = this._extractQuestFromDoc(this.document);
    if (questData?.questGiverUuid) {
      await addLink(questData.questGiverUuid, "quest-giver");
    }
    for (const uuid of Array.isArray(questData?.relatedUuids) ? questData.relatedUuids : []) {
      await addLink(uuid, "related");
    }

    return Array.from(links.values())
      .map((entry) => ({
        ...entry,
        relations: Array.from(entry.relations.values()),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
}

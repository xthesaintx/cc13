import { CampaignCodexLinkers } from "./sheets/linkers.js";
import { CampaignCodexBaseSheet } from "./sheets/base-sheet.js";
import { localize, format } from "./helper.js";
import { TemplateComponents } from "./sheets/template-components.js";
import { buildQuestCompletionChatContent } from "./quest-chat.js";
import { QuestAwards } from "./quest-awards.js";

var SearchFilter = foundry.applications.ux.SearchFilter;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const campaignCodexQuestBoard = HandlebarsApplicationMixin((ApplicationV2));

export class CampaignCodexQuestBoard extends campaignCodexQuestBoard {
  static DEFAULT_OPTIONS = {
    id: "campaign-codex-quest-board",
    classes: ["campaign-codex", "codex-toc", "quest-board"],
    tag: "div",
    window: {
      frame: true,
      title: "Campaign Codex Quest Board",
      icon: "fas fa-scroll",
      minimizable: true,
      resizable: true,
    },
    actions: {
      refreshBoard: this.#refreshBoard,
      toggleCardCollapse: this.#toggleCardCollapse,
      openDocument: this.#openDocument,
      sendToPlayer: this.#sendToPlayer,
      togglePinned: this.#togglePinned,
      toggleVisible: this.#toggleVisible,
      toggleQuestActive: this.#toggleQuestActive,
      toggleQuestCompleted: this.#toggleQuestCompleted,
      toggleQuestFailed: this.#toggleQuestFailed,
      toggleQuestStatus: this.#toggleQuestStatus,
      cycleUrgency: this.#cycleUrgency,
      toggleObjectiveState: this.#toggleObjectiveState,
      toggleObjectiveVisibility: this.#toggleObjectiveVisibility,
      focusQuestRef: this.#focusQuestRef,
      removeQuestLink: this.#removeQuestLink,
      clearQuestGiver: this.#clearQuestGiver,
      addCheckIn: this.#addCheckIn,
      postQuestUpdate: this.#postQuestUpdate,
      executeQuestMacro: this.#executeQuestMacro,
      distributeAwards: this.#distributeAwards,
    },
  };

  static PARTS = {
    main: {
      template: "modules/campaign-codex/templates/codex-quest-board.hbs",
      scrollable: ["", ".scrollable", ".cc-quest-board-main"],
    },
  };

  #search = new SearchFilter({
    inputSelector: "input[name=filter]",
    contentSelector: "section",
    callback: this._onSearchFilter.bind(this),
  });

  #filterableItems = [];
  #activeQuestRefKey = null;
  #collapsedCards = new Set();
  #expandedCards = new Set();
  #draggingQuestRefKey = null;

  static _refKey(docUuid, questId) {
    return `${docUuid}::${questId}`;
  }

  static _fromRefKey(refKey) {
    const [docUuid, questId] = String(refKey || "").split("::");
    return { docUuid, questId };
  }

  static async #refreshBoard(event, target) {
    event?.preventDefault?.();
    this.render(true);
  }

  static async #toggleCardCollapse(event, target) {
    event.preventDefault();
    const refKey = target?.dataset?.refKey;
    if (!refKey) return;

    const card = target.closest(".cc-quest-card");
    if (!card) return;
    const body = card.querySelector(".cc-quest-card-body.collapsible-content");
    if (!body) return;

    const currentlyCollapsed = card.classList.contains("is-collapsed");
    if (currentlyCollapsed) {
      card.classList.remove("is-collapsed");
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      body.getBoundingClientRect();
      body.style.maxHeight = `${body.scrollHeight}px`;
      body.style.opacity = "1";
      this.#collapsedCards.delete(refKey);
      this.#expandedCards.add(refKey);
    } else {
      body.style.maxHeight = `${body.scrollHeight}px`;
      body.style.opacity = "1";
      body.getBoundingClientRect();
      card.classList.add("is-collapsed");
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      this.#collapsedCards.add(refKey);
      this.#expandedCards.delete(refKey);
    }

    const clearInline = () => {
      if (!card.classList.contains("is-collapsed")) {
        body.style.maxHeight = "";
        body.style.opacity = "";
      }
    };
    body.addEventListener("transitionend", clearInline, { once: true });

    const isCollapsed = card.classList.contains("is-collapsed");

    const icon = target.matches("i") ? target : target.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-square-plus", isCollapsed);
      icon.classList.toggle("fa-square-minus", !isCollapsed);
    }
  }

  _toSearchableText(value) {
    if (Array.isArray(value)) value = value[0] || "";
    if (value && typeof value === "object") {
      if (typeof value.content === "string") value = value.content;
      else if (typeof value.value === "string") value = value.value;
      else {
        try {
          value = JSON.stringify(value);
        } catch (_error) {
          value = "";
        }
      }
    }
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  _normalizeQuest(quest) {
    return {
      ...quest,
      inactive: Boolean(quest.inactive),
      completed: Boolean(quest.completed),
      failed: Boolean(quest.failed),
      visible: Boolean(quest.visible),
      pinned: Boolean(quest.pinned),
      hideRewards: Boolean(quest.hideRewards),
      notifyPlayers: Boolean(quest.notifyPlayers),
      messageOnCompleted: Boolean(quest.messageOnCompleted),
      urgency: quest.urgency || "medium",
      boardColumn: quest.boardColumn || "active",
      questGiverUuid: quest.questGiverUuid || "",
      relatedUuids: Array.isArray(quest.relatedUuids) ? quest.relatedUuids : [],
      dependencies: Array.isArray(quest.dependencies) ? quest.dependencies : [],
      unlocks: Array.isArray(quest.unlocks) ? quest.unlocks : [],
      linkedMacros: Array.isArray(quest.linkedMacros) ? quest.linkedMacros : [],
      checkIns: Array.isArray(quest.checkIns) ? quest.checkIns : [],
      rewardXP: Number.isFinite(Number(quest.rewardXP)) ? Number(quest.rewardXP) : 0,
      rewardCurrency: Number.isFinite(Number(quest.rewardCurrency)) ? Number(quest.rewardCurrency) : 0,
      rewardReputation: Number.isFinite(Number(quest.rewardReputation)) ? Number(quest.rewardReputation) : 0,
      rewardClaimed: Boolean(quest.rewardClaimed),
      updatedAt: Number.isFinite(Number(quest.updatedAt)) ? Number(quest.updatedAt) : 0,
      activityLog: Array.isArray(quest.activityLog) ? quest.activityLog : [],
    };
  }

  _flattenObjectives(objectives, includeHidden = false, acc = []) {
    for (const obj of objectives || []) {
      if (includeHidden || obj.visible) acc.push(obj);
      this._flattenObjectives(obj.objectives || [], includeHidden, acc);
    }
    return acc;
  }

  _questStatus(quest) {
    if (quest.failed) return "failed";
    if (quest.completed) return "completed";
    if (quest.inactive) return "inactive";
    return "active";
  }

  _questActivityMeta(quest) {
    return quest.inactive
      ? { activityLabel: localize("quest.inactive"), activityClass: "inactive", activityIcon: "fas fa-toggle-off" }
      : { activityLabel: localize("quest.active"), activityClass: "active", activityIcon: "fas fa-toggle-on" };
  }

  _questStatusMeta(quest) {
    const status = this._questStatus(quest);
    if (status === "inactive") return { statusLabel: localize("quest.inactive") || "Inactive", statusClass: "inactive", statusIcon: "fas fa-circle-minus" };
    if (status === "completed") return { statusLabel: localize("quest.completed"), statusClass: "completed", statusIcon: "fas fa-circle-check" };
    if (status === "failed") return { statusLabel: localize("quest.failed"), statusClass: "failed", statusIcon: "fas fa-circle-xmark" };
    return { statusLabel: localize("quest.active"), statusClass: "active", statusIcon: "fas fa-circle" };
  }

  _urgencySortValue(urgency) {
    if (urgency === "high") return 0;
    if (urgency === "medium") return 1;
    return 2;
  }

  _questSort(a, b) {
    const colA = String(a.boardColumn || "active");
    const colB = String(b.boardColumn || "active");
    if (colA !== colB) return colA.localeCompare(colB);
    const urgencyCmp = this._urgencySortValue(a.urgency) - this._urgencySortValue(b.urgency);
    if (urgencyCmp !== 0) return urgencyCmp;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  }

  _sidebarOrderValue(quest) {
    const order = Number(quest.sidebarOrder);
    return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
  }

  _onSearchFilter(event, query, rgx) {
    for (const item of this.#filterableItems) {
      const match = rgx.test(item.name);
      item.element.style.display = match ? "" : "none";
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    context.currencyLabel = String(CampaignCodexLinkers.getCurrency() || "gp").toUpperCase();
    const awardSupport = QuestAwards.getSupport();
    const canDistributeAwards = Boolean(context.isGM && awardSupport.canDistribute);
    const questJournals = game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "quest");
    const allQuestsToProcess = questJournals.map((doc) => {
      const data = doc.getFlag("campaign-codex", "data") || {};
      const firstQuest = Array.isArray(data.quests) && data.quests.length > 0
        ? data.quests[0]
        : {
          id: foundry.utils.randomID(),
          title: doc.name,
          description: data.description || "",
          objectives: [],
          inventory: [],
          completed: false,
          failed: false,
          visible: false,
          pinned: false,
        };
      return { quest: this._normalizeQuest(firstQuest), doc };
    });

    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const processedQuests = await Promise.all(allQuestsToProcess.map(async ({ quest, doc }) => {
      const canViewSource = doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
      const sheetQuestTitle = doc.name || localize("names.quest");
      const data = doc.getFlag("campaign-codex", "data") || {};
      const questOverrides = doc.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = questOverrides.find((override) => override.key === "imageArea");
      const showImage = !context.isGM && imageAreaOverride?.hidden ? false : (imageAreaOverride?.visible ?? true);
      const questImage = doc.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "quest");
      const sheetDescription = doc.getFlag("campaign-codex", "data.description") ?? data.description ?? quest.description ?? "";
      const descriptionPromise = foundry.applications.ux.TextEditor.implementation.enrichHTML(sheetDescription || "", { async: true });
      const rewardInventorySource = Array.isArray(data.inventory) ? data.inventory : [];
      const inventoryWithoutPerms = await CampaignCodexLinkers.getInventory(doc, rewardInventorySource);
      const processedInventory = await Promise.all(inventoryWithoutPerms.map(async (item) => {
        const canView = await CampaignCodexBaseSheet.canUserView(item.uuid || item.itemUuid);
        return { ...item, canView, type: "item" };
      }));
      const finalItems = hideInventoryByPermission ? processedInventory.filter((item) => item.canView) : processedInventory;

      const enrichObjectivesRecursively = async (objectives) => {
        if (!objectives) return [];
        const enrichedPromises = objectives
          .filter((obj) => context.isGM || obj.visible)
          .map(async (obj) => {
            const enrichedText = await foundry.applications.ux.TextEditor.implementation.enrichHTML(obj.text || "", { async: true });
            const subObjectives = await enrichObjectivesRecursively(obj.objectives);
            return { ...obj, enrichedText, objectives: subObjectives };
          });
        return Promise.all(enrichedPromises);
      };

      const [enrichedDescription, visibleObjectives] = await Promise.all([
        descriptionPromise,
        enrichObjectivesRecursively(quest.objectives),
      ]);
      const macroItems = (await Promise.all((quest.linkedMacros || []).map(async (macroUuid) => {
        const macro = await fromUuid(macroUuid).catch(() => null);
        if (!macro || macro.documentName !== "Macro") return null;
        return {
          uuid: macro.uuid,
          name: macro.name,
          img: macro.img || "icons/svg/dice-target.svg",
        };
      }))).filter(Boolean);

      const objectiveList = this._flattenObjectives(quest.objectives || [], context.isGM);
      const completedCount = objectiveList.filter((o) => o.completed).length;
      const progressPct = objectiveList.length ? Math.round((completedCount / objectiveList.length) * 100) : 0;
      const statusMeta = this._questStatusMeta(quest);
      const activityMeta = this._questActivityMeta(quest);
      const status = this._questStatus(quest);
      const refKey = CampaignCodexQuestBoard._refKey(doc.uuid, quest.id);

      return {
        ...quest,
        title: sheetQuestTitle,
        refKey,
        status,
        ...statusMeta,
        ...activityMeta,
        inventory: finalItems,
        journalUuid: doc.uuid,
        journalName: doc.name,
        showImage,
        img: questImage,
        canViewSource,
        enrichedDescription,
        visibleObjectives,
        macroItems,
        isVisibleToPlayer: Boolean(quest.visible),
        progressPct,
        progressLabel: `${completedCount}/${objectiveList.length}`,
        searchText: [sheetQuestTitle, doc.name || "", this._toSearchableText(sheetDescription || "")].join(" ").trim(),
        canDistributeAwards: canDistributeAwards && (Number(quest.rewardXP || 0) > 0 || Number(quest.rewardCurrency || 0) > 0),
      };
    }));

    const questIndex = new Map(processedQuests.map((q) => [q.refKey, q]));
    const visibleForUser = processedQuests.filter((q) => (context.isGM ? true : q.isVisibleToPlayer));

    const sidebarOrderedQuests = [...visibleForUser].sort((a, b) => {
      const orderCmp = this._sidebarOrderValue(a) - this._sidebarOrderValue(b);
      if (orderCmp !== 0) return orderCmp;
      return a.title.localeCompare(b.title, undefined, { numeric: true });
    });

    const groupedSources = sidebarOrderedQuests.map((quest) => ({
      uuid: quest.journalUuid,
      name: quest.journalName,
      quest,
    }));
    const boardQuests = sidebarOrderedQuests.filter((q) => q.pinned);
    const boardColumns = [
      { id: "active", label: localize("quest.columnActive"), items: [] },
      { id: "completed", label: localize("quest.columnCompleted"), items: [] },
      { id: "failed", label: localize("quest.columnFailed"), items: [] },
    ];
    const columnMap = new Map(boardColumns.map((c) => [c.id, c]));
    for (const quest of boardQuests) {
      const colId = quest.boardColumn || (quest.status === "active" ? "active" : quest.status);
      const col = columnMap.get(colId) || columnMap.get("active");
      col.items.push(quest);
    }

    for (const quest of boardQuests) {
      if (!this.#collapsedCards.has(quest.refKey) && !this.#expandedCards.has(quest.refKey)) {
        this.#collapsedCards.add(quest.refKey);
      }
      quest.urgencyHigh = quest.urgency === "high";
      quest.urgencyMedium = quest.urgency === "medium";
      quest.urgencyLow = quest.urgency === "low";
      quest.updatedLabel = quest.updatedAt ? new Date(quest.updatedAt).toLocaleString() : "";
      quest.isCollapsed = this.#collapsedCards.has(quest.refKey);
      const giverDoc = quest.questGiverUuid ? (await fromUuid(quest.questGiverUuid)) : null;
      quest.questGiver = giverDoc && (context.isGM || giverDoc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) ? giverDoc : null;
      const relatedDocs = await Promise.all((quest.relatedUuids || []).map(async (uuid) => await fromUuid(uuid)));
      quest.relatedDocs = relatedDocs.filter((doc) => doc && (context.isGM || doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)));
      quest.dependencyItems = (quest.dependencies || [])
        .map((key) => questIndex.get(key))
        .filter(Boolean)
        .map((dep) => ({ key: dep.refKey, title: dep.title, statusClass: dep.statusClass, completed: dep.status === "completed" }));
      quest.unlockItems = (quest.unlocks || [])
        .map((key) => questIndex.get(key))
        .filter(Boolean)
        .map((dep) => ({ key: dep.refKey, title: dep.title, statusClass: dep.statusClass }));
      quest.isBlocked = quest.dependencyItems.some((dep) => !dep.completed);
      quest.hasVisibleRewards = Boolean(
        quest.rewardXP || quest.rewardCurrency || quest.rewardReputation || (Array.isArray(quest.inventory) && quest.inventory.length)
      );
      quest.showRewardsToPlayer = !quest.hideRewards && quest.hasVisibleRewards;
      quest.hasVisibleQuestLinks = Boolean(quest.questGiver || (Array.isArray(quest.relatedDocs) && quest.relatedDocs.length));
      quest.hasQuestGiver = Boolean(quest.questGiver);
      quest.hasRelatedDocs = Boolean(Array.isArray(quest.relatedDocs) && quest.relatedDocs.length);
      quest.hasLinkedMacros = Boolean(Array.isArray(quest.macroItems) && quest.macroItems.length);
      quest.completedOn = Boolean(quest.completed);
      quest.failedOn = Boolean(quest.failed);
      quest.checkIns = (quest.checkIns || []).map((entry) => ({
        ...entry,
        atLabel: entry.at ? new Date(entry.at).toLocaleString() : "",
      }));
    }

    const recentUpdates = [...visibleForUser]
      .filter((q) => q.updatedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((q) => ({ title: q.title, journalName: q.journalName, updatedLabel: new Date(q.updatedAt).toLocaleString(), statusClass: q.statusClass }));

    context.questGroups = groupedSources;
    context.boardQuests = boardQuests;
    context.boardColumns = boardColumns;
    context.recentUpdates = recentUpdates;
    context.hasBoardQuests = boardQuests.length > 0;
    context.hasContent = groupedSources.length > 0;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const content = this.element.querySelector("section");
    if (!content) return;

    this.#filterableItems = [];
    const sourceSearchIndex = new Map(
      (context.questGroups || []).map((group) => [
        CampaignCodexQuestBoard._refKey(group?.quest?.journalUuid, group?.quest?.id),
        SearchFilter.cleanQuery(group?.quest?.searchText || `${group?.name || ""} ${group?.quest?.journalName || ""}`),
      ]),
    );
    const boardSearchIndex = new Map(
      (context.boardQuests || []).map((quest) => [
        quest.refKey,
        SearchFilter.cleanQuery(quest.searchText || `${quest.journalName || ""}`),
      ]),
    );

    content.querySelectorAll(".cc-quest-source-group").forEach((groupEl) => {
      const refKey = CampaignCodexQuestBoard._refKey(groupEl.dataset.docUuid, groupEl.dataset.questId);
      const name = sourceSearchIndex.get(refKey) || SearchFilter.cleanQuery(groupEl.textContent || "");
      this.#filterableItems.push({ element: groupEl, name });
    });

    content.querySelectorAll(".cc-quest-card").forEach((cardEl) => {
      const refKey = cardEl.dataset.refKey;
      const name = boardSearchIndex.get(refKey) || SearchFilter.cleanQuery(cardEl.textContent || "");
      this.#filterableItems.push({ element: cardEl, name });
    });

    this.#search.bind(this.element);

    // GM quick edits for metadata fields.
    content.querySelectorAll(".cc-quest-field").forEach((el) => {
      el.addEventListener("change", async (ev) => {
        if (!game.user.isGM) return;
        const target = ev.currentTarget;
        const docUuid = target.dataset.docUuid;
        const questId = target.dataset.questId;
        const field = target.dataset.field;
        if (!docUuid || !questId || !field) return;
        let value = target.value;
        if (target.type === "checkbox") value = target.checked;
        if (["rewardXP", "rewardCurrency", "rewardReputation"].includes(field)) value = Number(value || 0);
        await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
          quest[field] = value;
          quest.updatedAt = Date.now();
        });
        this.render();
      });
    });

    // Drag quest source groups for sidebar ordering.
    content.querySelectorAll(".cc-quest-source-group").forEach((group) => {
      group.addEventListener("dragstart", (ev) => {
        this.#draggingQuestRefKey = CampaignCodexQuestBoard._refKey(group.dataset.docUuid, group.dataset.questId);
        group.classList.add("is-dragging");
        const payload = {
          type: "CampaignCodexQuestRef",
          docUuid: group.dataset.docUuid,
          questId: group.dataset.questId,
        };
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", JSON.stringify(payload));
      });
      group.addEventListener("dragend", () => {
        this.#draggingQuestRefKey = null;
        content.querySelectorAll(".cc-quest-source-group.is-drop-target, .cc-quest-source-group.is-drop-before, .cc-quest-source-group.is-drop-after")
          .forEach((el) => el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after"));
        group.classList.remove("is-dragging");
      });
      group.addEventListener("dragover", (ev) => {
        if (!game.user.isGM || !this.#draggingQuestRefKey) return;
        ev.preventDefault();
        const rect = group.getBoundingClientRect();
        const insertAfter = ev.clientY > rect.top + (rect.height / 2);
        group.classList.toggle("is-drop-before", !insertAfter);
        group.classList.toggle("is-drop-after", insertAfter);
        group.classList.add("is-drop-target");
      });
      group.addEventListener("dragleave", () => group.classList.remove("is-drop-target", "is-drop-before", "is-drop-after"));
      group.addEventListener("drop", (ev) => this.#onDropSidebarSort(ev, group, content));
    });

    // Drop zones for linked sheets / quest giver / dependencies / unlocks.
    content.querySelectorAll(".cc-quest-link-dropzone").forEach((zone) => {
      zone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        zone.classList.add("is-hover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-hover"));
      zone.addEventListener("drop", (ev) => this.#onDropQuestLink(ev, zone));
    });

    content.querySelectorAll(".cc-quest-reward-dropzone").forEach((zone) => {
      zone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        zone.classList.add("is-hover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-hover"));
      zone.addEventListener("drop", (ev) => this.#onDropQuestReward(ev, zone));
    });

    content.querySelectorAll(".cc-quest-reward-item[data-item-uuid]").forEach((el) => {
      if (!game.user.isGM) return;
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", (ev) => {
        const itemUuid = el.dataset.itemUuid;
        if (!itemUuid) return;
        ev.dataTransfer.effectAllowed = "copy";
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: itemUuid }));
        el.classList.add("is-dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
    });
  }

  async #onDropQuestLink(event, zone) {
    event.preventDefault();
    zone.classList.remove("is-hover");
    if (!game.user.isGM) return;
    const targetDocUuid = zone.dataset.docUuid;
    const targetQuestId = zone.dataset.questId;
    const role = zone.dataset.linkRole;
    if (!targetDocUuid || !targetQuestId || !role) return;

    let data = null;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (_) {
      return;
    }
    if (!data) return;

    if (role === "macro") {
      if (data.type !== "Macro" || !data.uuid) {
        ui.notifications.warn(localize("notify.dropMacro"));
        return;
      }
      await CampaignCodexQuestBoard.#updateQuest(targetDocUuid, targetQuestId, (quest) => {
        quest.linkedMacros = Array.isArray(quest.linkedMacros) ? quest.linkedMacros : [];
        if (!quest.linkedMacros.includes(data.uuid)) quest.linkedMacros.push(data.uuid);
        quest.updatedAt = Date.now();
      });
      this.render();
      return;
    }

    if (role === "dependency" || role === "unlock") {
      let refKey = null;
      if (data.type === "CampaignCodexQuestRef" && data.docUuid && data.questId) {
        refKey = CampaignCodexQuestBoard._refKey(data.docUuid, data.questId);
      } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
        const dropped = await fromUuid(data.uuid);
        const droppedDoc = dropped?.documentName === "JournalEntryPage" ? dropped.parent : dropped;
        if (droppedDoc?.getFlag("campaign-codex", "type") === "quest") {
          const droppedData = droppedDoc.getFlag("campaign-codex", "data") || {};
          const droppedQuestId = Array.isArray(droppedData.quests) && droppedData.quests.length > 0 ? droppedData.quests[0].id : null;
          if (droppedQuestId) {
            refKey = CampaignCodexQuestBoard._refKey(droppedDoc.uuid, droppedQuestId);
          }
        }
      }
      if (!refKey) return;
      const targetRefKey = CampaignCodexQuestBoard._refKey(targetDocUuid, targetQuestId);
      if (refKey === targetRefKey) {
        ui.notifications.warn("A quest cannot depend on or unlock itself.");
        return;
      }
      await CampaignCodexQuestBoard.#updateQuest(targetDocUuid, targetQuestId, (quest) => {
        const field = role === "dependency" ? "dependencies" : "unlocks";
        quest[field] = Array.isArray(quest[field]) ? quest[field] : [];
        if (!quest[field].includes(refKey)) quest[field].push(refKey);
        quest.updatedAt = Date.now();
      });
      this.render();
      return;
    }

    if (data.type !== "JournalEntry" && data.type !== "JournalEntryPage") return;
    const dropped = await fromUuid(data.uuid);
    const droppedDoc = dropped?.documentName === "JournalEntryPage" ? dropped.parent : dropped;
    if (!droppedDoc) return;
    if (role === "giver") {
      await CampaignCodexQuestBoard.#updateQuest(targetDocUuid, targetQuestId, (quest) => {
        quest.questGiverUuid = droppedDoc.uuid;
        quest.updatedAt = Date.now();
      });
    } else if (role === "related") {
      await CampaignCodexQuestBoard.#updateQuest(targetDocUuid, targetQuestId, (quest) => {
        quest.relatedUuids = Array.isArray(quest.relatedUuids) ? quest.relatedUuids : [];
        if (!quest.relatedUuids.includes(droppedDoc.uuid)) quest.relatedUuids.push(droppedDoc.uuid);
        quest.updatedAt = Date.now();
      });
    }
    this.render();
  }

  async #onDropQuestReward(event, zone) {
    event.preventDefault();
    zone.classList.remove("is-hover");
    if (!game.user.isGM) return;

    let data = null;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (_error) {
      return;
    }
    if (!data || data.type !== "Item" || !data.uuid) return;

    const item = await fromUuid(data.uuid).catch(() => null);
    if (!item) {
      ui.notifications.warn(localize("notify.itemNotFoundToAdd"));
      return;
    }

    const targetDocUuid = zone.dataset.docUuid;
    const targetQuestId = zone.dataset.questId;
    const questTitle = zone.dataset.questTitle || localize("names.quest");
    if (!targetDocUuid || !targetQuestId) return;

    const doc = await fromUuid(targetDocUuid).catch(() => null);
    if (!doc) return;
    const currentData = foundry.utils.deepClone(doc.getFlag("campaign-codex", "data") || {});
    const inventory = Array.isArray(currentData.inventory) ? currentData.inventory : [];
    const existing = inventory.find((entry) => entry.itemUuid === item.uuid);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + 1;
    } else {
      inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
    }
    currentData.inventory = inventory;
    const quests = Array.isArray(currentData.quests) ? currentData.quests : [];
    const quest = quests[0];
    if (quest) quest.updatedAt = Date.now();
    await doc.setFlag("campaign-codex", "data", currentData);

    ui.notifications.info(format("notify.addedToQuest", { item: item.name, quest: questTitle }));
    this.render();
  }

  async #onDropSidebarSort(event, targetGroup, content) {
    event.preventDefault();
    targetGroup.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    if (!game.user.isGM) return;
    if (!this.#draggingQuestRefKey) return;
    let data = null;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (_error) {
      return;
    }
    if (!data || data.type !== "CampaignCodexQuestRef" || !data.docUuid || !data.questId) return;
    const draggedRefKey = CampaignCodexQuestBoard._refKey(data.docUuid, data.questId);
    const targetRefKey = CampaignCodexQuestBoard._refKey(targetGroup.dataset.docUuid, targetGroup.dataset.questId);
    if (draggedRefKey === targetRefKey) return;

    const groups = Array.from(content.querySelectorAll(".cc-quest-source-group"));
    const refs = groups.map((group) => ({
      refKey: CampaignCodexQuestBoard._refKey(group.dataset.docUuid, group.dataset.questId),
      docUuid: group.dataset.docUuid,
      questId: group.dataset.questId,
    }));
    const draggedIndex = refs.findIndex((ref) => ref.refKey === draggedRefKey);
    const targetIndex = refs.findIndex((ref) => ref.refKey === targetRefKey);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const [dragged] = refs.splice(draggedIndex, 1);
    const rect = targetGroup.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + (rect.height / 2);
    const adjustedTargetIndex = refs.findIndex((ref) => ref.refKey === targetRefKey);
    const insertIndex = adjustedTargetIndex + (insertAfter ? 1 : 0);
    refs.splice(Math.max(0, insertIndex), 0, dragged);

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      await CampaignCodexQuestBoard.#updateQuest(ref.docUuid, ref.questId, (quest) => {
        quest.sidebarOrder = i;
      }, { touchUpdatedAt: false });
    }
    this.render();
  }

  static async #openDocument(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    doc?.sheet?.render(true);
  }

  static async #updateQuest(docUuid, questId, updater, { touchUpdatedAt = true } = {}) {
    const doc = await fromUuid(docUuid);
    if (!doc) return;
    const currentData = doc.getFlag("campaign-codex", "data") || {};
    const quests = foundry.utils.deepClone(currentData.quests || []);
    const quest = quests[0];
    if (!quest) return;
    updater(quest, doc);
    if (touchUpdatedAt) quest.updatedAt = Date.now();
    await doc.setFlag("campaign-codex", "data.quests", quests);
  }

  static async #togglePinned(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      quest.pinned = !quest.pinned;
    });
    this.render();
  }

  static async #toggleVisible(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      quest.visible = !quest.visible;
    });
    this.render();
  }

  static async #toggleQuestStatus(event, target) {
    // Backward-compatible alias for legacy bindings.
    return CampaignCodexQuestBoard.#toggleQuestActive.call(this, event, target);
  }

  static async #maybePostQuestStatusChat(docUuid, previousQuest, nextQuest, questTitle) {
    if (!nextQuest) return;
    const becameCompleted = !Boolean(previousQuest?.completed) && Boolean(nextQuest?.completed);
    if (Boolean(nextQuest.messageOnCompleted) && becameCompleted) {
      const questDoc = await fromUuid(docUuid).catch(() => null);
      const content = await buildQuestCompletionChatContent({
        quest: nextQuest,
        questDoc,
        fallbackTitle: questTitle,
      });
      await CampaignCodexQuestBoard.#broadcastChat(content);
      return;
    }
    if (Boolean(nextQuest.notifyPlayers)) {
      const safeQuestTitle = foundry.utils.escapeHTML(String(questTitle || localize("names.quest")));
      const linkedQuestTitle = docUuid
        ? `<span class="cc-service-link-name">@UUID[${docUuid}]{${safeQuestTitle}}</span>`
        : `<span class="cc-service-link-name">${safeQuestTitle}</span>`;
      await CampaignCodexQuestBoard.#broadcastChat(`<p>${linkedQuestTitle}: ${localize("quest.updatedForPlayers")}</p>`);
    }
  }

  static async #toggleQuestActive(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    let previousQuest = null;
    let nextQuest = null;
    let questTitle = "";
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest, doc) => {
      previousQuest = foundry.utils.deepClone(quest);
      quest.inactive = !Boolean(quest.inactive);
      questTitle = doc?.name || localize("names.quest");
      quest.boardColumn = quest.completed ? "completed" : quest.failed ? "failed" : "active";
      nextQuest = foundry.utils.deepClone(quest);
    });
    await CampaignCodexQuestBoard.#maybePostQuestStatusChat(docUuid, previousQuest, nextQuest, questTitle);
    this.render();
  }

  static async #toggleQuestCompleted(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    let previousQuest = null;
    let nextQuest = null;
    let questTitle = "";
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest, doc) => {
      previousQuest = foundry.utils.deepClone(quest);
      quest.completed = !Boolean(quest.completed);
      if (quest.completed) quest.failed = false;
      questTitle = doc?.name || localize("names.quest");
      quest.boardColumn = quest.completed ? "completed" : quest.failed ? "failed" : "active";
      nextQuest = foundry.utils.deepClone(quest);
    });
    await CampaignCodexQuestBoard.#maybePostQuestStatusChat(docUuid, previousQuest, nextQuest, questTitle);
    this.render();
  }

  static async #toggleQuestFailed(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    let previousQuest = null;
    let nextQuest = null;
    let questTitle = "";
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest, doc) => {
      previousQuest = foundry.utils.deepClone(quest);
      quest.failed = !Boolean(quest.failed);
      if (quest.failed) quest.completed = false;
      questTitle = doc?.name || localize("names.quest");
      quest.boardColumn = quest.completed ? "completed" : quest.failed ? "failed" : "active";
      nextQuest = foundry.utils.deepClone(quest);
    });
    await CampaignCodexQuestBoard.#maybePostQuestStatusChat(docUuid, previousQuest, nextQuest, questTitle);
    this.render();
  }

  static async #cycleUrgency(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      const current = quest.urgency || "medium";
      quest.urgency = current === "high" ? "medium" : current === "medium" ? "low" : "high";
    });
    this.render();
  }

  static async #toggleObjectiveState(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const actionTarget = target?.closest?.('[data-action="toggleObjectiveState"]') || target;
    const docUuid = actionTarget?.dataset?.docUuid;
    const questId = actionTarget?.dataset?.questId;
    const objectiveId = actionTarget?.dataset?.objectiveId;
    if (!docUuid || !questId || !objectiveId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      const flip = (objectives) => {
        for (const obj of objectives || []) {
          if (obj.id === objectiveId) {
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
            return true;
          }
          if (flip(obj.objectives || [])) return true;
        }
        return false;
      };
      flip(quest.objectives || []);
    });
    this.render();
  }

  static async #toggleObjectiveVisibility(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const actionTarget = target?.closest?.('[data-action="toggleObjectiveVisibility"]') || target;
    const docUuid = actionTarget?.dataset?.docUuid;
    const questId = actionTarget?.dataset?.questId;
    const objectiveId = actionTarget?.dataset?.objectiveId;
    if (!docUuid || !questId || !objectiveId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      const flip = (objectives) => {
        for (const obj of objectives || []) {
          if (obj.id === objectiveId) {
            obj.visible = !Boolean(obj.visible);
            return true;
          }
          if (flip(obj.objectives || [])) return true;
        }
        return false;
      };
      flip(quest.objectives || []);
    });
    this.render();
  }

  static async #focusQuestRef(event, target) {
    event.preventDefault();
    const refKey = target.dataset.refKey;
    if (!refKey) return;
    const root = this.element?.querySelector("section.quest-board") || this.element;
    if (!root) return;
    const safeKey = globalThis.CSS?.escape ? CSS.escape(refKey) : refKey.replaceAll('"', '\\"');
    const questCard = root.querySelector(`.cc-quest-card[data-ref-key="${safeKey}"]`);
    if (!questCard) {
      ui.notifications.info(localize("quest.linkedQuestNotPinned"));
      return;
    }
    root.querySelectorAll(".cc-quest-card.is-linked-highlight").forEach((el) => el.classList.remove("is-linked-highlight"));
    questCard.classList.add("is-linked-highlight");
    questCard.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => questCard.classList.remove("is-linked-highlight"), 1800);
  }

  static async #removeQuestLink(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    const field = target.dataset.field;
    const value = target.dataset.value;
    if (!docUuid || !questId || !field || !value) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      const list = Array.isArray(quest[field]) ? quest[field] : [];
      quest[field] = list.filter((v) => v !== value);
    });
    this.render();
  }

  static async #clearQuestGiver(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      quest.questGiverUuid = "";
    });
    this.render();
  }

  static async #addCheckIn(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    const note = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("quest.addCheckIn") },
      content: `<div class="form-group"><label>${localize("quest.checkInNote")}</label><input type="text" name="note" value="" autofocus /></div>`,
      ok: { label: localize("dialog.save"), callback: (event, button) => String(button.form.elements.note.value || "").trim() },
      cancel: { label: localize("dialog.cancel") },
      rejectClose: false,
    }).catch(() => "");
    if (!note) return;
    await CampaignCodexQuestBoard.#updateQuest(docUuid, questId, (quest) => {
      quest.checkIns = Array.isArray(quest.checkIns) ? quest.checkIns : [];
      quest.checkIns.unshift({ note, by: game.user.name, at: Date.now() });
      quest.checkIns = quest.checkIns.slice(0, 20);
    });
    this.render();
  }

  static async #postQuestUpdate(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const questTitle = target.dataset.questTitle || "Quest Update";
    const docUuid = target.dataset.docUuid || target.closest("[data-doc-uuid]")?.dataset?.docUuid || "";
    const safeQuestTitle = foundry.utils.escapeHTML(String(questTitle || "Quest Update"));
    const linkedQuestTitle = docUuid
      ? `<span class="cc-service-link-name">@UUID[${docUuid}]{${safeQuestTitle}}</span>`
      : `<span class="cc-service-link-name">${safeQuestTitle}</span>`;
      await CampaignCodexQuestBoard.#broadcastChat(`<p>${linkedQuestTitle}: ${localize("quest.updatedForPlayers")}</p>`);
  }

  static async #executeQuestMacro(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const macroUuid = target.dataset.macroUuid;
    if (!macroUuid) return;
    const macro = await fromUuid(macroUuid).catch(() => null);
    if (!macro || macro.documentName !== "Macro") {
      ui.notifications.warn(localize("notify.macroNotFound"));
      return;
    }
    await macro.execute();
    ui.notifications.info(format("notify.macroExecuted", { name: macro.name }));
  }

  static async #distributeAwards(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const docUuid = target.dataset.docUuid;
    const questId = target.dataset.questId;
    if (!docUuid || !questId) return;
    const doc = await fromUuid(docUuid);
    if (!doc) return;
    const currentData = doc.getFlag("campaign-codex", "data") || {};
    const quest = currentData.quests[0];
    if (!quest) return;
    await QuestAwards.openDistributionDialog({
      quest,
      currencyKey: CampaignCodexLinkers.getCurrency(),
    });
    this.render();
  }

  static async #broadcastChat(content = "") {
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content,
    });
  }

  static async #sendToPlayer(event, target) {
    event.stopPropagation();
    const itemUuid = target.dataset.uuid;
    const rewardSection = target.closest(".cc-quest-reward-dropzone");
    const docUuid = rewardSection?.dataset?.docUuid;
    if (!docUuid) return;
    const sourceDoc = await fromUuid(docUuid);
    if (!sourceDoc) return;

    const sourceData = sourceDoc.getFlag("campaign-codex", "data") || {};
    const rewardItem = (sourceData.inventory || []).find((i) => i.itemUuid === itemUuid);
    const maxQuantity = rewardItem?.infinite ? null : Math.max(Number(rewardItem?.quantity || 0), 0);
    if (maxQuantity !== null && maxQuantity < 1) {
      ui.notifications.warn(localize("notify.outOfStock"));
      return;
    }

    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (!item) {
      ui.notifications.warn(localize("notify.itemNotFound"));
      return;
    }
    const quantity = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("dialog.sendItemToPlayer") },
      content: `
        <div class="form-group">
            <label>${localize("inventory.quantity")} ${item.name}</label>
            <input type="number" name="quantity" min="1" ${maxQuantity === null ? "" : `max="${maxQuantity}"`} step="1" value="1" autofocus />
        </div>
      `,
      ok: {
        icon: '<i class="fas fa-check"></i>',
        label: localize("dialog.confirm"),
        callback: (event, button) => {
          const parsed = Math.floor(Number(button.form.elements.quantity.value));
          if (!Number.isFinite(parsed) || parsed < 1) return null;
          return maxQuantity === null ? parsed : Math.min(parsed, maxQuantity);
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: localize("dialog.cancel"),
      },
      rejectClose: false,
    }).catch(() => null);
    if (!quantity) return;

    TemplateComponents.createPlayerSelectionDialog(item.name, async (targetActor) => {
      try {
        const latestData = sourceDoc.getFlag("campaign-codex", "data") || {};
        const nextInventory = foundry.utils.deepClone(latestData.inventory || []);
        const invEntry = nextInventory.find((i) => i.itemUuid === item.uuid);
        const availableQty = Math.max(Number(invEntry?.quantity || 0), 0);
        const addQty = invEntry?.infinite ? quantity : Math.min(quantity, availableQty);
        if (addQty < 1) {
          ui.notifications.warn(localize("notify.outOfStock"));
          return;
        }

        const itemData = item.toObject();
        delete itemData._id;
        const existingItem = targetActor.items.find(
          (i) => i.getFlag("core", "_stats.compendiumSource") === item.uuid || (i.name === item.name && i.type === item.type && i.img === item.img),
        );
        if (existingItem) {
          const currentQty = existingItem.system.quantity || 0;
          await existingItem.update({ "system.quantity": currentQty + addQty });
        } else {
          itemData.system.quantity = addQty;
          await targetActor.createEmbeddedDocuments("Item", [itemData]);
        }
        if (invEntry && !invEntry.infinite) {
          invEntry.quantity = Math.max(availableQty - addQty, 0);
          await sourceDoc.setFlag("campaign-codex", "data.inventory", nextInventory);
        }
        ui.notifications.info(format("title.send.item.typetoplayer", { type: item.name, player: targetActor.name }));
        this.render();
      } catch (error) {
        console.error("Error transferring item:", error);
        ui.notifications.error(localize("error.faileditem"));
      }
    }, { showDeductFunds: false });
  }
}

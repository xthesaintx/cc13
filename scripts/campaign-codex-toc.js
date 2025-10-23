import { CampaignCodexLinkers } from "./sheets/linkers.js";
import { CampaignCodexBaseSheet } from "./sheets/base-sheet.js";
import { TemplateComponents } from "./sheets/template-components.js";

import {
    localize,
    format,
    createFromScene,
} from "./helper.js";
var SearchFilter = foundry.applications.ux.SearchFilter;

var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const campaignCodexToc = HandlebarsApplicationMixin((ApplicationV2));

export class CampaignCodexTOCSheet extends campaignCodexToc {
    static SCOPE = "campaign-codex";
    static TYPE_KEY = "type";
    static DEFAULT_OPTIONS = {
        id: "campaign-codex-toc-sheet",
        classes: ["campaign-codex", "codex-toc"],
        tag: 'div',
        window: {
            frame: true,
            title: 'Campaign Codex',
            icon:'fas fa-closed-captioning',
            minimizable: true,
            resizable: true,
            zIndex:10,
        },
        actions: {
            createSheet: this.#createSheet,
            openDocument: this.#openDocument,
            changeDefaultOwnership: this.#changeDefaultOwnership,
            collapseQuests:this.#collapseQuests,
            sendToPlayer:this.#sendToPlayer
        },
    };

  /**
   * The current set of file extensions which are being filtered upon
   * @type {string[]}
   */
  #search = new SearchFilter({
    inputSelector: "input[name=filter]",
    contentSelector: "section",
    callback: this._onSearchFilter.bind(this)
  });

  /**
   * A cached list of items that can be filtered.
   * @type {Array<{element: HTMLElement, name: string}>}
   */
  #filterableItems = [];


    static PARTS = {
        tabs: {
            template: "modules/campaign-codex/templates/codex-toc-tabnav.hbs",
        },
        subheader: {template: "modules/campaign-codex/templates/codex-toc-header.hbs"},
        groups: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        regions: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        locations: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        shops: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        npcs: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        tags: {
            template: "modules/campaign-codex/templates/codex-toc-content.hbs",
            scrollable: [''],
        },
        quests: {
            template: "modules/campaign-codex/templates/codex-toc-quest.hbs",
            scrollable: [''],
        },
    };

        static TABS = {
        sheet: {
            tabs: [
                { id: "groups", type:"group", title: "Groups", icon: "fas fa-folder-tree", cssClass: "cc-toc group", create: true},
                { id: "regions", type:"region", title: "Regions", icon: "fas fa-globe", cssClass: "cc-toc region", create: true },
                { id: "locations", type:"location", title: "Locations", icon: "fas fa-map-marker-alt", cssClass: "cc-toc location", create: true },
                { id: "shops", type:"shop", title: "Entries", icon: "fas fa-house", cssClass: "cc-toc shop", create: true },
                { id: "npcs", type:"npc", title: "NPCs", icon: "fas fa-user", cssClass: "cc-toc npc", create: true },
                { id: "tags", type:"tag", title: "Tags", icon: "fas fa-tag", cssClass: "cc-toc tag", create: true },
                { id: "quests", type:"quest", title: "Quests", icon: "fas fa-scroll", cssClass: "cc-toc quest" },
            ],
            initial: "groups",
        }
    };


  _onSearchFilter(event, query, rgx) {
    // Loop through the cached items instead of querying the DOM
    for (const item of this.#filterableItems) {
      const match = rgx.test(item.name);
      item.element.style.display = match ? "" : "none";
    }
  }



async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tabs = this._prepareTabs("sheet");
    const codexJournals = game.journal.filter((j) => j.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY));


    let allTags = []; 
    if (typeof game.campaignCodex?.getTagCache === 'function') {
        allTags = await game.campaignCodex.getTagCache();
    } else {
        console.warn("Campaign Codex | getTagCache() was not available during _prepareContext. Proceeding with empty tags.");
    }
    // const allTags = await game.campaignCodex.getTagCache?.() || [];


    const tagUuids = new Set(allTags.map(tag => tag.uuid));
    context.isGM = game.user.isGM;

    // --- Parallel Quest Enrichment ---

    const allQuestsToProcess = codexJournals.flatMap(doc => {
        const journalQuests = doc.getFlag("campaign-codex", "data")?.quests || [];
        return journalQuests.map(quest => ({ quest, doc }));
    });





    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");


    const questProcessingPromises = allQuestsToProcess.map(async ({ quest, doc }) => {
        const canViewSource = doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        const descriptionPromise = foundry.applications.ux.TextEditor.implementation.enrichHTML(quest.description || "", { async: true });

        const inventoryWithoutPerms = await CampaignCodexLinkers.getInventory(doc, quest.inventory || []);
        const processedInventory = await Promise.all(
            inventoryWithoutPerms.map(async (item) => {
                const canView = await CampaignCodexBaseSheet.canUserView(item.uuid || item.itemUuid);
                return { ...item, canView, type: "item" };
            })
        );
        const finalItems = hideInventoryByPermission
            ? processedInventory.filter(item => item.canView)
            : processedInventory;

        const enrichObjectivesRecursively = async (objectives) => {
            if (!objectives) return [];
            
            const enrichedPromises = objectives
                .filter(obj => obj.visible)
                .map(async obj => {
                    const enrichedText = await foundry.applications.ux.TextEditor.implementation.enrichHTML(obj.text || "", { async: true });
                    const subObjectives = await enrichObjectivesRecursively(obj.objectives);
                    return { ...obj, enrichedText, objectives: subObjectives };
                });

            return Promise.all(enrichedPromises);
        };
        
        const [enrichedDescription, visibleObjectives] = await Promise.all([
            descriptionPromise,
            enrichObjectivesRecursively(quest.objectives)
        ]);
        return {
            ...quest,
            inventory: finalItems, 
            journalUuid: doc.uuid,
            journalName: doc.name,
            canViewSource,
            enrichedDescription,
            visibleObjectives,
            isGM: context.isGM
        };
    });

    const processedQuests = await Promise.all(questProcessingPromises);

    const content = {
        groups: [], regions: [], locations: [], shops: [], npcs: [], tags: [],
        questsPinned: [], questsUnpinned: [],
    };

    for (const questItem of processedQuests) {
        if (questItem.pinned) {
            content.questsPinned.push(questItem);
        } else {
            content.questsUnpinned.push(questItem);
        }
    }
    
    codexJournals.forEach(journal => {
        const type = journal.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY);
        const ownershipLevel = journal.ownership.default;
        const ownershipIcon = ownershipLevel >= 2 ? 'fas fa-eye' : 'fas fa-eye-slash';

        const quests = journal.getFlag("campaign-codex", "data")?.quests;
        const isAnyQuestVisible = quests && quests.some(quest => quest.visible);
        const hasQuests = quests && quests.length > 0;

        const item = {
            id: journal.id,
            quests: hasQuests,
            questsvisible: isAnyQuestVisible, 
            name: journal.name,
            uuid: journal.uuid,
            ownershipIcon: ownershipIcon,
            ownershipLevel: ownershipLevel,
            canView: journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
        };

        switch (type) {
            case "group": content.groups.push(item); break;
            case "region": content.regions.push(item); break;
            case "location": content.locations.push(item); break;
            case "shop": content.shops.push(item); break;
            case "npc":
                if (!tagUuids.has(journal.uuid)) {
                    content.npcs.push(item);
                } else {
                    content.tags.push(item);
                }
                break;
        }
    });

    Object.values(content).forEach(arr => {
        if (Array.isArray(arr) && arr.length > 0) {
            if (arr[0].hasOwnProperty('name')) {
                arr.sort((a, b) => a.name.localeCompare(b.name));
            } else if (arr[0].hasOwnProperty('title')) {
                arr.sort((a, b) => a.title.localeCompare(b.title));
            }
        }
    });

    for (const tab of this.constructor.TABS.sheet.tabs) {
        if (tab.id === 'quests') {
            context[tab.id] = { questsPinned: content.questsPinned, questsUnpinned: content.questsUnpinned };
        }
        else {
            context[tab.id] = { items: content[tab.id] };
        }
    }

    context.counts = {
        groups: content.groups.length,
        regions: content.regions.length,
        locations: content.locations.length,
        shops: content.shops.length,
        npcs: content.npcs.length,
        tags: content.tags.length,
        quests: content.questsPinned.length + content.questsUnpinned.length
    };
        
    context.hasContent = codexJournals.length > 0 || allTags.length > 0;
    return context;
}

async _preparePartContext(partId, context) {
    switch (partId){
        case 'groups':
        case 'tags':
        case 'locations':
        case 'regions':            
        case 'npcs':
        case 'shops':
             context.items = context[partId].items || [];
            break;
        case 'quests':
            context.questsPinned = context[partId].questsPinned || [];
            context.questsUnpinned = context[partId].questsUnpinned || [];
            context.showOnlyPinned = game.settings.get("campaign-codex", "showOnlyPinned");
            context.hasContent = context.questsPinned.length > 0 || context.questsUnpinned.length > 0;
            break;
        default:
        }
    context.tab = context.tabs[partId];
    return context;
    }

static async #changeDefaultOwnership(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    const currentOwnership = target.dataset.ownership;
    let newOwnership = 0;
    if (currentOwnership > 0){newOwnership = 0;}else{newOwnership = 2;}
    const journal = await fromUuid(uuid);
    if (!journal) return;
    const update = { ownership: { "default" : newOwnership } };
    await journal.update(update);
    this.render(true);
}

    static async #openDocument(event, target) {
        event.preventDefault();
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        const doc = await fromUuid(uuid);
        doc?.sheet.render(true);
    }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const form = this.element;

    const content = form.querySelector("section");
    if (content) {
      this.#filterableItems = []; 
      for (const element of content.querySelectorAll("li, .toc-quest-item")) {
        const name = element.dataset.name;
        if (name) {
          this.#filterableItems.push({
            element: element,
            name: SearchFilter.cleanQuery(name)
          });
        }
      }
    }

    this.#search.bind(form);

        this._resizeObserver?.disconnect();
        const debouncedSave = foundry.utils.debounce((width, height) => {
            game.settings.set("campaign-codex", "tocSheetDimensions", {width, height });
        }, 300);

        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                debouncedSave(width, height);
            }
        });

        this._resizeObserver.observe(this.element);
    // Drag-drop
      new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".directory-item",
        permissions: {
          dragstart: true,
        },
        callbacks: {
          dragstart: this._onDragStart.bind(this),
        }
      }).bind(this.element);
  }


    async close(options) {
        this._resizeObserver?.disconnect();
        return super.close(options);
    }

static async #collapseQuests(event, target) {
    event.preventDefault();
    const questItem = target.closest(".toc-quest-item");
    if (!questItem) return;
    questItem.classList.toggle("is-collapsed");
    target.classList.toggle("fa-caret-up");
    target.classList.toggle("fa-caret-down");
  }

static async #sendToPlayer(event, target) {
    event.stopPropagation();
    const itemUuid = event.target.dataset.itemUuid;

    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);
    if (!item) {
      ui.notifications.warn("Item not found");
      return;
    }

    TemplateComponents.createPlayerSelectionDialog(item.name, async (targetActor) => {
        try {
          const itemData = item.toObject();
          delete itemData._id;
          await targetActor.createEmbeddedDocuments("Item", [itemData]);
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
    });
  }

static async #createSheet(event, target) {
    event.preventDefault();
    switch (target.dataset.type){
        case 'group':
        case 'tag':
        case 'location':
        case 'region':            
        case 'npc':
        case 'shop':
             createFromScene(target.dataset.type);
            break;
        default:
        }
      }

  /** @override */
 async _onDragStart(event) {
    const el = event.currentTarget;
    if ('link' in event.target.dataset) return;
    // const journal = game.journal.get("6B6FiSvkaKlbDrW8");
    let journalID = event.target.dataset.entryId;
    let journalData = game.journal.get(journalID);
    if (!journalData) return;
    let dragDataB = journalData.toDragData();
    if (!dragDataB) return;
    event.dataTransfer.setData('text/plain', JSON.stringify(dragDataB));
  }



}

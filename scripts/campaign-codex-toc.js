import {
    localize,
    format,
    createFromScene,
} from "./helper.js";

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
        },
    };


    static PARTS = {
        tabs: {
            template: "modules/campaign-codex/templates/codex-toc-tabnav.hbs",
        },
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

async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tabs = this._prepareTabs("sheet");
    const codexJournals = game.journal.filter((j) => j.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY));
    const allTags = game.campaignCodex.getTagCache?.() || [];
    const tagUuids = new Set(allTags.map(tag => tag.uuid));
    context.isGM = game.user.isGM;

    // --- Parallel Quest Enrichment ---

    const allQuestsToProcess = codexJournals.flatMap(doc => {
        const journalQuests = doc.getFlag("campaign-codex", "data")?.quests || [];
        return journalQuests.map(quest => ({ quest, doc }));
    });

    const questProcessingPromises = allQuestsToProcess.map(async ({ quest, doc }) => {
        const canViewSource = doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        const descriptionPromise = foundry.applications.ux.TextEditor.implementation.enrichHTML(quest.description || "", { async: true });
        const objectivePromises = (quest.objectives || [])
            .filter(obj => obj.visible)
            .map(async obj => {
                const enrichedText = await foundry.applications.ux.TextEditor.implementation.enrichHTML(obj.text || "", { async: true });
                return { ...obj, enrichedText };
            });

        const [enrichedDescription, visibleObjectives] = await Promise.all([
            descriptionPromise,
            Promise.all(objectivePromises)
        ]);

        return {
            ...quest,
            journalUuid: doc.uuid,
            journalName: doc.name,
            canViewSource,
            enrichedDescription,
            visibleObjectives
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
            quests: hasQuests, // Changed from the quest array to a boolean
            questsvisible: isAnyQuestVisible, // New property added
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
    const journal = game.journal.get("6B6FiSvkaKlbDrW8");
    let journalID = event.target.dataset.entryId;
    let journalData = game.journal.get(journalID);
    if (!journalData) return;
    let dragDataB = journalData.toDragData();
    if (!dragDataB) return;
    event.dataTransfer.setData('text/plain', JSON.stringify(dragDataB));
  }



}

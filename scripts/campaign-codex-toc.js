import { CampaignCodexLinkers } from "./sheets/linkers.js";
import { CampaignCodexBaseSheet } from "./sheets/base-sheet.js";
import { TemplateComponents } from "./sheets/template-components.js";

import {
    localize,
    format,
    createFromScene,
    getCampaignCodexFolder
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
        },
        actions: {
            createSheet: this.#createSheet,
            openDocument: this.#openDocument,
            changeDefaultOwnership: this.#changeDefaultOwnership,
            collapseQuests:this.#collapseQuests,
            sendToPlayer:this.#sendToPlayer,
            clickTag: this.#clickTag,
            toggleCollapse:this.#toggleCollapse,
            toggleTagFilter: {
                handler: this.#toggleTagFilter,
                buttons: [0, 2] 
            },
            clearTagFilters: this.#clearTagFilters,

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
    #includedTags = new Set();
    #excludedTags = new Set();
    #tagSelection = new Map();
    
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
            template: "modules/campaign-codex/templates/codex-toc-tags.hbs",
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


// In campaign-codex-toc.js (Around line 160)
/**
 * Finds the folder path for a given journal, relative to a codex root folder name.
 * @param {JournalEntry} journal - The journal entry.
 * @param {string} rootFolderName - The name of the root folder to stop at.
 * @returns {{path: string, folderId: string|null}} The path string and the ID of the deepest folder.
 */
_getRelativeFolderPath(journal, rootFolderName) {
    const pathParts = [];
    let currentFolder = journal.folder;

    const initialFolderId = journal.folder?.id || null; 
    
    while (currentFolder) {
        if (rootFolderName && currentFolder.name === rootFolderName) {
            break;
        }
        
        pathParts.push(currentFolder.name);
        
        currentFolder = currentFolder.folder;
    }

    if (pathParts.length === 0) {
        return { path: "", folderId: "Root" }; 
    }

    return { 
        path: pathParts.reverse().join(" - "),
        folderId: initialFolderId 
    };
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


    const tagUuids = new Set(allTags.map(tag => tag.uuid));
    context.isGM = game.user.isGM;


    const allQuestsToProcess = codexJournals.flatMap(doc => {
        const docType = doc.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY);
        if (docType === 'group') {
            return [];
        }
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
    
    const folderNames = {
        location: "Campaign Codex - Locations",
        shop: "Campaign Codex - Entries",
        npc: "Campaign Codex - NPCs",
        region: "Campaign Codex - Regions",
        group: "Campaign Codex - Groups",
        tag: "Campaign Codex - Tags",
    };

    codexJournals.forEach(journal => {
        const type = journal.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY);
        const ownershipLevel = journal.ownership.default;
        const ownershipIcon = ownershipLevel >= 2 ? 'fas fa-eye' : 'fas fa-eye-slash';
        const iconOverride = journal.getFlag("campaign-codex", "icon-override");
        if (iconOverride) {
          context.customIcon = iconOverride;
        }
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
            iconOverride:iconOverride,
            canView: journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER),
            folderPath: "" 
        };
        let pathData;
        switch (type) {
            case "group":
                pathData = this._getRelativeFolderPath(journal, folderNames["group"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.groups.push(item);
                break;
            case "region":
                pathData = this._getRelativeFolderPath(journal, folderNames["region"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.regions.push(item);
                break;
            case "location":
                pathData = this._getRelativeFolderPath(journal, folderNames["location"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.locations.push(item);
                break;
            case "shop":
                pathData = this._getRelativeFolderPath(journal, folderNames["shop"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.shops.push(item);
                break;
            case "npc":
                if (!tagUuids.has(journal.uuid)) {
                pathData = this._getRelativeFolderPath(journal, folderNames["npc"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.npcs.push(item);
                } else {
                pathData = this._getRelativeFolderPath(journal, folderNames["tag"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.tags.push(item);
                }
                break;
            case "tag":
                pathData = this._getRelativeFolderPath(journal, folderNames["tag"]);
                item.folderPath = pathData.path;
                item.folderId = pathData.folderId || "Root";
                content.tags.push(item);
                break;
        }
    });
    
    const tagProcessingPromises = content.tags.map(async (tagItem) => {
        const journal = game.journal.get(tagItem.id);
        if (!journal) return { ...tagItem, children: [], hasChildren: false };
        
        const journalData = journal.getFlag(this.constructor.SCOPE, "data") || {};
        
        const associateUuids = journalData.associates || [];
        const locationUuids = journalData.linkedLocations || []; 
        const shopUuids = journalData.linkedShops || [];
        const groupUuids = journalData.linkedGroups || [];

        const tagownershipLevel = journal.ownership.default;
        const tagownershipIcon = tagownershipLevel >= 2 ? 'fas fa-eye' : 'fas fa-eye-slash';

        tagItem.ownershipIcon = tagownershipIcon;
        tagItem.ownershipLevel = tagownershipLevel;
        tagItem.canView = journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);

        const allUuids = [...associateUuids, ...locationUuids, ...shopUuids, ...groupUuids];
        if (allUuids.length === 0) {
             return { ...tagItem, children: [], hasChildren: false };
        }

        const childrenDocs = (await Promise.all(allUuids.map(uuid => fromUuid(uuid)))).filter(Boolean); 

        const iconOverride = journal.getFlag("campaign-codex", "icon-override");
        if (iconOverride) {
          context.customIcon = iconOverride;
        }

        const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
        const typeOrder = { group: 1, region: 2, location: 3, shop: 4, npc: 5, associate: 5 };

        const processedChildren = childrenDocs
            .filter(doc => {
                const canView = doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
                return !hideByPermission || canView;
            })
            .map(doc => {
                 const childIconOverride = doc.getFlag("campaign-codex", "icon-override");
                    if (iconOverride) {
                      context.customIcon = iconOverride;
                    }
                const type = doc.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY);
                const quests = doc.getFlag("campaign-codex", "data")?.quests;
                const isAnyQuestVisible = quests && quests.some(quest => quest.visible);
                const hasQuests = quests && quests.length > 0;

                return {
                    id: doc.id,
                    uuid: doc.uuid,
                    quests: hasQuests,
                    questsvisible: isAnyQuestVisible, 
                    name: doc.name,
                    img: doc.img, 
                    type: type,
                    childIconOverride: childIconOverride,
                    canView: doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER),
                    displayIcon: TemplateComponents.getAsset("icon", type),
                    ownershipIcon: doc.ownership.default >= 2 ? 'fas fa-eye' : 'fas fa-eye-slash',
                    ownershipLevel: doc.ownership.default
                };
            })
            .sort((a, b) => {
                const typeA = typeOrder[a.type] || 99;
                const typeB = typeOrder[b.type] || 99;
                if (typeA !== typeB) return typeA - typeB;
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            });
            
        return {
            ...tagItem,
            children: processedChildren,
            hasChildren: processedChildren.length > 0
        };
    });

    content.tags = await Promise.all(tagProcessingPromises); 

    const cloudTags = content.tags.map(t => {
        const selectionState = this.#tagSelection.get(t.id) || 0;
        let stateClass = "neutral";
        if (selectionState === 1) stateClass = "included";
        if (selectionState === -1) stateClass = "excluded";

        return {
            ownershipIcon: t.ownershipIcon,
            ownershipLevel: t.ownershipLevel,
            canView: t.canView,
            uuid: t.uuid,
            id: t.id,
            name: t.name,
            icon: t.customIcon || t.displayIcon,
            count: t.children ? t.children.length : 0,
            state: stateClass
        };
    }).sort((a,b) => a.name.localeCompare(b.name));

    let filteredResults = [];
    const hasActiveFilters = this.#tagSelection.size > 0;

    if (hasActiveFilters) {
        const requiredTags = [];
        const excludedTags = [];
        for (const [id, state] of this.#tagSelection) {
            if (state === 1) requiredTags.push(id);
            if (state === -1) excludedTags.push(id);
        }

        const itemMap = new Map();
        for (const tag of content.tags) {
            if (!tag.children) continue;
            for (const child of tag.children) {
                if (!itemMap.has(child.uuid)) {
                    itemMap.set(child.uuid, { data: child, tags: new Set() });
                }
                itemMap.get(child.uuid).tags.add(tag.id);
            }
        }

        for (const [uuid, entry] of itemMap.entries()) {
            const itemTags = entry.tags;

            const isExcluded = excludedTags.some(tagId => itemTags.has(tagId));
            if (isExcluded) continue;

            const matchesRequirements = requiredTags.every(tagId => itemTags.has(tagId));

            if (matchesRequirements) {
                filteredResults.push(entry.data);
            }
        }
        
        filteredResults.sort((a, b) => a.name.localeCompare(b.name));
    }

    context.cloudTags = cloudTags;
    context.filteredResults = filteredResults;
    context.hasActiveFilters = hasActiveFilters;
    context.resultCount = filteredResults.length;


Object.values(content).forEach(arr => {
    if (Array.isArray(arr) && arr.length > 0) {
        if (arr[0].hasOwnProperty('name') && arr[0].hasOwnProperty('folderPath')) {
            arr.sort((a, b) => {
                const pathA = a.folderPath;
                const pathB = b.folderPath;
                const aIsEmpty = pathA === "";
                const bIsEmpty = pathB === "";
                if (aIsEmpty && !bIsEmpty) {
                    return 1; 
                }
                if (!aIsEmpty && bIsEmpty) {
                    return -1;
                }
                const pathCompare = pathA.localeCompare(pathB, undefined, { numeric: true });
                if (pathCompare !== 0) return pathCompare;
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            });
        } else if (arr[0].hasOwnProperty('title')) {
            arr.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
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
    context.isGM = game.user.isGM;
    const openStates = this._getOpenStates();
    switch (partId){
        case 'groups':
        case 'locations':
        case 'regions':       
        case 'npcs':
        case 'tags':
        case 'shops':
            let items = context[partId].items || [];
            if (!context.isGM) {
                items = items.filter(i => i.canView);
            }
            const sections = [];
            let currentPath = null;
            let currentSection = null;

            for (const item of items) {
                // If the path changes, start a new section
                if (item.folderPath !== currentPath) {
                    currentPath = item.folderPath;
                    
                    const displayTitle = currentPath === "" ? "" : currentPath;
                    const sectionId = item.folderId;
                    const isCollapsed = !openStates.includes(sectionId);
                    
                    currentSection = {
                        title: displayTitle,
                        items: [],
                        isCollapsed: isCollapsed,
                        sectionId: sectionId,
                    };
                    sections.push(currentSection);
                }
                
                // Add item to the current section
                if (currentSection) {
                    currentSection.items.push(item);
                }
            }
            context.items = items;   
            context.sections = sections;

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

    static async #toggleTagFilter(event, target) {
        event.preventDefault();
        const tagId = target.dataset.tagId;
        const current = this.#tagSelection.get(tagId) || 0;
        let next = 0;

        if (event.button === 2) {
            if (current === -1) next = 0;
            else if (current === 0) next = -1;
            else next = 0; 
        } else {
            if (current === 0) next = 1;
            else if (current === 1) next = 0;
            else next = 0;
        }

        if (next === 0) this.#tagSelection.delete(tagId);
        else this.#tagSelection.set(tagId, next);

        this.render();
    }

    static async #clearTagFilters(event, target) {
        this.#tagSelection.clear();
        this.render();
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
      for (const element of content.querySelectorAll("li, .toc-quest-item, div.tag-pill")) {
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

    const tagTab = form.querySelector('[data-tab="tags"].active');
    if (tagTab) {
        const firstTag = tagTab.querySelector('.toc-tags-left-col li.toc-tag-item');
        if (firstTag) {
            setTimeout(() => {
                if (!tagTab.querySelector('.toc-tag-item.active')) {
                     firstTag.click();
                }
            }, 0);
        }
    }


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

    _getOpenStates() {
        return game.settings.get("campaign-codex", "collapsedFolderStates") || [];
    }

    async _setOpenStates(states) {
        return game.settings.set("campaign-codex", "collapsedFolderStates", states);
    }


static async #toggleCollapse(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const sectionId = target.dataset.sectionId; 
    if (!sectionId) return;

    const headerUl = target.closest("ul.cc-toc-header-list");
    if (!headerUl) return;

    const itemsUl = headerUl.nextElementSibling;

    if (!itemsUl || !itemsUl.classList.contains("toc-collapsable")) return;
    
    const isCurrentlyCollapsed = itemsUl.classList.contains("is-collapsed");

    itemsUl.classList.toggle("is-collapsed");

    const isNowCollapsed = itemsUl.classList.contains("is-collapsed");

    const icon = headerUl.querySelector(".collapse-icon");
    if (icon) {
        icon.classList.toggle("fa-folder", isNowCollapsed); 
        icon.classList.toggle("fa-folder-open", !isNowCollapsed); 
    }
    let states = this._getOpenStates();
    if (!isNowCollapsed) {
        if (!states.includes(sectionId)) {
            states.push(sectionId);
        }
    } else {
        states = states.filter(id => id !== sectionId);
    }
    await this._setOpenStates(states)
}


static async #sendToPlayer(event, target) {
    event.stopPropagation();
    const itemUuid = event.target.dataset.uuid;

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
    const activeTab = this.element.querySelector(".campaign-codex-toc-app.tab.active")
    event.preventDefault();
    switch (activeTab.dataset.type){
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

  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame || !game.user.isGM) return frame;
    const copyId = `
        <button type="button" class="header-control fa-solid fa-circle-plus icon" data-action="createSheet"
                data-tooltip="Create Sheet" aria-label="Create Sheet"></button>
      `;
      this.window.close.insertAdjacentHTML("beforebegin", copyId);
    
    return frame;
  }


static async #clickTag(event, target) {
    const appElement = target.closest(".campaign-codex-toc-app");
    if (!appElement) return;

    const leftCol = appElement.querySelector('.toc-tags-left-col');
    const rightCol = appElement.querySelector('.toc-tags-right-col');
    const tagId = target.dataset.tagId;

    if (!leftCol || !rightCol || !tagId) return;

    leftCol.querySelectorAll('.toc-tag-item').forEach(el => el.classList.remove('active'));
    target.classList.add('active');

    rightCol.querySelectorAll('.tag-child-list').forEach(el => el.style.display = 'none');
    const childList = rightCol.querySelector(`.tag-child-list[data-tag-id="${tagId}"]`);
    if (childList) {
        childList.style.display = 'grid';
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

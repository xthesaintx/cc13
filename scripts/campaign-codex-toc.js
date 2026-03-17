import { TemplateComponents } from "./sheets/template-components.js";
import { localize, createFromScene } from "./helper.js";

var SearchFilter = foundry.applications.ux.SearchFilter;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const campaignCodexToc = HandlebarsApplicationMixin((ApplicationV2));

export class CampaignCodexTOCSheet extends campaignCodexToc {
    static SCOPE = "campaign-codex";
    static TYPE_KEY = "type";
    static TOC_STATE_FLAG = "tocState";
    static #docSearchCache = new Map();

    static DEFAULT_OPTIONS = {
        id: "campaign-codex-toc-sheet",
        classes: ["campaign-codex", "codex-toc"],
        tag: "div",
        window: {
            frame: true,
            title: "Campaign Codex",
            icon: "fas fa-closed-captioning",
            minimizable: true,
            resizable: true,
        },
        actions: {
            createSheet: this.#createSheet,
            openDocument: this.#openDocument,
            changeDefaultOwnership: this.#changeDefaultOwnership,
            selectFolderNode: this.#selectFolderNode,
            toggleFolderNode: this.#toggleFolderNode,
            toggleTagFilter: { handler: this.#toggleTagFilter, buttons: [0, 2] },
            toggleFilterMode: this.#toggleFilterMode,
            toggleSearchScope: this.#toggleSearchScope,
            setViewMode: this.#setViewMode,
            toggleGroupByFolder: this.#toggleGroupByFolder,
            clearTagFilters: this.#clearTagFilters,
            openQuestBoard: this.#openQuestBoard,
        },
    };

    static PARTS = {
        main: { template: "modules/campaign-codex/templates/codex-toc-content.hbs", scrollable: ["",".cc-toc-results",".scrollable",".cc-toc-folders",".cc-toc-tag-panel"] },
    };
    static SELECTORS = {
        JOURNAL_CARD: ".cc-toc-journal-list .directory-item[data-uuid]",
    };

    #searchQuery = "";
    #tagSelection = new Map();
    #includeMode = "and";
    #searchScope = "title";
    #viewMode = "list";
    #groupByFolder = false;
    #collapsedGroupKeys = new Set();
    #selectedFolderNode = "all";
    #expandedFolderNodes = new Set();
    #pendingSearchSelection = null;
    #persistStateDebounced = foundry.utils.debounce(() => this.#persistState(), 250);

    constructor(options = {}) {
        super(options);
        this.#restoreState();
    }

    _commitSearchQuery(rawValue, options = {}) {
        const nextQuery = String(rawValue || "");
        if (nextQuery === this.#searchQuery) return;
        const start = Number.isFinite(options.selectionStart) ? options.selectionStart : null;
        const end = Number.isFinite(options.selectionEnd) ? options.selectionEnd : start;
        this.#pendingSearchSelection = start === null ? null : {
            start,
            end,
            direction: options.selectionDirection || "none",
        };
        this.#searchQuery = nextQuery;
        this.#persistStateDebounced();
        this.render();
    }

    #restoreState() {
        const saved = game.user?.getFlag(this.constructor.SCOPE, this.constructor.TOC_STATE_FLAG);
        if (!saved || typeof saved !== "object") return;
        if (typeof saved.searchQuery === "string") this.#searchQuery = saved.searchQuery;
        if (saved.searchScope === "title" || saved.searchScope === "content") this.#searchScope = saved.searchScope;
        if (saved.viewMode === "list" || saved.viewMode === "tile") this.#viewMode = saved.viewMode;
        if (typeof saved.groupByFolder === "boolean") this.#groupByFolder = saved.groupByFolder;
        if (Array.isArray(saved.collapsedGroupKeys)) {
            this.#collapsedGroupKeys = new Set(
                saved.collapsedGroupKeys
                    .map((key) => String(key || "").trim())
                    .filter((key) => !!key),
            );
        }
    }

    async #persistState() {
        if (!game.user) return;
        const payload = {
            searchQuery: this.#searchQuery,
            searchScope: this.#searchScope,
            viewMode: this.#viewMode,
            groupByFolder: this.#groupByFolder,
            collapsedGroupKeys: [...this.#collapsedGroupKeys],
        };
        await game.user.setFlag(this.constructor.SCOPE, this.constructor.TOC_STATE_FLAG, payload);
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

    _buildSelectionBuckets() {
        const includedKeys = [];
        const excludedKeys = [];
        for (const [id, state] of this.#tagSelection) {
            if (state === 1) includedKeys.push(id);
            if (state === -1) excludedKeys.push(id);
        }
        return { includedKeys, excludedKeys };
    }

    _documentKeys(doc) {
        return new Set([
            `type:${doc.type}`,
            ...((doc.tags || []).map((tag) => `tag:${String(tag || "").toLowerCase()}`)),
        ]);
    }
    _displayTypeName(type) {
        const normalized = String(type || "").trim().toLowerCase();
        if (normalized === "tag") return "Faction";
        return localize(`names.${normalized}`) || normalized;
    }

    _matchesTagSelection(doc, includedKeys, excludedKeys) {
        const keys = this._documentKeys(doc);
        if (excludedKeys.some((key) => keys.has(key))) return false;
        if (!includedKeys.length) return true;
        if (this.#includeMode === "and") return includedKeys.every((key) => keys.has(key));
        return includedKeys.some((key) => keys.has(key));
    }

    _matchesFolderSelection(doc) {
        if (this.#selectedFolderNode === "all") return true;
        return (doc.folderNodeKeys || []).includes(this.#selectedFolderNode);
    }

    _buildCloudTags(docs, includedKeys, excludedKeys) {
        const keyMeta = new Map();
        for (const doc of docs) {
            const typeKey = `type:${doc.type}`;
            if (!keyMeta.has(typeKey)) keyMeta.set(typeKey, { name: this._displayTypeName(doc.type), icon: TemplateComponents.getAsset("icon", doc.type) });
            for (const rawTag of doc.tags || []) {
                const normalized = String(rawTag || "").trim();
                if (!normalized) continue;
                const tagKey = `tag:${normalized.toLowerCase()}`;
                if (!keyMeta.has(tagKey)) keyMeta.set(tagKey, { name: normalized, icon: "fas fa-hashtag" });
            }
        }

        const docsWithoutExcluded = docs.filter((doc) => {
            const keys = this._documentKeys(doc);
            return !excludedKeys.some((key) => keys.has(key));
        });
        const docsForDynamicCounts = (this.#includeMode === "and" && includedKeys.length > 0)
            ? docs.filter((doc) => this._matchesTagSelection(doc, includedKeys, excludedKeys))
            : docsWithoutExcluded;

        const dynamicCounts = new Map();
        for (const doc of docsForDynamicCounts) {
            for (const key of this._documentKeys(doc)) dynamicCounts.set(key, (dynamicCounts.get(key) || 0) + 1);
        }

        const selectedKeys = Array.from(this.#tagSelection.keys());
        const cloudKeys = new Set([
            ...Array.from(dynamicCounts.keys()).filter((key) => (dynamicCounts.get(key) || 0) > 0),
            ...selectedKeys,
        ]);

        return Array.from(cloudKeys).map((key) => {
            const state = this.#tagSelection.get(key) || 0;
            let stateClass = "neutral";
            if (state === 1) stateClass = this.#includeMode === "and" ? "included-and" : "included-or";
            if (state === -1) stateClass = "excluded";
            const meta = keyMeta.get(key) || { name: key, icon: "fas fa-tag" };
            return { id: key, name: meta.name, icon: meta.icon, count: dynamicCounts.get(key) || 0, state: stateClass };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    _ensureDefaultExpanded(rootNodes) {
        if (this.#expandedFolderNodes.size === 0) return;
        const validKeys = new Set();
        const stack = [...rootNodes];
        while (stack.length) {
            const node = stack.pop();
            if (!node) continue;
            validKeys.add(node.key);
            if (node.children?.length) stack.push(...node.children);
        }
        this.#expandedFolderNodes = new Set(
            [...this.#expandedFolderNodes].filter((key) => validKeys.has(key))
        );
    }

    _nodeHtml(node) {
        const hasChildren = (node.children || []).length > 0;
        const expanded = this.#expandedFolderNodes.has(node.key);
        const active = this.#selectedFolderNode === node.key;
        const toggleIcon = hasChildren ? "fa-folder-plus" : "fa-folder";
        const toggleAction = hasChildren ? `data-action="toggleFolderNode" data-node-key="${node.key}"` : "";
        const childrenHtml = hasChildren && expanded
            ? `<ul class="cc-tree-children">${node.children.map((child) => this._nodeHtml(child)).join("")}</ul>`
            : "";
        return `
            <li class="cc-tree-node ${active ? "active" : ""}">
              <div class="cc-tree-row">
                <i class="fas ${toggleIcon} cc-tree-toggle ${hasChildren ? "expandable" : "static"}" ${toggleAction}></i>
                <span class="cc-tree-label" data-action="selectFolderNode" data-node-key="${node.key}">
                  ${node.label}
                </span>
                <span class="folder-count">${node.count}</span>
              </div>
              ${childrenHtml}
            </li>
        `;
    }

    _renderTreeHtml(rootNodes) {
        const allActive = this.#selectedFolderNode === "all";
        const allCount = rootNodes.reduce((acc, n) => acc + (n.count || 0), 0);
        const allNode = `
          <li class="cc-tree-node ${allActive ? "active" : ""}">
            <div class="cc-tree-row">
              <i class="fas fa-folder-plus cc-tree-toggle"></i>
              <span class="cc-tree-label" data-action="selectFolderNode" data-node-key="all">All</span>
              <span class="folder-count">${allCount}</span>
            </div>
          </li>
        `;
        return `<ul class="cc-folder-tree">${allNode}${rootNodes.map((node) => this._nodeHtml(node)).join("")}</ul>`;
    }

    /**
     * Public helper: select a tag filter by raw tag name and re-render.
     * @param {string} tagName
     * @param {{state?: number, clear?: boolean}} [options]
     */
    setTagFilterByName(tagName, options = {}) {
        const raw = String(tagName || "").trim();
        if (!raw) return;
        const state = Number.isFinite(Number(options.state)) ? Number(options.state) : 1;
        const clear = options.clear ?? true;
        const key = `tag:${raw.toLowerCase()}`;

        if (clear) {
            this.#tagSelection.clear();
            this.#selectedFolderNode = "all";
        }

        if (state === 0) this.#tagSelection.delete(key);
        else this.#tagSelection.set(key, state);

        this.render(true);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.searchScopeLabel = this.#searchScope === "content" ? "fa-book" : "fa-input-text";
        context.searchScopeTitle = this.#searchScope === "content" ? "Search Content" : "Search Title";
        context.searchQuery = this.#searchQuery;
        context.includeModeLabel = this.#includeMode.toUpperCase();
        context.viewMode = this.#viewMode;
        context.groupByFolder = this.#groupByFolder;

        const codexJournals = game.journal.filter((j) => j.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY));
        const seenDocIds = new Set();
        const folderNodeMap = new Map();
        const rootFolderNodes = [];
        const ensureFolderNode = (folder) => {
            if (!folder) return null;
            const key = `folder:${folder.id}`;
            let node = folderNodeMap.get(key);
            if (!node) {
                node = { key, label: folder.name || "Folder", count: 0, children: [], childMap: new Map() };
                folderNodeMap.set(key, node);
                if (folder.folder) {
                    const parentNode = ensureFolderNode(folder.folder);
                    if (parentNode && !parentNode.childMap.has(key)) {
                        parentNode.childMap.set(key, node);
                        parentNode.children.push(node);
                    }
                } else {
                    rootFolderNodes.push(node);
                }
            }
            return node;
        };

        const docs = [];
        let hasUnfiledDocs = false;
        for (const journal of codexJournals) {
            seenDocIds.add(journal.id);
            const type = journal.getFlag(this.constructor.SCOPE, this.constructor.TYPE_KEY);
            if (!type) continue;
            const ownershipLevel = journal.ownership.default;
            const ownershipIcon = ownershipLevel >= 2 ? "fas fa-eye" : "fas fa-eye-slash";
            const iconOverride = journal.getFlag("campaign-codex", "icon-override");
            const cacheKey = [
                String(journal._stats?.modifiedTime ?? journal._source?._stats?.modifiedTime ?? 0),
                String(journal.folder?.id || ""),
                String(journal.name || ""),
                String(ownershipLevel),
                String(type),
            ].join("|");
            const cached = CampaignCodexTOCSheet.#docSearchCache.get(journal.id);
            let titleText = "";
            let contentText = "";
            let docTags = [];
            if (cached?.cacheKey === cacheKey) {
                titleText = cached.titleText;
                contentText = cached.contentText;
                docTags = cached.tags;
            } else {
                const journalData = journal.getFlag("campaign-codex", "data") || {};
                const descriptionValue = journal.getFlag("campaign-codex", "data.description") ?? journalData.description;
                const plainDescription = this._toSearchableText(descriptionValue);
                const plainNotes = this._toSearchableText(journalData.notes);
                docTags = Array.isArray(journalData.tags) ? journalData.tags.map((t) => String(t ?? "").trim()).filter(Boolean) : [];
                titleText = SearchFilter.cleanQuery(journal.name);
                contentText = SearchFilter.cleanQuery([plainDescription, plainNotes].join(" ").trim());
                CampaignCodexTOCSheet.#docSearchCache.set(journal.id, {
                    cacheKey,
                    titleText,
                    contentText,
                    tags: docTags,
                });
            }
            const canView = journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const folderNodeKeys = [];
            let folderPathKey = "folder:unfiled";
            let folderPathLabel = "Unfiled";
            let folderPathSort = "zzzz_unfiled";
            let currentFolder = journal.folder;
            if (!currentFolder) {
                hasUnfiledDocs = true;
                folderNodeKeys.push("folder:unfiled");
            } else {
                const folderPathNames = [];
                const folderPathIds = [];
                while (currentFolder) {
                    const node = ensureFolderNode(currentFolder);
                    if (node) folderNodeKeys.push(node.key);
                    folderPathNames.unshift(currentFolder.name || "Folder");
                    folderPathIds.unshift(currentFolder.id);
                    currentFolder = currentFolder.folder;
                }
                folderPathKey = `folder-path:${folderPathIds.join("/")}`;
                folderPathLabel = folderPathNames.join("\\");
                folderPathSort = folderPathLabel.toLowerCase();
            }

            docs.push({
                id: journal.id,
                name: journal.name,
                uuid: journal.uuid,
                type,
                iconOverride,
                ownershipIcon,
                ownershipLevel,
                canView,
                tags: docTags,
                titleText,
                contentText,
                folderNodeKeys,
                folderPathKey,
                folderPathLabel,
                folderPathSort,
            });
        }
        for (const cachedId of CampaignCodexTOCSheet.#docSearchCache.keys()) {
            if (!seenDocIds.has(cachedId)) CampaignCodexTOCSheet.#docSearchCache.delete(cachedId);
        }

        const pruneAndSortNodes = (nodes) => {
            const kept = [];
            for (const node of nodes) {
                node.children = pruneAndSortNodes(node.children || []);
                node.childMap = new Map(node.children.map((child) => [child.key, child]));
                if (node.count > 0) kept.push(node);
            }
            kept.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
            return kept;
        };
        const { includedKeys, excludedKeys } = this._buildSelectionBuckets();
        const cleanedSearchQuery = SearchFilter.cleanQuery(this.#searchQuery || "").toLowerCase();
        const matchesSearch = (doc) => {
            if (!cleanedSearchQuery) return true;
            const haystack = String(this.#searchScope === "content" ? doc.contentText : doc.titleText).toLowerCase();
            return haystack.includes(cleanedSearchQuery);
        };
        const visibleDocs = docs.filter((doc) => context.isGM || doc.canView);
        const validGroupKeys = new Set(
            visibleDocs.map((doc) => doc.folderPathKey || "folder:unfiled"),
        );
        if (this.#collapsedGroupKeys.size) {
            this.#collapsedGroupKeys = new Set(
                [...this.#collapsedGroupKeys].filter((key) => validGroupKeys.has(key)),
            );
        }
        const docsForCountsAndTree = visibleDocs
            .filter((doc) => this._matchesTagSelection(doc, includedKeys, excludedKeys))
            .filter(matchesSearch);
        for (const node of folderNodeMap.values()) node.count = 0;
        let unfiledCount = 0;
        for (const doc of docsForCountsAndTree) {
            for (const key of doc.folderNodeKeys || []) {
                if (key === "folder:unfiled") {
                    unfiledCount += 1;
                    continue;
                }
                const node = folderNodeMap.get(key);
                if (node) node.count += 1;
            }
        }
        const rootNodes = pruneAndSortNodes(rootFolderNodes);
        if (hasUnfiledDocs && unfiledCount > 0) {
            rootNodes.push({
                key: "folder:unfiled",
                label: "Unfiled",
                count: unfiledCount,
                children: [],
                childMap: new Map(),
            });
        }
        this._ensureDefaultExpanded(rootNodes);
        const filteredDocs = docsForCountsAndTree
            .filter((doc) => this._matchesFolderSelection(doc));

        const cloudTags = this._buildCloudTags(visibleDocs, includedKeys, excludedKeys);
        const middleList = [...filteredDocs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((doc) => ({
            ...doc,
            displayIcon: doc.iconOverride || TemplateComponents.getAsset("icon", doc.type),
        }));
        const groupedItems = this.#groupByFolder ? Array.from(
            filteredDocs.reduce((map, doc) => {
                const key = doc.folderPathKey || "folder:unfiled";
                if (!map.has(key)) {
                    map.set(key, {
                        key,
                        label: doc.folderPathLabel || "Unfiled",
                        sortKey: doc.folderPathSort || "zzzz_unfiled",
                        items: [],
                    });
                }
                map.get(key).items.push({
                    ...doc,
                    displayIcon: doc.iconOverride || TemplateComponents.getAsset("icon", doc.type),
                });
                return map;
            }, new Map()).values(),
        ).sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true })).map((group) => ({
            ...group,
            isOpen: !this.#collapsedGroupKeys.has(group.key),
            items: group.items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        })) : [];

        context.treeHtml = this._renderTreeHtml(rootNodes);
        context.items = middleList;
        context.groupedItems = groupedItems;
        context.cloudTags = cloudTags;
        context.resultCount = middleList.length;
        context.hasContent = docs.length > 0;
        context.hasActiveFilters = this.#tagSelection.size > 0 || this.#selectedFolderNode !== "all";
        return context;
    }

    async _preparePartContext(partId, context) {
        return context;
    }

    /** @inheritDoc */
    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this._createContextMenus();
        this.element.addEventListener("dragover", this._onDragOver.bind(this));
        this.element.addEventListener("drop", this._onDrop.bind(this));
    }

    _createContextMenus() {
        this._createContextMenu(this._getJournalContextOptions, this.constructor.SELECTORS.JOURNAL_CARD, {
            fixed: true,
            hookName: "getCampaignCodexTOCContextOptions",
            parentClassHooks: false,
        });
    }

    _getJournalContextOptions() {
        return [
            this._getJumpToPinContextOption(),
            this._getConfigureOwnershipContextOption(),
            this._getShowFolderContextOption(),
        ];
    }

    _getContextDocument(target) {
        const element = target?.dataset ? target : (target?.[0] || target?.currentTarget || null);
        const uuid = element?.dataset?.uuid;
        if (!uuid) return null;
        return fromUuidSync(uuid) || null;
    }

    _getJumpToPinContextOption() {
        return {
            name: "SIDEBAR.JumpPin",
            icon: '<i class="fa-solid fa-crosshairs"></i>',
            condition: (target) => !!this._getContextDocument(target)?.sceneNote,
            callback: async (target) => {
                const entry = this._getContextDocument(target) || await fromUuid(target?.dataset?.uuid || "");
                entry?.panToNote?.();
            },
        };
    }

    _getConfigureOwnershipContextOption() {
        return {
            name: "OWNERSHIP.Configure",
            icon: '<i class="fa-solid fa-lock"></i>',
            condition: () => game.user.isGM,
            callback: async (target) => {
                const document = this._getContextDocument(target) || await fromUuid(target?.dataset?.uuid || "");
                if (!document) return;
                const OwnershipConfig = foundry.applications?.apps?.DocumentOwnershipConfig;
                if (!OwnershipConfig) return;
                new OwnershipConfig({
                    document,
                }).render({ force: true });
            },
        };
    }

    _getShowFolderContextOption() {
        return {
            name: localize("context.showInDirectory"),
            icon: '<i class="fa-solid fa-folder-tree"></i>',
            condition: (target) => !!this._getContextDocument(target),
            callback: async (target) => this._openJournalFolderFromContext(target),
        };
    }

    async _openJournalFolderFromContext(target) {
        const element = target?.dataset ? target : (target?.[0] || target?.currentTarget || null);
        const uuid = element?.dataset?.uuid || "";
        const journalDoc = this._getContextDocument(target) || await fromUuid(uuid);
        if (!journalDoc) return;
        const folderKeys = [];
        let currentFolder = journalDoc.folder;
        while (currentFolder) {
            folderKeys.push(`folder:${currentFolder.id}`);
            currentFolder = currentFolder.folder;
        }

        if (folderKeys.length) {
            for (const key of folderKeys) this.#expandedFolderNodes.add(key);
            this.#selectedFolderNode = folderKeys[0];
        } else {
            this.#selectedFolderNode = "folder:unfiled";
        }
        this.render();
    }

    static async #toggleTagFilter(event, target) {
        event.preventDefault();
        const tagId = target.dataset.tagId;
        const current = this.#tagSelection.get(tagId) || 0;
        let next = 0;
        if (event.button === 2) next = current === -1 ? 0 : -1;
        else next = current === 1 ? 0 : 1;
        if (next === 0) this.#tagSelection.delete(tagId);
        else this.#tagSelection.set(tagId, next);
        this.render();
    }

    static async #toggleFilterMode(event, target) {
        event.preventDefault();
        this.#includeMode = this.#includeMode === "and" ? "or" : "and";
        this.render();
    }

    static async #toggleSearchScope(event, target) {
        event.preventDefault();
        this.#searchScope = this.#searchScope === "title" ? "content" : "title";
        this.#persistStateDebounced();
        this.render();
    }

    static async #setViewMode(event, target) {
        event.preventDefault();
        const mode = String(target.dataset.viewMode || "");
        if (!["list", "tile"].includes(mode)) return;
        if (this.#viewMode === mode) return;
        this.#viewMode = mode;
        this.#persistStateDebounced();
        this.render();
    }

    static async #toggleGroupByFolder(event, target) {
        event.preventDefault();
        this.#groupByFolder = !this.#groupByFolder;
        this.#persistStateDebounced();
        this.render();
    }

    static async #selectFolderNode(event, target) {
        event.preventDefault();
        const nodeKey = target.dataset.nodeKey;
        if (!nodeKey) return;
        this.#selectedFolderNode = nodeKey;
        this.render();
    }

    static async #toggleFolderNode(event, target) {
        event.preventDefault();
        const nodeKey = target.dataset.nodeKey;
        if (!nodeKey) return;
        if (this.#expandedFolderNodes.has(nodeKey)) this.#expandedFolderNodes.delete(nodeKey);
        else this.#expandedFolderNodes.add(nodeKey);
        this.render();
    }

    static async #clearTagFilters(event, target) {
        this.#tagSelection.clear();
        this.#selectedFolderNode = "all";
        this.render();
    }

    static async #changeDefaultOwnership(event, target) {
        event.preventDefault();
        const uuid = target.dataset.uuid;
        const currentOwnership = Number(target.dataset.ownership || 0);
        const journal = await fromUuid(uuid);
        if (!journal) return;
        await journal.update({ ownership: { default: currentOwnership > 0 ? 0 : 2 } });
        this.render(true);
    }

    static async #openDocument(event, target) {
        event.preventDefault();
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        const doc = await fromUuid(uuid);
        doc?.sheet.render(true);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const form = this.element;
        const searchInput = form.querySelector("#toc-filter");
        if (searchInput) {
            searchInput.addEventListener("input", (ev) => {
                const input = ev.currentTarget;
                this._commitSearchQuery(input?.value ?? "", {
                    selectionStart: input?.selectionStart,
                    selectionEnd: input?.selectionEnd,
                    selectionDirection: input?.selectionDirection,
                });
            });
            searchInput.addEventListener("change", (ev) => {
                const input = ev.currentTarget;
                this._commitSearchQuery(input?.value ?? "", {
                    selectionStart: input?.selectionStart,
                    selectionEnd: input?.selectionEnd,
                    selectionDirection: input?.selectionDirection,
                });
            });
            if (this.#pendingSearchSelection) {
                const max = searchInput.value?.length ?? 0;
                const start = Math.max(0, Math.min(this.#pendingSearchSelection.start, max));
                const end = Math.max(start, Math.min(this.#pendingSearchSelection.end, max));
                searchInput.focus({ preventScroll: true });
                searchInput.setSelectionRange(start, end, this.#pendingSearchSelection.direction);
                this.#pendingSearchSelection = null;
            }
        }
        const tagSearchInput = form.querySelector("#toc-tag-filter");
        if (tagSearchInput) {
            const applyTagFilter = (rawValue) => {
                const query = SearchFilter.cleanQuery(rawValue || "").toLowerCase();
                const pills = form.querySelectorAll(".cc-toc-tag-panel .tag-cloud .tag-pill");
                for (const pill of pills) {
                    const tagName = SearchFilter.cleanQuery(
                        pill.querySelector(".tag-name")?.textContent || "",
                    ).toLowerCase();
                    pill.style.display = !query || tagName.includes(query) ? "" : "none";
                }
            };
            applyTagFilter(tagSearchInput.value);
            tagSearchInput.addEventListener("input", (ev) => applyTagFilter(ev.currentTarget?.value ?? ""));
            tagSearchInput.addEventListener("change", (ev) => applyTagFilter(ev.currentTarget?.value ?? ""));
        }
        form.querySelectorAll('[data-action="toggleTagFilter"]').forEach((el) => {
            el.addEventListener("contextmenu", (ev) => ev.preventDefault());
        });
        form.querySelectorAll(".cc-toc-folder-group[data-group-key]").forEach((el) => {
            el.addEventListener("toggle", (ev) => {
                const details = ev.currentTarget;
                const groupKey = String(details?.dataset?.groupKey || "").trim();
                if (!groupKey) return;
                if (details.open) this.#collapsedGroupKeys.delete(groupKey);
                else this.#collapsedGroupKeys.add(groupKey);
                this.#persistStateDebounced();
            });
        });

        this._resizeObserver?.disconnect();
        const debouncedSave = foundry.utils.debounce((width, height) => {
            game.settings.set("campaign-codex", "tocSheetDimensions", { width, height });
        }, 300);
        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                debouncedSave(width, height);
            }
        });
        this._resizeObserver.observe(this.element);

        new foundry.applications.ux.DragDrop.implementation({
            dragSelector: ".directory-item",
            permissions: { dragstart: true },
            callbacks: { dragstart: this._onDragStart.bind(this) },
        }).bind(this.element);
    }

    async close(options) {
        this._resizeObserver?.disconnect();
        return super.close(options);
    }

    static async #createSheet(event, target) {
        event.preventDefault();
        const createType = await foundry.applications.api.DialogV2.prompt({
            window: { title: "Create Campaign Codex Sheet" },
            content: `
                <div class="form-group">
                  <label>Sheet Type</label>
                  <select name="sheetType">
                    <option value="group">Group</option>
                    <option value="region">Region</option>
                    <option value="location">Location</option>
                    <option value="shop">Entry</option>
                    <option value="npc">NPC</option>
                    <option value="tag">Faction</option>
                    <option value="quest">Quest</option>
                  </select>
                </div>
            `,
            ok: {
                icon: '<i class="fas fa-check"></i>',
                label: "Create",
                callback: (event, button) => button.form.elements.sheetType.value,
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: localize("dialog.cancel"),
            },
            rejectClose: false,
        }).catch(() => null);
        if (!createType) return;
        createFromScene(createType);
    }

    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;
        const questId = `
        <button type="button" class="header-control fa-solid fa-scroll icon" data-action="openQuestBoard"
                data-tooltip="Open Quest Board" aria-label="Open Quest Board"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", questId);
        if (!game.user.isGM) return frame;
        const copyId = `
        <button type="button" class="header-control fa-solid fa-circle-plus icon" data-action="createSheet"
                data-tooltip="Create Sheet" aria-label="Create Sheet"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", copyId);
        return frame;
    }

    static async #openQuestBoard(event, target) {
        event.preventDefault();
        await game.campaignCodex.openQuestBoard();
    }

    async _onDragStart(event) {
        if ("link" in event.target.dataset) return;
        const journalID = event.target.dataset.entryId;
        const journalData = game.journal.get(journalID);
        if (!journalData) return;
        const dragData = journalData.toDragData();
        if (!dragData) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    _onDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "link";
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (_error) {
            return;
        }
        if (!data || data.type !== "Actor") return;
        if (!game.user.isGM) {
            ui.notifications.warn("GM only action.");
            return;
        }

        const actor = await this._resolveDroppedActor(data);
        if (!actor) {
            ui.notifications.warn(localize("notify.actorNotFound"));
            return;
        }

        const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
        if (!npcJournal) return;
        npcJournal.sheet?.render(true);
        this.render();
    }

    async _resolveDroppedActor(data) {
        if (data?.uuid) {
            const actorByUuid = await fromUuid(data.uuid).catch(() => null);
            if (actorByUuid?.documentName === "Actor") return actorByUuid;
        }
        if (data?.id) return game.actors.get(data.id) || null;
        return null;
    }
}

import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import OrgChart from "../lib/orgchart/orgchart.js"; 

export class OrgChartWidget extends CampaignCodexWidget {
    constructor(widgetId, initialData, document) {
        super(widgetId, initialData, document);
        this._saveTimer = null; 
    }

    _getTitle(doc) {
        let title;
        const data = doc.getFlag("campaign-codex", "data") || {};
        
        if (data.sheetTypeLabelOverride) {
            title = data.sheetTypeLabelOverride;
        } else if (data.tagMode) {
            title = 'Tag';
        } else {
            title = doc.getFlag("campaign-codex", "type") || 'Member';
        }
        return title;
    }

    /**
     * Syncs Document Links with Widget Data and returns the full list (including hidden)
     */
    async _syncAndGetNodes() {
        const savedData = await this.getData();
        let hierarchy = Array.isArray(savedData?.hierarchy) ? savedData.hierarchy : [];
        const rootId = this.document.uuid;

        let rootNode = hierarchy.find(n => n.id === rootId);
        if (!rootNode) {
            rootNode = { id: rootId, parentId: null, className: 'root-node' };
            hierarchy.push(rootNode);
        }
        rootNode.name = this.document.name;
        rootNode.title = this._getTitle(this.document);
        rootNode.img = this.document.img;

        let groupNPCUUIDs = [];
        const groupSheet = Object.values(this.document.apps).find(app => app.constructor.name === "GroupSheet");
        if (groupSheet && groupSheet._processedData?.nestedData?.allNPCs) {
            groupNPCUUIDs = groupSheet._processedData.nestedData.allNPCs.map(n => n.uuid);
        }

        let locationNPCUUIDs = [];
        const locationSheet = Object.values(this.document.apps).find(app => app.constructor.name === "LocationSheet");
        if (locationSheet && locationSheet._processedData?.shopNPCs) {
            locationNPCUUIDs = locationSheet._processedData.shopNPCs.map(n => n.uuid);
        }

        let regionNPCUUIDs = [];
        const regionSheet = Object.values(this.document.apps).find(app => app.constructor.name === "RegionSheet");
        if (regionSheet && regionSheet._processedData?.rawShopNPCs) {
            regionNPCUUIDs = regionSheet._processedData?.rawShopNPCs.map(n => n.uuid);
        }
 

        const npcData = this.document.getFlag("campaign-codex", "data") || {};
        const allLinkedUuids = [...new Set([
            ...(regionNPCUUIDs || []),
            ...(locationNPCUUIDs || []),
            ...(groupNPCUUIDs || []),
            ...(npcData.associates || []), 
            ...(npcData.linkedNPCs || [])
        ])];

        // 3. Sync Child Nodes
        for (const uuid of allLinkedUuids) {
            try {
                const doc = await fromUuid(uuid);
                if (doc) {
                    let node = hierarchy.find(n => n.id === uuid);
                    if (!node) {
                        node = { 
                            id: uuid, 
                            parentId: rootId, 
                            className: 'standard-node',
                            hidden: false // Default visibility
                        };
                        hierarchy.push(node);
                    }
                    // Update display props
                    node.name = doc.name;
                    node.title = this._getTitle(doc);
                    // node.img = doc.img; 
                }
            } catch (e) { 
                console.warn("OrgChart: Missing doc", uuid); 
            }
        }

        // 4. Filter out stale nodes (IDs that are no longer linked)
        const validIds = new Set([rootId, ...allLinkedUuids]);
        return hierarchy.filter(node => validIds.has(node.id));
    }

    /**
     * Prepares the nested structure for OrgChart.js
     */
    async _getHierarchyData() {
        const allNodes = await this._syncAndGetNodes();
        const rootId = this.document.uuid;

        // Filter out hidden nodes for the chart view
        const visibleNodes = allNodes.filter(node => !node.hidden);

        const buildTree = (parentId) => {
            return visibleNodes
                .filter(node => node.parentId === parentId)
                .map(node => ({
                    id: node.id,
                    name: node.name,
                    title: node.title,
                    className: node.className || 'standard-node',
                    children: buildTree(node.id)
                }));
        };

        const finalRoot = visibleNodes.find(n => n.id === rootId);
        if (!finalRoot) return null;

        return {
            id: finalRoot.id,
            name: finalRoot.name,
            title: finalRoot.title,
            className: 'root-node',
            img: finalRoot.img,
            children: buildTree(rootId)
        };
    }

    async render() {
        // We fetch the nodes during render to populate the Removed List
        const allNodes = await this._syncAndGetNodes();
        const removedNodes = allNodes.filter(n => n.hidden);
        
        // Generate HTML for removed items
        const removedHtml = removedNodes.map(n => `
            <div class="removed-node" data-uuid="${n.id}" title="Click to restore">
                <i class="fas fa-plus-circle"></i> ${n.name}
            </div>
        `).join('');

        return `
            <div class="cc-widget org-chart-widget" style="aspect-ratio:1">
                <div id="org-chart-container-${this.widgetId}" class="org-chart-container" style="height:100%; display: grid; background-image: linear-gradient(90deg, rgba(200, 200, 200, 0.15) 10%, rgba(0, 0, 0, 0) 10%), linear-gradient(rgba(200, 200, 200, 0.15) 10%, rgba(0, 0, 0, 0) 10%); background-size: 10px 10px;"></div>
                
                ${removedNodes.length > 0 ? `
                <div class="removed-container">
                    <div class="removed-header">Removed Nodes</div>
                    <div class="removed-list">${removedHtml}</div>
                </div>` : '<div class="removed-container"><div class="removed-header">Right Click to remove nodes</div></div>'}
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        super.activateListeners(htmlElement);
        

        htmlElement.querySelectorAll('.removed-node').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                const uuid = el.dataset.uuid;
                await this._toggleNodeVisibility(uuid, false); // Unhide
            });
        });

        const data = await this._getHierarchyData();
        if (!data) return;
        
        const containerSelector = `#org-chart-container-${this.widgetId}`;
        const containerEl = htmlElement.querySelector(containerSelector);

        try {
            const orgChart = new OrgChart({
                'chartContainer': containerSelector,
                'data': data,
                'nodeContent': 'title',
                'nodeId': 'id',
                'draggable': this.isGM,
                'pan': true,
                'zoom': true,
                'createNode': (node, data) => {
                    // Click to Open
                    node.addEventListener('click', (e) => {
                        if (node.classList.contains('dragging')) return;
                        this._onOpenDocument(data.id);
                    });

                    // Right Click to Remove (GM Only)
                    if (this.isGM) {
                        node.addEventListener('contextmenu', async (e) => {
                            e.preventDefault();
                            if (data.id === this.document.uuid) return; 
                            await this._toggleNodeVisibility(data.id, true);
                        });
                    }
                }
            });

            const savedData = await this.getData();
            if (savedData?.viewState) {
                const chartDiv = containerEl.querySelector('.orgchart');
                if (chartDiv) {
                    chartDiv.style.transform = savedData.viewState;
                    chartDiv.style.cursor = 'grab';
                }
            }

            const chartDiv = containerEl.querySelector('.orgchart');
            if (chartDiv) {
                const saveState = () => this._saveViewState(chartDiv);
                containerEl.addEventListener('mouseup', saveState);
                containerEl.addEventListener('touchend', saveState, { passive: true });
                containerEl.addEventListener('wheel', () => {
                    clearTimeout(this._saveTimer);
                    this._saveTimer = setTimeout(saveState, 500); 
                }, { passive: false }); 
            }

            if (orgChart.chart) {
                orgChart.chart.addEventListener('nodedropped.orgchart', async (event) => {
                    const detail = event.detail;
                    const draggedNode = detail.draggedNode;
                    const dropZone = detail.dropZone;

                    if (!draggedNode || !dropZone) return;

                    const draggedId = draggedNode.id;
                    const dropNode = dropZone.closest('.node');
                    const newParentId = dropNode ? dropNode.id : null;

                    if (!draggedId || !newParentId) return;
                    if (draggedId === this.document.uuid) return; 

                    await this._updateParent(draggedId, newParentId);
                });
            }

        } catch (err) {
            console.error("OrgChart Init Failed:", err);
        }
    }
/**
     * Toggles visibility and handles parent/child logic
     */
    async _toggleNodeVisibility(uuid, hide) {
        const savedData = await this.getData();
        let hierarchy = Array.isArray(savedData?.hierarchy) ? savedData.hierarchy : [];
        let nodeIndex = hierarchy.findIndex(n => n.id === uuid);

        // FIX 1: If node doesn't exist in hierarchy (Auto-Synced), create it first
        if (nodeIndex === -1) {
            try {
                const doc = await fromUuid(uuid);
                if (doc) {
                    // It was auto-synced, so its parent was the Root
                    hierarchy.push({
                        id: uuid,
                        parentId: this.document.uuid, 
                        name: doc.name,
                        title: this._getTitle(doc), 
                        className: 'standard-node',
                        hidden: hide
                    });
                    nodeIndex = hierarchy.length - 1;
                } else { return; }
            } catch (e) { return; }
        }

        hierarchy[nodeIndex].hidden = hide;
        
        if (hide) {
            const oldParentId = hierarchy[nodeIndex].parentId;
            
            const children = hierarchy.filter(n => n.parentId === uuid);
            
            children.forEach(child => {
                child.parentId = oldParentId;
            });
        } else {
            hierarchy[nodeIndex].parentId = this.document.uuid;
        }
        
        await this.saveData({ hierarchy: hierarchy });
        this.document.sheet.render(true); 
    }


    async _saveViewState(chartDiv) {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
            const currentTransform = chartDiv.style.transform;
            if (currentTransform) {
                await this.saveData({ viewState: currentTransform });
            }
        }, 200);
    }

    async _updateParent(childId, newParentId) {
        const savedData = await this.getData();
        let hierarchy = Array.isArray(savedData?.hierarchy) ? savedData.hierarchy : [];
        
        const nodeIndex = hierarchy.findIndex(n => n.id === childId);
        
        if (nodeIndex > -1) {
            hierarchy[nodeIndex].parentId = newParentId;
        } else {
            try {
                const doc = await fromUuid(childId);
                if (doc) {
                    hierarchy.push({
                        id: childId,
                        parentId: newParentId,
                        name: doc.name,
                        title: this._getTitle(doc), 
                        className: 'standard-node',
                        hidden: false
                    });
                }
            } catch (e) { return; }
        }

        await this.saveData({ hierarchy: hierarchy });
    }

 
}
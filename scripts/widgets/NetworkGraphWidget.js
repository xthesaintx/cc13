import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class NetworkGraphWidget extends CampaignCodexWidget {
    constructor(widgetId, initialData, document) {
        super(widgetId, initialData, document);
        this.currentDepth = 0; 
        this.network = null;
        // Track the current "center" of the graph separately from the sheet document
        this.rootDoc = document; 
    }

    async render() {
        const graphId = `cc-graph-${this.widgetId}`;
        const controlId = `cc-graph-controls-${this.widgetId}`;
        const resetId = `cc-graph-reset-${this.widgetId}`;
        
        return `
        <div class="cc-widget-graph-wrapper" style="border: 1px solid var(--cc-border); border-radius: 4px; overflow: hidden; aspect-ratio: 1" >
            
            <div class="cc-graph-toolbar" style="
                padding: 5px 10px; 
                background: rgba(0, 0, 0, 0.05); 
                border-bottom: 1px solid var(--cc-border);
                display: flex; 
                align-items: center; 
                justify-content: space-between;
                font-size: 0.85em;">
                
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label for="${controlId}-slider" style="font-weight: bold;">Depth:</label>
                    <input type="range" id="${controlId}-slider" min="0" max="3" value="${this.currentDepth}" step="1" style="height: 6px;">
                    <span id="${controlId}-value" style="min-width: 15px; text-align: center;">${this.currentDepth}</span>
                </div>

                <div style="display: flex; gap: 10px; align-items: center;">
                    <i id="${resetId}" class="fas fa-sync-alt" style="cursor: pointer;" title="Reset to Original View"></i> Dbl-Click to Recenter
                    <div style="font-style: italic; opacity: 0.8; border-left: 1px solid #ccc; padding-left: 10px;">
                        <i class="fas fa-mouse"></i> Right-Click Open
                    </div>
                </div>
            </div>

            <div class="cc-widget-graph-container" style="height: 100%; width: 100%; position: relative; background: rgba(255,255,255,0.05);">
                <div id="${graphId}" style="height: 100%; width: 100%;"></div>
                <div id="${graphId}-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; display: none;">
                    <i class="fas fa-spinner fa-spin"></i> Loading...
                </div>
            </div>
        </div>`;
    }

    async activateListeners(htmlElement) {
        super.activateListeners(htmlElement);

        const container = htmlElement.querySelector(`#cc-graph-${this.widgetId}`);
        const slider = htmlElement.querySelector(`#cc-graph-controls-${this.widgetId}-slider`);
        const valDisplay = htmlElement.querySelector(`#cc-graph-controls-${this.widgetId}-value`);
        const loading = htmlElement.querySelector(`#cc-graph-${this.widgetId}-loading`);
        const resetButton = htmlElement.querySelector(`#cc-graph-reset-${this.widgetId}`);

        if (!container || typeof vis === "undefined") {
            if (container) container.innerHTML = `<p style="color:red; padding: 1em;">Error: vis.js library is not loaded.</p>`;
            return;
        }
        
        try {
            const savedData = await this.getData();
            if (savedData && typeof savedData.depth !== 'undefined') {
                this.currentDepth = parseInt(savedData.depth);
                
                // Update UI controls to match saved data
                if (slider) slider.value = this.currentDepth;
                if (valDisplay) valDisplay.textContent = this.currentDepth;
            }
        } catch (err) {
            console.warn("Campaign Codex | Error loading widget data:", err);
        }

        const data = { nodes: [], edges: [] };
        
        const options = {
            nodes: {
                shape: "icon",
                font: { 
                    size: 14, 
                    color: '#000000', 
                    face: 'Signika', 
                    strokeWidth: 3, 
                    strokeColor: '#ffffff' 
                }, 
                shadow: false
            },
            edges: {
                width: 2,
                color: { color: '#A0A0A0', highlight: '#FF4500', opacity: 0.5 },
                smooth: { type: 'continuous', roundness: 0.5 },
                arrows: { to: { enabled: false } }
            },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -80,
                    centralGravity: 0.005,
                    springLength: 150,
                    springConstant: 0.08,
                    damping: 0.4
                },
                stabilization: {
                    enabled: true,
                    iterations: 100,
                    updateInterval: 25
                },
                maxVelocity: 40,
                minVelocity: 0.5,
                timestep: 0.4
            },
            layout: {
                improvedLayout: true,
                randomSeed: 42 
            },
            interaction: { hover: true, zoomView: true, dragView: true }
        };

try {
            this.network = new vis.Network(container, data, options);

            // --- EVENT: Double-Click to RECENTER ---
            this.network.on("doubleClick", async (params) => {
                if (params.nodes.length > 0) {
                    const selectedUuid = params.nodes[0];
                    
                    // Don't reload if we clicked the current center
                    if (selectedUuid === this.rootDoc.uuid) return;

                    try {
                        const newRoot = await fromUuid(selectedUuid);
                        if (newRoot) {
                            this.rootDoc = newRoot; // Update dynamic root
                            await this._updateGraph(this.currentDepth, loading);
                            
                            // Animate focus to the new center
                            this.network.focus(selectedUuid, {
                                scale: 1.0,
                                animation: { duration: 1000, easingFunction: "easeInOutQuad" }
                            });
                        }
                    } catch (err) {
                        console.warn("Campaign Codex | Could not focus node:", err);
                    }
                }
            });

            // --- EVENT: Right-Click (oncontext) to OPEN ---
            this.network.on("oncontext", (params) => {
                // Stop standard browser menu
                params.event.preventDefault();

                // Get node at right-click position
                const selectedUuid = this.network.getNodeAt(params.pointer.DOM);

                if (selectedUuid) {
                    this._onOpenDocument(selectedUuid, "Linked Document");
                }
            });

            // --- EVENT: Reset Button ---
            if (resetButton) {
                resetButton.addEventListener("click", async () => {
                    this.rootDoc = this.document; // Reset to original doc
                    await this._updateGraph(this.currentDepth, loading);
                    this.network.fit({ animation: true }); // Fit all nodes
                });
            }

            // --- Initial Load ---
            await this._updateGraph(this.currentDepth, loading);

            // --- Slider Control ---
            if (slider) {
                slider.addEventListener("change", async (ev) => {
                    const newDepth = parseInt(ev.target.value);
                    this.currentDepth = newDepth;
                    if (valDisplay) valDisplay.textContent = newDepth;
                    await this._updateGraph(newDepth, loading);
                    if (this.isGM) this.saveData({ depth: newDepth });
                });

                slider.addEventListener("input", (ev) => {
                     if (valDisplay) valDisplay.textContent = ev.target.value;
                });
            }
        } catch (error) {
            console.error("Campaign Codex | Error initializing Network Widget:", error);
            container.innerHTML = `<p style="color:red; padding:1em;">Graph Error: ${error.message}</p>`;
        }
    }

    async _updateGraph(userDepth, loadingEl) {
        if (loadingEl) loadingEl.style.display = "block";
        
        try {
            const maxHops = userDepth + 1;
            const { nodes, edges } = await this._buildGraphData(maxHops);

            if (this.network) {
                this.network.setData({
                    nodes: nodes,
                    edges: edges
                });
            }
        } catch (error) {
            console.error("Campaign Codex | Graph Update Error:", error);
        } finally {
            if (loadingEl) loadingEl.style.display = "none";
        }
    }

    async _buildGraphData(maxHops) {
        const visited = new Set();
        const nodes = [];
        const edges = [];
        const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

        // Use the dynamic rootDoc instead of the static this.document
        const queue = [{ doc: this.rootDoc, depth: 0 }];

        visited.add(this.rootDoc.uuid);
        
        // Create the root node (it will always be "isCenter = true")
        nodes.push(this._createNode(this.rootDoc, true));

        while (queue.length > 0) {
            const { doc, depth } = queue.shift();

            const linkedUuids = this._extractLinks(doc);

            for (const targetUuid of linkedUuids) {
                if (!targetUuid || typeof targetUuid !== "string") continue;

                const isVisited = visited.has(targetUuid);


                if (isVisited) {
                    this._addEdge(edges, doc.uuid, targetUuid);
                } else {
                    if (depth < maxHops) {
                        try {
                            const targetDoc = await fromUuid(targetUuid);
                            const canView = targetDoc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);

                            if (targetDoc && (!hideByPermission || canView)) {
                                visited.add(targetUuid);
                                nodes.push(this._createNode(targetDoc, false));
                                this._addEdge(edges, doc.uuid, targetUuid);
                                
                                if (depth + 1 < maxHops) {
                                    queue.push({ doc: targetDoc, depth: depth + 1 });
                                }
                            }
                        } catch (err) { }
                    }
                }
            }
        }

        return { nodes, edges };
    }

    _addEdge(edgesArray, fromUuid, toUuid) {
        const id = [fromUuid, toUuid].sort().join("-");
        if (!edgesArray.find(e => e.id === id)) {
            edgesArray.push({ from: fromUuid, to: toUuid, id });
        }
    }

    _createNode(doc, isCenter) {
        const type = doc.getFlag("campaign-codex", "type") || "default";
        const isTag = doc.getFlag("campaign-codex", "data.tagMode");
        
        const iconMap = {
            group:   { code: '\uf0e8', color: '#d4af37' }, // fas fa-globe
            region:   { code: '\uf0ac', color: '#d4af37' }, // fas fa-globe
            location: { code: '\uf3c5', color: '#d4af37' }, // fas fa-map-marker-alt
            shop:     { code: '\uf015', color: '#d4af37' }, // fas fa-house
            npc:      { code: '\uf007', color: '#d4af37' }, // fas fa-user
            tag:      { code: '\uf02b', color: '#d4af37' }, // fas fa-tag
            default:  { code: '\uf15b', color: '#d4af37' }  // fas fa-file-alt
        };

        const config = isTag ? iconMap.tag : (iconMap[type] || iconMap.default);
        
        // Center node gets Highlight Color (Orange), others get Type Color
        const finalColor = isCenter ? "#2a2a2a" : config.color;

        return {
            id: doc.uuid,
            label: doc.name,
            shape: "icon",
            icon: {
                face: "'Font Awesome 6 Pro'",
                weight: 900,
                code: config.code,
                size: isCenter ? 50 : 30, // Make center node larger
                color: finalColor,
            }
        };
    }

    _extractLinks(doc) {
        const data = doc.getFlag("campaign-codex", "data") || {};
        const links = new Set();

        const arrayFields = ["linkedShops", "linkedNPCs", "linkedLocations", "linkedRegions", "associates", "members"];
        arrayFields.forEach(field => {
            if (Array.isArray(data[field])) {
                data[field].forEach(uuid => links.add(uuid));
            }
        });

        if (data.parentRegion) links.add(data.parentRegion);
        // if (data.linkedActor) links.add(data.linkedActor);
        if (data.linkedLocation) links.add(data.linkedLocation);

        return Array.from(links);
    }
}
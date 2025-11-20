import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { TemplateComponents } from "../sheets/template-components.js";

export class WorldMapWidget extends CampaignCodexWidget {
    constructor(widgetId, initialData, document) {
        super(widgetId, initialData, document);
        this.map = null;
        this.mapLayer = null;
        this.markers = new Map();
        this.widgetData = null;
        this._bounds = [[50,50],[1080, 1920]];
        this._mapImage = "modules/campaign-codex/ui/map.webp"
        this._initialLoad = false;
    }

    async render() {
        return `
            <div class="cc-widget world-map-widget">
                <div id="map-${this.widgetId}" class="map-container"></div>
                ${
                    this.isGM
                        ? `<div class="widget-controls">
                                <button type="button" class="select-map-image"><i class="fas fa-image"></i> Select Map</button>
                                <span style="display: flex; gap: 8px;">
                        <button type="button" class="center-map"><i class="fas fa-expand"></i> Center Map</button>
                                <button type="button" class="add-manual-pin"><i class="fas fa-map-pin"></i> Add Pin</button></span>
                              </div>`
                        : ""
                }
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        super.activateListeners(htmlElement);
        const defaultData = {
            mapImage: null,
            pins: [],
            dimensions: null 
        };
        this.widgetData = foundry.utils.mergeObject(defaultData, (await this.getData()) || {});
        if (this.widgetData.mapImage){this._mapImage = this.widgetData.mapImage}
        if (this.widgetData.dimensions) {
            const { width, height } = this.widgetData.dimensions;
            this._bounds = [
                [50, 50],
                [height, width],
            ];
        } 

        const mapContainer = htmlElement.querySelector(`#map-${this.widgetId}`);
        if (!mapContainer) {
            console.error(`Campaign Codex | Map container not found for widget ${this.widgetId}`);
            return;
        }

        if (this.map && this._initialLoad) {
            mapContainer.appendChild(this.map.getContainer());
            if (this.isGM) {
                this._attachGMListeners(htmlElement); 
            }

            const parentSheet = htmlElement.closest("form.application");
            const widgetTabButton = parentSheet?.querySelector('.sidebar-tabs .tab-item[data-tab="widgets"]');
            
            widgetTabButton?.addEventListener("click", () => {
                setTimeout(() => this.map?.invalidateSize(), 100);
            });


            setTimeout(() => this.map?.invalidateSize(), 100);
            return; 
        }

        this.map = L.map(mapContainer, {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 4,
            center:[this._bounds[1][0]/2,this._bounds[1][1]/2],
            zoom: -3,
            scrollWheelZoom: true,
            doubleClickZoom: false,
            maxBounds: this._bounds,
        });
        this.mapLayer = L.imageOverlay(this._mapImage, this._bounds).addTo(this.map);
        this.mapLayer.addTo(this.map);
        await this._loadPins();
        this._initialLoad = true;


        const parentSheet = htmlElement.closest("form.application");
        const widgetTabButton = parentSheet?.querySelector('.sidebar-tabs .tab-item[data-tab="widgets"], .selected-sheet-tab[data-tab="widgets"], .group-tab[data-tab="widgets"]');

        if (widgetTabButton) {
            widgetTabButton.addEventListener("click", () => {
                setTimeout(() => this.map?.invalidateSize(), 100);
         });
        }

        const parentTabPanel = htmlElement.closest(".tab-panel");
        if (parentTabPanel?.classList.contains("active")) {
            setTimeout(() => {
                this.map?.invalidateSize();
                this.map?.fitBounds(this._bounds);
            }, 100);
        } else {
            this.map.fitBounds(this._bounds);
        }

        if (this.isGM) {
            this._attachGMListeners(htmlElement, mapContainer);
        }
     }

    /**
     * NEW HELPER METHOD
     * Attaches GM-specific listeners to the widget's HTML elements.
     * This is separated so it can be called on re-renders.
     */
    _attachGMListeners(htmlElement, mapContainer = null) {
        htmlElement
            .querySelector(".center-map")
            ?.addEventListener("click", async (event) => {
                this.map?.invalidateSize();
                this.map.fitBounds(this._bounds);
            });
        htmlElement
            .querySelector(".select-map-image")
            ?.addEventListener("click", this._onSelectMapImage.bind(this));
        htmlElement.querySelector(".add-manual-pin")?.addEventListener("click", this._onAddManualPin.bind(this));
        this.map.on('moveend', () => this._saveViewState());
        this.map.on('zoomend', () => this._saveViewState());
        if (mapContainer) { 
            mapContainer.addEventListener("drop", this._onDrop.bind(this));
        }
    }

_saveViewState(){

}
    _getImageDimensions(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    reject(new Error(`Image loaded but has zero dimensions: ${path}`));
                } else {
                    resolve({ width: img.naturalWidth, height: img.naturalHeight });
                }
            };
            img.onerror = (err) => {
                reject(err);
            };
            img.src = path;
        });
    }


    async _loadMapImage() {
        const imagePath = this._mapImage;
        if (!imagePath || typeof imagePath !== "string" || imagePath.trim() === "") {
            return;
        }
        const { width, height } = await this._getImageDimensions(imagePath);
        this.widgetData.dimensions = { width, height };
        this._bounds = [
                    [50, 50],
                    [height, width],
                ];
        this._initialLoad = false;
    }


    _loadPins() {
        this.markers.forEach((marker) => this.map.removeLayer(marker));
        this.markers.clear();

        (this.widgetData.pins || []).forEach((pin) => {
            this._createMarker(pin);
        });
    }

    _getPinIcon(entityType) {
        const ASSET_MAP = [
          { key: "default", label: "Default", icon: "fas fa-map-pin" },
          { key: "region", label: "Region", icon: "fas fa-globe" },
          { key: "location", label: "Location", icon: "fas fa-map-marker-alt" },
          { key: "shop", label: "Shop", icon: "fas fa-house" },
          { key: "npc", label: "NPC", icon: "fas fa-user" },
          { key: "item", label: "Item", icon: "fas fa-box" },
          { key: "group", label: "Group", icon: "fas fa-sitemap" },
          { key: "tag", label: "Tag", icon: "fas fa-tag" },
          { key: "flask", label: "Flask", icon: "fas fa-flask" },
          { key: "quest", label: "Quest", icon: "fas fa-scroll" },
          { key: "dungeon", label: "Dungeon", icon: "fas fa-dungeon" },
          { key: "treasure", label: "Treasure", icon: "fas fa-gem" },
          { key: "tavern", label: "Tavern", icon: "fas fa-beer" },
          { key: "temple", label: "Temple", icon: "fas fa-place-of-worship" },
          { key: "castle", label: "Castle", icon: "fas fa-chess-rook" },
          { key: "camp", label: "Camp", icon: "fas fa-campground" },
          { key: "danger", label: "Danger", icon: "fas fa-skull-crossbones" },
          { key: "magic", label: "Magic", icon: "fas fa-magic" },
          { key: "portal", label: "Portal", icon: "fas fa-portal-enter" },
          { key: "village", label: "Village", icon: "fas fa-home" },
          { key: "forest", label: "Forest", icon: "fas fa-tree" },
          { key: "mountain", label: "Mountain", icon: "fas fa-mountain" }
        ];

        const entry = ASSET_MAP.find(item => item.key === entityType);

        if (entry) {
          return entry.icon;
        }

        return ASSET_MAP.find(item => item.key === "default").icon;
      }



    _createMarker(pinData) {
        if (!pinData || typeof pinData.lat !== "number" || typeof pinData.lng !== "number") {
            console.warn("Campaign Codex | Invalid pin data:", pinData);
            return;
        }

        const isVisibleToPlayers = pinData.visibleToPlayers !== false; // Default to true if not set
        if (!isVisibleToPlayers && !this.isGM) {
            return; 
        }
    
        const journalType = pinData.journalType || "default";
        const iconClass = this._getPinIcon(journalType) || "fas fa-map-pin";
        const customColor = pinData.customColor || "";
        const backgroundColor = pinData.backgroundColor || "";
        const iconStyle = customColor ? `color: ${customColor};` : "";
        const pinBackgroundStyle = backgroundColor ? `background-color: ${backgroundColor} !important;` : "";

        const isGMOnlyPin = !isVisibleToPlayers && this.isGM;
        const transparencyStyle = isGMOnlyPin ? "opacity: 0.5;" : "";
        const gmOnlyIndicator = isGMOnlyPin ? ' (GM Only)' : '';
        
        let noteHtml = '';
        if (pinData.note && pinData.note.trim()) {
            const sanitizeOptions = {
                ALLOWED_TAGS: [
                    'b', 'i', 'u', 'br', 'strong', 'em',
                    'h1', 'h2', 'h3', 'img'
                ],
                ALLOWED_ATTR: ['src'] 
            };
            const processedNote = foundry.utils.cleanHTML(pinData.note, sanitizeOptions);
            noteHtml = `<div class="pin-note">${processedNote}</div>`;
        }

        const hasNote = pinData.note && pinData.note.trim();
        const pinHtml = `
            <div class="cc-map-pin-wrapper" style="${transparencyStyle}">
                <div class="cc-map-pin-icon cc-pin-type-${journalType}" style="${pinBackgroundStyle}" data-uuid="${pinData.journalUuid || ''}">
                    <i class="${iconClass}" style="${iconStyle}" data-uuid="${pinData.journalUuid || ''}"></i>
                </div>
                <div class="cc-map-pin-label${hasNote ? ' has-note' : ''}">
                    <div class="pin-header">
                        <span class="pin-name" data-uuid="${pinData.journalUuid || ''}">${foundry.utils.escapeHTML(pinData.name || "Unnamed Pin")}${gmOnlyIndicator}</span>
                        ${this.isGM ? `
                            <a class="pin-delete" title="Delete Pin"><i class="fas fa-trash"></i></a>
                        ` : ''}
                    </div>
                   <div class="pin-note">${noteHtml}</div>
                </div>
            </div>
        `;

        const divIcon = L.divIcon({
            className: "cc-map-pin-container", 
            html: pinHtml,
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
        });

        const marker = L.marker([pinData.lat, pinData.lng], {
            icon: divIcon,
            draggable: this.isGM,
            autoPan: false, 
        }).addTo(this.map);

       marker.cc_pinData = pinData; 
       marker._isDragging = false;
       if (marker._icon) {
            L.DomEvent.disableClickPropagation(marker._icon);
            L.DomEvent.on(marker._icon, "mousedown dblclick", L.DomEvent.stopPropagation);
            L.DomEvent.on(marker._icon, "contextmenu", (event) => {
                event.preventDefault();
                this._editPinName(pinData.id);
            }, this);
             L.DomEvent.on(marker._icon, "click", (event) => {
                 L.DomEvent.stopPropagation(event); 
                     if (marker._isDragging) {
                         return; 
                     }
                     const target = event.target;
                     const uuid = target.dataset.uuid;
                     if (this.isGM && target.closest(".pin-delete")) {
                       this.confirmationDialog(`Are you sure you want to delete the pin "${pinData.name}"?`).then(
                         (proceed) => {
                             if (proceed) {
                                 this._removePinData(pinData.id);
                             }
                         },
                     );
                     } else {
                         if (uuid) {
                             this._onOpenDocument(uuid, "Journal");
                         }
                     }
             }, this);
        }

        if (this.isGM) {
            marker.on('dragstart', () => {
                marker._isDragging = true;
             });
             marker.on('dragend', (event) => {
                 this._onMarkerDragEnd(event, marker);
                 setTimeout(() => {
                     marker._isDragging = false;
                   }, 0); 
             });
        }
 
        this.markers.set(pinData.id, marker);
        return marker;
    }

    _findPinDataById(pinId) {
        return this.widgetData.pins.find((p) => p.id === pinId);
    }

    async _updatePinData(pinId, updates) {
        const pinIndex = this.widgetData.pins.findIndex((p) => p.id === pinId);
        if (pinIndex !== -1) {
            this.widgetData.pins[pinIndex] = { ...this.widgetData.pins[pinIndex], ...updates };
            const marker = this.markers.get(pinId);
            if (marker) {
                marker.cc_pinData = this.widgetData.pins[pinIndex]; 
                
                
                marker.setLatLng([this.widgetData.pins[pinIndex].lat, this.widgetData.pins[pinIndex].lng]);

                if (marker._icon) {
                    const nameSpan = marker._icon.querySelector('.pin-name');
                    if (nameSpan) {
                        nameSpan.textContent = this.widgetData.pins[pinIndex].name || "Unnamed Pin";
                        nameSpan.dataset.uuid = this.widgetData.pins[pinIndex].journalUuid || '';
                    }

                }
            }
            await this.saveData(this.widgetData);
            return true;
        }
        return false;
    }

    /**
     * Refreshes a marker's appearance by recreating it with updated pin data
     * @param {string} pinId - The pin ID to refresh
     */
    _refreshMarker(pinId) {
        const pinData = this._findPinDataById(pinId);
        if (!pinData) return;

        // Remove the old marker
        const oldMarker = this.markers.get(pinId);
        if (oldMarker) {
            this.map.removeLayer(oldMarker);
            this.markers.delete(pinId);
        }

        // Create a new marker with updated appearance
        this._createMarker(pinData);
    }


    async _removePinData(pinId) {
        const initialLength = this.widgetData.pins.length;
        this.widgetData.pins = this.widgetData.pins.filter((p) => p.id !== pinId);
        if (this.widgetData.pins.length < initialLength) {
            const marker = this.markers.get(pinId);
            if (marker) {
                this.map.removeLayer(marker);
                this.markers.delete(pinId);
            }
            await this.saveData(this.widgetData);
            return true;
        }
        return false;
    }

    async _onSelectMapImage(event) {
        event.preventDefault();
        const currentImage = this.widgetData.mapImage;

        new foundry.applications.apps.FilePicker.implementation({
            type: "image",
            current: currentImage,
            callback: async (path) => {
                this._mapImage = path;
                this.widgetData.mapImage = path;
                await this._loadMapImage();
                await this.saveData(this.widgetData);
            },
        }).browse();
    }

    async _onAddManualPin(event) {
        event?.preventDefault();
        if (!this.isGM) return;

        const center = this.map.getCenter();
        this._addPinAtPoint(center, "New Manual Pin");
    }

    async _addPinAtPoint(latlng, defaultName = "New Pin", journalUuid = null, journalType = "default") {
        const newPin = {
            id: foundry.utils.randomID(),
            name: defaultName,
            lat: latlng.lat,
            lng: latlng.lng,
            journalUuid: journalUuid,
            journalType: journalType,
            visibleToPlayers: true, // Default to visible
        };
        this.widgetData.pins.push(newPin);
        this._createMarker(newPin);
        await this.saveData(this.widgetData);
    }

    _onMarkerDragEnd(event, marker) {
        const newLatLng = marker.getLatLng();
        this._updatePinData(marker.cc_pinData.id, { lat: newLatLng.lat, lng: newLatLng.lng });
    }

 
    async _linkJournal(pinId) {
        ui.notifications.info("Drag and drop a Journal Entry onto the pin marker to link it.");
    }

    async _unlinkJournal(pinId) {
        await this._updatePinData(pinId, { journalUuid: null });
        ui.notifications.info("Journal unlinked from pin.");
    }
    async _editPinName(pinId) {
        const pinData = this._findPinDataById(pinId);
        if (!pinData) return;

        // Get available pin types from TemplateComponents
        const pinTypes = [
            { key: "default", label: "Default", icon: "fas fa-map-pin" },
            { key: "region", label: "Region", icon: "fas fa-globe" },
            { key: "location", label: "Location", icon: "fas fa-map-marker-alt" },
            { key: "shop", label: "Shop", icon: "fas fa-house" },
            { key: "npc", label: "NPC", icon: "fas fa-user" },
            { key: "item", label: "Item", icon: "fas fa-box" },
            { key: "group", label: "Group", icon: "fas fa-sitemap" },
            { key: "tag", label: "Tag", icon: "fas fa-tag" },
            { key: "flask", label: "Flask", icon: "fas fa-flask" },
            { key: "quest", label: "Quest", icon: "fas fa-scroll" },
            { key: "dungeon", label: "Dungeon", icon: "fas fa-dungeon" },
            { key: "treasure", label: "Treasure", icon: "fas fa-gem" },
            { key: "tavern", label: "Tavern", icon: "fas fa-beer" },
            { key: "temple", label: "Temple", icon: "fas fa-place-of-worship" },
            { key: "castle", label: "Castle", icon: "fas fa-chess-rook" },
            { key: "camp", label: "Camp", icon: "fas fa-campground" },
            { key: "danger", label: "Danger", icon: "fas fa-skull-crossbones" },
            { key: "magic", label: "Magic", icon: "fas fa-magic" },
            { key: "portal", label: "Portal", icon: "fas fa-portal-enter" },
            { key: "village", label: "Village", icon: "fas fa-home" },
            { key: "forest", label: "Forest", icon: "fas fa-tree" },
            { key: "mountain", label: "Mountain", icon: "fas fa-mountain" }
        ];

        const currentType = pinData.journalType || "default";
        const currentColor = pinData.customColor || "#d4af37";
        const currentBackgroundColor = pinData.backgroundColor || "#2a2a2a";
        
        const pinTypeOptions = pinTypes.map(type => 
            `<option value="${type.key}" ${type.key === currentType ? 'selected' : ''}>
                ${type.label}
            </option>`
        ).join("");

        const previewPinBackgroundStyle = currentBackgroundColor ? `background-color: ${currentBackgroundColor};` : "";
        
        const content = `
            <div class="form-group">
                <label>Pin Name:</label>
                <input type="text" name="pinName" value="${foundry.utils.escapeHTML(pinData.name || "")}" autofocus/>
            </div>
            <div class="form-group">
                <label>Pin Note:</label>
                <textarea name="pinNote" placeholder="Optional note that appears in tooltip (supports HTML markup)" style="width: 100%; height: 80px; padding: 4px; resize: vertical; font-family: inherit;">${foundry.utils.escapeHTML(pinData.note || "")}</textarea>
            </div>
            <div class="form-group">
                <label>Pin Type:</label>
                <select name="pinType" id="pinTypeSelect">
                    ${pinTypeOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Icon:</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="color" name="pinColor" id="pinColorPicker" value="${currentColor}" style="width: 50px; height: 30px; border: none; border-radius: 4px; cursor: pointer;"/>
                    <button type="button" id="resetColor" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Reset</button>
                </div>
            </div>
            <div class="form-group">
                <label>Background:</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="color" name="backgroundColor" id="backgroundColorPicker" value="${currentBackgroundColor}" style="width: 50px; height: 30px; border: none; border-radius: 4px; cursor: pointer;"/>
                    <button type="button" id="resetBackground" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Reset</button>
                </div>
            </div>
            <div class="form-group">
                <label>Visibility:</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" name="visibleToPlayers" id="visibleToPlayersCheckbox" ${pinData.visibleToPlayers !== false ? 'checked' : ''} style="margin-right: 4px;"/>
                    <label for="visibleToPlayersCheckbox" style="margin: 0; font-weight: normal;">Visible to Players</label>
                </div>
            </div>
            <div class="form-group">
                <label>Preview:</label>
                <div id="pinPreview" style="display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 4px;">
                    <div id="previewPinContainer" class="cc-pin-type-${currentType}" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; ${previewPinBackgroundStyle}">
                        <i id="previewIcon" class="${this._getPinIcon(currentType)}" style="font-size: 1.2em; color: ${currentColor};"></i>
                    </div>
                    <span id="previewName" style="font-weight: bold;">${foundry.utils.escapeHTML(pinData.name || "Unnamed Pin")}</span>
                </div>
            </div>
            <style>
                .form-group { margin-bottom: 12px; }
                .form-group label { display: block; margin-bottom: 4px; font-weight: bold; }
                .form-group input, .form-group select { width: 100%; padding: 4px; }
            </style>
        `;

        const result = await new Promise((resolve) => {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: "Edit Pin" },
                content: content,
                rejectClose: false,
                buttons: [{
                    action: "save",
                    label: "Save",
                    default: true,
                    callback: (event, button) => {
                        const newName = button.form.elements.pinName.value.trim() || pinData.name || "Unnamed Pin";
                        const newNote = button.form.elements.pinNote.value.trim() || "";
                        const newType = button.form.elements.pinType.value || "default";
                        const newColor = button.form.elements.pinColor.value || "";
                        const newBackgroundColor = button.form.elements.backgroundColor.value || "";
                        const newVisibleToPlayers = button.form.elements.visibleToPlayers.checked;
                        resolve({ name: newName, note: newNote, type: newType, color: newColor, backgroundColor: newBackgroundColor, visibleToPlayers: newVisibleToPlayers });
                    }
                }, {
                    action: "cancel",
                    label: "Cancel",
                    callback: () => resolve(null)
                }]
            });

            // Set up the preview functionality after dialog renders
            dialog.addEventListener("render", () => {
                const nameInput = dialog.element.querySelector('input[name="pinName"]');
                const typeSelect = dialog.element.querySelector('select[name="pinType"]');
                const colorPicker = dialog.element.querySelector('input[name="pinColor"]');
                const backgroundColorPicker = dialog.element.querySelector('input[name="backgroundColor"]');
                const visibilityCheckbox = dialog.element.querySelector('input[name="visibleToPlayers"]');
                const resetButton = dialog.element.querySelector('#resetColor');
                const resetBackgroundButton = dialog.element.querySelector('#resetBackground');
                const previewIcon = dialog.element.querySelector('#previewIcon');
                const previewPinContainer = dialog.element.querySelector('#previewPinContainer');
                const previewName = dialog.element.querySelector('#previewName');
                
                const iconMap = {
                    default: "fas fa-map-pin",
                    region: "fas fa-globe", 
                    location: "fas fa-map-marker-alt",
                    shop: "fas fa-store",
                    npc: "fas fa-user",
                    item: "fas fa-box",
                    group: "fas fa-sitemap",
                    tag: "fas fa-tag",
                    flask: "fas fa-flask",
                    quest: "fas fa-scroll",
                    dungeon: "fas fa-door-closed",
                    treasure: "fas fa-gem",
                    tavern: "fas fa-wine-glass",
                    temple: "fas fa-church",
                    castle: "fas fa-chess-rook",
                    camp: "fas fa-campground",
                    danger: "fas fa-skull-crossbones",
                    magic: "fas fa-magic",
                    portal: "fas fa-circle",
                    village: "fas fa-home",
                    forest: "fas fa-tree",
                    mountain: "fas fa-mountain"
                };
                
                function updatePreview() {
                    const selectedType = typeSelect.value;
                    const nameValue = nameInput.value.trim() || "Unnamed Pin";
                    const selectedColor = colorPicker.value;
                    const selectedBackgroundColor = backgroundColorPicker.value;
                    const isVisibleToPlayers = visibilityCheckbox.checked;
                    
                    // Update icon
                    previewIcon.className = iconMap[selectedType] || iconMap.default;
                    previewIcon.style.color = selectedColor;
                    
                    // Update pin container class and background
                    previewPinContainer.className = `cc-pin-type-${selectedType}`;
                    if (selectedBackgroundColor) {
                        previewPinContainer.style.backgroundColor = selectedBackgroundColor;
                    } else {
                        previewPinContainer.style.backgroundColor = "";
                    }
                    
                    // Apply transparency for GM-only pins
                    if (!isVisibleToPlayers) {
                        previewPinContainer.style.opacity = "0.5";
                        if (previewName) previewName.textContent = nameValue + " (GM Only)";
                    } else {
                        previewPinContainer.style.opacity = "1";
                        if (previewName) previewName.textContent = nameValue;
                    }
                }
                
                // Reset color to default black
                resetButton.addEventListener('click', () => {
                    colorPicker.value = "#000000";
                    updatePreview();
                });
                
                // Reset background color (clear it)
                resetBackgroundButton.addEventListener('click', () => {
                    backgroundColorPicker.value = "#000000";
                    backgroundColorPicker.value = ""; // Clear the background
                    updatePreview();
                });
                
                nameInput.addEventListener('input', updatePreview);
                typeSelect.addEventListener('change', updatePreview);
                colorPicker.addEventListener('input', updatePreview);
                backgroundColorPicker.addEventListener('input', updatePreview);
                visibilityCheckbox.addEventListener('change', updatePreview);
            });

            dialog.render(true);
        });

        if (result !== null && (result.name !== pinData.name || result.note !== (pinData.note || "") || result.type !== (pinData.journalType || "default") || result.color !== (pinData.customColor || "") || result.backgroundColor !== (pinData.backgroundColor || "") || result.visibleToPlayers !== (pinData.visibleToPlayers !== false))) {
            await this._updatePinData(pinId, { 
                name: result.name,
                note: result.note,
                journalType: result.type,
                customColor: result.color,
                backgroundColor: result.backgroundColor,
                visibleToPlayers: result.visibleToPlayers
            });
            this._refreshMarker(pinId);
            // Save the current map view state to prevent zoom/pan jumps
            // await this._saveViewState();
        }
    }
    _onDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "link";
        event.currentTarget.classList.add("drag-over");
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove("drag-over");

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            console.warn("Campaign Codex | Failed to parse drop data.");
            return;
        }
        if (data.type !== "JournalEntry" && data.type !== "JournalEntryPage") {
            ui.notifications.warn("Only Journal Entries and Journal Entry Pages can be dropped onto the map.");
            return;
        }

        const document = await fromUuid(data.uuid);
        if (!document) {
            ui.notifications.error("Could not find the dropped document.");
            return;
        }

        let journalType, documentName, documentUuid;
        
        if (data.type === "JournalEntryPage") {
            // For journal pages, use the page's UUID and name, but get journal type from parent
            journalType = document.parent.getFlag("campaign-codex", "type") || "default";
            documentName = document.name;
            documentUuid = document.uuid;
        } else {
            // For journal entries, use the journal's UUID, name, and type
            journalType = document.getFlag("campaign-codex", "type") || "default";
            documentName = document.name;
            documentUuid = document.uuid;
        }

        const mapContainer = event.currentTarget;
        const point = this.map.mouseEventToContainerPoint(event);
        const latlng = this.map.containerPointToLatLng(point);

        await this._addPinAtPoint(latlng, documentName, documentUuid, journalType); 
        ui.notifications.info(`Added pin for "${documentName}".`);
    }
    async close() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        await this.saveData(this.widgetData);
        await super.close();
    }
}
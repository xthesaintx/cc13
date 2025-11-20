import { WorldMapWidget } from "./WorldMapWidget.js"; 
import { NetworkGraphWidget } from "./NetworkGraphWidget.js"; 
import { OrgChartWidget } from "./OrgChartWidget.js";

class WidgetManager {
    constructor() {
        this.widgetRegistry = new Map();
        this.widgetInstances = new Map();
        this._registerDefaultWidgets();
    }

    _registerDefaultWidgets() {
        this.registerWidget("worldMap", WorldMapWidget);
        this.registerWidget("networkGraph", NetworkGraphWidget);
        this.registerWidget("orgChart", OrgChartWidget);
        // Register other widget types here later
    }

    /**
     * Registers a widget class for a given type string.
     * @param {string} widgetType - The identifier used in the tag (e.g., "worldMap").
     * @param {typeof CampaignCodexWidget} widgetClass - The class constructor for the widget.
     */
    registerWidget(widgetType, widgetClass) {
        if (this.widgetRegistry.has(widgetType)) {
            console.warn(`Campaign Codex | Widget type "${widgetType}" is already registered. Overwriting.`);
        }
        this.widgetRegistry.set(widgetType, widgetClass);
        console.log(`Campaign Codex | Registered widget type: ${widgetType}`);
    }

/**
 * Loads active widgets from the document's flags.
 * Instantiates them and returns a single, joined HTML string of their placeholders.
 *
 * @param {Document} document - The document (e.g., JournalEntryPage) to load widgets for.
 * @returns {string} A single HTML string of all widget placeholders or error messages.
 */
instantiateActiveWidgets(document) {
  const widgetHtmls = [];
  const sheetWidgets = document.getFlag("campaign-codex", "sheet-widgets") || [];
  const activeWidgets = sheetWidgets.filter(w => w.active === true);

  for (const widgetData of activeWidgets) {
    const { id: widgetId, widgetName } = widgetData; 
    
    try {
      const widgetNameLower = widgetName.toLowerCase();
      let canonicalName = null;
      for (const key of this.widgetRegistry.keys()) {
        if (key.toLowerCase() === widgetNameLower) {
          canonicalName = key; 
          break;
        }
      }
      if (!canonicalName) {
        console.warn(`Campaign Codex | Document [${document.id}] has an active widget with unknown type: ${widgetName} (ID: ${widgetId})`);
        continue;
      }

      if (this.widgetInstances.has(widgetId)) {
        widgetHtmls.push(
          `<div class="cc-widget-container" data-widget-type="${canonicalName}" data-widget-id="${widgetId}"></div>`
        );
        continue;
      }
      const WidgetClass = this.widgetRegistry.get(canonicalName);
      const widgetInstance = new WidgetClass(widgetId, widgetData, document);
      this.widgetInstances.set(widgetId, widgetInstance);
      
      widgetHtmls.push(
        `<div class="cc-widget-container" data-widget-type="${canonicalName}" data-widget-id="${widgetId}"></div>`
      );
    } catch (error) {
      console.error(`Campaign Codex | Error instantiating widget ${widgetName} (ID: ${widgetId}):`, error);
      widgetHtmls.push(
        `<p style="color: red; font-weight: bold;">[Error Loading CC Widget: ${widgetName} id=${widgetId}]</p>`
      );
    }
  }
  return widgetHtmls.join("");
}


    /**
     * Renders a specific widget into its container and activates its listeners.
     * Should be called after the main sheet HTML is in the DOM.
     * @param {HTMLElement} containerElement - The placeholder div element.
     */
    async renderAndActivateWidget(containerElement) {
        const widgetId = containerElement.dataset.widgetId;
        const widgetInstance = this.widgetInstances.get(widgetId);


        if (!widgetInstance) {
            console.error(`Campaign Codex | Widget instance not found for ID: ${widgetId}`);
            containerElement.innerHTML = `<p style="color: red; font-weight: bold;">[Widget Load Error]</p>`;
            return;
        }

        try {
            const widgetHtml = await widgetInstance.render();
            containerElement.innerHTML = widgetHtml;
            await widgetInstance.activateListeners(containerElement.firstElementChild);
        } catch (error) {
            console.error(
                `Campaign Codex | Error rendering or activating widget ${widgetInstance.widgetType} (ID: ${widgetId}):`,
                error,
            );
            containerElement.innerHTML = `<p style="color: red; font-weight: bold;">[Widget Render Error]</p>`;
        } 
        // finally {
        //     this.widgetInstances.delete(widgetId);
        // }
    }

    /**
     * Clears any remaining widget instances (e.g., if rendering failed).
     */
    clearTemporaryInstances() {
        if (this.widgetInstances.size > 0) {
            console.warn(`Campaign Codex | Clearing ${this.widgetInstances.size} unactivated widget instances.`);
            this.widgetInstances.clear();
        }
    }
}

// Create a singleton instance
export const widgetManager = new WidgetManager();


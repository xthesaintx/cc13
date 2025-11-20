/**
 * Base class for all Campaign Codex widgets.
 */
export class CampaignCodexWidget {
    /**
     * @param {string} widgetId - A unique identifier for this specific widget instance.
     * @param {object} initialData - Data potentially passed from the widget tag (e.g., for initial setup).
     * @param {Document} document - The Journal Entry document this widget belongs to.
     */
    constructor(widgetId, initialData, document) {
        if (!widgetId || !document) {
            throw new Error("Campaign Codex Widget requires a widgetId and document.");
        }
        this.widgetId = widgetId;
        this.initialData = initialData;
        this.document = document;
        this.widgetType = this.constructor.name.replace('Widget', '').toLowerCase(); // e.g., 'worldmap'
    }

    /**
     * Returns the HTML structure for the widget.
     * Should be overridden by subclasses.
     * @returns {Promise<string>} HTML string.
     */
    async render() {
        throw new Error("Widget subclass must implement render()");
    }

    /**
     * Activates event listeners for the widget's HTML.
     * Should be overridden by subclasses.
     * @param {HTMLElement} htmlElement - The widget's container element in the DOM.
     */
    async activateListeners(htmlElement) {
        // console.log(`Campaign Codex | Activating listeners for ${this.widgetType} widget (ID: ${this.widgetId})`);
    }

    /**
     * Retrieves the saved data for this specific widget instance from the document flags.
     * @returns {Promise<object | null>} The widget's data, or null if none exists.
     */
    async getData() {
        try {
            return await this.document.getFlag("campaign-codex", `data.widgets.${this.widgetType}.${this.widgetId}`);
        } catch (error) {
            console.error(`Campaign Codex | Error getting data for widget ${this.widgetType} (ID: ${this.widgetId}):`, error);
            return null;
        }
    }

    /**
     * Saves data for this specific widget instance to the document flags
     * without triggering a full sheet re-render.
     * @param {object} data - The data object to save.
     * @returns {Promise<void>}
     */
    async saveDataTemporal(data) {
        try {
            const flagPath = `flags.campaign-codex.data.widgets.${this.widgetType}.${this.widgetId}`;
             await this.document.updateSource({ [flagPath]: data });
             foundry.utils.setProperty(this.document, flagPath, data);
             console.log(`Campaign Codex | Saved widget data (ID: ${this.widgetId}) without render.`);

        } catch (error) {
            console.error(`Campaign Codex | Error saving data for widget ${this.widgetType} (ID: ${this.widgetId}):`, error);
        }
    }

/**
     * Saves data for this specific widget instance to the document flags.
     * @param {object} data - The data object to save.
     * @returns {Promise<Document | undefined>} The updated document.
     */
    async saveData(data) {
        try {
            const flagPath = `data.widgets.${this.widgetType}.${this.widgetId}`;
            // console.log(`Campaign Codex | Saving widget data (ID: ${this.widgetId}) using setFlag.`);
            return await this.document.setFlag("campaign-codex", flagPath, data);
        } catch (error) {
            console.error(`Campaign Codex | Error saving data via setFlag for widget ${this.widgetType} (ID: ${this.widgetId}):`, error);
             return undefined;
        }

    }

    /**
     * Removes all data for this widget instance from the document flags.
     * @returns {Promise<Document | undefined>} The updated document.
     */
     async removeData() {
        try {
            const flagPath = `data.widgets.${this.widgetType}.${this.widgetId}`;
            // console.log(`Campaign Codex | Removing widget data (ID: ${this.widgetId}) using unsetFlag.`);
            return await this.document.unsetFlag("campaign-codex", flagPath);
        } catch (error) {
            console.error(`Campaign Codex | Error removing data via unsetFlag for widget ${this.widgetType} (ID: ${this.widgetId}):`, error);
             return undefined;
        }
    }


    /**
     * Utility to check if the current user is a GM.
     * @returns {boolean}
     */
    get isGM() {
        return game.user.isGM;
    }



/**
 * Shows a confirmation dialog.
 * @param {string} [message="Are you sure?"] - The confirmation message.
 * @returns {Promise<boolean>}
 */
 async confirmationDialog(message = "Are you sure?") {
    const proceed = await foundry.applications.api.DialogV2.confirm({
        content: message,
        rejectClose: false,
        modal: true,
    });
    return proceed;
}

/**
 * Opens a document from its UUID.
 * @param {string} uuid - The document UUID.
 * @param {string} [type="document"] - A label for error messages.
 */
 async _onOpenDocument(uuid, type = "document") {
    if (!uuid) return console.warn(`Campaign Codex | No UUID found for ${type}`);

    try {
        const doc = await fromUuid(uuid);
        if (doc) {
            if (doc instanceof JournalEntryPage) {
                doc.parent.sheet.render(true, { pageId: doc.id });
            } else {
                doc.sheet.render(true);
            }
        } else {
            ui.notifications.warn(`${type} document not found`);
        }
    } catch (error) {
        console.error(`Campaign Codex | Error opening ${type}:`, error);
        ui.notifications.error(`Failed to open ${type}`);
    }
}

}
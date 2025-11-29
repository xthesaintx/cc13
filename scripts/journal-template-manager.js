import { BUNDLED_TEMPLATES } from "./bundled-templates.js";
/**
 * A singleton class to manage discovering and caching journal templates.
 */
class JournalTemplateManager {
    constructor() {
        this.bundledTemplates = [];
        this.userTemplates = [];
    }

    /**
     * A getter for the user-defined template folder path from game settings.
     * @returns {string}
     */
    get userTemplatePath() {
        return game.settings.get("campaign-codex", "journalTemplateFolder");
    }

    /**
     * A getter that intelligently combines module and user templates, ensuring no duplicates.
     * @returns {Array<object>} An array of { title, filePath } objects.
     */
    get allTemplates() {
        const combined = [...this.bundledTemplates, ...this.userTemplates];
        // const uniqueTemplates = Array.from(new Map(combined.map(item => [item.filePath, item])).values());
        // uniqueTemplates.sort((a, b) => a.title.localeCompare(b.title));
        // return uniqueTemplates;
        return combined.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    }

    /**
     * Scans both the default module folder and the user-configured folder for templates.
     * This should be called on init and anytime the user setting changes.
     */
    async scanAllTemplates() {
        if (this.bundledTemplates.length === 0) {
            this.bundledTemplates = this._loadBundledTemplates();
        }
        this.userTemplates = await this._scanPath(game.settings.get("campaign-codex", "journalTemplateFolder"), "User");

    }

    /**
     * A private helper method to load and format the bundled JS string templates.
     * @returns {Array<object>} An array of template objects.
     * @private
     */
    _loadBundledTemplates() {
        return BUNDLED_TEMPLATES.map(template => ({
            title: template.title,
            content: template.content,
            filePath: null 
        }));
    }
/**
     * A private helper method to browse a given path and format the results.
     * @param {string} path The filesystem path to scan.
     * @param {string} prefix A prefix to add to the template title (e.g., "User").
     * @returns {Promise<Array<object>>} A promise that resolves to an array of template objects.
     * @private
     */
    async _scanPath(path, prefix = "") {
        if (!path) return [];
        try {
            const data = await foundry.applications.apps.FilePicker.implementation.browse("data", path, { extensions: [".html", ".hbs"] });
            if (!data.files?.length) return [];

            return data.files.map(filePath => {
                const fileName = filePath.split('/').pop().replace(/\.(html|hbs)$/, '');
                let title = fileName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                if (prefix) title = `[${prefix}] ${title}`;
                filePath = decodeURIComponent(filePath);
                return { 
                    title, 
                    filePath, 
                    content: null 
                };
            });
        } catch (error) {
            return [];
        }
    }
}


export const templateManager = new JournalTemplateManager();

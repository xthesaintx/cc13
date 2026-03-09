import { BUNDLED_TEMPLATES } from "./bundled-templates.js";
/**
 * A singleton class to manage discovering and caching journal templates.
 */
class JournalTemplateManager {
    static isForgeEnvironment() {
        return (
            typeof ForgeVTT !== "undefined" &&
            ForgeVTT?.usingTheForge === true
        );
    }

    static getFilePickerSources() {
        if (this.isForgeEnvironment()) {
            return ["forgevtt", "data"];
        }
        return ["data", "forgevtt"];
    }

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
        const attempts = this._getBrowseAttempts(path);

        for (const attempt of attempts) {
            try {
                const options = { extensions: [".html", ".hbs"] };
                if (attempt.bucket) options.bucket = attempt.bucket;

                const data = await foundry.applications.apps.FilePicker.implementation.browse(
                    attempt.source,
                    attempt.path,
                    options
                );

                if (!data.files?.length) continue;

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
                continue;
            }
        }

        return [];
    }

    /**
     * Build candidate FilePicker browse inputs, including Forge fallback support.
     * @param {string} rawPath
     * @returns {Array<{source: string, path: string, bucket: string|null}>}
     * @private
     */
    _getBrowseAttempts(rawPath) {
        const normalized = String(rawPath || "").trim();
        if (!normalized) return [];

        let source = null;
        let path = normalized;
        let bucket = null;

        const bracketSource = normalized.match(/^\[([^\]]+)\]\s*(.+)$/);
        if (bracketSource) {
            source = bracketSource[1].toLowerCase();
            path = bracketSource[2].trim();
        } else {
            const prefixedSource = normalized.match(/^([a-z0-9_-]+):(.*)$/i);
            if (prefixedSource) {
                const maybeSource = prefixedSource[1].toLowerCase();
                if (["data", "public", "s3", "forgevtt"].includes(maybeSource)) {
                    source = maybeSource;
                    path = prefixedSource[2].trim();
                }
            }
        }

        path = path.replace(/^\/+/, "").replace(/\/+$/, "");

        if (source === "s3" && path.includes("/")) {
            const [first, ...rest] = path.split("/");
            if (first && rest.length) {
                bucket = first;
                path = rest.join("/");
            }
        }

        const attempts = [];
        const pushAttempt = (attemptSource, attemptPath, attemptBucket = null) => {
            if (!attemptPath) return;
            const key = `${attemptSource}|${attemptBucket || ""}|${attemptPath}`;
            if (attempts.some(a => `${a.source}|${a.bucket || ""}|${a.path}` === key)) return;
            attempts.push({ source: attemptSource, path: attemptPath, bucket: attemptBucket });
        };

        if (source) {
            pushAttempt(source, path, bucket);

            // Cross-try common hosted sources so source mismatch doesn't block scanning.
            if (source === "data") pushAttempt("forgevtt", path);
            if (source === "forgevtt") pushAttempt("data", path);
        } else {
            for (const defaultSource of JournalTemplateManager.getFilePickerSources()) {
                pushAttempt(defaultSource, path, bucket);
            }
        }

        return attempts;
    }
}


export const templateManager = new JournalTemplateManager();

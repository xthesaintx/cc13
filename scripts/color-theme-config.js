const { SchemaField, ColorField, StringField, FilePathField,BooleanField,NumberField } = foundry.data.fields;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const ColorThemeCC = HandlebarsApplicationMixin((ApplicationV2));

/**
 * The Application responsible for configuring the Campaign Codex theme colors.
 * @extends {FormApplicationV2}
 */
export class ColorThemeConfig extends ColorThemeCC {
  static DEFAULT_OPTIONS = {
        tag:'form',
        id: "campaign-codex-theme-config",
        title: "Campaign Codex Theme Colors",
        classes: ["campaign-codex-theme-config campaign-codex"],
        window: {
            icon: "fa-solid fa-palette",
            contentClasses: ["standard-form"],
          resizable: true,
        },
        position: { width: 520, height: 750 },
        form: {
            handler: this.#onSubmitForm,
            closeOnSubmit: true,
            submitOnChange: false
        },
        actions: {
            reset: this.#onResetDefaults,
            apply: this.#onApply,
            importTheme: function(event, target) {
                this.element.querySelector("#wgtgm-import-file").click();
                },
            exportTheme: this.#_exportTheme
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/campaign-codex/templates/color-theme-config.hbs",
            // scrollable: [".form-body"]
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    /**
     * The data schema which defines the form fields.
     * @override
     */
    static defineSchema() {
        const fontChoices = foundry.applications.settings.menus.FontConfig.getAvailableFontChoices();

        return new SchemaField({
            primary: new ColorField({ label: "Seconday Accent"}),
            slate: new ColorField({ label: "Slate"}),
            textMuted: new ColorField({ label: "Text Muted"}),
            sidebarBg: new ColorField({ label: "Sidebar Background" }),
            sidebarText: new ColorField({ label: "Light Text" }),
            accent: new ColorField({ label: "Accent"}),
            mainBg: new ColorField({ label: "Main Background" }),
            mainText: new ColorField({ label: "Main Text" }),
            cardBg: new ColorField({ label: "Card Background" }),
            border: new ColorField({ label: "Border" }),
            success: new ColorField({ label: "Success" }),
            danger: new ColorField({ label: "Danger" }),
            backgroundImageTile: new BooleanField({ label: "Tile Background Image"}),
            anchorImage: new BooleanField({ label: "Image Anchor", hint: "Enabled: Anchor Bottom-Right of window; Default: Middle-Left"}),
            themeOverrideToLight: new StringField({ label: "Override Theme", hint:"Forces a theme on CC Sheets on all clients", choices:{none: "none",dark:"dark",light:"light"} }),
            backgroundOpacity: new NumberField({label:"Background Image Opacity", nullable: false, min: 1, max: 100, step: 1}),
            backgroundImage: new FilePathField({
                categories: ["IMAGE"],
                label: "Background Image",
            }),
            fontHeading: new StringField({
                label: "Heading Font",
                choices: fontChoices
            }),
            fontBody: new StringField({
                label: "Body Font",
                choices: fontChoices
            })
        });
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.fieldsets = this._getFields();
        context.buttons = this._getButtons();
        return context;
    }



static get themeFields() {
        return [
            "themeOverrideToLight",
            "accent", "primary",
            "sidebarText", "mainText", "textMuted",
            "sidebarBg", "mainBg", "cardBg",
            "border", "slate",
            "success", "danger",
            "backgroundOpacity", "backgroundImage","backgroundImageTile", "anchorImage",
            "fontHeading", "fontBody"
        ];
    }


  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame ) return frame;
    const copyId = `
        <button type="button" class="header-control fa-solid fa-file-import icon" data-action="importTheme"
                data-tooltip="Import from JSON" aria-label="Import from JSON"></button>
        <button type="button" class="header-control fa-solid fa-file-export icon" data-action="exportTheme"
                data-tooltip="Export to JSON" aria-label="Export to JSON"></button>
      `;
      this.window.close.insertAdjacentHTML("beforebegin", copyId);
    
    return frame;
  }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const fileInput = this.element.querySelector("#wgtgm-import-file");
        if (fileInput) {
            fileInput.addEventListener("change", (event) => this._importTheme(event));
        }
    }

   static async #_exportTheme(event, app) {
        event.preventDefault();
        const formData = new foundry.applications.ux.FormDataExtended(app.form);
        for (const [key, value] of Object.entries(formData.object)) {
            if (!value){
                const setting = game.settings.settings.get(`campaign-codex.color-${key}`);
                await game.settings.set("campaign-codex", `color-${key}`, setting.default);
            }else{
            await game.settings.set("campaign-codex", `color-${key}`, value);
        }
        }
        ui.notifications.info("Campaign Codex theme settings applied!");

        const data = {};
        for (const field of this.constructor.themeFields) {
            data[field] = game.settings.get("campaign-codex", `color-${field}`);
        }
        const filename = `campaign-codex-theme.json`;
        foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
        ui.notifications.info("Campaign Codex: Theme exported successfully.");
    }

    async _importTheme(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonString = e.target.result;
                const json = JSON.parse(jsonString);

                if (json) {
                    for (const [key, value] of Object.entries(json)) {
                        if (this.constructor.themeFields.includes(key)) {
                            await game.settings.set("campaign-codex", `color-${key}`, value);
                        }
                    }

                    ui.notifications.info("Theme imported successfully.");
                    
                    this.render();
                    
                }

            } catch (err) {
                console.error("Campaign Codex | Import Error:", err);
                ui.notifications.error("Failed to parse JSON file.");
            }
            event.target.value = "";
        };
        reader.readAsText(file);
    }


    _getFields() {
        const schema = this.constructor.defineSchema();
        const fieldsets = [
            { legend: "Default Theme Override", fields: ["themeOverrideToLight"] },
            { legend: "Primary Colors", fields: ["accent", "primary"] },
            { legend: "Text", fields: ["sidebarText", "mainText", "textMuted"] },
            { legend: "Backgrounds", fields: ["sidebarBg", "mainBg", "cardBg"] },
            { legend: "Borders", fields: ["border", "slate"] },
            { legend: "Feedback Colors", fields: ["success", "danger"] },
            { legend: "Background Image", fields: ["backgroundOpacity","backgroundImage","backgroundImageTile","anchorImage"] },
            { legend: "Typography", fields: ["fontHeading", "fontBody"] },
        ];

        return fieldsets.map(fieldset => ({
            legend: fieldset.legend,
            fields: fieldset.fields.map(fieldName => {
                const field = schema.fields[fieldName];
                const value = game.settings.get("campaign-codex", `color-${fieldName}`);
                return { field, value };
            })
        }));
    }


    _getButtons() {
        return [
            {
                type: "button",
                action: "reset", 
                icon: "fa-solid fa-undo",
                label: "Reset Defaults"
            },
            {
                type: "button",
                action: "apply",
                icon: "fa-solid fa-check",
                label: "Apply Changes"
            },
            {
                type: "submit",
                icon: "fa-solid fa-floppy-disk",
                label: "Save Changes"
            }
        ];
    }

    static async #onApply(event, app) {
        event.preventDefault();
        const formData = new foundry.applications.ux.FormDataExtended(app.form);
        for (const [key, value] of Object.entries(formData.object)) {
            if (!value){
                const setting = game.settings.settings.get(`campaign-codex.color-${key}`);
                await game.settings.set("campaign-codex", `color-${key}`, setting.default);
            }else{
            await game.settings.set("campaign-codex", `color-${key}`, value);
        }
        }
        ui.notifications.info("Campaign Codex theme settings applied!");
    }

    static async #onSubmitForm(event, form, formData) {
        event.preventDefault();
        for (const [key, value] of Object.entries(formData.object)) {

            await game.settings.set("campaign-codex", `color-${key}`, value);
        }
        ui.notifications.info("Campaign Codex theme colors updated!");
        foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });

    }

    static async #onResetDefaults() {
        const fontChoices = foundry.applications.settings.menus.FontConfig.getAvailableFontChoices();
        const schema = 
        new SchemaField({
            primary: new ColorField({ label: "Seconday Accent"}),
            slate: new ColorField({ label: "Slate"}),
            textMuted: new ColorField({ label: "Text Muted"}),
            sidebarBg: new ColorField({ label: "Sidebar Background" }),
            sidebarText: new ColorField({ label: "Light Text" }),
            accent: new ColorField({ label: "Accent"}),
            mainBg: new ColorField({ label: "Main Background" }),
            mainText: new ColorField({ label: "Main Text" }),
            cardBg: new ColorField({ label: "Card Background" }),
            border: new ColorField({ label: "Border" }),
            success: new ColorField({ label: "Success" }),
            danger: new ColorField({ label: "Danger" }),
            backgroundImageTile: new BooleanField({ label: "Tile Background Image"}),
            themeOverrideToLight: new StringField({ label: "Override Theme", hint:"Forces a theme on CC Sheets on all clients", choices:["none","dark","light"] }),
            backgroundOpacity: new NumberField({label:"Background Image Opacity", nullable: false, min: 1, max: 100, step: 1}),
            anchorImage: new BooleanField({ label: "Image Anchor", hint: "Enabled: Anchor Bottom-Right of window; Default: Middle-Left"}),
            backgroundImage: new FilePathField({
                categories: ["IMAGE"],
                label: "Background Image",
            }),
            fontHeading: new StringField({
                label: "Heading Font",
                choices: fontChoices
            }),
            fontBody: new StringField({
                label: "Body Font",
                choices: fontChoices
            })
        });
        for (const key of Object.keys(schema.fields)) {
            const settingKey = `campaign-codex.color-${key}`;
            const setting = game.settings.settings.get(settingKey);
            if (setting) {
                await game.settings.set("campaign-codex", `color-${key}`, setting.default);
            }
        }
        ui.notifications.info("Campaign Codex theme colors have been reset to default.");
        this.render(); 
    }
}



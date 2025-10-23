const { SchemaField, ColorField, StringField } = foundry.data.fields;
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
            contentClasses: ["standard-form"]
        },
        position: { width: 520, height: "auto" },
        form: {
            handler: this.#onSubmitForm,
            closeOnSubmit: true,
            submitOnChange: false
        },
        actions: {
            reset: this.#onResetDefaults,
            apply: this.#onApply
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
        const fontChoices = FontConfig.getAvailableFontChoices();

        return new SchemaField({
            ui: new ColorField({ label: "UI Elements"}),
            slate: new ColorField({ label: "Slate"}),
            textMuted: new ColorField({ label: "Text Muted"}),
            borderMedium: new ColorField({ label: "Border Slate"}),
            accent: new ColorField({ label: "Accent"}),
            primary: new ColorField({ label: "Seconday Accent"}),
            sidebarBg: new ColorField({ label: "Sidebar Background" }),
            sidebarText: new ColorField({ label: "Light Text" }),
            mainBg: new ColorField({ label: "Main Background" }),
            mainText: new ColorField({ label: "Main Text" }),
            cardBg: new ColorField({ label: "Card Background" }),
            border: new ColorField({ label: "Border" }),
            borderLight: new ColorField({ label: "Border Light" }),
            success: new ColorField({ label: "Success" }),
            danger: new ColorField({ label: "Danger" }),
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

    _getFields() {
        const schema = this.constructor.defineSchema();
        const fieldsets = [
            { legend: "Primary Colors", fields: ["ui","accent", "primary"] },
            { legend: "Text", fields: ["sidebarText", "mainText", "textMuted"] },
            { legend: "Backgrounds", fields: ["sidebarBg", "mainBg", "cardBg"] },
            { legend: "Borders", fields: ["border", "borderLight", "slate", "borderMedium"] },
            { legend: "Feedback Colors", fields: ["success", "danger"] },
            { legend: "Typography", fields: ["fontHeading", "fontBody"] }
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
    }

    static async #onResetDefaults() {
        const fontChoices = FontConfig.getAvailableFontChoices();
        const schema = 
        new SchemaField({
            ui: new ColorField({ label: "UI Elements"}),
            slate: new ColorField({ label: "Slate"}),
            textMuted: new ColorField({ label: "Text Muted"}),
            borderMedium: new ColorField({ label: "Border Slate"}),
            accent: new ColorField({ label: "Accent"}),
            primary: new ColorField({ label: "Seconday Accent"}),
            sidebarBg: new ColorField({ label: "Sidebar Background" }),
            sidebarText: new ColorField({ label: "Light Text" }),
            mainBg: new ColorField({ label: "Main Background" }),
            mainText: new ColorField({ label: "Main Text" }),
            cardBg: new ColorField({ label: "Card Background" }),
            border: new ColorField({ label: "Border" }),
            borderLight: new ColorField({ label: "Border Light" }),
            success: new ColorField({ label: "Success" }),
            danger: new ColorField({ label: "Danger" }),
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



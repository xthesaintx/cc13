const { SchemaField, StringField } = foundry.data.fields;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const templateCC = HandlebarsApplicationMixin((ApplicationV2));

/**
 * The Application responsible for configuring the Campaign Codex theme colors.
 * @extends {FormApplicationV2}
 */
export class TemplatePicker extends templateCC {
  static DEFAULT_OPTIONS = {
        tag:'form',
        id: "campaign-codex-template-config",
        title: "Campaign Codex Template Path",
        classes: ["campaign-codex-theme-config campaign-codex"],
        window: {
            icon: "fa-solid fa-fodler",
            contentClasses: ["standard-form"]
        },
        position: { width: 520, height: "auto" },
        form: {
            handler: this.#onSubmitForm,
            closeOnSubmit: true,
            submitOnChange: false,
        },
        actions: {
            browse: this.#onBrowse
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/campaign-codex/templates/picker-config.hbs",
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
        return new SchemaField({
            journalTemplateFolder: new StringField({ label: "Template Path:", readonly: true }),
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
            { legend: "Template Path", fields: ["journalTemplateFolder"] },
        ];

        return fieldsets.map(fieldset => ({
            legend: fieldset.legend,
            fields: fieldset.fields.map(fieldName => {
                const field = schema.fields[fieldName];
                const readonly = true;
                const value = game.settings.get("campaign-codex", `${fieldName}`);
                return { field, value, readonly };
            })
        }));
    }


    _getButtons() {
        return [
            {
                type: "button",
                action: "browse",
                icon: "fa-solid fa-folder",
                label: "Browse"
            },
            {
                type: "submit",
                icon: "fa-solid fa-floppy-disk",
                label: "Save Changes"
            }
        ];
    }

    static #onBrowse(event, app) {
    event.preventDefault();
    const formData = new foundry.applications.ux.FormDataExtended(app.form);

    const form = this.element;
    const input = form.querySelector("input");
    // console.log(input);
    
    new foundry.applications.apps.FilePicker.implementation({
      type: "folder",
      current: input.value,
      callback: (path) => {input.value = path;},
    }).browse();
  
    }

    static async #onSubmitForm(event, form, formData) {
        event.preventDefault();
        for (const [key, value] of Object.entries(formData.object)) {
            await game.settings.set("campaign-codex", "journalTemplateFolder", value);
        }
        ui.notifications.info("Campaign Codex template path updated!");
    }
}



import { templateManager } from "./journal-template-manager.js";


export class DetailsNodeView {
    constructor(node) {
        this.node = node;

        this.dom = document.createElement("details");
        this.summary = document.createElement("summary");

        this.dom.appendChild(this.summary); 
        this.contentDOM =  this.dom;

        const applyAttributes = (attrsObject) => {
            if (!attrsObject) return;
            Object.entries(attrsObject).forEach(([key, value]) => {
                if (key !== "open" && key !== "_preserve" && value !== null && value !== undefined) {
                    this.dom.setAttribute(key, value);
                }
            });
        };

        applyAttributes(node.attrs);

        if (node.attrs._preserve && typeof node.attrs._preserve === 'object') {
             applyAttributes(node.attrs._preserve);
        }

        this.dom.open = true;
    }

    update(node) {
        if (node.type !== this.node.type) return false;
        if (!this.dom.open) {
            this.dom.open = true;
        }
        this.node = node; 
        return false;
    }

}

export default class DetailsExpanderPlugin extends ProseMirror.ProseMirrorPlugin {
    static build(schema, options = {}) {
        return new ProseMirror.Plugin({
            key: new ProseMirror.PluginKey('detailsExpander'),
            props: {
                nodeViews: {
                    details(node) {
                        return new DetailsNodeView(node);
                    }
                }
            }
        });
    }
}

Hooks.on("getProseMirrorMenuDropDowns", (proseMirrorMenu, dropdowns) => {
    const templates = templateManager.allTemplates;
    if (templates.length === 0) return;

    const insertTemplate = async (template) => {
        try {
            let contentHTML;
            if (template.content) {
                const compiled = Handlebars.compile(template.content);
                contentHTML = compiled({}); // Pass an empty context
            } else if (template.filePath) {
                contentHTML = await foundry.applications.handlebars.renderTemplate(template.filePath);
            } else {
                console.error("Campaign Codex | Invalid template object", template);
                ui.notifications.error("Invalid template definition.");
                return;
            }

            // const contentHTML = await foundry.applications.handlebars.renderTemplate(templatePath);
            if (!contentHTML) return;

            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = contentHTML;

            const fragment = foundry.prosemirror.DOMParser.fromSchema(proseMirrorMenu.view.state.schema).parseSlice(tempDiv);


            proseMirrorMenu.view.dispatch(
                proseMirrorMenu.view.state.tr.replaceSelection(fragment).scrollIntoView()
            );

        } catch (error) {
            console.error(`Campaign Codex | Failed to load or insert template: ${template.title}`, error);
            ui.notifications.error(`Failed to load template: ${template.title}`);
        }
    };

    const entries = templates.map(template => ({
        title: template.title,
        action: `${template.title.slugify()}-template`,
        cmd: () => insertTemplate(template)
    }));

    dropdowns.campaignCodexTemplates = {
        title: 'Templates',
        icon: '<i class="fas fa-closed-captioning"></i>', 
        cssClass: "cc-templates",
        title: "Templates", // The name of the dropdown in the UI
        entries: entries
    };
});

Hooks.on("createProseMirrorEditor", (uuid, plugins, options) => {
    plugins.detailsExpander = DetailsExpanderPlugin.build(ProseMirror.defaultSchema);  
});




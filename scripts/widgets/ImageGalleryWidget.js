import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class ImageGalleryWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.images = widgetData.images || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const images = savedData.images || [];

        return {
            id: this.widgetId,
            images: images,
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();

        const imagesHtml = data.images.map(img => `
            <div class="gallery-item" data-id="${img.id}">
                <img src="${img.src}" class="gallery-image" title="Click to view" />
                ${data.isGM ? `
                <div class="gallery-controls">
                    <i class="fas fa-trash gallery-btn remove" data-action="remove" title="Remove Image"></i>
                </div>
                ` : ''}
            </div>
        `).join("");

        return `
            <div class="cc-widget-image-gallery" id="widget-${this.widgetId}">
                ${data.isGM ? `
                <div class="gallery-toolbar">
                    <button class="gallery-add-btn" data-action="add"><i class="fas fa-plus-circle"></i> Add Image</button>
                </div>
                ` : ''}
                
                <div class="gallery-grid">
                    ${imagesHtml || `<div class="gallery-empty">No images added.</div>`}
                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {

        if (!this.isGM) return;

        htmlElement.querySelector('.gallery-add-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this._addImage(htmlElement);
        });

        htmlElement.querySelectorAll('.gallery-btn.remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                const id = e.currentTarget.closest('.gallery-item').dataset.id;
                await this._removeImage(id, htmlElement);
            });
        });
    }

    async _addImage(htmlElement) {
        const fp = new FilePicker({
            type: "image",
            callback: async (path) => {
                const savedData = (await this.getData()) || {};
                const images = savedData.images || [];
                
                images.push({
                    id: foundry.utils.randomID(),
                    src: path
                });

                await this.saveData({ images: images });
                this._refreshWidget(htmlElement);
            }
        });
        fp.browse();
    }

    async _removeImage(id, htmlElement) {
        const savedData = (await this.getData()) || {};
        let images = savedData.images || [];
        images = images.filter(i => i.id !== id);
        
        await this.saveData({ images: images });
        this._refreshWidget(htmlElement);
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        htmlElement.innerHTML = newHtml;
        this.activateListeners(htmlElement);
    }
}
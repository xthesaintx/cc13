import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class ProgressClockWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        
        const max = parseInt(savedData.max) || 4;
        const current = parseInt(savedData.current) || 0;

        const fillDegrees = (current / max) * 360;

        return {
            id: this.widgetId,
            title: savedData.title || "New Clock",
            max: max,
            current: current,
            fillStyle: `background: conic-gradient(var(--clock-fill) 0deg ${fillDegrees}deg, transparent ${fillDegrees}deg 360deg);`,
            clockClass: "standard",
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();
        
        let separators = "";
        const rotationStep = 360 / data.max;
        for (let i = 0; i < data.max; i++) {
            separators += `<div class="clock-line" style="transform: rotate(${i * rotationStep}deg)"></div>`;
        }

        return `
            <div class="cc-widget-progress-clock ${data.clockClass}" id="widget-${this.widgetId}">
                <div class="cc-widget-card">
                    
                    <div class="cc-widget-face cc-widget-front">
                    ${this.isGM 
                        ? `<input type="text" class="rel-title-input" value="${data.title}" placeholder="Widget Title" title="Click to edit title"/>` 
                        : `<h4 class="rel-title">${data.title}</h4>`
                    }                        
                        <div class="clock-circle-container" data-action="advance" title="Left-Click: Advance | Right-Click: Clear Segment">
                            <div class="clock-pie" style="${data.fillStyle}"></div>
                            <div class="clock-grid">${separators}</div>
                            <div class="clock-border"></div>
                        </div>
                        <div class="clock-controls">
                            ${data.isGM ? `<i class="fas fa-cog clock-settings-toggle" data-action="flip"></i>` : ''}
                        </div>
                    </div>

                    <div class="cc-widget-face cc-widget-back">
                    
                         <div class="form-group">
                            <label>Segments</label>
                            <select class="clock-input-max">
                                ${[4, 6, 8, 10, 12, 20].map(n => `<option value="${n}" ${data.max === n ? 'selected' : ''}>${n}</option>`).join('')}
                            </select>
                            <button class="clock-btn reset" data-action="clear">Clear Clock</button>

                        </div>


                        <i class="fas fa-undo clock-settings-toggle" data-action="flip"></i>
                    </div>

                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {
    
    if (!this.isGM) return;

const clockFace = htmlElement.querySelector('.clock-circle-container');
        if (clockFace) {
            clockFace.addEventListener('click', async (e) => {
                e.preventDefault();
                // GUARD CLAUSE: Do nothing if flipped
                const card = htmlElement.querySelector('.cc-widget-card');
                if (card && card.classList.contains('flipped')) return;

                await this._updateValue(1, htmlElement);
            });
            clockFace.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                // GUARD CLAUSE: Do nothing if flipped
                const card = htmlElement.querySelector('.cc-widget-card');
                if (card && card.classList.contains('flipped')) return;

                await this._updateValue(-1, htmlElement);
            });
        }


        const titleInput = htmlElement.querySelector('.rel-title-input');
        if (titleInput) {
            titleInput.addEventListener('change', async (e) => {
                e.preventDefault();
                await this._saveTitle(e.target.value);
            });
        }

        htmlElement.querySelectorAll('[data-action="flip"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const card = htmlElement.querySelector('.cc-widget-card');
                if (card) card.classList.toggle('flipped');
            });
        });

        const maxInput = htmlElement.querySelector('.clock-input-max');

        const saveSettings = async () => {
            const savedData = (await this.getData()) || {};
            
            const newMax = parseInt(maxInput.value);
            const current = Math.min(savedData.current || 0, newMax);

            await this.saveData({
                ...savedData,
                max: newMax,
                current: current,
            });
            this._refreshWidget(htmlElement);
        };

        if (maxInput) maxInput.addEventListener('change', saveSettings);

        htmlElement.querySelector('[data-action="clear"]')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const savedData = (await this.getData()) || {};
            await this.saveData({ ...savedData, current: 0 });
            this._refreshWidget(htmlElement);
        });
    }

    async _saveTitle(newTitle) {
        const savedData = (await this.getData()) || {};
        await this.saveData({ ...savedData, title: newTitle });
    }

    async _updateValue(delta, htmlElement) {
        const savedData = (await this.getData()) || {};
        const max = parseInt(savedData.max) || 4;
        const current = parseInt(savedData.current) || 0;
        
        const newValue = Math.max(0, Math.min(max, current + delta));
        
        if (newValue !== current) {
            await this.saveData({ ...savedData, current: newValue });
            this._refreshWidget(htmlElement);
        }
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        if (htmlElement.parentElement) {
            htmlElement.innerHTML = newHtml;
            this.activateListeners(htmlElement);
        }
    }
}
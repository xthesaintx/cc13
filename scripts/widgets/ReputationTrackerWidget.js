

import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class ReputationTrackerWidget extends CampaignCodexWidget {
  
  constructor(widgetId, widgetData, document) {
    super(widgetId, widgetData, document);
    this.defaultUseLoyalty = false;
    this.defaultReputationValue = 0;
  }

  /**
   * Retrieves the linked actor if one exists on the document.
   * @returns {Promise<Actor|null>}
   */
  async _getLinkedActor() {
    const linkedActorUuid = this.document.getFlag("campaign-codex", "data.linkedActor");
    if (!linkedActorUuid) return null;
    return await fromUuid(linkedActorUuid);
  }

  /**
   * Prepares the data for rendering.
   */
  async _prepareContext() {
    const savedData = (await this.getData()) || {};
    
    const useLoyalty = savedData.useLoyalty ?? this.defaultUseLoyalty;
    let reputationValue = savedData.reputationValue ?? this.defaultReputationValue;

    const context = {
      id: this.widgetId,
      useLoyalty: useLoyalty,
      value: reputationValue,
      icon: "fa-meh", 
      statusClass: "neutral",
      tooltip: "Neutral Reputation"
    };

    // --- LOYALTY MODE ---
    if (useLoyalty) {
      const actor = await this._getLinkedActor();
      if (actor) {
        const loyalty = foundry.utils.getProperty(actor, "system.attributes.loyalty.value");
        context.value = Number(loyalty) || 0; 
        
        // 10+ Loyal (Heart), 1-9 Faithful (Face), <=0 Disloyal (Skull)
        if (context.value >= 10) {
          context.icon = "fa-heart";
          context.statusClass = "good";
          context.tooltip = "Loyal: Risks anything to help the party.";
        } else if (context.value > 0) {
          context.icon = "fa-meh";
          context.statusClass = "neutral";
          context.tooltip = "Faithful: Tenuously faithful to the party.";
        } else {
          context.icon = "fa-skull";
          context.statusClass = "bad";
          context.tooltip = "Disloyal: No longer acts in the party's best interests.";
        }
      } else {
        context.tooltip = "No Linked Actor Found!";
        context.value = "-";
      }
    } 
    // --- STANDARD MODE ---
    else {
      // >0 Good (Heart), 0 Neutral (Face), <0 Bad (Skull)
      if (context.value > 0) {
        context.icon = "fa-heart";
        context.statusClass = "good";
        context.tooltip = "Good Reputation";
      } else if (context.value < 0) {
        context.icon = "fa-skull";
        context.statusClass = "bad";
        context.tooltip = "Bad Reputation";
      }
    }

    return context;
  }


  async render() {
    const data = await this._prepareContext();
    return `
      <div class="cc-widget-reputation-tracker" id="widget-${this.widgetId}" ${this.isGM ? ``: `style="display:none;"`}>
        <div class="cc-widget-card">
          
          <div class="cc-widget-face cc-widget-front">
            <button class="rep-btn minus" data-action="decrease"><i class="fas fa-minus"></i></button>
            
            <div class="rep-display ${data.statusClass}" title="${data.tooltip}">
              <span class="rep-value">${data.value}</span>
            </div>

            <button class="rep-btn plus" data-action="increase"><i class="fas fa-plus"></i></button>
            <i class="fas ${data.icon} rep-icon ${data.statusClass}" title="${data.tooltip}"></i>
            <i class="fas fa-cog rep-settings-toggle" data-action="flip"></i>
          </div>

          <div class="cc-widget-face cc-widget-back">
            <div class="form-group">
              <input type="checkbox" class="loyalty-check" ${data.useLoyalty ? "checked" : ""}>
              <label>Use D&D Loyalty</label>
            </div>
            <i class="fas fa-undo rep-settings-toggle" data-action="flip"></i>
          </div>

        </div>
      </div>`;
  }


  async activateListeners(htmlElement) {
    htmlElement.querySelectorAll('.rep-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const delta = action === "increase" ? 1 : -1;
        await this._updateValue(delta, htmlElement);
      });
    });

    htmlElement.querySelectorAll('[data-action="flip"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = htmlElement.querySelector('.cc-widget-card');
        if (card) card.classList.toggle('flipped');
      });
    });

    const checkbox = htmlElement.querySelector('.loyalty-check');
    if (checkbox) {
      checkbox.addEventListener('change', async (e) => {
        const currentData = (await this.getData()) || {};
        
        const useLoyalty = e.target.checked;
        
        await this.saveData({ 
          ...currentData,
          useLoyalty: useLoyalty 
        });
        
        this._refreshWidget(htmlElement);
      });
    }
  }

  async _updateValue(delta, htmlElement) {
    // We need to fetch the *saved* state (or defaults) to know which mode we are in
    const savedData = (await this.getData()) || {};
    const useLoyalty = savedData.useLoyalty ?? this.defaultUseLoyalty;

    if (useLoyalty) {
      const actor = await this._getLinkedActor();
      if (actor) {
        let currentLoyalty = Number(foundry.utils.getProperty(actor, "system.attributes.loyalty.value")) || 0;
        const newValue = currentLoyalty + delta;
        await actor.update({ "system.attributes.loyalty.value": newValue });
        this._refreshWidget(htmlElement);
      } else {
        ui.notifications.warn("Campaign Codex | No Linked Actor found for Loyalty tracking.");
      }
    } else {
      let currentVal = savedData.reputationValue ?? this.defaultReputationValue;
      const newValue = currentVal + delta;

      await this.saveData({
        ...savedData,
        reputationValue: newValue
      });
      
      this._refreshWidget(htmlElement);
    }
  }

  async _refreshWidget(htmlElement) {
    const newHtml = await this.render();
    htmlElement.innerHTML = newHtml;
    this.activateListeners(htmlElement);
  }
}
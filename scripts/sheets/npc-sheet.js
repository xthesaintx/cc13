import { CampaignCodexBaseSheet } from './base-sheet.js';
import { TemplateComponents } from './template-components.js';
import { DescriptionEditor } from './editors/description-editor.js';
import { CampaignCodexLinkers } from './linkers.js';


export class NPCSheet extends CampaignCodexBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "npc-sheet"]
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async getData() {
    const data = await super.getData();
    const npcData = this.document.getFlag("campaign-codex", "data") || {};


    data.linkedActor = npcData.linkedActor ? await CampaignCodexLinkers.getLinkedActor(npcData.linkedActor) : null;
    data.allLocations = await CampaignCodexLinkers.getAllLocations(this.document, npcData.linkedLocations || []);
    data.linkedShops = await CampaignCodexLinkers.getLinkedShopsWithLocation(this.document,npcData.linkedShops || []);
    data.associates = await CampaignCodexLinkers.getAssociates(this.document,npcData.associates || []);


    data.sheetType = "npc";
    data.sheetTypeLabel = data.linkedActor?.type === 'character' ? "Player Journal" : "NPC Journal";
    data.defaultImage = TemplateComponents.getAsset('image','npc');
    data.customImage = this.document.getFlag("campaign-codex", "image") || data.linkedActor?.img || TemplateComponents.getAsset('image','npc');
    
    data.tabs = [
      { key: 'info', label: 'Info', icon: 'fas fa-info-circle', active: this._currentTab === 'info' },
      { key: 'locations', label: 'Locations', icon: 'fas fa-map-marker-alt', active: this._currentTab === 'locations',
      statistic: {
        value: data.allLocations.length,
        color: '#28a745'
      } },
      { key: 'shops', label: 'Entries', icon: 'fas fa-book-open', active: this._currentTab === 'shops' ,
      statistic: {
        value: data.linkedShops.length,
        color: '#6f42c1'
      }},
      { key: 'associates', label: 'Associates', icon: 'fas fa-users', active: this._currentTab === 'associates',
      statistic: {
        value: data.associates.length,
        color: '#fd7e14'
      } },
      { key: 'notes', label: 'Notes', icon: 'fas fa-sticky-note', active: this._currentTab === 'notes' }
    ];
    
    data.statistics = [
      { icon: 'fas fa-map-marker-alt', value: data.allLocations.length, label: 'LOCATIONS', color: '#28a745' },
      { icon: 'fas fa-book-open', value: data.linkedShops.length, label: 'ENTRIES', color: '#6f42c1' },
      { icon: 'fas fa-users', value: data.associates.length, label: 'ASSOCIATES', color: '#fd7e14' }
    ];

      const sources = [
    { data: data.allLocations, type: 'location' },
    { data: data.linkedShops, type: 'shop' },
    { data: data.associates, type: 'npc' }
  ];

  data.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);


    if (data.linkedActor) {
      data.customHeaderContent = `
        <div class="actor-stats">
        </div>
      `;
    }
    
    
    data.tabPanels = [
      {
        key: 'info',
        active: this._currentTab === 'info',
        content: this._generateInfoTab(data)
      },
      {
        key: 'locations',
        active: this._currentTab === 'locations',
        content: this._generateLocationsTab(data)
      },
      {
        key: 'shops', 
        active: this._currentTab === 'shops',
        content: this._generateShopsTab(data)
      },
      {
        key: 'associates',
        active: this._currentTab === 'associates', 
        content: this._generateAssociatesTab(data)
      },
      {
        key: 'notes',
        active: this._currentTab === 'notes',
        content: CampaignCodexBaseSheet.generateNotesTab(data)
      }
    ];
    
    return data;
  }

  _generateInfoTab(data) {
    let actorSection = '';
    let dropToMapBtn = '';


    dropToMapBtn = (canvas.scene && data.linkedActor) ? `
    <button type="button" class="refresh-btn npcs-to-map-button" title="Drop to current scene">
      <i class="fas fa-map"></i>
      Drop NPC
    </button>
  ` : '';




    if (data.linkedActor) {
      actorSection = `
        <div class="form-section">
          <h3><i class="fas fa-link"></i> Linked Actor</h3>
          ${TemplateComponents.actorLinkCard(data.linkedActor)}
        </div>
      `;

    } else {
      actorSection = `
        <div class="form-section">
          ${TemplateComponents.dropZone('actor', 'fas fa-user-plus', 'Link Actor', 'Drag an NPC actor here to link')}
        </div>
      `;
    }
    
    return `
      ${TemplateComponents.contentHeader('fas fas fa-info-circle', 'Information', dropToMapBtn)}
      ${actorSection}
      ${TemplateComponents.richTextSection('Description', 'fas fa-align-left', data.sheetData.enrichedDescription, 'description')}
    `;
  }

  _generateLocationsTab(data) {
    const refreshBtn = `
      <button type="button" class="refresh-btn refresh-locations" title="Refresh location data">
        <i class="fas fa-sync-alt"></i>
        Refresh
      </button>
    `;

    return `
      ${TemplateComponents.contentHeader('fas fa-map-marker-alt', 'Locations', refreshBtn)}
      ${TemplateComponents.dropZone('location', 'fas fa-map-marker-alt', 'Add Locations', 'Drag location journals here to associate this NPC with them')}
      ${this._generateLocationsBySource(data)}
    `;
  }

  _generateLocationsBySource(data) {
    const directLocations = data.allLocations.filter(loc => loc.source === 'direct');
    const shopLocations = data.allLocations.filter(loc => loc.source === 'shop');

    let content = '';

    if (directLocations.length > 0) {
      content += `
        <div class="location-section">
          <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
            <i class="fas fa-map-marker-alt" style="color: var(--cc-accent); margin-right: 8px;"></i>
            Direct Locations (${directLocations.length})
          </h3>
          ${TemplateComponents.entityGrid(directLocations, 'location')}
        </div>
      `;
    }

    if (shopLocations.length > 0) {
      content += `
        <div class="location-section">
          <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
            <i class="fas fa-book-open" style="color: var(--cc-accent); margin-right: 8px;"></i>
            Shop Locations (${shopLocations.length})
          </h3>
          ${TemplateComponents.infoBanner('Locations where this NPC works through shop associations.')}
          ${TemplateComponents.entityGrid(shopLocations, 'location')}
        </div>
      `;
    }

    if (data.allLocations.length === 0) {
      content = TemplateComponents.emptyState('location');
    }

    return content;
  }

  _generateShopsTab(data) {
    return `
      ${TemplateComponents.contentHeader('fas fa-book-open', 'Associated Entries')}
      ${TemplateComponents.dropZone('shop', 'fas fa-book-open', 'Add Entries', 'Drag entry journals here to associate this NPC with them')}
      ${TemplateComponents.entityGrid(data.linkedShops, 'shop')}
    `;
  }

  _generateAssociatesTab(data) {
    return `
      ${TemplateComponents.contentHeader('fas fa-users', 'Associates & Contacts')}
      ${TemplateComponents.dropZone('associate', 'fas fa-user-friends', 'Add Associates', 'Drag NPC journals or actors here to create relationships')}
      ${TemplateComponents.entityGrid(data.associates, 'associate', true)}
    `;
  }





  _activateSheetSpecificListeners(html) {
    html.querySelectorAll('.remove-location')?.forEach(element => element.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      if (e.currentTarget.style.opacity === '0.3' || e.currentTarget.style.cursor === 'not-allowed') {
        ui.notifications.warn("Cannot remove shop-based locations directly. Remove the NPC from the shop instead.");
        return;
      }
      
      const locationCard = e.currentTarget.closest('.entity-card');
      const isShopLocation = locationCard.getAttribute('data-source') === 'shop';
      
      if (isShopLocation) {
        ui.notifications.warn("Cannot remove shop-based locations directly. Remove the NPC from the shop instead.");
        return;
      }
      
      await this._onRemoveFromList(e, 'linkedLocations');
    }));


    html.querySelector('.remove-actor')?.addEventListener('click', this._onRemoveActor.bind(this));
    html.querySelectorAll('.remove-shop')?.forEach(element => element.addEventListener('click', async (e) => await this._onRemoveFromList(e, 'linkedShops')));
    html.querySelectorAll('.remove-associate')?.forEach(element => element.addEventListener('click', async (e) => await this._onRemoveFromList(e, 'associates')));

    
    html.querySelectorAll('.open-actor')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'actor')));
    html.querySelectorAll('.open-location')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'location')));
    html.querySelectorAll('.open-shop')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'shop')));
    html.querySelectorAll('.open-npc')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'npc')));
    html.querySelectorAll('.open-associate')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'associate')));

    
    html.querySelector('.refresh-locations')?.addEventListener('click', this._onRefreshLocations.bind(this));

    
    html.querySelectorAll('.location-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'location')));
    html.querySelectorAll('.shop-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'shop')));
    html.querySelectorAll('.npc-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'npc')));
  }


async _onRefreshLocations(event) {
  console.log(`Campaign Codex | Manual refresh requested for NPC: ${this.document.name}`);
  
  const npcData = this.document.getFlag("campaign-codex", "data") || {};
  const linkedShops = npcData.linkedShops || [];
  console.log(`Campaign Codex | Current linked shops:`, linkedShops);
  
  this.render(false);
  ui.notifications.info("Location data refreshed! Shop-based locations have been recalculated.");
}

async _forceLocationRecalculation() {
  console.log(`Campaign Codex | Forcing location recalculation for NPC: ${this.document.name}`);
  
  const npcData = this.document.getFlag("campaign-codex", "data") || {};
  const directLocations = npcData.linkedLocations || [];
  const linkedShops = npcData.linkedShops || [];
  
  console.log(`Campaign Codex | Direct locations:`, directLocations);
  console.log(`Campaign Codex | Linked shops:`, linkedShops);
  
for (const shopUuid of linkedShops) { 
  const shop = await fromUuid(shopUuid); 
  if (shop) {
    const shopData = shop.getFlag("campaign-codex", "data") || {};
    const shopNPCs = shopData.linkedNPCs || [];
    const shopLocation = shopData.linkedLocation;
    
    console.log(`Campaign Codex | Shop ${shop.name}:`, {
      linksToThisNPC: shopNPCs.includes(this.document.uuid), 
      location: shopLocation,
      allNPCs: shopNPCs
    });
  }
}
  
  this.render(false);
}

  async _handleDrop(data, event) {
    if (data.type === "Actor") {
      await this._handleActorDrop(data, event);
    } else if (data.type === "JournalEntry") {
      await this._handleJournalDrop(data, event);
    }
  }


  async _handleJournalDrop(data, event) {
    let journalUuid = data.uuid;
    if (!journalUuid && data.id) {
      journalUuid = `JournalEntry.${data.id}`;
    }
    
    if (!journalUuid) {
      ui.notifications.warn("Could not determine journal UUID");
      return;
    }
    
    const journal = await fromUuid(journalUuid);
    if (!journal || journal.id === this.document.id) return; 

    const journalType = journal.getFlag("campaign-codex", "type");
    
    if (journalType === "location") {
      await this._saveFormData();
      await game.campaignCodex.linkLocationToNPC(journal, this.document);
      this.render(false);
    } else if (journalType === "shop") {
      await this._saveFormData();
      await game.campaignCodex.linkShopToNPC(journal, this.document);
      this.render(false);
    } else if (journalType === "npc") {
      await this._saveFormData();
      await game.campaignCodex.linkNPCToNPC(this.document, journal);
      this.render(false);
    }
  }

  async _onRemoveActor(event) {
     await this._saveFormData();
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.linkedActor = null;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(false);
  }

  getSheetType() {
    return "npc";
  }
async _onDropNPCsToMapClick(event) {
  event.preventDefault();
  
  const npcData = this.document.getFlag("campaign-codex", "data") || {};
  
  if (!npcData.linkedActor) {
    ui.notifications.warn("This NPC has no linked actor to drop!");
    return;
  }
  
  try {
    const linkedActor = await fromUuid(npcData.linkedActor);
    if (!linkedActor) {
      ui.notifications.warn("Linked actor not found!");
      return;
    }
    
    const npcForDrop = {
      id: this.document.id,
      uuid: this.document.uuid,
      name: this.document.name,
      img: this.document.getFlag("campaign-codex", "image") || linkedActor.img || "icons/svg/mystery-man.svg",
      actor: linkedActor
    };
    
    await this._onDropNPCsToMap([npcForDrop], { 
      title: `Drop ${this.document.name} to Map`,
      showHiddenToggle: true
    });
    
  } catch (error) {
    console.error('Campaign Codex | Error dropping NPC to map:', error);
    ui.notifications.error("Failed to drop NPC to map!");
  }
}

}
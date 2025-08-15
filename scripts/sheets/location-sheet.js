import { CampaignCodexBaseSheet } from './base-sheet.js';
import { TemplateComponents } from './template-components.js';
import { DescriptionEditor } from './editors/description-editor.js';
import { CampaignCodexLinkers } from './linkers.js';
import { promptForName} from "../helper.js";

export class LocationSheet extends CampaignCodexBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "location-sheet"]
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async getData() {
    const data = await super.getData();
    const locationData = this.document.getFlag("campaign-codex", "data") || {};

    data.linkedScene = null;
  if (locationData.linkedScene) {
    try {
      const scene = await fromUuid(locationData.linkedScene);
      if (scene) {
        data.linkedScene = {
          uuid: scene.uuid,
          name: scene.name,
          img: scene.thumb || "icons/svg/map.svg"
        };
      }
    } catch (error) {
      console.warn(`Campaign Codex | Linked scene not found: ${locationData.linkedScene}`);
    }
  }

    data.directNPCs = await CampaignCodexLinkers.getDirectNPCs(this.document,locationData.linkedNPCs || []);
    data.shopNPCs = await CampaignCodexLinkers.getShopNPCs(this.document,locationData.linkedShops || []);
    data.allNPCs = [...data.directNPCs, ...data.shopNPCs];
    data.linkedShops = await CampaignCodexLinkers.getLinkedShops(this.document, locationData.linkedShops || []);
    data.linkedRegion = await CampaignCodexLinkers.getLinkedRegion(this.document);
    
    data.sheetType = "location";
    data.sheetTypeLabel = "Location";
    data.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image','location');
    
    data.tabs = [
      { key: 'info', label: 'Info', icon: 'fas fa-info-circle', active: this._currentTab === 'info' },
      { key: 'npcs', label: 'NPCs', icon: 'fas fa-users', active: this._currentTab === 'npcs', statistic: {value: data.allNPCs.length,color: '#fd7e14'} },
      { key: 'shops', label: 'Entries', icon: 'fas fa-book-open', active: this._currentTab === 'shops', statistic: {value: data.linkedShops.length, color: '#6f42c1'} },
      ...(game.user.isGM ? [{ key: 'notes', label: 'Notes', icon: 'fas fa-sticky-note', active: this._currentTab === 'notes' }] : [])
    ];
    
    
    data.statistics = [
      { icon: 'fas fa-users', value: data.allNPCs.length, label: 'NPCS', color: '#fd7e14' },
      { icon: 'fas fa-book-open', value: data.linkedShops.length, label: 'ENTRIES', color: '#6f42c1' }
    ];

  const sources = [
    { data: data.allNPCs, type: 'npc' },
    { data: data.linkedShops, type: 'shop' },
  ];

  data.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);



    const allItems = [
      ...data.allNPCs.map(npc => ({ ...npc, type: 'npc' })),
      ...data.linkedShops.map(shop => ({ ...shop, type: 'shop' }))
    ];


    
  let headerContent = '';
  
  if (data.linkedRegion) {
    headerContent += `
      <div class="region-info">
        <span class="region-label">Region:</span>
        <span class="region-name region-link" data-region-uuid="${data.linkedRegion.uuid}" style="cursor: pointer; color: var(--cc-accent);">${data.linkedRegion.name}</span>
      </div>
    `;
  }
  
  if (data.linkedScene) {
    headerContent += `
      <div class="scene-info">
        
        <span class="scene-name open-scene" data-scene-uuid="${data.linkedScene.uuid}" title="Open Scene"> <i class="fas fa-map"></i> ${data.linkedScene.name}</span>

              ${game.user.isGM ? `<button type="button" class="scene-btn remove-scene" title="Unlink Scene">
          <i class="fas fa-unlink"></i>
        </button>`:''}
      </div>
    `;
  }
  else
  {   headerContent += `${game.user.isGM ? `<div class="scene-info">
        
        <span class="scene-name open-scene" style="text-align:center;"><i class="fas fa-link"></i> Drop scene to link</span>

      </div>`:''}
    `;}
  
  if (headerContent) {
    data.customHeaderContent = headerContent;
  }
  

    
    data.tabPanels = [
      {
        key: 'info',
        active: this._currentTab === 'info',
        content: this._generateInfoTab(data)
      },
      {
        key: 'npcs',
        active: this._currentTab === 'npcs',
        content: this._generateNPCsTab(data)
      },
      {
        key: 'shops', 
        active: this._currentTab === 'shops',
        content: this._generateShopsTab(data)
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
    let locationSection = '';
    
    if (data.linkedRegion) {
      locationSection = `
        <div class="form-section">
          <h3><i class="${TemplateComponents.getAsset('icon','region')}"></i> Region</h3>
          <div class="linked-actor-card">
            <div class="actor-image">
              <img src="${data.linkedRegion.img}" alt="${data.linkedRegion.name}">
            </div>
            <div class="actor-content">
              <h4 class="actor-name">${data.linkedRegion.name}</h4>
            </div>
            <div class="actor-actions">
              <button type="button" class="action-btn open-region" data-region-uuid="${data.linkedRegion.uuid}" title="Open Location">
                <i class="fas fa-external-link-alt"></i>
              </button>
              ${game.user.isGM ? `<button type="button" class="action-btn remove-location" title="Remove Location">
                <i class="fas fa-unlink"></i>
              </button>`:''}
            </div>
          </div>
        </div>
      `;
    } else {
      locationSection = `
      <div class="form-section">
           ${game.user.isGM ? `${TemplateComponents.dropZone('region', 'fas fa-globe', 'Set Region', 'Drag a region journal here to add this location to a region')}`:''}
      </div>`;
    }
    
    return `
      ${TemplateComponents.contentHeader('fas fas fa-info-circle', 'Information')}
      ${locationSection}
      ${TemplateComponents.richTextSection('Description', 'fas fa-align-left', data.sheetData.enrichedDescription, 'description')}
    `;
  }



_generateNPCsTab(data) {
  const dropToMapBtn = (canvas.scene && data.directNPCs && game.user.isGM && data.directNPCs.length > 0) ? `
    <button type="button" class="refresh-btn npcs-to-map-button" title="Drop direct NPCs to current scene">
      <i class="fas fa-map"></i>
      Drop Direct NPCs
    </button>
  ` : '';

  let content = `
    ${TemplateComponents.contentHeader('fas fa-users', 'NPCs at this Location', dropToMapBtn)}
    ${game.user.isGM ? `${TemplateComponents.dropZone('npc', 'fas fa-user-plus', 'Add NPCs', 'Drag NPCs or actors here to add them directly to this location')}`:''}
  `;

  if (data.directNPCs.length > 0) {
    content += `
      <div class="npc-section">
        <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
          <i class="fas fa-user" style="color: var(--cc-accent); margin-right: 8px;"></i>
          Direct NPCs (${data.directNPCs.length}) 
         </h3>
        ${TemplateComponents.entityGrid(data.directNPCs, 'npc', true)}
      </div>
    `;
  }

  if (data.shopNPCs.length > 0) {
    content += `
      <div class="npc-section">
        <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
          <i class="fas fa-book-open" style="color: var(--cc-accent); margin-right: 8px;"></i>
          Entry NPCs (${data.shopNPCs.length})
         </h3>
        ${TemplateComponents.infoBanner('NPCs automatically populated from entries at this location. Manage them through their respective entries.')}
        ${TemplateComponents.entityGrid(data.shopNPCs, 'npc', true)}
      </div>
    `;
  }

  if (data.allNPCs.length === 0) {
    content += TemplateComponents.emptyState('npc');
  }

  return content;
}


  _generateShopsTab(data) {
    const createShopBtn = game.user.isGM ? `
      <button type="button" class="refresh-btn create-shop-button" title="Create New Entry">
        <i class="fas fa-house-chimney-medical"></i>
      </button>` : '';

    return `
      ${TemplateComponents.contentHeader('fas fa-book-open', 'Entries at this Location', createShopBtn)}
      ${game.user.isGM ? `${TemplateComponents.dropZone('shop', 'fas fa-book-open', 'Add Entries', 'Drag entry journals here to add them to this location')}`:''}
      ${TemplateComponents.entityGrid(data.linkedShops, 'shop')}
    `;
  }

  async _onCreateShopJournal(event) {
    event.preventDefault();
    const name = await promptForName("Entry");
    if (name) {
      const shopJournal = await game.campaignCodex.createShopJournal(name);
      if (shopJournal) {
        await game.campaignCodex.linkLocationToShop(this.document, shopJournal);
        this.render(false);
        shopJournal.sheet.render(true);
      }
    }
  }



  _activateSheetSpecificListeners(html) {
   html.querySelector('.create-shop-button')?.addEventListener('click', this._onCreateShopJournal.bind(this));

    html.querySelector('.remove-npc')?.addEventListener('click', async (e) => {
      const npcUuid = e.currentTarget.dataset.npcUuid;
      const npcCard = e.currentTarget.closest('.entity-card');
      const isShopNPC = npcCard.querySelector('.shop-tags');
      
      if (isShopNPC) {
        ui.notifications.warn("Cannot remove entry NPCs directly. Remove them from their entries instead.");
        return;
      }
      
      await this._onRemoveFromList(e, 'linkedNPCs');
    });
    
    html.querySelector('.remove-location')?.addEventListener('click', this._onRemoveFromRegion.bind(this));
    html.querySelectorAll('.remove-shop')?.forEach(element => element.addEventListener('click', async (e) => await this._onRemoveFromList(e, 'linkedShops')));

    
    html.querySelectorAll('.open-npc')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'npc')));
    html.querySelectorAll('.open-shop')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'shop')));
    html.querySelectorAll('.open-actor')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'actor')));
    html.querySelectorAll('.open-region')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'region'))); 
  html.querySelector('.open-scene')?.addEventListener('click', this._onOpenScene.bind(this));
  html.querySelector('.remove-scene')?.addEventListener('click', this._onRemoveScene.bind(this));

    
    html.querySelectorAll('.npc-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'npc')));
    html.querySelectorAll('.shop-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'shop')));
    
    
    html.querySelectorAll('.region-link')?.forEach(element => element.addEventListener('click', async (e) => await this._onOpenDocument(e, 'region')));

    
    html.querySelector('.refresh-npcs')?.addEventListener('click', this._onRefreshNPCs.bind(this));
  }

  async _onRefreshNPCs(event) {
    this.render(false);
    ui.notifications.info("Location data refreshed!");
  }

  async _handleDrop(data, event) {
      if (data.type === "Scene") {
    await this._handleSceneDrop(data, event);
  } else if (data.type === "JournalEntry") {
      await this._handleJournalDrop(data, event);
    } else if (data.type === "Actor") {
      await this._handleActorDrop(data, event);
    }
  }

async _handleSceneDrop(data, event) {
  const scene = await fromUuid(data.uuid);
  if (!scene) {
    ui.notifications.warn("Could not find the dropped scene.");
    return;
  }
  
  await this._saveFormData();
  await game.campaignCodex.linkSceneToDocument(scene, this.document);
  ui.notifications.info(`Linked scene "${scene.name}" to ${this.document.name}`);
  this.render(false);
}


async _handleJournalDrop(data, event) {
  const journal = await fromUuid(data.uuid);
  if (!journal || journal.uuid === this.document.uuid) return; 

  const journalType = journal.getFlag("campaign-codex", "type");
  
  if (journalType === "npc") {
    await this._saveFormData();
    await game.campaignCodex.linkLocationToNPC(this.document, journal);
    this.render(false);
  } else if (journalType === "shop") {
    await this._saveFormData();
    await game.campaignCodex.linkLocationToShop(this.document, journal);
    this.render(false);
  } else if (journalType === "region") {
    await this._saveFormData();
    await game.campaignCodex.linkRegionToLocation(journal, this.document);
    ui.notifications.info(`Added "${this.document.name}" to region "${journal.name}"`);
    this.render(false);
  }
}


  getSheetType() {
    return "location";
  }

async _onOpenScene(event) {
  event.preventDefault();
  await game.campaignCodex.openLinkedScene(this.document);
}

async _onRemoveScene(event) {
  event.preventDefault();
  await this._saveFormData();
  const currentData = this.document.getFlag("campaign-codex", "data") || {};
  currentData.linkedScene = null;
  await this.document.setFlag("campaign-codex", "data", currentData);
  this.render(false);
  ui.notifications.info("Unlinked scene");
}


async _onDropNPCsToMapClick(event) {
  event.preventDefault();
  
  const locationData = this.document.getFlag("campaign-codex", "data") || {};
  const directNPCs = await CampaignCodexLinkers.getDirectNPCs(this.document,locationData.linkedNPCs || []);
  
  if (directNPCs && directNPCs.length > 0) {
    await this._onDropNPCsToMap(directNPCs, { 
      title: `Drop ${this.document.name} Direct NPCs to Map` 
    });
  } else {
    ui.notifications.warn("No direct NPCs with linked actors found to drop!");
  }
}
}
# Campaign Codex v13
Encounter a bug or issue with the Campaign Codex Foundry VTT module? Please report it [here](https://github.com/xthesaintx/cc13/issues).

Discord: https://discord.gg/fycwH79s2y

Website: www.wgtngm.com

Patreon: www.patreon.com/wgtngm

Campaign Codex extends the Foundry journaling system by providing bespoke journal sheet types, relationship linking, and organisational tools. The objective of Campaign Codex is to ensure that any campaign information, from short one-shots to expansive continent-spanning campaigns, can be accessed easily and efficiently. The module integrates five sheet types into Foundry’s journal panel. Campaign Codex complements Foundry’s core journal system rather than replacing it, preserving existing content. Each sheet type supports linking with scenes, actors, and items, creating an interconnected network of campaign information.

### Sheet Features and Functionality

Campaign Codex sheets incorporate drag-and-drop linking capabilities, enabling connections between different sheets and direct linking to items, scenes, and actors. This linking system provides automated relationship tracking.

Each sheet includes several standard components:

* Information Tab: Primary interface for entering and displaying information relevant to each sheet type.  
* Private Game Master’s Notes Tab: Dedicated area accessible only to Game Masters for recording sensitive information, plot developments, or private planning notes. This tab is invisible to players.  
* Customisable Cover Imagery: Select an image or pull in from linked actors.

### Sheet Types

Campaign Codex provides five sheet types, each designed to address specific aspects of campaign management:

NPC Sheets

Management system for non-player characters.

* Information Tab: Enables direct linking to actor sheets. Provides space for character descriptions, personality traits, and background information.  
* Locations Tab: Directly link locations associated with an NPC and auto-populate from linked Entries.  
* Entries Tab: Lists all “Points of Interest” (Entries) linked to the NPC, including establishments they operate, quests they provide, or encounters in which they participate.  
* Associates Tab: Link connected NPCs and display what Location and Entry they’re associated with.  
* Notes Tab: Private Game Master annotations.

Entry (Points of Interest) Sheets

For managing specific points of interest within campaigns, including commercial establishments, landmarks, quest locations, or encounters.

* Information Tab: Provides space for detailed location descriptions and allows assignment to parent locations (e.g., cities, regions).  
* Inventory Tab: Inventory management system for commercial establishments or treasure repositories. Features pricing functionality and includes a “loot mode” toggle that disables pricing for treasure caches or creature lairs. Inventory visibility can be controlled and hidden from players until revealed.  
* NPCs Tab: Lists all NPCs directly associated with the point of interest (e.g., proprietors, guardians, quest providers).  
* Notes Tab: Private Game Master annotations.

Location Sheets

For managing settlements, cities, dungeons, or defined geographical areas.

* Information Tab: Provides space for location descriptions and enables assignment to larger regions for hierarchical organisation.  
* NPCs Tab: Displays NPCs directly assigned to the location and those operating within local establishments (Entries).  
* Entries Tab: Lists all points of interest located within the area.  
* Notes Tab: Private Game Master annotations.

Region Sheets

For organising extensive geographical areas, including continents, kingdoms, or large wilderness zones.

* Information Tab: Provides regional descriptions and overviews.  
* Locations Tab: Lists all subordinate locations (cities, towns, dungeons) contained within the region.  
* NPCs Tab: Automatically populates with all NPCs existing within the entire region.  
* Entries Tab: Automatically compiles all points of interest found throughout the region.  
* Notes Tab: Private Game Master annotations.

Group Sheets

Organisational tool for combining various campaign elements into cohesive collections, suitable for specific adventures, ongoing storylines, or factions.

* Tree List: Hierarchical organisation of all linked sheets (NPCs, Entries, Locations, Regions, or additional Groups), enabling construction of interconnected narratives.  
* Read-Only View: Allows viewing of any linked sheet’s contents in read-only format directly within the group sheet, eliminating the need to open multiple journal entries.  
* Information Tab: General descriptions and overviews for the entire group.  
* NPCs Tab: Automatically aggregates all NPCs from linked sheets within the group.  
* Inventory Tab: Consolidates inventory items from all linked sheets (e.g., multiple shops or treasure hoards associated with the group).  
* Notes Tab: Private Game Master annotations.

### Export and Import Functionality

Campaign Codex includes export and import for campaign sharing or moving out of the world. This enables the transfer of complete journal sheet collections into compendia (for world or module distribution) whilst preserving established relationship links. Scenes, items, and actors linked within Campaign Codex sheets are included in transfers.

The import functionality will bring in complete collections of journal sheets and associated items, actors and scenes whilst maintaining linked relationships established during export.

*For distributing content to other worlds or others, creating self-contained modules is recommended. Modules must have unlocked Journal, Item, Scene, and Actor packs for Campaign Codex’s export capabilities.*

### Foundry Integration

The Journal Directory buttons

* Region Button: Creates journal sheets for defining geographical regions.  
* Location Button: Creates journal sheets for specific areas within regions.  
* Entry Button: Creates sheets for commercial premises, encounters, or points of interest.  
* NPC Button: Creates character journals with integration with actor sheets.  
* Group Button: Creates group sheets for organising various sheets into thematic collections.  
* Compendium Export: Initiates export processes for packaging complete campaign setups.  
* Compendium Import: Imports complete campaign setups into the current worlds.

Context Menu

The context menu when right-clicking journal entries within the Journal Directory has had two new options added:

* Export to Standard Journal: This will convert a Campaign Codex journal sheet into a standard flat Foundry Journal.  
* Add to Group: This will add the selected journal sheet to a group sheet.

Automated Folder Management

Campaign Codex creates and maintains dedicated folders for streamlined journal organisation:

* Campaign Codex – Regions  
* Campaign Codex – Locations  
* Campaign Codex – Entries  
* Campaign Codex – NPCs  
* Campaign Codex – Groups

Settings

* Enable/Disable folder management to suit your preferred organisational style.  
* Set a custom path for the system item currency for tailored system compatibility.

### Support & Community

For bug reports, feature requests or general chat about the module or other publications, please join our community on [Discord](https://discord.gg/k3ZzWF7y).

### Installation

1. In Foundry, navigate to the Add-on Modules tab.  
2. Click Install Module.  
3. Paste the manifest URL for your Foundry version:  
   * Foundry v12: [https://www.wgtngm.com/modules/cc/12/module.json](https://www.wgtngm.com/modules/cc/12/module.json)  
   * Foundry v13: [https://www.wgtngm.com/modules/cc/13/module.json](https://www.wgtngm.com/modules/cc/13/module.json)  
4. Click Install.  
5. Enable the module in your world.

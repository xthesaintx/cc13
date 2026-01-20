## 2.2.8
- mitigation for other styles whack-a-mole with fa icons and display properties

## 2.2.7
- fix when inventory at 0 cost still being deducted.
- updated tag and group selected sheet inventory to match base sheet inventory
- fixed currency displaying default

## 2.2.6
- ToC header button fix
- Linking npcs directly to group fix
- custom price, currency paths for auto deduction

## 2.2.5
- map marker scale in settings
- toc cc button colouring reenabled

## 2.2.4
- fixes (theming, tags)
- Moved add sheet button in ToC to window header
- added wfrp4e and shadow of the demon lord to the inventory auto deduct
- added tag buttons to the filter
- cc sheets added to default sheet list
- tag sheet added to create sheet list
- tag button in toc improvements


## 2.1.9
- Light / Dark Mode support
- Collapsing Sidebar
- Tag View improvement on group sheet
- Improved themes.
- Improved UI Inventory
- Notification push to player on permission changes
- Gallery Template added
- Saves the state of the group sidebar on close
- relationship tracker widgets
- new tag sheet
- convert NPC tag sheet to new tag sheet button
- group sheets can be tagged
- image gallery
- ToC tag cloud
- roll table widget
- weather widget
- event widget
- timeline widget
- changed some styling on the prosemirror so it collapses to 0 height if empty and inactive
- changed the widget manager initialisation so that widgets reliant on other modules can be quietly not activated.
- fix for when tthe heme is set to default
- fix for timeline widget for large timespans
- updated group NPC filters
- search filter added to inventory
- merchant widget rolls silently
- changed theme setting height from auto to 750
- widget updates to relationship trackers
- added multipliers to merchant tables
- added hidden to sheet tab config, hides tabs and elements from non-GM users
- fixed dnd 5e easy ref integration style
- fixed default browser theme conflicts
- drop members of groups and encounters from linked actor (group/encounter) sheets to the map and not the container
- updated calendar widgets to work with new event types
- macro widget
- move widgets above or below text on the info tab
- cards (npc, location, regions, etc.) can be dragged as per journals for linking and dropping to the map
- Items in inventory are draggable to shops and actor sheets
- players can now purchase from the store, automatic fund deduction available for fallout, dnd5e, shadowrun6-eden, pf1, shadowdark, swade, sfrpg & pf2e
- Player purchasing can be disabled in the settings
- Inventory items with 0 quantity will not show in the player view.
- filter added to send to player dialogue
- deduct funds added to send to player dialogue
- infinite toggle for inventory items
- scenes can be linked to groups
- inventory is sorted by type, and is collapsible
- added a converter when converting one cc type to another, giving the option to convert.
- default tab visibility for player added to tab config


## 1.5.8
- Regions can have multiple parents
- inventory bug fix
- Macro Compendium added, a migration macro is included.

## 1.5.7
- Bug fixes (currency can be 0)
- Tab override defaults can be overriden at sheet level, tabs with defaults will be highlighted
- Map marker input text box next to subtitle, can be hidden in sheet config
-

## 1.5.6
- updated the drag drop to the new v2 method
- group sheets now only check for circular, self link, and dup links at root
- Bug fixes
- CSS Bug fixes
- Removed inventory items from group sheet tree and and tab
- Added Entries to group sheet tab
- Implemented lazy loading on sheets
- Added a loading state for inventory if it's not finished processing data before the tab is selected.

## API
Assign the API:
- campaignCodexAPI = game.modules.get('campaign-codex')?.api;

### Copy Standard Journal to CC Sheet
Convert a journal with a text page or multiple text pages in a CC sheet of a type or multiples sheets
- campaignCodexAPI.convertJournalToCCSheet (uuid, type, pagesToSeparateSheets)
uuid: uuid of journal to copy
type: String, destination sheet type (location, npc, region, shop, group, tags)
pagesToSeparateSheets: Bool, will create a Campaign Codex sheet of type for each page in the journal


### Export to zip of md files
- campaignCodexAPI.exportToObsidian();


### Open the ToC Sheet
- campaignCodexAPI.openTOCSheet(type);

## 1.5.4
- Added Show to Players in the config menu
- Selected sheet on a group sheet: Tags tab removed, tags in header clickable
- Adding an existing item will add +1 to item in inventory
- fixed tag tab default visibility

## 1.5.3
- added option to disable custom map markers
- added option to default to cc-ui colour for map markers
- added calculation for dark or light text on map marker
= bug fixes (tag tab defaults, objective visibiliy, tab visibility, depth save state)

## 1.5
- Change ToC helper function to open to a tab (ie quests)
- Customise tab names and sheet icons
- Replicate the folder structure of the journal panel
- Drag drop from group tree view to map
- tighten up group tree spacing
- Widget implementation
- Inventory on all sheets
- set default tab visibility for sheet types
- hide, show, rename tabs (cog icon on sheet).
- hide show image on sheet
- Auto folder sorting not to auto sort duplication within sub folders if the subfolder is in the correct folder.
- TOC - Either a Tags view improvement
- group and standard linkers performance improvements
- can drag group tree nodes to other sheets and scenes
- All Sheets v2
- pinned quests will only show on quest board if set to visible.
- added custom icon override for sheets
- added currency in hand for inventory
- debounce on sheet refresh and tidy up of refreshes
- Added custom map markers for Campaign Codex journal entries. If a journal's name is prefixed with a map code (e.g., A01 - Foyer, A01 : Foyer, A01: Foyer, A01 Foyer, A01), the map note will now render as a circular icon displaying the code "A01". The recognized pattern is {Optional Letter}{1-3 Digits}{Optional Letter}{: or - with or with spaces}{Optional Name}."^([A-Z]?\d{1,3}[A-Z]?)(?=\s*[-: ]"
- Made openTOCSheet async and now takes an option to open a specific tab openTOCSheet("tab")
groups, regions, locations, shops, npcs, tags, quests
- Hide inventory toggle removed as tab visibility is now a thing
- Updated Welcome message
- Send Item to Player updated to V2
- Drop NPC dialog updated to v2
- Added templates
- made AllTags more robust
- max height added on the quest box description area
- Fixed some UI compatability with styling
- NPC card subtitle will come from sheet
- CC scene control button is part of the UI
- Templates in editor
- filter for TOC
- Styled CC Scene control toggle in settings (if on it uses the UI color from themes)
- Add user templates from folder selected in settings (will scan dir for HBS/HTML)
- Sheet Focus fix
- sub objectives
- reordering of sub objectives

## 0.9.9
- fix to the path for templates
- css fix player users themes


## 0.9.7
- folder auto organisation logic updated to not move journals duplicated in subfolder
- css fix to apply main text colour to editable text in info and notes for themes

## 0.9.4
- moved the templates to an array

## 0.9.3
- Updated Welcome message
- Items on Quests
- Quests sub objectives
- Max height added on the quest box description area
- Drag Drop reordering of objectives
- Confirmation dialog on Quest delete
- Added templates to text editor
- Added user templates from folder selected in settings (will scan dir for HBS/HTML)
- Added details/summary compatability to text editor
- Send Item to Player updated to V2
- Drop NPC dialog updated to v2
- Made AllTags more robust
- Fixed some UI compatability with styling
- NPC card subtitle will come from sheet
- Filter for TOC
- CC scene control button is part of the UI
- Styled CC Scene control toggle in settings (if on it uses the UI color from themes)
- Sheet Focus fix
- Improved Exports to standard journals and MD to include quests
- Converting standard journals to CC journals gives the option to bring in content.
- Various other bug fixes
- FR localisation added
- Remove image button

## 0.8.45
- quest board and table of contents
- themes in the core settings

## 0.8.31
- Add tags directly from sheet
- Create tags directly from sheet
- updated ui of quicklinks and tags
- customisable subtitle on sheets

## 0.8.25
- Toggle stats next to menu items on main sheets, viewable by GM only
- Export and Import overhaul
- Can select and export a root folder to a compendium (module) as a pack
- Can import packs, and will selectively bring in actors, items, scenes and journals
- Creating packs is additive, using the same pack name as an existing pack will add to it
- Creating whole world exports will clear and overwrite the module journal compendium

## 0.8.18
- Importer fix

## 0.8.16
- Added quests to sheets
- Regions and be added to regions
- Core setting to limit the number of layers of regions, default 5, max 10.
- removed ability to open scenes from compendium sheets
- updated the export / import feature. Exporting will overwrite journals in a module rather than timestamp but will keep scene notes and actors intact.

## 0.8.09
- Added compatability for Shadowdark item price
- Added option to toggle rounding of item price

## 0.8.08
- renamed to Campaign Codex instead of campaign-codex

## 0.8.07
- circular dependancy fix

## 0.8.05
- entity-name css text wrap fix

## 0.8.04
- Region Sheet NPC Tab fix

## 0.8.03
- Performance upgrade to all sheets
- Style update to buttons
- Multiple Journals tab 

## 0.8.01b
- Performance improvement on groupsheet
- image cropping improvement

## 0.7.88b
- Create journal dialog not working for NPCs fixed

## 0.7.87b
- Complete overhaul of linked cards, buttons and major UI improvements
- Complete overhaul of group sheets
- Refactored and fixed linking, link clean up and updating
- Refactored some link checking
- Refactored hooks
- Linked cards click through to sheets
- Add tag toggle to npc sheet
- Added tag information to side panel and on cards
- Fixed scrolling
- Fixed indirect link updating
- NPCs and tags on region sheets
- Moved permission checking to linkers
- Substantial back end code improvements

### Fixes
- Enter on Markup Unlinking standard journal

## 0.7.7b
- Added inline editors

## 0.7.61
- Inventory column header row fix when base price is disabled
- Fixed the Secret block reveal/hide button not working or appearing

## 0.7.6
- Sort Inventory A-Z on Shop Sheet  
- Link a journal or page to an information tab of a sheet or group sheet

### Core Settings

- Item price and denomination defaults added for Dungeons and Dragons 5e, Pathfinder 2e, Starfinder, Savage Worlds Adventure Edition, Pathfinder 1e, Old-School Essentials and Daggerheart  
- Override for Denomination  
- Show/Hide the Base Price column in the inventory  
- Enable/Disable automatically sort A-Z on cards (actors, locations)  
- Show/Hide cards if users aren't Observer or higher, auto-generated (entries and NPCs) cards

### Import/Export

- Added linked journals to import/export  
- Added a clean-up check for scenes and linked standard journals on export  
- Adventure Compendium compatibility  
- Added localisation framework, implementation in future version

### Clean up

- Added clean up for linked journals on journal deletion

### Sheet Creation

- Ability to create and link a location from a region sheet  
- Ability to create and link an entry from a location sheet  
- Ability to create and link an entry from a NPC sheet  
- Ability to create and link an NPC from a entry sheet  
- Create and link a location by dropping a scene onto the location tab of a region, and the scene links to the location. Checks for duplicates (same location name, same scene) and won't create  
- "Create Journal Entry" menu integration


### Group Sheets
- Allow duplicates of NPC in the Tree Node view

### User permissions

- Hiding links to other sheets that player users aren't Observer or higher  
- Hide Drop NPC to Map for non-GM users on sheets  
- Hide Mark up and loot toggles from non-GM users  
- Hide Notes from non-GM users  
- Disabled name edit for non-GM users  
- Hiding toggles and buttons from non-GM users  
- Hide stats (\#) on sidebar for non-GM users.  
- Make the info tab description edit button visible for users who are GM or Owner

### Fixes

- Force enable of some buttons for player users foundry disables by default  
- CSS Inventory List Item fix  
- Fix the Reference to Shop that should be Entry  
- Bug Fix: Fix one editor window resetting to the last saved state when another editor is saved or sheet updates.  
- Fix CSS for main images on sheet so landscape images are centred and portraits are centred top third (object-position: 50% 25%;)  
- Fixed names not updating on open linked journals until reopened
- v13: Fixed the DnD5e journal styling


## 0.7.5
- Moved to GitHub
- Fixed render on sheet creation

## 0.7.4
- main.js - 222 - Added to Create New Journal Dialog
- Added CSS for Monk's Enhanced Journal

## 0.7.3
- Updated Welcome Message to include github and fixed discord link
- Fixed css interference

## 0.7.2
- Changed manifest to point to different url
- Fixed context menu not working in v12

## 0.7.1
- Quick fix to CSS style for prosemirror editor for non D&D 5e Systems

## 0.7
- Launch versoin
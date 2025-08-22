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
/**
 * Macro to migrate Campaign Codex Region data.
 * Moves 'parentRegion' (string) to 'parentRegions' (array).
 */
const SCOPE = "campaign-codex";
const DATA_KEY = "data";
const TYPE_KEY = "type";

const regions = game.journal.filter(j => j.getFlag(SCOPE, TYPE_KEY) === "region");
let count = 0;

if (regions.length === 0) {
    ui.notifications.warn("No Campaign Codex regions found.");
} else {
    for (const doc of regions) {
        const data = doc.getFlag(SCOPE, DATA_KEY);

        if (!data || !data.parentRegion) continue;

        const newData = foundry.utils.deepClone(data);

        if (!Array.isArray(newData.parentRegions)) {
            newData.parentRegions = [];
        }

        if (!newData.parentRegions.includes(newData.parentRegion)) {
            newData.parentRegions.push(newData.parentRegion);
        }

        delete newData.parentRegion;

        await doc.setFlag(SCOPE, DATA_KEY, newData);
        
        console.log(`Campaign Codex | Migrated Region "${doc.name}": Moved parentRegion to parentRegions.`);
        count++;
    }

    ui.notifications.info(`Migration Complete: Updated ${count} regions.`);
}
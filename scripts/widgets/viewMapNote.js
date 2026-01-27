import { gameSystemClass } from "../helper.js";
import { localize, format, renderTemplate, isThemed, journalSystemClass } from "../helper.js"; 

const { DialogV2 } = foundry.applications.api;

class CodexMapNotePopup extends DialogV2 {
    constructor(options) {
        super(options);
        this.journal = options.codex?.journal;
        this.noteData = options.codex?.noteData;
    }

    /** * Inject "Open Journal" button into the window frame HTML.
     * @inheritDoc 
     */
    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;

        const openJournalBtn = `
            <button type="button" 
                    class="header-control fas fa-book icon" 
                    data-action="openJournal" 
                    data-tooltip="Open Journal">
            </button>
        `;
        if (this.journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) this.window.close.insertAdjacentHTML("beforebegin", openJournalBtn);
    
        return frame;
    }
}

export async function displayCodexNote(entryId, widgetId, noteId, origin = null) {
    const journal = game.journal.get(entryId);
    if (!journal) return ui.notifications.warn("Campaign Codex | Journal Entry not found.");

    const widgetData = journal.getFlag("campaign-codex", `data.widgets.mapnote.${widgetId}`);
    if (!widgetData?.notes) return ui.notifications.warn("Campaign Codex | Widget data missing.");

    const noteData = widgetData.notes.find(n => n.id === noteId);
    if (!noteData) {
        if (journal) journal.sheet.render(true);
        return ui.notifications.warn("Campaign Codex | Note and Journal content not found.");
    }

    const enrichedContent = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        noteData.content || "", 
        { async: true, secrets: journal.isOwner }
    );
    
    const parentJournal = journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) ? `: ${journal.name}` :'';

    
    const systemClass = gameSystemClass(game.system.id);
    const journalClass = journalSystemClass(game.system.id);
    const baseTitle = noteData.title || "Note";
    const windowTitle = `${baseTitle}${noteData.mapId ? ` [${noteData.mapId.toUpperCase()}]` : ""} ${parentJournal}`;
        const themeOverride = isThemed();

    const width = 600;
    const position = origin ? {
        width: width,
        height: "auto",
        top: origin.ty-42,
        left: origin.tx - (width / 2) 
    } : { width: width, height: "auto" };

    new CodexMapNotePopup({
        id:noteId,
        window: { 
            title: windowTitle, 
            resizable: true,
            icon: "fas fa-map-pin",
            minimizable: true,
            },
        classes: ["campaign-codex", "note-popup", "themed", themeOverride],
        position: position,
        codex: {
            journal: journal,
            noteData: noteData
        },

        actions: {
            openJournal: () => {
                if (journal) journal.sheet.render(true);
            }
        },

        content: `
            <article class="cc-enriched ${isThemed() ? 'themed':''} ${journalClass} ${isThemed()} ${systemClass}">
              <section class="journal-entry-content cc-non-owner-view">
                ${enrichedContent}
              </section>
            </article>  
        `,
        buttons: [
            {
                action: "close",
                label: "Close",
                icon: "fas fa-times",
                default: true
            }
        ]
    }).render(true);
}


export async function hoverCodexNote(entryId, widgetId, noteId, origin = null) {
    const journal = game.journal.get(entryId);
    if (!journal) return ui.notifications.warn("Campaign Codex | Journal Entry not found.");

    const widgetData = journal.getFlag("campaign-codex", `data.widgets.mapnote.${widgetId}`);
    if (!widgetData?.notes) return ui.notifications.warn("Campaign Codex | Widget data missing.");

    const noteData = widgetData.notes.find(n => n.id === noteId);
    if (!noteData) return;

    const enrichedContent = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        noteData.content || "", 
        { async: true, secrets: journal.isOwner }
    );
    
    const parentJournal = journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) ? `: ${journal.name}` :'';

            const themeOverride = isThemed();

    const systemClass = gameSystemClass(game.system.id);
    const journalClass = journalSystemClass(game.system.id);
    const baseTitle = noteData.title || "Note";
    const windowTitle = `${baseTitle}${noteData.mapId ? ` [${noteData.mapId.toUpperCase()}]` : ""} ${parentJournal}`;
    const height = "auto";
    const width = 300;
    const position = origin ? {
        width: width,
        height: height,
        top: origin.ty ,
        left: origin.tx - (width / 2) 
    } : { width: width, height: height };

    const app = new CodexMapNotePopup({
        id: `hover-${noteId}`,
        window: { 
            title: windowTitle, 
            resizable: false,
            icon: "fas fa-map-pin",
            minimizable: false,
            },
        classes: ["campaign-codex", "note-popup", "hover-note", "themed", themeOverride],
        position: position,
        codex: {
            journal: journal,
            noteData: noteData
        },

        actions: {
            openJournal: () => {
                if (journal) journal.sheet.render(true);
            }
        },

        content: `
            <article class="cc-enriched ${isThemed() ? 'themed':''} ${journalClass} ${isThemed()} ${systemClass}">
              <section class="journal-entry-content cc-non-owner-view">
                ${enrichedContent}
              </section>
            </article>
            <div class="codex-overflow-indicator">
                   ...
            </div>  
        `,
        buttons: [
            {
                action: "close",
                label: "Close",
                icon: "fas fa-times",
                default: true
            }
        ]
    });
    await app.render(true);
    if (app.element && origin) {
        const renderedHeight = app.element.offsetHeight;
        const newTop = app.position.top - (renderedHeight / 2);
        
        app.setPosition({
            top: newTop
        });
    }
if (app.element) {
        app.element.addEventListener('mouseleave', () => {
            app.element.style.display = 'none';
            app.close();
        });
        const contentWrapper = app.element.querySelector('.cc-enriched');
        const contentEl = app.element.querySelector('.journal-entry-content');
        const indicator = app.element.querySelector('.codex-overflow-indicator');
        
        if (contentEl && indicator) {
            if (contentEl.scrollHeight > contentEl.parentElement.clientHeight) {
                indicator.style.display = 'block';
                contentWrapper.classList.add("overflow")
            }
        }

        app.element.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
            app.close();
            displayCodexNote(entryId, widgetId, noteId, origin);
        });
    }

    return app;

}
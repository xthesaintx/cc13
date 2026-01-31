import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { gameSystemClass } from "../helper.js";
import { localize, format, renderTemplate, isThemed, journalSystemClass } from "../helper.js";

export class MapNoteWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.notes = widgetData.notes || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const notes = savedData.notes || [];
        const isGM = game.user.isGM;

        const enrichedNotes = notes
            .filter(n => isGM || n.visible)
            .map(n => ({
                ...n,
                title: n.title || "New Note",
                mapId: n.mapId || "",
                visible: n.visible ?? false,
                visibilityIcon: n.visible ? "fa-eye" : "fa-eye-slash",
                visibilityTitle: n.visible ? "Player Visible" : "Player Hidden",
                isGM: isGM // Pass to individual note for template logic
            }));

        return {
            id: this.widgetId,
            notes: enrichedNotes,
            isGM: isGM,
            entryId: this.document.id,
            entryUuid: this.document.uuid
        };
    }
    async render() {
        const context = await this._prepareContext();
        return await renderTemplate("modules/campaign-codex/templates/widgets/map-notes.hbs", context);
    }

    async _updateNoteData(id, updates) {
        if (updates.mapId) {
            updates.mapId = updates.mapId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4);
        }

        const savedData = (await this.getData()) || {};
        const notes = [...(savedData.notes || [])]; 
        const index = notes.findIndex(n => n.id === id);
        
        if (index === -1) return;

        notes[index] = { ...notes[index], ...updates };
        await this.saveData({ notes });

        if (canvas.ready && (updates.mapId !== undefined || updates.title !== undefined)) {
            const noteUpdates = canvas.notes.placeables
                .filter(n => n.document.getFlag("campaign-codex", "noteid") === id)
                .map(n => ({
                    _id: n.document.id,
                    text: updates.title ?? n.document.text,
                    "flags.campaign-codex.markerid": updates.mapId ?? n.document.getFlag("campaign-codex", "markerid")
                }));

            if (noteUpdates.length > 0) {
                await canvas.scene.updateEmbeddedDocuments("Note", noteUpdates);
            }
        }
    }

    /**
     * Efficient Refresh: Target the specific DOM node
     */
    async _refreshWidget() {
        const htmlElement = document.getElementById(`widget-${this.widgetId}`);
        if (!htmlElement) return;

        const newHtml = await this.render();
        const newNode = foundry.utils.elementCreateFromString(newHtml);
        
        // Swap only the content to preserve scroll position if possible
        htmlElement.replaceWith(newNode);
        this.activateListeners(newNode);
    }


    async activateListeners(htmlElement) {
        htmlElement.querySelector('[data-action="add"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this._createNote();
        });

        htmlElement.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                await this._deleteNote(id);
            });
        });

        htmlElement.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                this._viewNote(id, true); // editMode = true
            });
        });

        htmlElement.querySelectorAll('.note-card[data-action="view"]').forEach(div => {
            div.addEventListener('click', (e) => {
                if (e.target.closest('.note-actions')) return;
                if (e.target.closest('input')) return; 
                if (e.currentTarget.closest('.note-card').classList.contains('dragging')) return;
                
                e.preventDefault();
                const id = e.currentTarget.dataset.id;
                this._viewNote(id, false); // editMode = false
            });
        });

        htmlElement.querySelectorAll('.note-title-input').forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            
            input.addEventListener('change', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const newTitle = e.currentTarget.value;
                await this._updateNoteData(id, { title: newTitle });
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            });
        });



        htmlElement.querySelectorAll('.note-mapId-input').forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('input', function() {
                this.value = this.value.replace(/[^a-zA-Z0-9]/g, "");
            });
            input.addEventListener('change', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const newMapId = e.currentTarget.value;
                await this._updateNoteData(id, { mapId: newMapId });
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            });
        });     

        htmlElement.querySelectorAll('[data-action="toggle-visibility"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                await this._toggleVisibility(id);
            });
        });

        htmlElement.querySelectorAll('.note-card[data-drag="true"]').forEach(card => {
             card.addEventListener('dragstart', (e) => this._onDragStart(e));
        });
    }


async _toggleVisibility(id) {
        const savedData = (await this.getData()) || {};
        const notes = savedData.notes || [];
        const index = notes.findIndex(n => n.id === id);
        
        if (index !== -1) {
            const currentState = notes[index].visible ?? false;
            notes[index] = { ...notes[index], visible: !currentState };
            
            await this.saveData({ notes });
        }
    }

    async _onDragStart(event) {
        const el = event.currentTarget;
        if ('link' in event.target.dataset) return;
        let journalID = event.target.dataset.entryId;
        let journalData = game.journal.get(journalID);
        if (!journalData) return;
        let dragDataB = journalData.toDragData();

        const noteTitle = el.dataset.title || "New Note";
        const noteId = el.dataset.id; 
        const mapId = el.dataset.mapId || ""; 
        const widgetId = this.widgetId; 

        game.user._tempNoteDrop = {
            uuid: journalData.uuid,
            label: noteTitle,
        
            flags: {
                "campaign-codex": {
                    noteid: noteId,
                    widgetid: widgetId,
                    markerid: mapId
                }
            }
        };


        dragDataB.noteLabel = noteTitle;
        if (!dragDataB) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(dragDataB));
    }

    async _deleteNote(id) {
        const confirm = await this.confirmationDialog("Are you sure you want to delete this note?");
        if (!confirm) return;

        const savedData = (await this.getData()) || {};
        let notes = savedData.notes || [];
        notes = notes.filter(n => n.id !== id);

        await this.saveData({ notes });
        this._refreshWidget();
    }


    async _createNote() {
        const newId = foundry.utils.randomID();
        const newNote = {
            id: newId,
            content: "",
            title: "New Note",
            mapId: "",
            visible: false
        };
        await this._viewNote(newId, true, newNote);
    }

/**
     * Opens the note editor.
     * @param {string} noteId 
     * @param {boolean} editMode 
     * @param {object|null} newNoteData - If present, this is a new unsaved note from _createNote.
     */
    async _viewNote(noteId, editMode = false, newNoteData = null) {
        // 1. Determine Source of Truth
        // If newNoteData exists, use it. Otherwise try to find it in DB.
        let note = newNoteData;

        if (!note) {
            const savedData = (await this.getData()) || {};
            const notes = savedData.notes || [];
            note = notes.find(n => n.id === noteId);
        }
        
        // If it's not in DB and not passed as new, we can't show it.
        if (!note) return;

        const isOwner = this.document.isOwner;
        const canEdit = isOwner && editMode;

        const enrichedContent = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            note.content, 
            { async: true, secrets: isOwner }
        );

        const systemClass = gameSystemClass(game.system.id);
        const journalClass = journalSystemClass(game.system.id);
        let contentHtml = "";

        if (canEdit) {
            const rawContent = foundry.utils.escapeHTML(note.content || "");
            
            contentHtml = `
              <article class="cc-enriched ${isThemed() ? 'themed':''} ${isThemed()} ${systemClass}">
                <section class="journal-entry-content">
                  <prose-mirror name="flags.campaign-codex.data.${note.id}" value="${rawContent}" compact="true" class="journal-page-content cc-prosemirror ${journalClass} ${isThemed() ? 'themed':''} ${isThemed()}">
                    ${enrichedContent}
                  </prose-mirror>
                </section>
              </article>
            `;
        } else {
            contentHtml = `
                <article class="cc-enriched ${isThemed() ? 'themed':''} ${journalClass} ${isThemed()} ${systemClass}">
                  <section class="journal-entry-content cc-non-owner-view">
                    ${enrichedContent}
                  </section>
                </article>                
            `;
        }
        const themeOverride = isThemed();
        const ccEditMode = editMode ? "edit-mode" : "read-mode";
        const { DialogV2 } = foundry.applications.api;
        const baseTitle = note.title || "Note";
        const windowTitle = `${baseTitle}${note.mapId ? ` [${note.mapId}]` : ""}`;

        const dialog = new DialogV2({
            window: { title: windowTitle || "Note", resizable: true },
            id: noteId,
            modal: false,
            classes: ["cc-map-widget", "campaign-codex", "note-dialog", ccEditMode, themeOverride, "themed"],
            content: contentHtml,
            buttons: [
                {
                    action: "close",
                    label: "Close",
                    icon: "fas fa-times"
                }
            ],
            position: { width: 550, height: "auto" }
        });

        const rendered = await dialog.render(true);
        const html = rendered.element;

        if (canEdit) {
            const proseMirror = html.querySelector('prose-mirror');

            if (proseMirror && !proseMirror.dataset.listenerAttached) {
                proseMirror.dataset.listenerAttached = "true";
                
                proseMirror.addEventListener('save', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (proseMirror.dataset.saving === "true") return;
                    proseMirror.dataset.saving = "true";
                    try {
                        const target = event.currentTarget;
                        let valueToSave = Array.isArray(target.value) ? target.value[0] : target.value;
                        
                        if (newNoteData) {
                            const currentData = (await this.getData()) || {};
                            const currentNotes = currentData.notes || [];

                            const existingIndex = currentNotes.findIndex(n => n.id === noteId);

                            if (existingIndex > -1) {
                                currentNotes[existingIndex].content = valueToSave;
                            } else {
                                const noteToSave = { 
                                    ...newNoteData, 
                                    content: valueToSave 
                                };
                                currentNotes.push(noteToSave);
                            }

                            await this.saveData({ notes: currentNotes });

                        } else {
                            await this._updateNoteData(noteId, { content: valueToSave });
                        }
                    } finally {
                        proseMirror.dataset.saving = "false"; 
                    }
                    dialog.close();
                    this._refreshWidget();
                });
            }
        }
    }

    async _refreshWidget() {
        const htmlElement = document.getElementById(`widget-${this.widgetId}`);
        if (htmlElement && htmlElement.parentElement) {
            const container = htmlElement.parentElement;
            const newHtml = await this.render();
            container.innerHTML = newHtml;
            this.activateListeners(container);
        }
    }
}
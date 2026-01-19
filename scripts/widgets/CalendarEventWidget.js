import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class CalendarEventWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.moduleId = "wgtgm-mini-calendar";
        this.journalName = "Calendar Events - Mini Calendar";
    }

    async _prepareContext() {
        const calendar = game.time.calendar;
        if (!calendar) return { error: "Calendar system not ready." };

        const miniCal = game.wgtngmMiniCalender?.calendarInstance || game.wgtngmMiniCalender;
        if (!miniCal) return { error: "Mini Calendar not initialized." };

        const journal = game.journal.getName(this.journalName);
        if (!journal) return { error: `Journal "${this.journalName}" not found.` };

        const pageMap = new Map();
        journal.pages.forEach(page => pageMap.set(page.name, page));

        const upcomingEvents = [];
        
        const secondsPerDay = calendar.days.hoursPerDay * calendar.days.minutesPerHour * calendar.days.secondsPerMinute;
        const startTimestamp = game.time.worldTime;
        const daysInWeek = calendar?.days?.values?.length || 7;

        for (let i = 0; i < daysInWeek; i++) {
            const targetTime = startTimestamp + (i * secondsPerDay);
            const dateComponents = calendar.timeToComponents(targetTime);
            
            const dateObj = {
                year: dateComponents.year,
                month: dateComponents.month,
                day: dateComponents.dayOfMonth
            };

            const notes = await miniCal._getNotesForDay(dateObj, journal, pageMap);

            if (notes && notes.length > 0) {
                const visibleNotes = this.isGM ? notes : notes.filter(n => n.playerVisible);
                
                visibleNotes.forEach(note => {
                    upcomingEvents.push({
                        title: note.title,
                        hour: note.hour || "",
                        minute: note.minute || "",
                        icon: note.icon || "fas fa-book",
                        content: note.content,
                        displayDate: i === 0 ? "Today" : `${calendar.months.values[dateObj.month].abbreviation} ${dateObj.day + 1}`,
                        isRecurring: !!note.isRecurringInstance,
                        isToday: i === 0
                    });
                });
            }
        }

        return {
            daysInWeek: daysInWeek,
            id: this.widgetId,
            events: upcomingEvents,
            hasEvents: upcomingEvents.length > 0,
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();

        if (data.error) return `<div class="cc-widget-error">${data.error}</div>`;

        const listHtml = data.events.map(e => `
            <div class="event-row ${e.isToday ? 'today' : ''}" style="cursor: pointer;">
                <div class="event-date">
                    <span>${e.displayDate}</span>
                </div>
                <div class="event-content">
                    <div class="event-title">
                        <span class="event-icon-title"><i class="${e.icon}"></i> ${e.title} 
                        ${e.isRecurring ? '<i class="fas fa-repeat" title="Recurring" style="font-size:0.7em; opacity:0.5; margin-left:4px;"></i>' : ''}
                        </span>
                        <span class="event-time" style="font-size:0.7em; color: var(--cc-accent); margin-left:4px;">${e.hour}${e.hour ? ':':''}${e.minute}</span>
                    </div>
                    <div class="event-details" style="display: none;">
                        ${e.content || ''}
                    </div>
                </div>
            </div>
        `).join("");

        return `
            <div class="cc-widget-event" id="widget-${this.widgetId}">
                <div class="event-header">
                    Upcoming Events (${data.daysInWeek} Days)
                </div>
                <div class="event-body">
                    ${data.hasEvents ? listHtml : `<div class="event-empty">No upcoming events.</div>`}
                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        const widgetRoot = htmlElement;
        const rows = widgetRoot.querySelectorAll('.event-row');
        rows.forEach(row => {
            row.addEventListener('click', (ev) => {
                ev.stopPropagation(); 
                const details = row.querySelector('.event-details');
                if (details) {
                    const isHidden = details.style.display === 'none';
                    details.style.display = isHidden ? 'block' : 'none';
                    row.classList.toggle('expanded', isHidden);
                }
            });
        });
    }
}
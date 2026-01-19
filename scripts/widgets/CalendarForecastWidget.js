import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class CalendarForecastWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.moduleId = "wgtgm-mini-calendar";
        this.journalName = "Calendar Events - Mini Calendar";
    }

    async _prepareContext() {
        const journal = game.journal.getName(this.journalName);
        if (!journal) return { error: "Calendar Journal not found." };

        const weatherPage = journal.pages.getName("Weather History");
        if (!weatherPage) return { error: "Weather History not initialized." };

        const history = weatherPage.getFlag(this.moduleId, "history") || {};
        const calendar = game.time.calendar; 

        if (!calendar) return { error: "Calendar system not ready." };

        const now = calendar.timeToComponents(game.time.worldTime);
        const forecast = [];

        for (let i = 0; i < 5; i++) {
            const secondsPerDay = calendar.days.hoursPerDay * calendar.days.minutesPerHour * calendar.days.secondsPerMinute;
            const targetTime = game.time.worldTime + (i * secondsPerDay);
            const date = calendar.timeToComponents(targetTime);
            
            const key = `${date.year}-${date.month}-${date.dayOfMonth}`;
            const weatherData = history[key];

            const dayName = calendar.days.values[date.dayOfWeek]?.abbreviation || "Day";
            const dateDisplay = i === 0 ? "Today" : `${game.i18n.localize(dayName)} ${date.dayOfMonth + 1}`;

            if (weatherData) {
                forecast.push({
                    day: dateDisplay,
                    icon: weatherData.icon || "fas fa-question",
                    temp: this._formatTemp(weatherData.temp),
                    label: weatherData.label || "Unknown",
                    isToday: i === 0
                });
            } else {
                forecast.push({
                    day: dateDisplay,
                    icon: "fas fa-minus",
                    temp: "--",
                    label: "No Data",
                    isToday: i === 0
                });
            }
        }

        return {
            id: this.widgetId,
            current: forecast[0], 
            upcoming: forecast.slice(1), 
            season: this._getCurrentSeason(calendar, now.month),
            isGM: this.isGM
        };
    }

    _formatTemp(temp) {
        if (temp === undefined || temp === null) return "";
        const useCelsius = game.settings.get("wgtgm-mini-calendar", "useCelsius");
        const val = parseFloat(temp) || 0;
        const tempDisplay =  useCelsius ? "ºC" : "ºF";
        const displayTemp = useCelsius ? Math.round((val- 32)* 5/9) : val;
        return displayTemp + tempDisplay;
    }

    _getCurrentSeason(calendar, monthIndex) {
        if (!calendar.seasons?.values) return "";
        const monthOrdinal = calendar.months.values[monthIndex].ordinal;
        const season = calendar.seasons.values.find(s => 
            (s.monthStart <= s.monthEnd) 
                ? (monthOrdinal >= s.monthStart && monthOrdinal <= s.monthEnd)
                : (monthOrdinal >= s.monthStart || monthOrdinal <= s.monthEnd)
        );
        return season ? season.name : "";
    }

    async render() {
        const data = await this._prepareContext();
        if (data.error) return `<div class="cc-widget-error">${data.error}</div>`;

        const upcomingHtml = data.upcoming.map(d => `
            <div class="forecast-day">
                <span class="day-name">${d.day}</span>
                <i class="${d.icon} day-icon"></i>
                <span class="day-temp">${d.temp}</span>
            </div>
        `).join("");

        return `
            <div class="cc-widget-forecast" id="widget-${this.widgetId}">
                <div class="forecast-main">
                    <div class="main-info">
                        <span class="season-label">${game.i18n.localize(data.season)}</span>
                        <div class="temp-large">${data.current.temp}</div>
                        <div class="condition-label">${data.current.label}</div>
                    </div>
                    <i class="${data.current.icon} main-icon"></i>
                </div>
                
                <div class="forecast-strip">
                    ${upcomingHtml}
                </div>
            </div>
        `;
    }
}
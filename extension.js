const config = {
    tabTitle: "Weathercards",
    settings: [
        {
            id: "weather-wxApiKey",
            name: "API Key",
            description: "API Key from https://openweathermap.org/api",
            action: { type: "input", placeholder: "Open Weather Map API Key" },
        },
        {
            id: "weather-weatherDefaultLocation",
            name: "Location",
            description: "City, Country",
            action: { type: "input", placeholder: "melbourne,au" },
        },
        {
            id: "weather-wxUnits",
            name: "Units",
            description: "Set this to imperial or metric as desired",
            action: { type: "select", items: ["metric", "imperial"] },
        },
        {
            id: "weather-number",
            name: "How Many Days?",
            description: "How many cards would you like to show?",
            action: { type: "select", items: ["Today Only", "2", "3", "4", "5", "6", "7", "8"] },
        },
    ]
};

const alertTextByUid = new Map();

// copied and adapted from https://github.com/dvargas92495/roamjs-components/blob/main/src/writes/createBlock.ts
const createBlock = (params) => {
    const uid = params.node.uid || window.roamAlphaAPI.util.generateUID();
    const block = {
        uid,
        string: params.node.text
    };
    if (params.node.props) {
        block.props = params.node.props;
    }
    return Promise.all([
        window.roamAlphaAPI.createBlock({
            location: {
                "parent-uid": params.parentUid,
                order: params.order,
            },
            block
        })
    ].concat((params.node.children || []).map((node, order) =>
        createBlock({ parentUid: uid, order, node })
    )))
};

export default {
    onload: ({ extensionAPI }) => {
        extensionAPI.settings.panel.create(config);

        const ensureAlertTooltip = () => {
            let tooltip = document.querySelector(".wx-alert-tooltip");
            if (!tooltip) {
                tooltip = document.createElement("div");
                tooltip.className = "wx-alert-tooltip";
                tooltip.style.display = "none";
                document.body.appendChild(tooltip);
            }
            return tooltip;
        };

        const showAlertTooltip = (pillEl, text) => {
            const tooltip = ensureAlertTooltip();
            tooltip.textContent = text;
            tooltip.style.display = "block";
            const rect = pillEl.getBoundingClientRect();
            const padding = 6;
            const maxWidth = Math.min(420, window.innerWidth - padding * 2);
            tooltip.style.maxWidth = maxWidth + "px";
            let left = rect.left;
            let top = rect.bottom + 6;
            const tooltipRect = tooltip.getBoundingClientRect();
            if (left + tooltipRect.width > window.innerWidth - padding) {
                left = window.innerWidth - padding - tooltipRect.width;
            }
            if (left < padding) {
                left = padding;
            }
            if (top + tooltipRect.height > window.innerHeight - padding) {
                top = rect.top - tooltipRect.height - 6;
            }
            tooltip.style.left = left + "px";
            tooltip.style.top = top + "px";
        };

        const hideAlertTooltip = () => {
            const tooltip = document.querySelector(".wx-alert-tooltip");
            if (tooltip) {
                tooltip.style.display = "none";
            }
        };

        const alertTooltipHandler = async (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const pill = target.closest('span[data-tag="wx-alert-pill"]');
            if (!pill) {
                return;
            }
            const container = pill.closest(".roam-block-container");
            const uid = container?.getAttribute("data-block-uid");
            if (!uid) {
                return;
            }
            const text = await getAlertTextForUid(uid);
            if (!text) {
                return;
            }
            showAlertTooltip(pill, text);
        };

        const alertTooltipLeaveHandler = (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const pill = target.closest('span[data-tag="wx-alert-pill"]');
            if (!pill) {
                return;
            }
            hideAlertTooltip();
        };

        const alertTooltipScrollHandler = () => {
            hideAlertTooltip();
        };

        window.weathercardsAlertTooltipHandler = alertTooltipHandler;
        window.weathercardsAlertTooltipLeaveHandler = alertTooltipLeaveHandler;
        window.weathercardsAlertTooltipScrollHandler = alertTooltipScrollHandler;
        document.body.addEventListener("mouseover", window.weathercardsAlertTooltipHandler, true);
        document.body.addEventListener("mouseout", window.weathercardsAlertTooltipLeaveHandler, true);
        window.addEventListener("scroll", window.weathercardsAlertTooltipScrollHandler, true);

        extensionAPI.ui.commandPalette.addCommand({
            label: "Weathercards",
            callback: () => {
                const uid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
                weather().then(async (blocks) => {
                    if (!Array.isArray(blocks) || blocks.length === 0) {
                        return;
                    }
                    if (uid != undefined) {
                        const headerNode = blocks[0];
                        await window.roamAlphaAPI.updateBlock({
                            block: { uid, string: headerNode.text }
                        });
                        if (headerNode.alertText) {
                            alertTextByUid.set(uid, headerNode.alertText);
                            await setAlertProp(uid, headerNode.alertText);
                        }
                        (headerNode.children || []).forEach((node, order) => createBlock({
                            parentUid: uid,
                            order,
                            node
                        }));
                    } else {
                        const parentUid = await getCurrentPageUid();
                        if (!parentUid) {
                            return;
                        }
                        blocks.forEach((node, order) => createBlock({
                            parentUid,
                            order,
                            node
                        }));
                    }
                });
            },
        });

        const args = {
            text: "WEATHERCARDS",
            help: "Import the weather forecast from Open Weather Map",
            handler: (context) => weather,
        };

        if (window.roamjs?.extension?.smartblocks) {
            window.roamjs.extension.smartblocks.registerCommand(args);
        } else {
            document.body.addEventListener(
                `roamjs:smartblocks:loaded`,
                () =>
                    window.roamjs?.extension.smartblocks &&
                    window.roamjs.extension.smartblocks.registerCommand(args)
            );
        }

        async function weather() {
            var key, wxUnits;
            breakme: {
                if (!extensionAPI.settings.get("weather-wxApiKey")) {
                    key = "API";
                    sendConfigAlert(key);
                    return [];
                } else if (!extensionAPI.settings.get("weather-weatherDefaultLocation")) {
                    key = "location";
                    sendConfigAlert(key);
                    return [];
                } else {
                    const wxApiKey = extensionAPI.settings.get("weather-wxApiKey");
                    const wxLocation = extensionAPI.settings.get("weather-weatherDefaultLocation");
                    const rawUnits = extensionAPI.settings.get("weather-wxUnits");
                    const unitsRegex = /^(metric|imperial)$/;
                    if (!rawUnits || rawUnits === "metric") {
                        wxUnits = "metric";
                    } else if (unitsRegex.test(rawUnits)) {
                        wxUnits = rawUnits;
                    } else {
                        key = "units";
                        sendConfigAlert(key);
                        return [];
                    }
                    var wxNumber = 1;
                    const rawNumber = extensionAPI.settings.get("weather-number");
                    if (rawNumber && rawNumber !== "Today Only") {
                        const parsed = parseInt(rawNumber, 10);
                        if (!Number.isNaN(parsed) && parsed > 0) {
                            wxNumber = parsed;
                        }
                    }

                    function toSentenceCase(str) {
                        if ((str === null) || (str === '')) {
                            return;
                        } else {
                            str = str.toString();
                            return str.replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
                        }
                    }

                    /* fetch weather forecast data */
                    try {
                        var url = 'https://api.openweathermap.org/geo/1.0/direct?q='
                            + encodeURIComponent(wxLocation)
                            + '&limit=1&'
                            + 'APPID=' + wxApiKey;
                        var requestResults = await fetch(url);
                        if (!requestResults.ok) {
                            throw new Error("Geocoding request failed");
                        }
                        var dataResults = await requestResults.json();
                        if (!Array.isArray(dataResults) || dataResults.length === 0) {
                            throw new Error("No geocoding results");
                        }

                        var lat = dataResults[0].lat;
                        var lon = dataResults[0].lon;
                        if (dataResults[0].state) {
                            var wxLocationName = dataResults[0].name + ', ' + dataResults[0].state + ' (' + dataResults[0].country + ')';
                        } else {
                            var wxLocationName = dataResults[0].name + ' (' + dataResults[0].country + ')';
                        }

                        var url = 'https://api.openweathermap.org/data/3.0/onecall?'
                            + 'lat=' + lat + '&lon=' + lon
                            + '&units=' + wxUnits + '&'
                            + 'exclude=minutely,hourly&'
                            + 'APPID=' + wxApiKey;
                        var requestResults = await fetch(url);
                        if (!requestResults.ok) {
                            throw new Error("Weather request failed");
                        }
                        var dataResults = await requestResults.json();
                    
                    if (dataResults.hasOwnProperty("cod") && dataResults.cod == 401) {
                        key = "API3";
                        sendConfigAlert(key);
                        break breakme;
                    } else {
                        var curTimezone = new Date().getTimezoneOffset();
                        var weatherTimezone = dataResults.timezone_offset / 60 * -1;
                        var tzDiff = curTimezone - weatherTimezone;
                        var wxAlerts = '';
    
                        let days = [];
                        for (var i = 0; i < parseInt(wxNumber); i++) {
                            const date = new Date(dataResults.daily[i].dt * 1000);
                            var wxDay = '**' + formatDate(date, "#DDDD#, #MMM# #DD#, #YYYY#") + '**';
                            var wxDescription = toSentenceCase(dataResults.daily[i].weather[0].description);
                            var wxHighTemperature = Math.round(dataResults.daily[i].temp.max);
                            var wxLowTemperature = Math.round(dataResults.daily[i].temp.min);
                            var wxMorning = Math.round(dataResults.daily[i].temp.morn);
                            var wxAfternoon = Math.round(dataResults.daily[i].temp.day);
                            var wxEvening = Math.round(dataResults.daily[i].temp.eve);
                            var wxPrecip = Math.round(dataResults.daily[i].pop * 100);
                            var wxInfo = "";
    
                            if (i == 0) {
                                var wxDescriptionCur = toSentenceCase(dataResults.current.weather[0].description);
                                var wxConditions = dataResults.current.weather[0].main;
                                var wxCurTemperature = Math.round(dataResults.current.temp);
                                var wxHumidity = Math.round(dataResults.current.humidity);
                                const dateS = new Date(dataResults.current.sunrise * 1000);
                                var wxSunrise = '' + formatDate(dateS, "#h#:#mm# #AMPM#") + '';
                                const dateSS = new Date(dataResults.current.sunset * 1000);
                                var wxSunset = '' + formatDate(dateSS, "#h#:#mm# #AMPM#") + '';
                                var wxWindSpeed = Math.round(dataResults.current.wind_speed);
                                if (wxUnits == "imperial") {
                                    wxWindSpeed += "mph";
                                } else {
                                    wxWindSpeed = Math.round(parseInt(wxWindSpeed) * 3.6);
                                    wxWindSpeed += "kph";
                                }
    
                                wxInfo += '**Today, **' + wxDay + '\n'
                                    + '\n'
                                    + '**Currently: **' + wxDescriptionCur + ' (' + wxCurTemperature + '°)\n'
                                    + '**Forecast: **' + wxDescription + ' (' + wxHighTemperature + '°/' + wxLowTemperature + '°)\n'
                                    + '**Morn: **' + wxMorning + '° **Day: **' + wxAfternoon + '° **Eve: **' + wxEvening + '°\n'
                                    + '**Prec: **' + wxPrecip + '% **Wind: **' + wxWindSpeed + ' **Hum: **' + wxHumidity + '%\n'
                                    + '**Sunrise: **' + wxSunrise + ' **Sunset: **' + wxSunset + ' '
                                    + ' #wx-fc #weathercard #\[\[wx-' + wxConditions + '\]\]';
                            } else {
                                var wxConditions = dataResults.daily[i].weather[0].main;
                                const dateS = new Date(dataResults.daily[i].sunrise * 1000);
                                var wxSunrise = '' + formatDate(dateS, "#h#:#mm# #AMPM#") + '';
                                const dateSS = new Date(dataResults.daily[i].sunset * 1000);
                                var wxSunset = '' + formatDate(dateSS, "#h#:#mm# #AMPM#") + '';
                                var wxHumidity = Math.round(dataResults.daily[i].humidity);
                                var wxWindSpeed = Math.round(dataResults.daily[i].wind_speed);
                                if (wxUnits == "imperial") {
                                    wxWindSpeed += "mph";
                                } else {
                                    wxWindSpeed = Math.round(parseInt(wxWindSpeed) * 3.6);
                                    wxWindSpeed += "kph";
                                }
                                var wxPrecip = Math.round(dataResults.daily[i].pop * 100);
                                wxInfo += wxDay + '\n'
                                    + '\n'
                                    + '**Forecast: **' + wxDescription + ' (' + wxHighTemperature + '°/' + wxLowTemperature + '°)\n'
                                    + '**Morn: **' + wxMorning + '° **Day: **' + wxAfternoon + '° **Eve: **' + wxEvening + '°\n'
                                    + '**Prec: **' + wxPrecip + '% **Wind: **' + wxWindSpeed + ' **Hum: **' + wxHumidity + '%\n'
                                    + '**Sunrise: **' + wxSunrise + ' **Sunset: **' + wxSunset + ' '
                                    + ' #wx-fc #weathercard #\[\[wx-' + wxConditions + '\]\]';
                            }
                            days.push({ "text": wxInfo });
                        }
                        // update header 
                        const dateU = new Date(dataResults.current.dt * 1000);
                        var wxUpdateTime = '' + formatDate(dateU, "#hhh#:#mm# #AMPM#") + '';
    
                        let wxAlertPill = '';
                        let wxAlertText = '';
                        const headerUid = window.roamAlphaAPI.util.generateUID();
                        let headerProps = null;
                        if (dataResults.alerts) {
                            wxAlertPill = ' #wx-alert-pill';
                            wxAlertText = dataResults.alerts[0].description
                                .replace(/\n\*/g, 'linebreak')
                                .replace(/\n/g, ' ')
                                .replace(/linebreak/g, '\n*');
                            alertTextByUid.set(headerUid, wxAlertText);
                            headerProps = { "wx-alert-text": wxAlertText };
                        }
    
                        const headerChildren = days;

                        return [
                            {
                                uid: headerUid,
                                text: '**' + wxLocationName + '** __' + wxUpdateTime + '__' + wxAlertPill + ' #rm-grid #rm-grid-3c #.wx-header'.toString(),
                                props: headerProps || undefined,
                                alertText: wxAlertText || "",
                                children: headerChildren
                            },
                        ];
                    }
                    } catch (err) {
                        console.error("Weathercards error:", err);
                        return [];
                    }
                };
            }
        }
    },
    onunload: () => {
        if (window.roamjs?.extension?.smartblocks) {
            window.roamjs.extension.smartblocks.unregisterCommand("WEATHERCARDS");
        };
        if (window.weathercardsAlertTooltipHandler) {
            document.body.removeEventListener("mouseover", window.weathercardsAlertTooltipHandler, true);
            delete window.weathercardsAlertTooltipHandler;
        }
        if (window.weathercardsAlertTooltipLeaveHandler) {
            document.body.removeEventListener("mouseout", window.weathercardsAlertTooltipLeaveHandler, true);
            delete window.weathercardsAlertTooltipLeaveHandler;
        }
        if (window.weathercardsAlertTooltipScrollHandler) {
            window.removeEventListener("scroll", window.weathercardsAlertTooltipScrollHandler, true);
            delete window.weathercardsAlertTooltipScrollHandler;
        }
        const tooltip = document.querySelector(".wx-alert-tooltip");
        if (tooltip) {
            tooltip.remove();
        }
    }
}

async function getCurrentPageUid() {
    let pageOrBlockUid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
    if (pageOrBlockUid) {
        if (isPageUid(pageOrBlockUid)) {
            return pageOrBlockUid;
        }
        let pageUid = getPageUidFromBlockUid(pageOrBlockUid);
        if (pageUid) {
            return pageUid;
        }
    }
    let logPageUid = getLogPageUidFromDom();
    if (logPageUid) {
        return logPageUid;
    }
    return null;
}

function isPageUid(uid) {
    let page = window.roamAlphaAPI.q(`[:find ?e :where [?e :block/uid "${uid}"] [?e :node/title ?t]]`);
    return page.length > 0;
}

function getPageUidFromBlockUid(blockUid) {
    let page = window.roamAlphaAPI.q(
        `[:find ?pageUid :where [?b :block/uid "${blockUid}"] [?b :block/page ?p] [?p :block/uid ?pageUid]]`
    );
    return page?.[0]?.[0] || null;
}

function getLogPageUidFromDom() {
    let container = document.querySelector(".roam-log-page .rm-title-display-container[data-page-uid]");
    return container?.getAttribute("data-page-uid") || null;
}

async function getAlertTextForUid(uid) {
    const inMemory = alertTextByUid.get(uid);
    if (inMemory) {
        return inMemory;
    }
    try {
        const props = window.roamAlphaAPI.pull("[:block/props]", [":block/uid", uid])?.[":block/props"];
        const text = props?.["wx-alert-text"] || props?.[":wx-alert-text"] || null;
        if (text) {
            alertTextByUid.set(uid, text);
        }
        return text;
    } catch (err) {
        return null;
    }
}

async function setAlertProp(uid, text) {
    if (!text) {
        return;
    }
    try {
        await window.roamAlphaAPI.updateBlock({
            block: {
                uid,
                props: { "wx-alert-text": text }
            }
        });
    } catch (err) {
        // Ignore if props are unsupported in this environment.
    }
}

function sendConfigAlert(key) {
    if (key == "API") {
        alert("Please set the API key from https://openweathermap.org/api in the configuration settings via the Roam Depot tab.");
    } else if (key == "location") {
        alert("Please set your location in the format city, country (e.g. melbourne, au or berlin, de) in the configuration settings via the Roam Depot tab.");
    } else if (key == "units") {
        alert("Please set your preferred units of measurement (metric or imperial) in the configuration settings via the Roam Depot tab.");
    } else if (key == "API3") {
        alert("Please subscribe to the updated OpenWeather One Call API 3.0 at https://openweathermap.org/api as the old API is deprecated. Once your new subscription is confirmed you should be able to use Weathercards as before without any change in settings.");
    }
}

//*** This code is copyright 2002-2016 by Gavin Kistner, !@phrogz.net
//*** It is covered under the license viewable at http://phrogz.net/JS/_ReuseLicense.txt
function formatDate(date, formatString) {
    var YYYY, YY, MMMM, MMM, MM, M, DDDD, DDD, DD, D, hhhh, hhh, hh, h, mm, m, ss, s, ampm, AMPM, dMod, th;
    YY = ((YYYY = date.getFullYear()) + "").slice(-2);
    MM = (M = date.getMonth() + 1) < 10 ? ('0' + M) : M;
    MMM = (MMMM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][M - 1]).substring(0, 3);
    DD = (D = date.getDate()) < 10 ? ('0' + D) : D;
    DDD = (DDDD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()]).substring(0, 3);
    th = (D >= 10 && D <= 20) ? 'th' : ((dMod = D % 10) == 1) ? 'st' : (dMod == 2) ? 'nd' : (dMod == 3) ? 'rd' : 'th';
    formatString = formatString.replace("#YYYY#", YYYY).replace("#YY#", YY).replace("#MMMM#", MMMM).replace("#MMM#", MMM).replace("#MM#", MM).replace("#M#", M).replace("#DDDD#", DDDD).replace("#DDD#", DDD).replace("#DD#", DD).replace("#D#", D).replace("#th#", th);
    h = (hhh = date.getHours());
    if (h == 0) h = 24;
    if (h > 12) h -= 12;
    hh = h < 10 ? ('0' + h) : h;
    hhhh = hhh < 10 ? ('0' + hhh) : hhh;
    AMPM = (ampm = hhh < 12 ? 'am' : 'pm').toUpperCase();
    mm = (m = date.getMinutes()) < 10 ? ('0' + m) : m;
    ss = (s = date.getSeconds()) < 10 ? ('0' + s) : s;
    return formatString.replace("#hhhh#", hhhh).replace("#hhh#", hhh).replace("#hh#", hh).replace("#h#", h).replace("#mm#", mm).replace("#m#", m).replace("#ss#", ss).replace("#s#", s).replace("#ampm#", ampm).replace("#AMPM#", AMPM);
}

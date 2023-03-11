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
            action: { type: "input", placeholder: "metric" },
        },
        {
            id: "weather-number",
            name: "How Many Days?",
            description: "How many cards would you like to show?",
            action: { type: "select", items: ["Today Only", "2", "3", "4", "5", "6", "7", "8"] },
        },
    ]
};

// copied and adapted from https://github.com/dvargas92495/roamjs-components/blob/main/src/writes/createBlock.ts
const createBlock = (params) => {
    const uid = window.roamAlphaAPI.util.generateUID();
    return Promise.all([
        window.roamAlphaAPI.createBlock({
            location: {
                "parent-uid": params.parentUid,
                order: params.order,
            },
            block: {
                uid,
                string: params.node.text
            }
        })
    ].concat((params.node.children || []).map((node, order) =>
        createBlock({ parentUid: uid, order, node })
    )))
};

export default {
    onload: ({ extensionAPI }) => {
        extensionAPI.settings.panel.create(config);

        extensionAPI.ui.commandPalette.addCommand({
            label: "Weathercards",
            callback: () => {
                const uid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
                weather().then(async (blocks) => {
                    if (uid != undefined) {
                        const pageId = window.roamAlphaAPI.pull("[*]", [":block/uid", uid])?.[":block/page"]?.[":db/id"];
                        const parentUid = window.roamAlphaAPI.pull("[:block/uid]", pageId)?.[":block/uid"];
                        blocks.forEach((node, order) => createBlock({
                            parentUid,
                            order,
                            node
                        }));
                    } else {
                        var uri = window.location.href;
                        const regex = /^https:\/\/roamresearch.com\/.+\/(app|offline)\/\w+$/; //today's DNP
                        if (regex.test(uri)) { // this is Daily Notes for today
                            var today = new Date();
                            var dd = String(today.getDate()).padStart(2, '0');
                            var mm = String(today.getMonth() + 1).padStart(2, '0');
                            var yyyy = today.getFullYear();
                            var pageBlock = "" + mm + "-" + dd + "-" + yyyy + "";
                        }
                        const parentUid = pageBlock || await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
                        blocks.forEach((node, order) => createBlock({
                            parentUid,
                            order,
                            node
                        }));
                    }
                });
            },
            //callback: () => weather()
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
                    break breakme;
                } else if (!extensionAPI.settings.get("weather-weatherDefaultLocation")) {
                    key = "location";
                    sendConfigAlert(key);
                    break breakme;
                } else {
                    const wxApiKey = extensionAPI.settings.get("weather-wxApiKey");
                    const wxLocation = extensionAPI.settings.get("weather-weatherDefaultLocation");
                    if (extensionAPI.settings.get("weather-wxUnits")) {
                        const regex = /^metric|imperial$/;
                        if (regex.test(extensionAPI.settings.get("weather-wxUnits"))) {
                            wxUnits = extensionAPI.settings.get("weather-wxUnits");
                        } else {
                            key = "units";
                            sendConfigAlert(key);
                            break breakme;
                        }
                    } else {
                        wxUnits = "metric";
                    }
                    var wxNumber = 1;
                    if (extensionAPI.settings.get("weather-number") != "Today Only") {
                        wxNumber = parseInt(extensionAPI.settings.get("weather-number"));
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
                    var url = 'https://api.openweathermap.org/geo/1.0/direct?q='
                        + wxLocation
                        + '&limit=1&'
                        + 'APPID=' + wxApiKey;
                    var requestResults = await fetch(url);
                    var dataResults = await requestResults.json();
                    var lat = dataResults[0].lat;
                    var lon = dataResults[0].lon;
                    if (dataResults[0].state) {
                        var wxLocationName = dataResults[0].name + ', ' + dataResults[0].state + ' (' + dataResults[0].country + ')';
                    } else {
                        var wxLocationName = dataResults[0].name + ' (' + dataResults[0].country + ')';
                    }

                    var url = 'https://api.openweathermap.org/data/2.5/onecall?'
                        + 'lat=' + lat + '&lon=' + lon
                        + '&units=' + wxUnits + '&'
                        + 'exclude=minutely,hourly&'
                        + 'APPID=' + wxApiKey;
                    var requestResults = await fetch(url);
                    var dataResults = await requestResults.json();
                    console.info(dataResults)
                    var curTimezone = new Date().getTimezoneOffset();
                    var weatherTimezone = dataResults.timezone_offset / 60 * -1;
                    var tzDiff = curTimezone - weatherTimezone;
                    var wxAlerts = '';

                    let days = [];
                    for (var i = 0; i < parseInt(wxNumber); i++) {
                        const date = new Date(dataResults.daily[i].dt * 1000);
                        var wxDay = '**' + date.customFormat("#DDDD#, #MMM# #DD#, #YYYY#") + '**';
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
                            var wxSunrise = '' + dateS.customFormat("#h#:#mm# #AMPM#") + '';
                            const dateSS = new Date(dataResults.current.sunset * 1000);
                            var wxSunset = '' + dateSS.customFormat("#h#:#mm# #AMPM#") + '';
                            var wxWindSpeed = Math.round(dataResults.current.wind_speed);
                            if (wxUnits == "imperial") {
                                wxWindSpeed += "mph";
                            } else {
                                wxWindSpeed = Math.round(parseInt(wxWindSpeed) * 3.6);
                                wxWindSpeed += "kph";
                            }

                            wxInfo += wxDay + '\n'
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
                            var wxSunrise = '' + dateS.customFormat("#h#:#mm# #AMPM#") + '';
                            const dateSS = new Date(dataResults.daily[i].sunset * 1000);
                            var wxSunset = '' + dateSS.customFormat("#h#:#mm# #AMPM#") + '';
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
                    /*
                    // parse weather forecast data for each day
                    // Today
                    const date = new Date(dataResults.daily[0].dt * 1000);
                    var wxDay0 = '**' + date.customFormat("#DDDD#, #MMM# #DD#, #YYYY#") + '**';
                    var wxConditions0 = dataResults.current.weather[0].main;
                    var wxDescriptionCur0 = toSentenceCase(dataResults.current.weather[0].description);
                    var wxDescription0 = toSentenceCase(dataResults.daily[0].weather[0].description);
                    var wxHighTemperature0 = Math.round(dataResults.daily[0].temp.max);
                    var wxLowTemperature0 = Math.round(dataResults.daily[0].temp.min);
                    var wxCurTemperature0 = Math.round(dataResults.current.temp);
                    var wxMorning0 = Math.round(dataResults.daily[0].temp.morn);
                    var wxAfternoon0 = Math.round(dataResults.daily[0].temp.day);
                    var wxEvening0 = Math.round(dataResults.daily[0].temp.eve);
                    var wxHumidity0 = Math.round(dataResults.current.humidity);
                    var wxPrecip0 = Math.round(dataResults.daily[0].pop * 100);
                    const dateS0 = new Date(dataResults.current.sunrise * 1000);
                    var wxSunrise0 = '' + dateS0.customFormat("#h#:#mm# #AMPM#") + '';
                    const dateSS0 = new Date(dataResults.current.sunset * 1000);
                    var wxSunset0 = '' + dateSS0.customFormat("#h#:#mm# #AMPM#") + '';
                    var wxWindSpeed0 = Math.round(dataResults.current.wind_speed);
                    // Tomorrow 
                    const date1 = new Date(dataResults.daily[1].dt * 1000);
                    var wxDay1 = '**' + date1.customFormat("#DDDD#, #MMM# #DD#, #YYYY#") + '**';
                    var wxDescription1 = toSentenceCase(dataResults.daily[1].weather[0].description);
                    var wxConditions1 = dataResults.daily[1].weather[0].main;
                    var wxHighTemperature1 = Math.round(dataResults.daily[1].temp.max);
                    var wxLowTemperature1 = Math.round(dataResults.daily[1].temp.min);
                    var wxMorning1 = Math.round(dataResults.daily[1].temp.morn);
                    var wxAfternoon1 = Math.round(dataResults.daily[1].temp.day);
                    var wxEvening1 = Math.round(dataResults.daily[1].temp.eve);
                    var wxHumidity1 = Math.round(dataResults.daily[1].humidity);
                    var wxPrecip1 = Math.round(dataResults.daily[1].pop * 100);
                    const dateS1 = new Date(dataResults.daily[1].sunrise * 1000);
                    var wxSunrise1 = '' + dateS1.customFormat("#h#:#mm# #AMPM#") + '';
                    const dateSS1 = new Date(dataResults.daily[1].sunset * 1000);
                    var wxSunset1 = '' + dateSS1.customFormat("#h#:#mm# #AMPM#") + '';
                    var wxWindSpeed1 = Math.round(dataResults.daily[1].wind_speed);
                    // Day After Tomorrow
                    const date2 = new Date(dataResults.daily[2].dt * 1000);
                    var wxDay2 = '**' + date2.customFormat("#DDDD#, #MMM# #DD#, #YYYY#") + '**';
                    var wxDescription2 = toSentenceCase(dataResults.daily[2].weather[0].description);
                    var wxConditions2 = dataResults.daily[2].weather[0].main;
                    var wxHighTemperature2 = Math.round(dataResults.daily[2].temp.max);
                    var wxLowTemperature2 = Math.round(dataResults.daily[2].temp.min);
                    var wxMorning2 = Math.round(dataResults.daily[2].temp.morn);
                    var wxAfternoon2 = Math.round(dataResults.daily[2].temp.day);
                    var wxEvening2 = Math.round(dataResults.daily[2].temp.eve);
                    var wxHumidity2 = Math.round(dataResults.daily[2].humidity);
                    var wxPrecip2 = Math.round(dataResults.daily[2].pop * 100);
                    const dateS2 = new Date(dataResults.daily[2].sunrise * 1000);
                    var wxSunrise2 = '' + dateS2.customFormat("#h#:#mm# #AMPM#") + '';
                    const dateSS2 = new Date(dataResults.daily[2].sunset * 1000);
                    var wxSunset2 = '' + dateSS2.customFormat("#h#:#mm# #AMPM#") + '';
                    var wxWindSpeed2 = Math.round(dataResults.daily[2].wind_speed);
                    // 4 
                    const date3 = new Date(dataResults.daily[3].dt * 1000);
                    var wxDay3 = '**' + date3.customFormat("#DDDD#, #MMM# #DD#, #YYYY#") + '**';
                    var wxDescription3 = toSentenceCase(dataResults.daily[3].weather[0].description);
                    var wxConditions3 = dataResults.daily[3].weather[0].main;
                    var wxHighTemperature3 = Math.round(dataResults.daily[3].temp.max);
                    var wxLowTemperature3 = Math.round(dataResults.daily[3].temp.min);
                    var wxMorning3 = Math.round(dataResults.daily[3].temp.morn);
                    var wxAfternoon3 = Math.round(dataResults.daily[3].temp.day);
                    var wxEvening3 = Math.round(dataResults.daily[3].temp.eve);
                    var wxHumidity3 = Math.round(dataResults.daily[3].humidity);
                    var wxPrecip3 = Math.round(dataResults.daily[3].pop * 100);
                    const dateS3 = new Date(dataResults.daily[3].sunrise * 1000);
                    var wxSunrise3 = '' + dateS3.customFormat("#h#:#mm# #AMPM#") + '';
                    const dateSS3 = new Date(dataResults.daily[3].sunset * 1000);
                    var wxSunset3 = '' + dateSS3.customFormat("#h#:#mm# #AMPM#") + '';
                    var wxWindSpeed3 = Math.round(dataResults.daily[3].wind_speed);

                    // format weather cards
                    // day 0
                    var wxInfo0 = wxDay0 + '\n'
                        + '\n'
                        + '**Currently: **' + wxDescriptionCur0 + ' (' + wxCurTemperature0 + '°)\n'
                        + '**Forecast: **' + wxDescription0 + ' (' + wxHighTemperature0 + '°/' + wxLowTemperature0 + '°)\n'
                        + '**Morn: **' + wxMorning0 + '° **Day: **' + wxAfternoon0 + '° **Eve: **' + wxEvening0 + '°\n'
                        + '**Prec: **' + wxPrecip0 + '% **Wind: **' + wxWindSpeed0 + 'mph **Hum: **' + wxHumidity0 + '%\n'
                        + '**Sunrise: **' + wxSunrise0 + ' **Sunset: **' + wxSunset0 + ' '
                        + ' #wx-fc #weathercard #\[\[wx-' + wxConditions0 + '\]\]';
                    // day 1
                    var wxInfo1 = wxDay1 + '\n'
                        + '\n'
                        + '**Forecast: **' + wxDescription1 + ' (' + wxHighTemperature1 + '°/' + wxLowTemperature1 + '°)\n'
                        + '**Morn: **' + wxMorning1 + '° **Day: **' + wxAfternoon1 + '° **Eve: **' + wxEvening1 + '°\n'
                        + '**Prec: **' + wxPrecip1 + '% **Wind: **' + wxWindSpeed1 + 'mph **Hum: **' + wxHumidity1 + '%\n'
                        + '**Sunrise: **' + wxSunrise1 + '% **Sunset: **' + wxSunset1 + ' '
                        + ' #wx-fc #weathercard #\[\[wx-' + wxConditions1 + '\]\]';
                    // day 2
                    var wxInfo2 = wxDay2 + '\n'
                        + '\n'
                        + '**Forecast: **' + wxDescription2 + ' (' + wxHighTemperature2 + '°/' + wxLowTemperature2 + '°)\n'
                        + '**Morn: **' + wxMorning2 + '° **Day: **' + wxAfternoon2 + '° **Eve: **' + wxEvening2 + '°\n'
                        + '**Prec: **' + wxPrecip2 + '% **Wind: **' + wxWindSpeed2 + 'mph **Hum: **' + wxHumidity2 + '%\n'
                        + '**Sunrise: **' + wxSunrise2 + '% **Sunset: **' + wxSunset2 + ' '
                        + ' #wx-fc #weathercard #\[\[wx-' + wxConditions2 + '\]\]';
                    // day 3
                    var wxInfo3 = wxDay3 + '\n'
                        + '\n'
                        + '**Forecast: **' + wxDescription3 + ' (' + wxHighTemperature3 + '°/' + wxLowTemperature3 + '°)\n'
                        + '**Morn: **' + wxMorning3 + '° **Day: **' + wxAfternoon3 + '° **Eve: **' + wxEvening3 + '°\n'
                        + '**Prec: **' + wxPrecip3 + '% **Wind: **' + wxWindSpeed3 + 'mph **Hum: **' + wxHumidity3 + '%\n'
                        + '**Sunrise: **' + wxSunrise3 + '% **Sunset: **' + wxSunset3 + ' '
                        + ' #wx-fc #weathercard #\[\[wx-' + wxConditions3 + '\]\]';
*/
                    // update header 
                    const dateU = new Date(dataResults.current.dt * 1000);
                    var wxUpdateTime = '' + dateU.customFormat("#hhh#:#mm# #AMPM#") + '';

                    if (dataResults.alerts) {
                        wxAlerts = '\n((\n'
                            + dataResults.alerts[0].description.replace(/\n\*/g, 'linebreak').replace(/\n/g, ' ').replace(/linebreak/g, '\n*')
                            + '))';
                    }

                    return [
                        {
                            text: '**' + wxLocationName + '** __' + wxUpdateTime + '__' + wxAlerts + ' #rm-grid #rm-grid-3c #.wx-header'.toString(),
                            children: days
                        },
                    ];
                };
                /*
                return [
                    {
                        text: '**' + wxLocationName + '** __' + wxUpdateTime + '__' + wxAlerts + ' #rm-grid #rm-grid-3c #.wx-header'.toString(),
                        children: [
                            { text: "" + wxInfo0.toString() + "" },
                            { text: "" + wxInfo1.toString() + "" },
                            { text: "" + wxInfo2.toString() + "" },
                            { text: "" + wxInfo3.toString() + "" },
                        ]
                    },
                ];
                */
            }
        }
    },
    onunload: () => {
        if (window.roamjs?.extension?.smartblocks) {
            window.roamjs.extension.smartblocks.unregisterCommand("WEATHERCARDS");
        };
    }
}

function sendConfigAlert(key) {
    if (key == "API") {
        alert("Please set the API key from https://openweathermap.org/api in the configuration settings via the Roam Depot tab.");
    } else if (key == "location") {
        alert("Please set your location in the format city, country (e.g. melbourne, au or berlin, de) in the configuration settings via the Roam Depot tab.");
    } else if (key == "units") {
        alert("Please set your preferred units of measurement (metric or imperial) in the configuration settings via the Roam Depot tab.");
    }
}

//*** This code is copyright 2002-2016 by Gavin Kistner, !@phrogz.net
//*** It is covered under the license viewable at http://phrogz.net/JS/_ReuseLicense.txt
Date.prototype.customFormat = function (formatString) {
    var YYYY, YY, MMMM, MMM, MM, M, DDDD, DDD, DD, D, hhhh, hhh, hh, h, mm, m, ss, s, ampm, AMPM, dMod, th;
    YY = ((YYYY = this.getFullYear()) + "").slice(-2);
    MM = (M = this.getMonth() + 1) < 10 ? ('0' + M) : M;
    MMM = (MMMM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][M - 1]).substring(0, 3);
    DD = (D = this.getDate()) < 10 ? ('0' + D) : D;
    DDD = (DDDD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][this.getDay()]).substring(0, 3);
    th = (D >= 10 && D <= 20) ? 'th' : ((dMod = D % 10) == 1) ? 'st' : (dMod == 2) ? 'nd' : (dMod == 3) ? 'rd' : 'th';
    formatString = formatString.replace("#YYYY#", YYYY).replace("#YY#", YY).replace("#MMMM#", MMMM).replace("#MMM#", MMM).replace("#MM#", MM).replace("#M#", M).replace("#DDDD#", DDDD).replace("#DDD#", DDD).replace("#DD#", DD).replace("#D#", D).replace("#th#", th);
    h = (hhh = this.getHours());
    if (h == 0) h = 24;
    if (h > 12) h -= 12;
    hh = h < 10 ? ('0' + h) : h;
    hhhh = hhh < 10 ? ('0' + hhh) : hhh;
    AMPM = (ampm = hhh < 12 ? 'am' : 'pm').toUpperCase();
    mm = (m = this.getMinutes()) < 10 ? ('0' + m) : m;
    ss = (s = this.getSeconds()) < 10 ? ('0' + s) : s;
    return formatString.replace("#hhhh#", hhhh).replace("#hhh#", hhh).replace("#hh#", hh).replace("#h#", h).replace("#mm#", mm).replace("#m#", m).replace("#ss#", ss).replace("#s#", s).replace("#ampm#", ampm).replace("#AMPM#", AMPM);
};
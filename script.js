const moments = [
    { id: 'ontbijt', name: 'Ontbijt', hint: 'Een fijne start van je dag', icon: '☕' },
    { id: 'tussendoor-ochtend', name: 'Tussendoor', hint: 'Ochtend', icon: '🍎' },
    { id: 'lunch', name: 'Lunch', hint: 'Middag', icon: '🥪' },
    { id: 'tussendoor-middag', name: 'Tussendoor', hint: 'Middag', icon: '🍐' },
    { id: 'warme-maaltijd', name: 'Warme maaltijd', hint: 'Avondeten', icon: '🍲' },
    { id: 'tussendoor-avond', name: 'Tussendoor', hint: 'Avond', icon: '🍵' }
];

const stoolTypes = [
    { type: 1, title: 'Losse keutels', detail: 'Hard en moeilijk uit te scheiden' },
    { type: 2, title: 'Klonterige worst', detail: 'Als een worst, maar klonterig' },
    { type: 3, title: 'Gebarsten worst', detail: 'Als een worst met barstjes aan de buitenkant' },
    { type: 4, title: 'Gladde worst', detail: 'Glad en zacht' },
    { type: 5, title: 'Zachte keutels', detail: 'Zachte keutels met duidelijke randen' },
    { type: 6, title: 'Papierige ontlasting', detail: 'Zachte, papperige delen met niet-definieerbare randen' },
    { type: 7, title: 'Waterig', detail: 'Geen vaste stukjes, helemaal vloeibaar' }
];

const reminderTemplates = [
    { id: 'new-day', label: 'Nieuwe dag en ontbijt', time: '07:00' },
    { id: 'snack-morning', label: 'Tussendoor in de ochtend', time: '09:45' },
    { id: 'lunch', label: 'Lunch', time: '12:00' },
    { id: 'snack-afternoon', label: 'Tussendoor in de middag', time: '15:00' },
    { id: 'dinner', label: 'Warme maaltijd', time: '18:00' },
    { id: 'snack-evening', label: 'Tussendoor in de avond', time: '20:00' }
];

const dateInput = document.getElementById('diary-date');
const historySelect = document.getElementById('history-select');
const mealList = document.getElementById('meal-list');
const notesInput = document.getElementById('day-notes');
const stoolTypesElement = document.getElementById('stool-types');
const saveStatus = document.getElementById('save-status');
const notificationToggle = document.getElementById('notification-toggle');
const notificationStatus = document.getElementById('notification-status');
const notificationReminders = document.getElementById('notification-reminders');
const installHelp = document.getElementById('install-help');
const appLinkStatus = document.getElementById('app-link-status');
const installScreen = document.getElementById('install-screen');
const installScreenStatus = document.getElementById('install-screen-status');
const installScreenHeading = document.getElementById('install-screen-heading');
const installScreenIntro = document.getElementById('install-screen-intro');
const installAppLinkStatus = document.getElementById('install-app-link-status');
const iosInstallInstructions = document.getElementById('ios-install-instructions');
const devAccess = document.getElementById('dev-access');
const authForm = document.getElementById('auth-form');
const authPassword = document.getElementById('auth-password');
const authStatus = document.getElementById('auth-status');
const logoutButton = document.getElementById('logout-button');
const diaryApp = document.getElementById('diary-app');
const pageTabs = Array.from(document.querySelectorAll('.page-tab'));
const pagePanels = Array.from(document.querySelectorAll('.tab-panel'));
let activeDay = blankDay();
let pendingWrite = null;
let saveTimer = null;
let writeChain = Promise.resolve();
let notificationSettings = readNotificationSettings();
let pushSubscription = null;
let serviceWorkerRegistration = null;
let notificationSaveTimer = null;
let isDevMode = false;
let appStarted = false;

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function activatePageTab(tab) {
    const activePanelId = tab.getAttribute('aria-controls');
    pageTabs.forEach(item => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
    });
    pagePanels.forEach(panel => {
        panel.hidden = panel.id !== activePanelId;
    });
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function defaultNotificationSettings() {
    return {
        enabled: false,
        reminders: reminderTemplates.map(reminder => ({
            id: reminder.id,
            time: reminder.time,
            enabled: true
        }))
    };
}

function readNotificationSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('eetdagboek-notifications-v1') || 'null');
        const defaults = defaultNotificationSettings();
        if (!saved || typeof saved !== 'object') return defaults;
        defaults.enabled = saved.enabled === true;
        defaults.reminders = reminderTemplates.map(template => {
            const setting = Array.isArray(saved.reminders)
                ? saved.reminders.find(reminder => reminder && reminder.id === template.id)
                : null;
            return {
                id: template.id,
                time: setting && /^([01]\d|2[0-3]):[0-5]\d$/.test(setting.time)
                    ? setting.time
                    : template.time,
                enabled: setting ? setting.enabled !== false : true
            };
        });
        return defaults;
    } catch (error) {
        console.error('Meldingsinstellingen konden niet worden gelezen.', error);
        return defaultNotificationSettings();
    }
}

function saveNotificationSettingsLocally() {
    try {
        localStorage.setItem('eetdagboek-notifications-v1', JSON.stringify(notificationSettings));
    } catch (error) {
        console.error('Meldingsinstellingen konden niet lokaal worden opgeslagen.', error);
        notificationStatus.textContent = 'Instellingen konden niet op dit apparaat worden opgeslagen.';
    }
}

function renderNotificationReminders() {
    notificationReminders.innerHTML = reminderTemplates.map(template => {
        const setting = notificationSettings.reminders.find(reminder => reminder.id === template.id);
        return `
            <div class="reminder-row">
                <label class="reminder-choice" for="reminder-enabled-${template.id}">
                    <input id="reminder-enabled-${template.id}" type="checkbox"
                        data-reminder-enabled="${template.id}" ${setting.enabled ? 'checked' : ''}>
                    <span>${template.label}</span>
                </label>
                <label class="sr-only" for="reminder-time-${template.id}">Tijd voor ${template.label}</label>
                <input id="reminder-time-${template.id}" type="time" data-reminder-time="${template.id}"
                    value="${setting.time}">
            </div>
        `;
    }).join('');
}

function handleNotificationSettingsChange(event) {
    const reminderId = event.target.dataset.reminderEnabled || event.target.dataset.reminderTime;
    if (!reminderId) return;
    const reminder = notificationSettings.reminders.find(item => item.id === reminderId);
    if (!reminder) return;
    if (event.target.dataset.reminderEnabled) reminder.enabled = event.target.checked;
    else reminder.time = event.target.value;

    saveNotificationSettingsLocally();
    if (!notificationSettings.enabled || !pushSubscription) return;

    window.clearTimeout(notificationSaveTimer);
    notificationSaveTimer = window.setTimeout(async () => {
        try {
            await savePushSettings();
            notificationStatus.textContent = 'Herinneringstijden bijgewerkt.';
        } catch (error) {
            notificationStatus.textContent = `Tijden konden niet naar de server worden gestuurd: ${error.message}`;
            console.error('Pushherinneringen konden niet worden bijgewerkt.', error);
        }
    }, 400);
}

function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledApp() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function base64UrlToBytes(base64Url) {
    const padding = '='.repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function pushSettingsPayload() {
    return {
        enabled: notificationSettings.enabled,
        reminders: notificationSettings.reminders,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam'
    };
}

async function savePushSettings() {
    if (!pushSubscription) return;
    await apiRequest('/api/push/subscriptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subscription: pushSubscription.toJSON(),
            settings: pushSettingsPayload()
        })
    });
}

async function enablePushNotifications() {
    if (!window.isSecureContext) {
        throw new Error('Pushmeldingen werken pas op een HTTPS-site. Open de beveiligde site op je iPhone.');
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Deze browser ondersteunt geen pushmeldingen.');
    }
    if (isIosDevice() && !isInstalledApp()) {
        installHelp.open = true;
        throw new Error('Zet de site eerst via Safari op het beginscherm en open daarna de app.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Meldingen zijn niet toegestaan. Controleer de meldingsinstellingen van je browser.');
    }

    serviceWorkerRegistration = await navigator.serviceWorker.register('service-worker.js');
    const keyResult = await apiRequest('/api/push/public-key');
    pushSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
    let createdSubscription = false;
    if (!pushSubscription) {
        pushSubscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(keyResult.publicKey)
        });
        createdSubscription = true;
    }

    notificationSettings.enabled = true;
    try {
        await savePushSettings();
    } catch (error) {
        notificationSettings.enabled = false;
        saveNotificationSettingsLocally();
        if (createdSubscription && pushSubscription) {
            try {
                await apiRequest('/api/push/subscriptions', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: pushSubscription.endpoint })
                });
            } catch (cleanupError) {
                console.error('Mislukte pushregistratie kon niet van de server worden verwijderd.', cleanupError);
            }
            try {
                await pushSubscription.unsubscribe();
                pushSubscription = null;
            } catch (cleanupError) {
                console.error('Mislukte pushregistratie kon niet van het apparaat worden verwijderd.', cleanupError);
            }
        }
        throw error;
    }
    saveNotificationSettingsLocally();
    notificationToggle.textContent = 'Meldingen uitschakelen';
    notificationStatus.textContent = 'Meldingen staan aan. Je tijden worden per dag automatisch gevolgd.';
}

async function disablePushNotifications() {
    notificationSettings.enabled = false;
    saveNotificationSettingsLocally();
    notificationToggle.textContent = 'Meldingen inschakelen';

    let cleanupError = null;
    try {
        if (!serviceWorkerRegistration && 'serviceWorker' in navigator && window.isSecureContext) {
            serviceWorkerRegistration = await navigator.serviceWorker.getRegistration();
        }
        pushSubscription = pushSubscription ||
            (serviceWorkerRegistration && await serviceWorkerRegistration.pushManager.getSubscription());
    } catch (error) {
        cleanupError = error;
    }

    if (pushSubscription) {
        try {
            await apiRequest('/api/push/subscriptions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: pushSubscription.endpoint })
            });
        } catch (error) {
            cleanupError = error;
            console.error('Pushabonnement kon niet van de server worden verwijderd.', error);
        }
        try {
            await pushSubscription.unsubscribe();
            pushSubscription = null;
        } catch (error) {
            cleanupError = cleanupError || error;
            console.error('Pushabonnement kon niet van het apparaat worden verwijderd.', error);
        }
    }

    if (cleanupError) {
        notificationStatus.textContent = `Meldingen lokaal uitgezet; server kon niet volledig worden bijgewerkt: ${cleanupError.message}`;
        console.error('Pushmeldingen konden niet volledig worden uitgeschakeld.', cleanupError);
    } else {
        notificationStatus.textContent = 'Meldingen staan uit.';
    }
}

async function initializeNotifications() {
    renderNotificationReminders();
    if (!window.isSecureContext) {
        notificationStatus.textContent = 'Voor installeren en pushmeldingen is een HTTPS-site nodig.';
        return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        notificationStatus.textContent = 'Deze browser ondersteunt geen pushmeldingen.';
        return;
    }

    try {
        serviceWorkerRegistration = await navigator.serviceWorker.register('service-worker.js');
        pushSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
        if (notificationSettings.enabled && pushSubscription && Notification.permission === 'granted') {
            await savePushSettings();
            notificationToggle.textContent = 'Meldingen uitschakelen';
            notificationStatus.textContent = 'Meldingen staan aan.';
        } else {
            notificationSettings.enabled = false;
            saveNotificationSettingsLocally();
            notificationToggle.textContent = 'Meldingen inschakelen';
            notificationStatus.textContent = isIosDevice() && !isInstalledApp()
                ? 'Voeg deze site eerst via Safari toe aan je beginscherm om meldingen te gebruiken.'
                : 'Meldingen staan uit. Stel hieronder je tijden in of schakel ze in.';
        }
    } catch (error) {
        notificationStatus.textContent = `Meldingen konden niet worden voorbereid: ${error.message}`;
        console.error('Pushmeldingen konden niet worden voorbereid.', error);
    }
}

async function shareAppLink(statusElement = appLinkStatus) {
    const appUrl = new URL(window.location.href);
    appUrl.search = '';
    appUrl.hash = '';
    statusElement.hidden = false;
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Mijn eetdagboek',
                text: 'Open mijn eetdagboek-app via deze link.',
                url: appUrl.href
            });
            statusElement.textContent = 'App-link gedeeld.';
        } catch (error) {
            if (error.name === 'AbortError') return;
            statusElement.textContent = `De link kon niet worden gedeeld: ${error.message}`;
            console.error('De app-link kon niet worden gedeeld.', error);
        }
        return;
    }

    try {
        await navigator.clipboard.writeText(appUrl.href);
        statusElement.textContent = 'App-link gekopieerd. Je kunt hem nu versturen.';
    } catch (error) {
        statusElement.textContent = `Kopieer deze app-link om hem te versturen: ${appUrl.href}`;
        console.error('De app-link kon niet naar het klembord worden gekopieerd.', error);
    }
}

async function prepareInstallScreen() {
    if (!isIosDevice()) {
        installScreenHeading.textContent = 'De app is voorlopig alleen voor iPhone';
        installScreenIntro.textContent = 'Gebruik de dev-code hieronder om de app in je browser te bekijken tijdens development.';
        installScreenStatus.textContent = 'De app is voorlopig alleen beschikbaar op iPhone en iPad. Gebruik de dev-code hieronder voor development.';
        iosInstallInstructions.hidden = true;
        return;
    }

    iosInstallInstructions.hidden = false;
    if (!window.isSecureContext) {
        installScreenStatus.textContent = 'Installeren op iPhone werkt alleen via een beveiligd HTTPS-adres.';
        return;
    }
    if (!('serviceWorker' in navigator)) {
        installScreenStatus.textContent = 'Open deze link in Safari om hem op je beginscherm te zetten.';
        return;
    }

    try {
        await navigator.serviceWorker.register('service-worker.js');
        installScreenStatus.textContent = 'Open deze link in Safari en volg de stappen hieronder.';
    } catch (error) {
        installScreenStatus.textContent = `Safari-installatie kon niet worden voorbereid: ${error.message}`;
        console.error('De iPhone-webapp kon niet worden voorbereid voor installatie.', error);
    }
}

function blankDay() {
    const meals = {};
    moments.forEach(moment => {
        meals[moment.id] = {
            time: '',
            food: '',
            drink: '',
            details: '',
            movement: '',
            symptoms: '',
            symptomScore: '',
            stoolType: null
        };
    });
    return { meals, notes: '', stoolType: null };
}

function normalizeDay(savedDay) {
    const day = blankDay();
    if (!savedDay || typeof savedDay !== 'object') return day;
    moments.forEach(moment => {
        const savedMeal = savedDay.meals && savedDay.meals[moment.id];
        if (!savedMeal || typeof savedMeal !== 'object') return;
        ['time', 'food', 'drink', 'details', 'movement', 'symptoms', 'symptomScore'].forEach(field => {
            if (typeof savedMeal[field] === 'string') day.meals[moment.id][field] = savedMeal[field];
        });
        if (Number.isInteger(savedMeal.stoolType) && savedMeal.stoolType >= 1 && savedMeal.stoolType <= 7) {
            day.meals[moment.id].stoolType = savedMeal.stoolType;
        }
    });
    if (typeof savedDay.notes === 'string') day.notes = savedDay.notes;
    if (Number.isInteger(savedDay.stoolType) && savedDay.stoolType >= 1 && savedDay.stoolType <= 7) {
        day.stoolType = savedDay.stoolType;
    }
    return day;
}

async function apiRequest(url, options) {
    const response = await fetch(window.eetdagboekApiUrl(url), options);
    if (!response.ok) {
        let message = `Serverfout (${response.status})`;
        try {
            const result = await response.json();
            if (result.error) message = result.error;
        } catch {
            // Use the HTTP status when the server does not return JSON.
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function render() {
    mealList.innerHTML = moments.map(moment => {
        const meal = activeDay.meals[moment.id];
        return `
            <article class="meal-card">
                <header class="meal-header">
                    <span class="meal-icon" aria-hidden="true">${moment.icon}</span>
                    <div class="meal-title">
                        <h3>${moment.name}</h3>
                        <p>${moment.hint}</p>
                    </div>
                    <label class="time-field" for="time-${moment.id}">
                        Tijd
                        <input id="time-${moment.id}" data-meal="${moment.id}" data-field="time" type="time" value="${escapeHtml(meal.time)}">
                    </label>
                </header>
                <div class="meal-fields">
                    <div class="field">
                        <label for="food-${moment.id}">Wat en hoeveel heb je gegeten?</label>
                        <textarea id="food-${moment.id}" data-meal="${moment.id}" data-field="food" rows="2" placeholder="Bijvoorbeeld: 2 boterhammen met kaas">${escapeHtml(meal.food)}</textarea>
                    </div>
                    <div class="field">
                        <label for="drink-${moment.id}">Wat en hoeveel heb je gedronken?</label>
                        <textarea id="drink-${moment.id}" data-meal="${moment.id}" data-field="drink" rows="2" placeholder="Bijvoorbeeld: 1 glas water">${escapeHtml(meal.drink)}</textarea>
                    </div>
                    <div class="field">
                        <label for="details-${moment.id}">Bijzonderheden, bijvoorbeeld stress</label>
                        <textarea id="details-${moment.id}" data-meal="${moment.id}" data-field="details" rows="2" placeholder="Bijvoorbeeld: stress of menstruatie">${escapeHtml(meal.details)}</textarea>
                    </div>
                    <div class="field">
                        <label for="movement-${moment.id}">Beweging</label>
                        <textarea id="movement-${moment.id}" data-meal="${moment.id}" data-field="movement" rows="2" placeholder="Bijvoorbeeld: 30 minuten gefietst">${escapeHtml(meal.movement)}</textarea>
                    </div>
                    <div class="field symptom-fields">
                        <label for="symptoms-${moment.id}">Klachten</label>
                        <textarea id="symptoms-${moment.id}" data-meal="${moment.id}" data-field="symptoms" rows="2" placeholder="Bijvoorbeeld: buikpijn, misselijkheid">${escapeHtml(meal.symptoms)}</textarea>
                        <label class="score-label" for="symptom-score-${moment.id}">Ernst (0–10)</label>
                        <input id="symptom-score-${moment.id}" data-meal="${moment.id}" data-field="symptomScore" type="number" min="0" max="10" inputmode="numeric" placeholder="—" value="${escapeHtml(meal.symptomScore)}">
                    </div>
                    <div class="field stool-picker">
                        <span class="field-label">Ontlasting — kies een type</span>
                        <div class="meal-stool-types" role="group" aria-label="Ontlastingstype bij ${moment.name.toLowerCase()} ${moment.hint.toLowerCase()}">
                            ${stoolTypes.map(item => `
                                <button class="meal-stool-type${meal.stoolType === item.type ? ' selected' : ''}"
                                    type="button" data-meal="${moment.id}" data-stool-type="${item.type}"
                                    aria-label="Type ${item.type}: ${item.detail}" aria-pressed="${meal.stoolType === item.type}">
                                    <span class="stool-illustration" aria-hidden="true">${stoolIllustration(item.type)}</span>
                                    <span>${item.type}</span>
                                </button>
                            `).join('')}
                        </div>
                        <span class="stool-selected">${meal.stoolType
                            ? `Gekozen: type ${meal.stoolType} — ${stoolTypes[meal.stoolType - 1].detail}`
                            : 'Nog niets gekozen'}</span>
                    </div>
                </div>
            </article>
        `;
    }).join('');
    notesInput.value = activeDay.notes;
    renderStoolTypes();
    updateSummary();
}

function renderStoolTypes() {
    stoolTypesElement.innerHTML = stoolTypes.map(item => `
        <div class="stool-type">
            <span class="stool-illustration" aria-hidden="true">${stoolIllustration(item.type)}</span>
            <span class="stool-number">Type ${item.type}</span>
            <span class="stool-title">${item.title}</span>
            <span class="stool-detail">${item.detail}</span>
        </div>
    `).join('');
}

function stoolIllustration(type) {
    const drawings = {
        1: '<circle cx="18" cy="21" r="6"/><circle cx="32" cy="14" r="7"/><circle cx="47" cy="20" r="6"/><circle cx="61" cy="12" r="5"/>',
        2: '<circle cx="17" cy="19" r="8"/><circle cx="29" cy="14" r="8"/><circle cx="42" cy="17" r="9"/><circle cx="55" cy="14" r="8"/><circle cx="66" cy="20" r="7"/>',
        3: '<path d="M9 19 Q17 7 28 15 L38 11 Q49 8 56 15 L71 13 Q79 19 70 25 L18 26 Q8 25 9 19Z"/><path class="crack" d="M28 14l5 5-4 6m17-12-5 6 6 5m12-8-4 5"/>',
        4: '<path d="M8 21 Q15 13 27 16 Q43 19 56 15 Q69 12 76 18 Q75 23 62 23 L22 24 Q11 25 8 21Z"/>',
        5: '<path d="M15 22 Q12 17 20 14 Q28 12 31 19 Q31 24 24 25Z"/><path d="M38 18 Q40 10 48 13 Q57 16 53 22 Q46 27 40 23Z"/><path d="M61 22 Q58 16 65 14 Q73 14 74 20 Q73 25 66 25Z"/>',
        6: '<path d="M7 22 Q14 16 22 18 Q27 10 35 14 Q43 8 49 15 Q58 11 63 17 Q73 13 78 21 Q70 28 58 24 Q47 29 38 24 Q27 29 18 24 Q11 27 7 22Z"/>',
        7: '<path d="M6 22 Q12 17 19 20 Q27 14 35 19 Q43 13 51 18 Q60 14 67 19 Q74 17 80 22 Q75 27 64 25 Q55 29 44 25 Q33 29 22 25 Q12 28 6 22Z"/>'
    };
    const drawing = drawings[type] || '';
    return `<svg viewBox="0 0 86 34" focusable="false"><g fill="#9a6541" stroke="#805034" stroke-width="1">${drawing}</g></svg>`;
}

function collectDay() {
    const day = blankDay();
    mealList.querySelectorAll('[data-meal][data-field]').forEach(input => {
        day.meals[input.dataset.meal][input.dataset.field] = input.value;
    });
    moments.forEach(moment => {
        day.meals[moment.id].stoolType = activeDay.meals[moment.id].stoolType;
    });
    day.notes = notesInput.value;
    day.stoolType = activeDay.stoolType;
    return day;
}

function scheduleSave() {
    activeDay = collectDay();
    updateSummary();
    pendingWrite = { date: dateInput.value, day: activeDay };
    saveStatus.textContent = 'Opslaan…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushQueuedSave, 300);
}

function flushQueuedSave() {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    if (!pendingWrite) return writeChain;

    const entry = pendingWrite;
    pendingWrite = null;
    writeChain = writeChain.then(async () => {
        await apiRequest(`/api/days/${entry.date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry.day)
        });
        saveStatus.textContent = 'Opgeslagen in data-bestand';
        saveStatus.title = '';
        await refreshHistory();
    }).catch(error => {
        saveStatus.textContent = 'Opslaan mislukt';
        saveStatus.title = `Je wijzigingen konden niet worden opgeslagen: ${error.message}`;
        console.error('Eetdagboek kon niet worden opgeslagen.', error);
    });
    return writeChain.then(() => pendingWrite ? flushQueuedSave() : undefined);
}

function updateSummary() {
    const completed = moments.filter(moment => {
        const meal = activeDay.meals[moment.id];
        return meal.food.trim() || meal.drink.trim() || meal.details.trim() ||
            meal.movement.trim() || meal.symptoms.trim() || meal.stoolType;
    }).length;
    document.getElementById('completed-count').textContent = completed;
    document.getElementById('progress-bar').style.width = `${completed / moments.length * 100}%`;
}

function formatDate(dateString) {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${dateString}T00:00:00Z`));
}

async function refreshHistory() {
    const dates = await apiRequest('/api/days');
    const currentValue = historySelect.value;
    historySelect.innerHTML = '<option value="">Eerdere dagen bekijken</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        historySelect.appendChild(option);
    });
    if (dates.includes(currentValue)) historySelect.value = currentValue;
}

async function loadDay(date) {
    saveStatus.textContent = 'Dag laden…';
    try {
        await flushQueuedSave();
        await writeChain;
        let savedDay;
        try {
            savedDay = await apiRequest(`/api/days/${date}`);
        } catch (error) {
            if (error.status !== 404) throw error;
            savedDay = null;
        }
        activeDay = normalizeDay(savedDay);
        render();
        saveStatus.textContent = savedDay ? 'Dag geladen' : 'Nieuwe, nog niet opgeslagen dag';
        saveStatus.title = '';
    } catch (error) {
        activeDay = blankDay();
        render();
        saveStatus.textContent = 'Dag laden mislukt';
        saveStatus.title = error.message;
        console.error('Eetdagboek kon niet worden geladen.', error);
    }
}

async function createDay() {
    const date = dateInput.value;
    if (!date) return;
    await flushQueuedSave();
    try {
        await apiRequest(`/api/days/${date}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(blankDay())
        });
        activeDay = blankDay();
        render();
        saveStatus.textContent = 'Dag aangemaakt en opgeslagen';
        saveStatus.title = '';
        await refreshHistory();
    } catch (error) {
        if (error.status === 409) {
            saveStatus.textContent = 'Deze dag bestaat al';
            await loadDay(date);
            return;
        }
        saveStatus.textContent = 'Dag aanmaken mislukt';
        saveStatus.title = error.message;
        console.error('Eetdagboek kon niet worden aangemaakt.', error);
    }
}

async function migrateLegacyData() {
    const storageKey = 'mijn-eetdagboek-v1';
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    const legacyDiary = JSON.parse(saved);
    if (!legacyDiary || typeof legacyDiary !== 'object' || Array.isArray(legacyDiary)) {
        throw new Error('De eerder opgeslagen gegevens hebben een ongeldig formaat.');
    }

    for (const [date, savedDay] of Object.entries(legacyDiary)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error('Een eerder opgeslagen dag heeft een ongeldige datum.');
        }
        try {
            await apiRequest(`/api/days/${date}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizeDay(savedDay))
            });
        } catch (error) {
            if (error.status !== 409) throw error;
        }
    }
    localStorage.removeItem(storageKey);
}

function plainTextOverview() {
    const filledMeals = moments.filter(moment => {
        const meal = activeDay.meals[moment.id];
        return meal.food.trim() || meal.drink.trim() || meal.details.trim() ||
            meal.movement.trim() || meal.symptoms.trim() || meal.stoolType;
    }).length;
    const entries = moments.map(moment => {
        const meal = activeDay.meals[moment.id];
        const stool = stoolTypes.find(item => item.type === meal.stoolType);
        const time = meal.time ? ` — ${meal.time.replace(':', '.')}` : '';
        return [
            `${moment.name}${moment.hint ? ` (${moment.hint})` : ''}${time}`,
            `Gegeten: ${meal.food.trim() || '—'}`,
            `Gedronken: ${meal.drink.trim() || '—'}`,
            `Bijzonderheden: ${meal.details.trim() || '—'}`,
            `Beweging: ${meal.movement.trim() || '—'}`,
            `Ontlasting: ${stool ? `type ${stool.type} — ${stool.detail}` : '—'}`,
            `Klachten: ${meal.symptoms.trim() || '—'}${meal.symptomScore ? ` (ernst ${meal.symptomScore}/10)` : ''}`
        ].join('\n');
    });
    const totals = [
        `Ingevulde eetmomenten: ${filledMeals} van ${moments.length}`,
        `Ontlastingstypes ingevuld: ${moments.filter(moment => activeDay.meals[moment.id].stoolType).length}`,
        `Klachtenmomenten: ${moments.filter(moment => activeDay.meals[moment.id].symptoms.trim()).length}`
    ];
    const legacyStool = stoolTypes.find(item => item.type === activeDay.stoolType);
    if (legacyStool) totals.push(`Ontlasting (dagnotitie): type ${legacyStool.type} — ${legacyStool.detail}`);

    return [
        'EET- EN KLACHTENDAGBOEK',
        `Dag en datum: ${formatDate(dateInput.value)}`,
        '',
        ...entries.flatMap(entry => [entry, '']),
        'TOTAAL',
        ...totals,
        '',
        'Notities over de dag:',
        activeDay.notes.trim() || '—'
    ].join('\n');
}

async function copyOverview() {
    const preview = document.getElementById('copy-preview');
    const textArea = document.getElementById('copy-text');
    const status = document.getElementById('copy-status');
    textArea.value = plainTextOverview();
    preview.hidden = false;

    try {
        if (!navigator.clipboard || !window.isSecureContext) {
            throw new Error('Klembordtoegang is niet beschikbaar.');
        }
        await navigator.clipboard.writeText(textArea.value);
        status.textContent = 'Gekopieerd. Je kunt de tekst nu plakken in een e-mail of document.';
    } catch {
        textArea.focus();
        textArea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }
        status.textContent = copied
            ? 'Gekopieerd. Je kunt de tekst nu plakken in een e-mail of document.'
            : 'Kopiëren lukt niet automatisch. Selecteer de tekst en kies Kopieer.';
    }
    preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openDocument() {
    const exportWindow = window.open('about:blank', '_blank');
    if (!exportWindow) {
        saveStatus.textContent = 'Sta pop-ups toe om het overzicht te openen';
        return;
    }
    flushQueuedSave().then(() => writeChain).then(() => {
        const exportUrl = new URL('export.html', document.baseURI);
        exportUrl.searchParams.set('date', dateInput.value);
        exportWindow.location.href = exportUrl.href;
    });
}

const pageQuery = new URLSearchParams(location.search);
const requestedDate = pageQuery.get('date');
dateInput.value = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : localDateString(new Date());
const isAppLaunch = isIosDevice() && isInstalledApp();
installScreen.hidden = false;
diaryApp.hidden = true;
logoutButton.hidden = true;
iosInstallInstructions.hidden = !isIosDevice();

mealList.addEventListener('input', scheduleSave);
mealList.addEventListener('change', scheduleSave);
notesInput.addEventListener('input', scheduleSave);
mealList.addEventListener('click', event => {
    const button = event.target.closest('[data-meal][data-stool-type]');
    if (!button) return;
    activeDay.meals[button.dataset.meal].stoolType = Number(button.dataset.stoolType);
    render();
    scheduleSave();
});
dateInput.addEventListener('change', () => loadDay(dateInput.value));
historySelect.addEventListener('change', () => {
    if (!historySelect.value) return;
    dateInput.value = historySelect.value;
    loadDay(historySelect.value);
});
document.getElementById('new-day-button').addEventListener('click', createDay);
document.getElementById('copy-button').addEventListener('click', copyOverview);
document.getElementById('copy-again-button').addEventListener('click', copyOverview);
document.getElementById('close-copy-button').addEventListener('click', () => {
    document.getElementById('copy-preview').hidden = true;
});
document.getElementById('open-document-button').addEventListener('click', openDocument);
notificationToggle.addEventListener('click', async () => {
    notificationToggle.disabled = true;
    try {
        if (notificationSettings.enabled) {
            await disablePushNotifications();
        } else {
            await enablePushNotifications();
        }
    } catch (error) {
        notificationStatus.textContent = error.message;
        console.error('Pushmeldingen konden niet worden ingeschakeld.', error);
    } finally {
        notificationToggle.disabled = false;
    }
});
notificationReminders.addEventListener('change', handleNotificationSettingsChange);
pageTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activatePageTab(tab));
    tab.addEventListener('keydown', event => {
        let nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % pageTabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index + pageTabs.length - 1) % pageTabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = pageTabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const nextTab = pageTabs[nextIndex];
        activatePageTab(nextTab);
        nextTab.focus();
    });
});
document.getElementById('share-app-button').addEventListener('click', shareAppLink);
document.getElementById('share-install-link-button').addEventListener('click', () => {
    shareAppLink(installAppLinkStatus);
});
authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = authForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    authStatus.textContent = 'Dev-code controleren…';
    try {
        await apiRequest('/api/dev/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: authPassword.value })
        });
        authPassword.value = '';
        showDiaryApp(true);
    } catch (error) {
        authStatus.textContent = error.message;
        console.error('Developmenttoegang kon niet worden geopend.', error);
    } finally {
        submitButton.disabled = false;
    }
});
logoutButton.addEventListener('click', async () => {
    if (!isDevMode || isAppLaunch) return;
    logoutButton.disabled = true;
    try {
        await flushQueuedSave();
        await writeChain;
        await apiRequest('/api/dev/session', { method: 'DELETE' });
        isDevMode = false;
        diaryApp.hidden = true;
        installScreen.hidden = false;
        authStatus.textContent = 'Je bent uitgelogd uit devmode.';
        authPassword.focus();
    } catch (error) {
        saveStatus.textContent = `Uitloggen is niet gelukt: ${error.message}`;
        console.error('Developmenttoegang kon niet worden afgesloten.', error);
    } finally {
        logoutButton.disabled = false;
    }
});

async function startApp() {
    try {
        await migrateLegacyData();
    } catch (error) {
        saveStatus.textContent = 'Overzetten oude gegevens mislukt';
        saveStatus.title = `Oude gegevens zijn behouden in deze browser: ${error.message}`;
        console.error('Eetdagboekgegevens konden niet worden overgezet.', error);
    }

    await loadDay(dateInput.value);
    if (pageQuery.get('newDay') === '1') await createDay();
    try {
        await refreshHistory();
    } catch (error) {
        saveStatus.textContent = error.status === 404 ? 'Open de Node-site uit de terminal' : 'Server niet bereikbaar';
        saveStatus.title = error.status === 404
            ? 'De huidige preview-server heeft geen dagboek-API. Start npm start en open het netwerkadres dat in de terminal verschijnt.'
            : `De daglijst kon niet worden geladen: ${error.message}`;
        console.error('Eetdagboekserver is niet bereikbaar.', error);
    }
}

function showDiaryApp(devMode) {
    isDevMode = devMode;
    installScreen.hidden = true;
    diaryApp.hidden = false;
    logoutButton.hidden = !devMode;
    if (appStarted) return;

    appStarted = true;
    render();
    startApp();
    if (isAppLaunch) initializeNotifications();
}

async function initializeEntry() {
    if (location.hostname.endsWith('.github.io') && !window.EETDAGBOEK_API_BASE_URL) {
        await prepareInstallScreen();
        devAccess.hidden = true;
        installScreenIntro.textContent = 'GitHub Pages kan alleen de website tonen. Voor laden en opslaan is een aparte Node-API nodig.';
        installScreenStatus.textContent = 'Vul de HTTPS-URL van je Node-API in config.js in en laad de pagina opnieuw.';
        return;
    }

    if (isAppLaunch || window.EETDAGBOEK_API_BASE_URL) {
        showDiaryApp(false);
        return;
    }

    await prepareInstallScreen();
    try {
        const session = await apiRequest('/api/dev/session');
        devAccess.hidden = !session.enabled;
        if (!session.enabled) {
            if (!isIosDevice()) {
                installScreenIntro.textContent = 'De app is voorlopig alleen beschikbaar op iPhone en iPad.';
                installScreenStatus.textContent = 'Developmenttoegang is uitgeschakeld op deze server.';
            }
            return;
        }
        if (session.unlocked) showDiaryApp(true);
    } catch (error) {
        devAccess.hidden = false;
        authStatus.textContent = `Devmode kon niet worden gecontroleerd: ${error.message}`;
        console.error('Developmenttoegang kon niet worden gecontroleerd.', error);
    }
}

initializeEntry();

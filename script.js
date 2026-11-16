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

const sessionStorageKey = 'eetdagboek-session-v1';
const isTestEnvironment = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandaloneApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
const dateInput = document.getElementById('diary-date');
const historySelect = document.getElementById('history-select');
const mealList = document.getElementById('meal-list');
const notesInput = document.getElementById('day-notes');
const stoolTypesElement = document.getElementById('stool-types');
const saveStatus = document.getElementById('save-status');
const installScreen = document.getElementById('install-screen');
const diaryApp = document.getElementById('diary-app');
const authForm = document.getElementById('auth-form');
const authPassword = document.getElementById('auth-password');
const authStatus = document.getElementById('auth-status');
const loginLoading = document.getElementById('login-loading');
const logoutButton = document.getElementById('logout-button');
const adminPanel = document.getElementById('admin-panel');
const adminUserList = document.getElementById('admin-user-list');
const adminStatus = document.getElementById('admin-status');
const changeLogForm = document.getElementById('change-log-form');
const changeLogList = document.getElementById('change-log-list');
const changeLogStatus = document.getElementById('change-log-status');
const newChangesDialog = document.getElementById('new-changes-dialog');
const newChangesList = document.getElementById('new-changes-list');
const newChangesStatus = document.getElementById('new-changes-status');
const acknowledgeChangesButton = document.getElementById('acknowledge-changes-button');
const generatedCodePanel = document.getElementById('generated-code-panel');
const generatedUserCode = document.getElementById('generated-user-code');
const pageTabs = Array.from(document.querySelectorAll('.page-tab'));
const pagePanels = Array.from(document.querySelectorAll('.tab-panel'));
document.querySelectorAll('.ios-install-guide').forEach(guide => {
    guide.hidden = !isIosDevice || isStandaloneApp;
});
let activeDay = blankDay();
let activeDate = '';
let appStarted = false;
let savedDays = {};
let sessionToken = '';
let sessionRole = '';
let pendingSaveTimer = null;
let pendingSave = null;
let saveQueue = Promise.resolve();
let saveRevision = 0;
let saveError = null;
let changeLog = [];
let unreadChanges = [];
let editingChangeId = '';

function setLoginLoading(loading) {
    loginLoading.hidden = !loading;
    authForm.querySelector('button[type="submit"]').disabled = loading;
}

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

async function apiRequest(path, options = {}) {
    if (isTestEnvironment) {
        throw new Error('API-verzoeken zijn uitgeschakeld in de lokale testomgeving.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    const response = await fetch(path, {
        method: options.method || 'GET',
        headers,
        ...(options.body ? { body: options.body } : {})
    });
    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('De server gaf een ongeldig antwoord terug.');
    }
    if (!response.ok) throw new Error(result.error || 'Het verzoek is mislukt.');
    return result;
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

function queueSave(date, day) {
    const revision = ++saveRevision;
    saveError = null;
    if (isTestEnvironment) {
        savedDays[date] = day;
        saveStatus.textContent = 'Testmodus — niet opgeslagen';
        refreshHistory();
        return Promise.resolve(true);
    }
    saveQueue = saveQueue.then(async () => {
        await apiRequest('/api/days', {
            method: 'POST',
            body: JSON.stringify({ entries: [{ date, data: day }] })
        });
        savedDays[date] = day;
        if (revision === saveRevision && activeDate === date) {
            saveStatus.textContent = 'Opgeslagen in de cloud';
            saveStatus.title = '';
            refreshHistory();
        }
    }).catch(error => {
        if (revision === saveRevision) {
            saveError = error;
            saveStatus.textContent = 'Opslaan mislukt';
            saveStatus.title = `Je wijzigingen konden niet in de cloud worden opgeslagen: ${error.message}`;
        }
        console.error('Eetdagboek kon niet in Supabase worden opgeslagen.', error);
    });
    return saveQueue.then(() => !saveError);
}

function scheduleSave() {
    activeDay = collectDay();
    updateSummary();
    const date = activeDate || dateInput.value;
    if (!isValidDate(date)) {
        saveStatus.textContent = 'Kies een geldige datum';
        return;
    }
    savedDays[date] = activeDay;
    if (isTestEnvironment) {
        pendingSave = null;
        window.clearTimeout(pendingSaveTimer);
        saveStatus.textContent = 'Testmodus — niet opgeslagen';
        saveStatus.title = 'Testgegevens bestaan alleen totdat je de pagina herlaadt.';
        refreshHistory();
        return;
    }
    pendingSave = { date, day: activeDay };
    saveRevision += 1;
    saveError = null;
    saveStatus.textContent = 'Wordt opgeslagen…';
    saveStatus.title = '';
    window.clearTimeout(pendingSaveTimer);
    pendingSaveTimer = window.setTimeout(() => {
        const pending = pendingSave;
        pendingSave = null;
        if (pending) queueSave(pending.date, pending.day);
    }, 500);
}

async function flushSave() {
    window.clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
    if (pendingSave) {
        const pending = pendingSave;
        pendingSave = null;
        queueSave(pending.date, pending.day);
    }
    await saveQueue;
    return !saveError;
}

async function saveCurrentDay() {
    if (!activeDate) return true;
    activeDay = collectDay();
    savedDays[activeDate] = activeDay;
    if (isTestEnvironment) return true;
    pendingSave = { date: activeDate, day: activeDay };
    return flushSave();
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

function refreshHistory() {
    const dates = Object.keys(savedDays)
        .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort()
        .reverse();
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
    try {
        if (!isValidDate(date)) throw new Error('Kies een geldige datum.');
        if (activeDate && activeDate !== date && !await saveCurrentDay()) {
            dateInput.value = activeDate;
            return;
        }
        const days = savedDays;
        const savedDay = Object.prototype.hasOwnProperty.call(days, date) ? days[date] : null;
        activeDay = normalizeDay(savedDay);
        activeDate = date;
        render();
        if (isTestEnvironment) {
            saveStatus.textContent = savedDay
                ? 'Testdag geladen — niet opgeslagen'
                : 'Nieuwe testdag — niet opgeslagen';
        } else {
            saveStatus.textContent = savedDay
                ? 'Dag uit de cloud geladen'
                : 'Nieuwe dag, nog niet opgeslagen';
        }
        saveStatus.title = '';
    } catch (error) {
        if (activeDate) dateInput.value = activeDate;
        saveStatus.textContent = 'Dag laden mislukt';
        saveStatus.title = error.message;
        console.error('Eetdagboek kon niet worden geladen.', error);
    }
}

async function createDay() {
    const date = dateInput.value;
    if (!isValidDate(date)) return;
    try {
        if (!await saveCurrentDay()) return;
        const days = savedDays;
        if (Object.prototype.hasOwnProperty.call(days, date)) {
            saveStatus.textContent = 'Deze dag bestaat al';
            await loadDay(date);
            return;
        }
        activeDay = blankDay();
        activeDate = date;
        savedDays[date] = activeDay;
        render();
        saveStatus.textContent = 'Dag wordt opgeslagen…';
        saveStatus.title = '';
        refreshHistory();
        await queueSave(date, activeDay);
    } catch (error) {
        saveStatus.textContent = 'Dag aanmaken mislukt';
        saveStatus.title = error.message;
        console.error('Eetdagboek kon niet worden aangemaakt.', error);
    }
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

async function openDocument() {
    const exportWindow = window.open('about:blank', '_blank');
    if (!exportWindow) {
        saveStatus.textContent = 'Sta pop-ups toe om het overzicht te openen';
        return;
    }
    if (!await saveCurrentDay()) {
        exportWindow.close();
        return;
    }
    const exportUrl = new URL('export.html', document.baseURI);
    exportUrl.searchParams.set('date', dateInput.value);
    exportWindow.location.href = exportUrl.href;
}

const pageQuery = new URLSearchParams(location.search);
const requestedDate = pageQuery.get('date');
dateInput.value = isValidDate(requestedDate)
    ? requestedDate
    : localDateString(new Date());

mealList.addEventListener('input', scheduleSave);
mealList.addEventListener('change', scheduleSave);
notesInput.addEventListener('input', scheduleSave);
mealList.addEventListener('click', event => {
    const button = event.target.closest('[data-meal][data-stool-type]');
    if (!button) return;
    const meal = activeDay.meals[button.dataset.meal];
    const selectedType = Number(button.dataset.stoolType);
    meal.stoolType = meal.stoolType === selectedType ? null : selectedType;
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
pageTabs.forEach(tab => {
    tab.addEventListener('click', () => activatePageTab(tab));
    tab.addEventListener('keydown', event => {
        const availableTabs = pageTabs.filter(item => !item.hidden);
        const index = availableTabs.indexOf(tab);
        let nextIndex = -1;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % availableTabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index + availableTabs.length - 1) % availableTabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = availableTabs.length - 1;
        if (nextIndex < 0) return;
        event.preventDefault();
        const nextTab = availableTabs[nextIndex];
        activatePageTab(nextTab);
        nextTab.focus();
    });
});
authForm.addEventListener('submit', async event => {
    event.preventDefault();
    authStatus.textContent = '';
    const submitButton = authForm.querySelector('button[type="submit"]');
    setLoginLoading(true);
    try {
        if (isTestEnvironment) {
            await new Promise(resolve => window.setTimeout(resolve, 500));
            sessionRole = 'test';
            authPassword.value = '';
            authStatus.textContent = '';
            await showDiaryApp('Testgebruiker');
            return;
        }
        const result = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ code: authPassword.value })
        });
        sessionToken = result.token;
        sessionRole = result.role;
        localStorage.setItem(sessionStorageKey, sessionToken);
        authPassword.value = '';
        authStatus.textContent = '';
        await showDiaryApp(result.name);
    } catch (error) {
        setLoginLoading(false);
        authStatus.textContent = error.message;
        authPassword.select();
        console.error('Inloggen is mislukt.', error);
    } finally {
        submitButton.disabled = false;
    }
});

logoutButton.addEventListener('click', async () => {
    if (!await saveCurrentDay() &&
        !window.confirm('Je laatste wijzigingen zijn niet opgeslagen. Wil je toch uitloggen?')) return;
    if (!isTestEnvironment) localStorage.removeItem(sessionStorageKey);
    sessionToken = '';
    sessionRole = '';
    appStarted = false;
    editingChangeId = '';
    diaryApp.hidden = true;
    installScreen.hidden = false;
    loginLoading.hidden = true;
    logoutButton.hidden = true;
    adminPanel.hidden = true;
    generatedCodePanel.hidden = true;
    generatedUserCode.textContent = '';
    adminUserList.replaceChildren();
    savedDays = {};
    activeDate = '';
    activeDay = blankDay();
    render();
    refreshHistory();
    document.getElementById('diary-tab').hidden = false;
    activatePageTab(document.getElementById('diary-tab'));
    authStatus.textContent = isTestEnvironment
        ? 'Terug naar het testinlogscherm. Vernieuwen wist testgegevens.'
        : 'Je bent uitgelogd.';
});

async function startApp() {
    try {
        if (isTestEnvironment) {
            savedDays = {};
            await loadDay(dateInput.value);
            refreshHistory();
            saveStatus.textContent = 'Testmodus — niet opgeslagen';
            return;
        }
        const result = await apiRequest('/api/days');
        savedDays = {};
        result.entries.forEach(entry => {
            savedDays[entry.date] = normalizeDay(entry.data);
        });
        await loadDay(dateInput.value);
        refreshHistory();
    } catch (error) {
        saveStatus.textContent = 'Dagboek laden mislukt';
        saveStatus.title = `De gegevens konden niet uit Supabase worden gelezen: ${error.message}`;
        console.error('Eetdagboek kon niet uit Supabase worden geladen.', error);
        throw error;
    }
}

async function loadAdminUsers() {
    const result = await apiRequest('/api/admin/users');
    adminUserList.replaceChildren();
    result.users.forEach(user => {
        const item = document.createElement('li');
        const details = document.createElement('span');
        details.textContent = `${user.name}${user.active ? '' : ' — ingetrokken'}`;
        item.appendChild(details);
        if (user.active) {
            const button = document.createElement('button');
            button.className = 'button button-secondary';
            button.type = 'button';
            button.dataset.revokeUser = user.id;
            button.textContent = 'Intrekken';
            item.appendChild(button);
        }
        adminUserList.appendChild(item);
    });
}

function makeChangeListItem(change) {
    const item = document.createElement('li');
    const title = document.createElement('h3');
    title.textContent = change.title;
    const date = document.createElement('time');
    date.dateTime = change.created_at;
    date.textContent = new Intl.DateTimeFormat('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(new Date(change.created_at));
    const message = document.createElement('p');
    message.textContent = change.message;
    item.append(title, date, message);
    if (sessionRole === 'admin') {
        const actions = document.createElement('div');
        actions.className = 'change-log-actions';
        const editButton = document.createElement('button');
        editButton.className = 'button button-secondary';
        editButton.type = 'button';
        editButton.dataset.editChange = change.id;
        editButton.textContent = 'Aanpassen';
        const deleteButton = document.createElement('button');
        deleteButton.className = 'button button-secondary';
        deleteButton.type = 'button';
        deleteButton.dataset.deleteChange = change.id;
        deleteButton.textContent = 'Verwijderen';
        actions.append(editButton, deleteButton);
        item.appendChild(actions);

        if (editingChangeId === change.id) {
            const form = document.createElement('form');
            form.className = 'change-log-edit-form';
            form.dataset.changeEditor = change.id;
            form.dataset.revision = change.revision;
            const titleId = `change-edit-title-${change.id}`;
            const messageId = `change-edit-message-${change.id}`;
            const titleLabel = document.createElement('label');
            titleLabel.htmlFor = titleId;
            titleLabel.textContent = 'Titel';
            const titleInput = document.createElement('input');
            titleInput.id = titleId;
            titleInput.name = 'title';
            titleInput.type = 'text';
            titleInput.maxLength = 120;
            titleInput.required = true;
            titleInput.value = change.title;
            const messageLabel = document.createElement('label');
            messageLabel.htmlFor = messageId;
            messageLabel.textContent = 'Wat is er veranderd?';
            const messageInput = document.createElement('textarea');
            messageInput.id = messageId;
            messageInput.name = 'message';
            messageInput.rows = 4;
            messageInput.maxLength = 4000;
            messageInput.required = true;
            messageInput.value = change.message;
            const formActions = document.createElement('div');
            formActions.className = 'change-log-actions';
            const saveButton = document.createElement('button');
            saveButton.className = 'button button-primary';
            saveButton.type = 'submit';
            saveButton.textContent = 'Wijzigingen opslaan';
            const cancelButton = document.createElement('button');
            cancelButton.className = 'button button-secondary';
            cancelButton.type = 'button';
            cancelButton.dataset.cancelChange = change.id;
            cancelButton.textContent = 'Annuleren';
            formActions.append(saveButton, cancelButton);
            form.append(titleLabel, titleInput, messageLabel, messageInput, formActions);
            item.appendChild(form);
        }
    }
    return item;
}

function renderChangeLog() {
    changeLogList.replaceChildren();
    changeLog.forEach(change => changeLogList.appendChild(makeChangeListItem(change)));
    changeLogStatus.textContent = changeLog.length
        ? ''
        : 'Er zijn nog geen veranderingen gepubliceerd.';
}

async function loadChangeLog() {
    const result = await apiRequest('/api/changes');
    if (!Array.isArray(result.changes)) throw new Error('De veranderingen konden niet worden gelezen.');
    changeLog = result.changes;
    renderChangeLog();
    return changeLog.filter(change => !change.seen);
}

function showNewChanges(changes) {
    unreadChanges = changes.map(change => ({ id: change.id, revision: change.revision }));
    newChangesList.replaceChildren(...changes.map(makeChangeListItem));
    newChangesStatus.textContent = '';
    newChangesDialog.showModal();
    acknowledgeChangesButton.focus();
}

async function acknowledgeNewChanges() {
    acknowledgeChangesButton.disabled = true;
    newChangesStatus.textContent = 'Wordt opgeslagen…';
    try {
        await apiRequest('/api/changes/read', {
            method: 'POST',
            body: JSON.stringify({ changes: unreadChanges })
        });
        const acknowledgedRevisions = new Map(unreadChanges.map(change => [change.id, change.revision]));
        changeLog = changeLog.map(change => acknowledgedRevisions.get(change.id) === change.revision
            ? { ...change, seen: true }
            : change);
        unreadChanges = [];
        renderChangeLog();
        newChangesDialog.close();
    } catch (error) {
        newChangesStatus.textContent = `De wijzigingen zijn nog niet als gelezen opgeslagen: ${error.message}`;
        console.error('De gelezen changelog-items konden niet worden opgeslagen.', error);
    } finally {
        acknowledgeChangesButton.disabled = false;
    }
}

function greetingForTime() {
    const hour = new Date().getHours();
    if (hour < 5 || hour >= 22) return 'Goedenacht';
    if (hour < 12) return 'Goedemorgen';
    if (hour < 18) return 'Goedemiddag';
    return 'Goedenavond';
}

async function showDiaryApp(name) {
    logoutButton.hidden = false;
    adminPanel.hidden = sessionRole !== 'admin';
    changeLogForm.hidden = sessionRole !== 'admin';
    document.getElementById('account-name').textContent = name || '';
    document.getElementById('greeting').textContent = greetingForTime();
    document.getElementById('greeting-name').textContent = name || '';
    if (appStarted) return;
    appStarted = true;
    if (isTestEnvironment) {
        document.body.classList.add('test-mode');
        document.getElementById('test-mode-banner').hidden = false;
        document.querySelector('.intro-copy').textContent =
            'In deze testmodus blijven je wijzigingen alleen tijdelijk in het geheugen.';
        document.getElementById('notification-copy').textContent =
            'Lokale testomgeving: gegevens blijven alleen tijdelijk in het geheugen en worden nergens opgeslagen.';
        document.getElementById('storage-status').textContent =
            'Testmodus — vernieuwen of sluiten wist alle ingevoerde gegevens.';
        document.getElementById('open-document-button').hidden = true;
        logoutButton.hidden = false;
        logoutButton.textContent = 'Terug naar inlogscherm';
        adminPanel.hidden = true;
        changeLogForm.hidden = true;
        changeLogStatus.textContent = 'Veranderingen zijn alleen beschikbaar in de liveversie.';
        installScreen.hidden = true;
        diaryApp.hidden = false;
        document.getElementById('diary-tab').hidden = false;
        activatePageTab(document.getElementById('diary-tab'));
        await startApp();
        return;
    }
    if (sessionRole === 'admin') {
        installScreen.hidden = true;
        diaryApp.hidden = false;
        document.getElementById('diary-tab').hidden = true;
        activatePageTab(document.getElementById('reminders-tab'));
        try {
            await loadAdminUsers();
        } catch (error) {
            adminStatus.textContent = `Gebruikers laden mislukt: ${error.message}`;
        }
        try {
            await loadChangeLog();
        } catch (error) {
            changeLogStatus.textContent = `Veranderingen laden mislukt: ${error.message}`;
            console.error('De changelog kon niet worden geladen.', error);
        }
        return;
    }
    document.getElementById('diary-tab').hidden = false;
    activatePageTab(document.getElementById('diary-tab'));
    setLoginLoading(true);
    authStatus.textContent = '';
    try {
        await startApp();
    } catch (error) {
        setLoginLoading(false);
        appStarted = false;
        installScreen.hidden = false;
        authStatus.textContent = `Het dagboek kon niet worden geladen. Je wijzigingen zijn nog niet geopend: ${error.message}`;
        return;
    }
    let unreadChanges = [];
    try {
        unreadChanges = await loadChangeLog();
    } catch (error) {
        changeLogStatus.textContent = `Veranderingen laden mislukt: ${error.message}`;
        console.error('De changelog kon niet worden geladen.', error);
    }
    setLoginLoading(false);
    authStatus.textContent = '';
    installScreen.hidden = true;
    diaryApp.hidden = false;
    if (unreadChanges.length) showNewChanges(unreadChanges);
}

if (!isTestEnvironment && 'serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('service-worker.js').catch(error => {
        console.error('De app-shell kon niet worden bijgewerkt.', error);
    });
}

document.getElementById('create-user-form').addEventListener('submit', async event => {
    event.preventDefault();
    const nameInput = document.getElementById('new-user-name');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    adminStatus.textContent = 'Gebruiker wordt aangemaakt…';
    generatedCodePanel.hidden = true;
    try {
        const result = await apiRequest('/api/admin/users', {
            method: 'POST',
            body: JSON.stringify({ name: nameInput.value })
        });
        generatedUserCode.textContent = result.code;
        generatedCodePanel.hidden = false;
        nameInput.value = '';
        adminStatus.textContent = 'Gebruiker aangemaakt. Bewaar de code; hij wordt niet opnieuw getoond.';
        await loadAdminUsers();
    } catch (error) {
        adminStatus.textContent = `Gebruiker aanmaken mislukt: ${error.message}`;
        console.error('Gebruiker kon niet worden aangemaakt.', error);
    } finally {
        button.disabled = false;
    }
});

changeLogForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isTestEnvironment || sessionRole !== 'admin') return;
    const titleInput = document.getElementById('change-title');
    const messageInput = document.getElementById('change-message');
    const button = changeLogForm.querySelector('button[type="submit"]');
    button.disabled = true;
    changeLogStatus.textContent = 'Verandering wordt gepubliceerd…';
    try {
        await apiRequest('/api/changes', {
            method: 'POST',
            body: JSON.stringify({ title: titleInput.value, message: messageInput.value })
        });
        changeLogForm.reset();
        await loadChangeLog();
        changeLogStatus.textContent = 'Verandering gepubliceerd.';
    } catch (error) {
        changeLogStatus.textContent = `Verandering publiceren mislukt: ${error.message}`;
        console.error('De changelog kon niet worden bijgewerkt.', error);
    } finally {
        button.disabled = false;
    }
});

changeLogList.addEventListener('click', async event => {
    const cancelButton = event.target.closest('[data-cancel-change]');
    if (cancelButton) {
        editingChangeId = '';
        renderChangeLog();
        return;
    }
    const editButton = event.target.closest('[data-edit-change]');
    if (editButton) {
        editingChangeId = editButton.dataset.editChange;
        renderChangeLog();
        changeLogList.querySelector('[data-change-editor] input[name="title"]').focus();
        return;
    }
    const deleteButton = event.target.closest('[data-delete-change]');
    if (!deleteButton || !window.confirm('Wil je deze update definitief verwijderen?')) return;
    deleteButton.disabled = true;
    changeLogStatus.textContent = 'Update wordt verwijderd…';
    try {
        await apiRequest(`/api/changes?id=${encodeURIComponent(deleteButton.dataset.deleteChange)}`, {
            method: 'DELETE'
        });
    } catch (error) {
        changeLogStatus.textContent = `Update verwijderen mislukt: ${error.message}`;
        console.error('De changelog-update kon niet worden verwijderd.', error);
        deleteButton.disabled = false;
        return;
    }
    editingChangeId = '';
    try {
        await loadChangeLog();
        changeLogStatus.textContent = 'Update verwijderd.';
    } catch (error) {
        changeLogStatus.textContent = `Update verwijderd, maar de lijst kon niet worden vernieuwd: ${error.message}`;
        console.error('De changelog kon na verwijderen niet worden ververst.', error);
    }
});

changeLogList.addEventListener('submit', async event => {
    const form = event.target.closest('[data-change-editor]');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    changeLogStatus.textContent = 'Wijziging wordt opgeslagen…';
    try {
        await apiRequest(`/api/changes?id=${encodeURIComponent(form.dataset.changeEditor)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: form.elements.namedItem('title').value,
                message: form.elements.namedItem('message').value,
                revision: Number(form.dataset.revision)
            })
        });
    } catch (error) {
        if (error.message.includes('ondertussen aangepast')) {
            editingChangeId = '';
            try {
                await loadChangeLog();
            } catch (reloadError) {
                console.error('De changelog kon na een conflicterende wijziging niet worden ververst.', reloadError);
            }
        }
        changeLogStatus.textContent = `Update aanpassen mislukt: ${error.message}`;
        console.error('De changelog-update kon niet worden aangepast.', error);
        button.disabled = false;
        return;
    }
    editingChangeId = '';
    try {
        await loadChangeLog();
        changeLogStatus.textContent = 'Update aangepast. Gebruikers krijgen bij hun volgende login opnieuw een melding.';
    } catch (error) {
        changeLogStatus.textContent = `Update aangepast, maar de lijst kon niet worden vernieuwd: ${error.message}`;
        console.error('De changelog kon na aanpassen niet worden ververst.', error);
    }
});

acknowledgeChangesButton.addEventListener('click', acknowledgeNewChanges);

adminUserList.addEventListener('click', async event => {
    const button = event.target.closest('[data-revoke-user]');
    if (!button || !window.confirm('Wil je deze gebruiker intrekken? De toegang tot diens dagboek wordt direct geblokkeerd.')) return;
    button.disabled = true;
    try {
        await apiRequest(`/api/admin/users?id=${encodeURIComponent(button.dataset.revokeUser)}`, {
            method: 'DELETE'
        });
        adminStatus.textContent = 'Gebruiker ingetrokken.';
        await loadAdminUsers();
    } catch (error) {
        button.disabled = false;
        adminStatus.textContent = `Gebruiker intrekken mislukt: ${error.message}`;
        console.error('Gebruiker kon niet worden ingetrokken.', error);
    }
});

document.getElementById('copy-user-code-button').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(generatedUserCode.textContent);
        adminStatus.textContent = 'Gebruikerscode gekopieerd.';
    } catch (error) {
        adminStatus.textContent = 'Kopiëren mislukt. Selecteer de gebruikerscode en kopieer deze handmatig.';
        console.error('Gebruikerscode kon niet worden gekopieerd.', error);
    }
});

async function resumeSession() {
    try {
        sessionToken = localStorage.getItem(sessionStorageKey) || '';
    } catch (error) {
        authStatus.textContent = `De blijvende sessie kan niet worden gelezen: ${error.message}`;
        return;
    }
    if (!sessionToken) return;
    setLoginLoading(true);
    authStatus.textContent = '';
    try {
        const account = await apiRequest('/api/auth/me');
        sessionRole = account.role;
        await showDiaryApp(account.name);
    } catch (error) {
        setLoginLoading(false);
        if (error.message.includes('Log opnieuw in') || error.message.includes('sessie') ||
            error.message.includes('ingetrokken')) {
            localStorage.removeItem(sessionStorageKey);
            sessionToken = '';
        }
        authStatus.textContent = `Automatisch inloggen is mislukt: ${error.message}`;
    }
}

if (isTestEnvironment) {
    document.getElementById('auth-help').textContent =
        'Testmodus: vul een willekeurige code in om door te gaan. Er wordt niets opgeslagen.';
} else {
    resumeSession();
}

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
const dateInput = document.getElementById('diary-date');
const historySelect = document.getElementById('history-select');
const mealList = document.getElementById('meal-list');
const notesInput = document.getElementById('day-notes');
const stoolTypesElement = document.getElementById('stool-types');
const saveStatus = document.getElementById('save-status');
const backupStatus = document.getElementById('backup-status');
const installScreen = document.getElementById('install-screen');
const diaryApp = document.getElementById('diary-app');
const authForm = document.getElementById('auth-form');
const authPassword = document.getElementById('auth-password');
const authStatus = document.getElementById('auth-status');
const logoutButton = document.getElementById('logout-button');
const adminPanel = document.getElementById('admin-panel');
const adminUserList = document.getElementById('admin-user-list');
const adminStatus = document.getElementById('admin-status');
const generatedCodePanel = document.getElementById('generated-code-panel');
const generatedUserCode = document.getElementById('generated-user-code');
const pageTabs = Array.from(document.querySelectorAll('.page-tab'));
const pagePanels = Array.from(document.querySelectorAll('.tab-panel'));
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

async function writeCloudDays(entries) {
    const normalizedEntries = entries.map(entry => ({
        date: entry.date,
        data: normalizeDay(entry.data)
    }));
    await apiRequest('/api/days', {
        method: 'POST',
        body: JSON.stringify({ entries: normalizedEntries })
    });
    normalizedEntries.forEach(entry => {
        savedDays[entry.date] = entry.data;
    });
}

function downloadBackup() {
    try {
        const days = { ...savedDays };
        if (!Object.keys(days).length) {
            backupStatus.textContent = 'Er zijn nog geen opgeslagen dagen om te downloaden.';
            return;
        }
        const backup = new Blob([JSON.stringify(days, null, 2)], { type: 'application/json' });
        const backupUrl = URL.createObjectURL(backup);
        const link = document.createElement('a');
        link.href = backupUrl;
        link.download = 'eetdagboek-reservekopie.json';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(backupUrl), 1000);
        backupStatus.textContent = 'Reservekopie gedownload.';
    } catch (error) {
        backupStatus.textContent = `Reservekopie maken is mislukt: ${error.message}`;
        console.error('Eetdagboekreservekopie kon niet worden gemaakt.', error);
    }
}

async function importDayFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const dateMatch = file.name.match(/\d{4}-\d{2}-\d{2}/);

    try {
        const importedData = JSON.parse(await file.text());
        if (!importedData || typeof importedData !== 'object' || Array.isArray(importedData)) {
            throw new Error('Dit bestand bevat geen dagboekgegevens.');
        }
        if (!await saveCurrentDay()) return;
        const days = savedDays;
        let entries;
        if (importedData.meals && typeof importedData.meals === 'object') {
            const date = dateMatch ? dateMatch[0] : dateInput.value;
            if (!isValidDate(date)) throw new Error('De datum voor deze dag is ongeldig.');
            entries = [[date, importedData]];
        } else {
            entries = Object.entries(importedData);
            if (!entries.length || entries.some(([date, day]) =>
                !isValidDate(date) || !day || typeof day !== 'object' ||
                !day.meals || typeof day.meals !== 'object')) {
                throw new Error('Dit bestand bevat geen geldige reservekopie.');
            }
        }

        const conflicts = entries.filter(([date]) =>
            Object.prototype.hasOwnProperty.call(days, date));
        if (conflicts.length && !window.confirm(
            `${conflicts.length} ${conflicts.length === 1 ? 'dag bestaat' : 'dagen bestaan'} al. Wil je die vervangen?`
        )) {
            return;
        }
        await writeCloudDays(entries.map(([date, data]) => ({ date, data })));
        const selectedDate = dateMatch && entries.some(([date]) => date === dateMatch[0])
            ? dateMatch[0]
            : entries[0][0];
        activeDate = '';
        dateInput.value = selectedDate;
        await loadDay(selectedDate);
        refreshHistory();
        backupStatus.textContent = `${entries.length} ${entries.length === 1 ? 'dag geïmporteerd' : 'dagen geïmporteerd'}.`;
    } catch (error) {
        backupStatus.textContent = `Dagbestand importeren is mislukt: ${error.message}`;
        console.error('Dagbestand kon niet worden geïmporteerd.', error);
    } finally {
        event.target.value = '';
    }
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
        saveStatus.textContent = savedDay ? 'Dag uit de cloud geladen' : 'Nieuwe dag, nog niet opgeslagen';
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
document.getElementById('backup-button').addEventListener('click', downloadBackup);
document.getElementById('import-day-file').addEventListener('change', importDayFile);
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
    authStatus.textContent = 'Bezig met inloggen…';
    const submitButton = authForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
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
    localStorage.removeItem(sessionStorageKey);
    sessionToken = '';
    sessionRole = '';
    appStarted = false;
    diaryApp.hidden = true;
    installScreen.hidden = false;
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
    authStatus.textContent = 'Je bent uitgelogd.';
});

async function startApp() {
    try {
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

async function showDiaryApp(name) {
    logoutButton.hidden = false;
    adminPanel.hidden = sessionRole !== 'admin';
    document.getElementById('account-name').textContent = name || '';
    if (appStarted) return;
    appStarted = true;
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
        return;
    }
    document.getElementById('diary-tab').hidden = false;
    activatePageTab(document.getElementById('diary-tab'));
    diaryApp.hidden = true;
    installScreen.hidden = false;
    authStatus.textContent = 'Je dagboek wordt geladen…';
    try {
        await startApp();
        authStatus.textContent = '';
        installScreen.hidden = true;
        diaryApp.hidden = false;
    } catch (error) {
        appStarted = false;
        installScreen.hidden = false;
        authStatus.textContent = `Het dagboek kon niet worden geladen. Je wijzigingen zijn nog niet geopend: ${error.message}`;
    }
}

if ('serviceWorker' in navigator && window.isSecureContext) {
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
    try {
        const account = await apiRequest('/api/auth/me');
        sessionRole = account.role;
        await showDiaryApp(account.name);
    } catch (error) {
        if (error.message.includes('Log opnieuw in') || error.message.includes('sessie') ||
            error.message.includes('ingetrokken')) {
            localStorage.removeItem(sessionStorageKey);
            sessionToken = '';
        }
        authStatus.textContent = `Automatisch inloggen is mislukt: ${error.message}`;
    }
}

resumeSession();

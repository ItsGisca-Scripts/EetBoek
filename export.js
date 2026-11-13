const moments = [
    { id: 'ontbijt', name: 'Ontbijt' },
    { id: 'tussendoor-ochtend', name: 'Tussen-door' },
    { id: 'lunch', name: 'Lunch' },
    { id: 'tussendoor-middag', name: 'Tussendoor' },
    { id: 'warme-maaltijd', name: 'Warme Maaltijd' },
    { id: 'tussendoor-avond', name: 'Tussendoor' }
];

const stoolTypes = [
    { type: 1, detail: 'Losse harde keutels, zoals noten (moeilijke stoelgang)' },
    { type: 2, detail: 'Als een worst, maar klonterig' },
    { type: 3, detail: 'Als een worst met barstjes aan de buitenkant' },
    { type: 4, detail: 'Als een worst of slang, glad en zacht' },
    { type: 5, detail: 'Zachte keutels met duidelijke randen' },
    { type: 6, detail: 'Zachte en papperige delen met niet-definieerbare randen' },
    { type: 7, detail: 'Waterig, geen vaste stukjes, helemaal vloeibaar' }
];

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function formatDate(dateString) {
    return new Intl.DateTimeFormat('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${dateString}T00:00:00Z`));
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
    return `<svg viewBox="0 0 86 34" role="img" aria-label="Ontlasting type ${type}"><g fill="#9a6541" stroke="#805034" stroke-width="1">${drawings[type] || ''}</g></svg>`;
}

function normalizeMeal(savedMeal) {
    return {
        time: typeof savedMeal.time === 'string' ? savedMeal.time : '',
        food: typeof savedMeal.food === 'string' ? savedMeal.food : '',
        drink: typeof savedMeal.drink === 'string' ? savedMeal.drink : '',
        details: typeof savedMeal.details === 'string' ? savedMeal.details : '',
        movement: typeof savedMeal.movement === 'string' ? savedMeal.movement : '',
        symptoms: typeof savedMeal.symptoms === 'string' ? savedMeal.symptoms : '',
        symptomScore: typeof savedMeal.symptomScore === 'string' ? savedMeal.symptomScore : '',
        stoolType: Number.isInteger(savedMeal.stoolType) ? savedMeal.stoolType : null
    };
}

function totalDrinks(day) {
    let milliliters = 0;
    moments.forEach(moment => {
        const drinkText = day.meals[moment.id].drink;
        for (const match of drinkText.matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b/gi)) {
            const amount = Number(match[1].replace(',', '.'));
            const unit = match[2].toLowerCase();
            milliliters += amount * (unit === 'l' ? 1000 : unit === 'cl' ? 10 : 1);
        }
    });
    return milliliters ? `${Number(milliliters.toFixed(1))} ml` : 'Niet berekend';
}

function renderDocument(date, day) {
    document.title = `Eetdagboek - ${formatDate(date)}`;
    document.getElementById('document-date').textContent = `Dag en datum: ${formatDate(date)}`;
    const normalizedMeals = {};
    moments.forEach(moment => {
        normalizedMeals[moment.id] = normalizeMeal(day.meals && day.meals[moment.id] || {});
    });

    const filledMeals = moments.filter(moment => {
        const meal = normalizedMeals[moment.id];
        return meal.food.trim() || meal.drink.trim() || meal.details.trim() ||
            meal.movement.trim() || meal.symptoms.trim() || meal.stoolType;
    }).length;
    const movementSummary = moments
        .map(moment => normalizedMeals[moment.id].movement.trim())
        .filter(Boolean)
        .join('; ') || '—';
    const stoolCount = moments.filter(moment => normalizedMeals[moment.id].stoolType).length;
    const symptomCount = moments.filter(moment => normalizedMeals[moment.id].symptoms.trim()).length;

    document.getElementById('meal-rows').innerHTML = moments.map(moment => {
        const meal = normalizedMeals[moment.id];
        const stool = stoolTypes.find(item => item.type === meal.stoolType);
        const symptoms = meal.symptoms.trim()
            ? `${escapeHtml(meal.symptoms)}${meal.symptomScore ? ` — ${escapeHtml(meal.symptomScore)}/10` : ''}`
            : '<span class="empty">—</span>';
        const stoolContent = stool
            ? `<span class="stool-value">${stoolIllustration(stool.type)}<span>Type ${stool.type}<br>${escapeHtml(stool.detail)}</span></span>`
            : '<span class="empty">—</span>';
        return `<tr>
            <th>${moment.name}<span class="meal-time">${meal.time ? `${escapeHtml(meal.time).replace(':', '.')} uur` : 'Tijd niet ingevuld'}</span></th>
            <td>${escapeHtml(meal.food) || '<span class="empty">—</span>'}</td>
            <td>${escapeHtml(meal.drink) || '<span class="empty">—</span>'}</td>
            <td>${escapeHtml(meal.details) || '<span class="empty">—</span>'}</td>
            <td>${escapeHtml(meal.movement) || '<span class="empty">—</span>'}</td>
            <td>${stoolContent}</td>
            <td>${symptoms}</td>
        </tr>`;
    }).join('');

    const legacyStool = stoolTypes.find(item => item.type === day.stoolType);
    document.getElementById('totals-row').innerHTML = `<tr>
        <th>TOTAAL</th>
        <td>${filledMeals} van 6 momenten ingevuld</td>
        <td>${totalDrinks({ meals: normalizedMeals })}</td>
        <td>${escapeHtml(day.notes) || '—'}${legacyStool ? `<br>Ontlasting: type ${legacyStool.type}` : ''}</td>
        <td>${escapeHtml(movementSummary)}</td>
        <td>${stoolCount} type${stoolCount === 1 ? '' : 's'} ingevuld</td>
        <td>${symptomCount} moment${symptomCount === 1 ? '' : 'en'} met klachten</td>
    </tr>`;

    const notes = document.getElementById('day-notes');
    const notesText = document.getElementById('day-notes-text');
    if (day.notes) {
        notes.hidden = false;
        notesText.textContent = day.notes;
    }
    document.getElementById('document-status').textContent = 'Dagoverzicht geopend';
}

async function loadDocument() {
    const date = new URLSearchParams(location.search).get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('De datum in de documentlink is ongeldig.');
    }
    let day;
    const saved = localStorage.getItem('mijn-eetdagboek-v1');
    const days = saved ? JSON.parse(saved) : {};
    if (!days || typeof days !== 'object' || Array.isArray(days)) {
        throw new Error('De lokaal opgeslagen dagen hebben een ongeldig formaat.');
    }
    day = days[date] || { meals: {}, notes: '', stoolType: null };
    renderDocument(date, day);
}

loadDocument().catch(error => {
    document.getElementById('document-status').textContent = error.message;
    document.getElementById('document').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});

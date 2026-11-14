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

function wrapCanvasText(context, value, maxWidth) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];

    const lines = [];
    let line = '';
    words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth || !line) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    });
    lines.push(line);
    return lines;
}

function rowText(row) {
    return Array.from(row.cells, cell => (cell.innerText || cell.textContent).replace(/\s+/g, ' ').trim());
}

async function saveTableImage() {
    const button = document.getElementById('save-image-button');
    const status = document.getElementById('document-status');
    button.disabled = true;
    status.textContent = 'Afbeelding maken…';

    try {
        const table = document.querySelector('.table-scroll table');
        if (!table) throw new Error('De dagtabel is niet beschikbaar.');

        const headers = Array.from(table.querySelectorAll('thead th'), cell => cell.innerText.trim());
        const rows = [
            ...Array.from(table.querySelectorAll('tbody tr'), rowText),
            ...Array.from(table.querySelectorAll('tfoot tr'), rowText)
        ];
        const columnCount = headers.length;
        if (!columnCount) throw new Error('De dagtabel bevat geen kolommen.');

        const scale = 2;
        const padding = 36;
        const tableWidth = 2100;
        const columnWidth = tableWidth / columnCount;
        const cellPadding = 12;
        const lineHeight = 22;
        const measureCanvas = document.createElement('canvas');
        const measureContext = measureCanvas.getContext('2d');
        if (!measureContext) throw new Error('Afbeeldingen maken wordt niet ondersteund in deze browser.');

        function prepareRow(cells, font) {
            measureContext.font = font;
            const lines = cells.map(text => wrapCanvasText(
                measureContext,
                text,
                columnWidth - cellPadding * 2
            ));
            return {
                lines,
                height: Math.max(72, ...lines.map(value => value.length * lineHeight + cellPadding * 2))
            };
        }

        const header = prepareRow(headers, 'bold 16px Arial');
        const body = rows.map((row, index) => prepareRow(
            row,
            index === rows.length - 1 ? 'bold 14px Arial' : '14px Arial'
        ));
        const title = document.querySelector('.document-header h1').innerText;
        const date = document.getElementById('document-date').innerText;
        const notes = document.getElementById('day-notes');
        const notesText = notes.hidden ? '' : document.getElementById('day-notes-text').innerText;
        const titleHeight = 86;
        const notesHeight = notesText ? 100 + Math.ceil(notesText.length / 120) * lineHeight : 0;
        const imageWidth = tableWidth + padding * 2;
        const imageHeight = padding * 2 + titleHeight + header.height +
            body.reduce((height, row) => height + row.height, 0) + notesHeight;
        const canvas = document.createElement('canvas');
        canvas.width = imageWidth * scale;
        canvas.height = imageHeight * scale;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Afbeeldingen maken wordt niet ondersteund in deze browser.');
        context.scale(scale, scale);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, imageWidth, imageHeight);

        context.fillStyle = '#376c55';
        context.font = 'bold 30px Arial';
        context.fillText(title, padding, padding + 34);
        context.fillStyle = '#25372e';
        context.font = '14px Arial';
        context.fillText(date, padding, padding + 61);

        function drawRow(prepared, y, isHeader, isTotal) {
            let x = padding;
            prepared.lines.forEach(lines => {
                context.fillStyle = isHeader ? '#f6f7f5' : isTotal ? '#fafbf9' : '#ffffff';
                context.fillRect(x, y, columnWidth, prepared.height);
                context.strokeStyle = '#879189';
                context.lineWidth = 1;
                context.strokeRect(x, y, columnWidth, prepared.height);
                context.fillStyle = '#25372e';
                context.font = isHeader
                    ? 'bold 16px Arial'
                    : isTotal ? 'bold 14px Arial' : '14px Arial';
                lines.forEach((line, index) => {
                    context.fillText(line, x + cellPadding, y + cellPadding + 16 + index * lineHeight);
                });
                x += columnWidth;
            });
        }

        let y = padding + titleHeight;
        drawRow(header, y, true, false);
        y += header.height;
        body.forEach((row, index) => {
            drawRow(row, y, false, index === body.length - 1);
            y += row.height;
        });

        if (notesText) {
            y += 20;
            context.fillStyle = '#25372e';
            context.font = 'bold 16px Arial';
            context.fillText('Notities over de dag', padding, y + 18);
            context.font = '14px Arial';
            wrapCanvasText(context, notesText, tableWidth).forEach((line, index) => {
                context.fillText(line, padding, y + 44 + index * lineHeight);
            });
        }

        const image = await new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('De afbeelding kon niet worden gemaakt.')), 'image/png');
        });
        const imageUrl = URL.createObjectURL(image);
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `eetdagboek-${new URLSearchParams(location.search).get('date')}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
        status.textContent = 'Afbeelding opgeslagen.';
    } catch (error) {
        status.textContent = error.message;
        console.error('De dagtabel kon niet als afbeelding worden opgeslagen.', error);
    } finally {
        button.disabled = false;
    }
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

document.getElementById('save-image-button').addEventListener('click', saveTableImage);

loadDocument().catch(error => {
    document.getElementById('document-status').textContent = error.message;
    document.getElementById('document').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});

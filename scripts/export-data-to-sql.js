const fs = require('node:fs/promises');
const path = require('node:path');

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function main() {
    const dataDirectory = path.join(__dirname, '..', 'data');
    const outputDirectory = path.join(__dirname, '..', 'database');
    const outputPath = path.join(outputDirectory, 'data-import.sql');
    const files = await fs.readdir(dataDirectory);
    const dayFiles = files
        .filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .sort();
    const rows = [];

    for (const file of dayFiles) {
        const entryDate = file.slice(0, 10);
        if (!isValidDate(entryDate)) {
            throw new Error(`Ongeldige datum in bestandsnaam: ${file}`);
        }
        const content = JSON.parse(await fs.readFile(path.join(dataDirectory, file), 'utf8'));
        const jsonHex = Buffer.from(JSON.stringify(content), 'utf8').toString('hex');
        rows.push(`    ('${entryDate}', CONVERT(X'${jsonHex}' USING utf8mb4))`);
    }

    const statements = [
        '-- Generated from data/YYYY-MM-DD.json by npm run export:mysql-data.',
        '-- Run database/schema.sql first. This file contains private diary data; do not commit it.',
        'SET NAMES utf8mb4;',
        'START TRANSACTION;'
    ];
    if (rows.length > 0) {
        statements.push(
            'INSERT INTO diary_days (entry_date, content) VALUES',
            `${rows.join(',\n')};`
        );
    }
    statements.push('COMMIT;', '');

    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputPath, statements.join('\n'), 'utf8');
    console.log(`SQL-export gemaakt met ${rows.length} dag(en): ${outputPath}`);
}

main().catch(error => {
    console.error('De lokale dagbestanden konden niet naar SQL worden geëxporteerd.', error);
    process.exitCode = 1;
});

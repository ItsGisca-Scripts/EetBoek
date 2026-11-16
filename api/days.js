const {
    database,
    isRecord,
    readBody,
    respondError,
    send,
    validDate,
    verify
} = require('../lib/backend');

module.exports = async function handler(req, res) {
    try {
        const session = await verify(req, 'user');
        if (req.method === 'GET') {
            const date = typeof req.query.date === 'string' ? req.query.date : '';
            if (date && !validDate(date)) return send(res, 400, { error: 'Ongeldige datum.' });
            const query = date
                ? `user_id=eq.${session.sub}&entry_date=eq.${date}&select=entry_date,data`
                : `user_id=eq.${session.sub}&select=entry_date,data&order=entry_date.desc`;
            const rows = await database('diary_entries', query);
            return send(res, 200, { entries: rows.map(row => ({ date: row.entry_date, data: row.data })) });
        }
        if (req.method === 'POST') {
            const body = readBody(req);
            const entries = Array.isArray(body.entries) ? body.entries : [body];
            if (!entries.length || entries.length > 500 || entries.some(entry =>
                !isRecord(entry) || !validDate(entry.date) || !isRecord(entry.data)
            )) {
                return send(res, 400, { error: 'De dagboekgegevens of datums zijn ongeldig.' });
            }
            const rows = entries.map(entry => ({
                user_id: session.sub,
                entry_date: entry.date,
                data: entry.data
            }));
            await database('diary_entries', 'on_conflict=user_id,entry_date', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=minimal',
                body: rows
            });
            return send(res, 200, { saved: entries.length });
        }
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    } catch (error) {
        return respondError(res, error);
    }
};

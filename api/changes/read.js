const { database, isRecord, readBody, respondError, send, verify } = require('../../lib/backend');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    }
    try {
        const session = await verify(req, 'user');
        const body = readBody(req);
        if (!isRecord(body) || !Array.isArray(body.changes) ||
            body.changes.length < 1 || body.changes.length > 500 ||
            body.changes.some(change => !isRecord(change) ||
                typeof change.id !== 'string' || !uuidPattern.test(change.id) ||
                !Number.isInteger(change.revision) || change.revision < 1)) {
            return send(res, 400, { error: 'De lijst met gelezen wijzigingen is ongeldig.' });
        }
        const rows = Array.from(new Map(body.changes.map(change => [
            change.id,
            { user_id: session.sub, change_id: change.id, seen_revision: change.revision }
        ])).values());
        await database('diary_change_reads', 'on_conflict=user_id,change_id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=minimal',
            body: rows
        });
        return send(res, 200, { markedRead: rows.length });
    } catch (error) {
        return respondError(res, error);
    }
};

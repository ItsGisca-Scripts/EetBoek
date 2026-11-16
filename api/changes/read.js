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
        if (!isRecord(body) || !Array.isArray(body.changeIds) ||
            body.changeIds.length < 1 || body.changeIds.length > 500 ||
            body.changeIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))) {
            return send(res, 400, { error: 'De lijst met gelezen wijzigingen is ongeldig.' });
        }
        const rows = Array.from(new Set(body.changeIds)).map(changeId => ({
            user_id: session.sub,
            change_id: changeId
        }));
        await database('diary_change_reads', 'on_conflict=user_id,change_id', {
            method: 'POST',
            prefer: 'resolution=ignore-duplicates,return=minimal',
            body: rows
        });
        return send(res, 200, { markedRead: rows.length });
    } catch (error) {
        return respondError(res, error);
    }
};

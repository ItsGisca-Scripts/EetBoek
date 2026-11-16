const {
    database,
    isRecord,
    readBody,
    respondError,
    send,
    verify
} = require('../lib/backend');

module.exports = async function handler(req, res) {
    try {
        const session = await verify(req);
        if (req.method === 'GET') {
            const changes = await database(
                'app_changes',
                'select=id,title,message,created_at&order=created_at.desc&limit=500'
            );
            if (session.role === 'admin') {
                return send(res, 200, { changes: changes.map(change => ({ ...change, seen: true })) });
            }
            const reads = await database(
                'diary_change_reads',
                `user_id=eq.${session.sub}&select=change_id&limit=500`
            );
            const seenIds = new Set(reads.map(read => read.change_id));
            return send(res, 200, {
                changes: changes.map(change => ({ ...change, seen: seenIds.has(change.id) }))
            });
        }
        if (req.method === 'POST') {
            await verify(req, 'admin');
            const body = readBody(req);
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            const message = typeof body.message === 'string' ? body.message.trim() : '';
            if (!isRecord(body) || !title || title.length > 120 || !message || message.length > 4000) {
                return send(res, 400, { error: 'Vul een titel en bericht in (maximaal 120 en 4000 tekens).' });
            }
            const rows = await database('app_changes', 'select=id,title,message,created_at', {
                method: 'POST',
                prefer: 'return=representation',
                body: { title, message }
            });
            return send(res, 201, { change: rows[0] });
        }
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    } catch (error) {
        return respondError(res, error);
    }
};

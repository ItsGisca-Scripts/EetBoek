const {
    database,
    isRecord,
    readBody,
    respondError,
    send,
    verify
} = require('../lib/backend');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
    try {
        const session = await verify(req);
        if (req.method === 'GET') {
            const changes = await database(
                'app_changes',
                'select=id,title,message,created_at,revision&order=created_at.desc&limit=500'
            );
            if (session.role === 'admin') {
                return send(res, 200, { changes: changes.map(change => ({ ...change, seen: true })) });
            }
            const reads = await database(
                'diary_change_reads',
                `user_id=eq.${session.sub}&select=change_id,seen_revision&limit=500`
            );
            const seenRevisions = new Map(reads.map(read => [read.change_id, read.seen_revision]));
            return send(res, 200, {
                changes: changes.map(change => ({
                    ...change,
                    seen: seenRevisions.get(change.id) === change.revision
                }))
            });
        }
        if (req.method === 'POST') {
            await verify(req, 'admin');
            const body = readBody(req);
            if (!isRecord(body)) {
                return send(res, 400, { error: 'Vul een titel en bericht in (maximaal 120 en 4000 tekens).' });
            }
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            const message = typeof body.message === 'string' ? body.message.trim() : '';
            if (!title || title.length > 120 || !message || message.length > 4000) {
                return send(res, 400, { error: 'Vul een titel en bericht in (maximaal 120 en 4000 tekens).' });
            }
            const rows = await database('app_changes', 'select=id,title,message,created_at', {
                method: 'POST',
                prefer: 'return=representation',
                body: { title, message }
            });
            return send(res, 201, { change: rows[0] });
        }
        if (req.method === 'PATCH') {
            await verify(req, 'admin');
            const id = typeof req.query.id === 'string' ? req.query.id : '';
            if (!uuidPattern.test(id)) return send(res, 400, { error: 'Ongeldige verandering.' });
            const body = readBody(req);
            if (!isRecord(body)) {
                return send(res, 400, { error: 'Vul een titel en bericht in (maximaal 120 en 4000 tekens).' });
            }
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            const message = typeof body.message === 'string' ? body.message.trim() : '';
            if (!title || title.length > 120 || !message || message.length > 4000 ||
                !Number.isInteger(body.revision) || body.revision < 1) {
                return send(res, 400, { error: 'Vul een titel en bericht in (maximaal 120 en 4000 tekens).' });
            }
            const current = await database(
                'app_changes',
                `id=eq.${id}&select=id,revision&limit=1`
            );
            if (!current.length) return send(res, 404, { error: 'Verandering niet gevonden.' });
            if (current[0].revision !== body.revision) {
                return send(res, 409, { error: 'Deze verandering is ondertussen aangepast. Laad de lijst opnieuw.' });
            }
            const rows = await database(
                'app_changes',
                `id=eq.${id}&revision=eq.${body.revision}&select=id,title,message,created_at,revision`,
                {
                    method: 'PATCH',
                    prefer: 'return=representation',
                    body: {
                        title,
                        message,
                        revision: body.revision + 1
                    }
                }
            );
            if (!rows.length) {
                return send(res, 409, { error: 'Deze verandering is ondertussen aangepast. Laad de lijst opnieuw.' });
            }
            return send(res, 200, { change: rows[0] });
        }
        if (req.method === 'DELETE') {
            await verify(req, 'admin');
            const id = typeof req.query.id === 'string' ? req.query.id : '';
            if (!uuidPattern.test(id)) return send(res, 400, { error: 'Ongeldige verandering.' });
            const rows = await database('app_changes', `id=eq.${id}&select=id`, {
                method: 'DELETE',
                prefer: 'return=representation'
            });
            if (!rows.length) return send(res, 404, { error: 'Verandering niet gevonden.' });
            return send(res, 200, { deleted: true });
        }
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    } catch (error) {
        return respondError(res, error);
    }
};

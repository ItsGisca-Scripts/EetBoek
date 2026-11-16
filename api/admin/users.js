const {
    codeHash,
    database,
    isRecord,
    randomBytes,
    readBody,
    respondError,
    send,
    verify
} = require('../../lib/backend');

module.exports = async function handler(req, res) {
    try {
        await verify(req, 'admin');
        if (req.method === 'GET') {
            const users = await database(
                'diary_users',
                'select=id,name,active,created_at&order=created_at.desc'
            );
            return send(res, 200, { users });
        }
        if (req.method === 'POST') {
            const body = readBody(req);
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!name || name.length > 80) {
                return send(res, 400, { error: 'Vul een naam in van maximaal 80 tekens.' });
            }
            const code = randomBytes(24).toString('base64url');
            const rows = await database('diary_users', 'select=id,name,active,created_at', {
                method: 'POST',
                prefer: 'return=representation',
                body: { name, code_hash: codeHash(code), active: true }
            });
            return send(res, 201, { user: rows[0], code });
        }
        if (req.method === 'DELETE') {
            const id = typeof req.query.id === 'string' ? req.query.id : '';
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
                return send(res, 400, { error: 'Ongeldige gebruiker.' });
            }
            const current = await database('diary_users', `id=eq.${id}&select=id,token_version&limit=1`);
            if (!current.length) return send(res, 404, { error: 'Gebruiker niet gevonden.' });
            const rows = await database('diary_users', `id=eq.${id}&select=id,name,active,created_at`, {
                method: 'PATCH',
                prefer: 'return=representation',
                body: { active: false, token_version: current[0].token_version + 1 }
            });
            return send(res, 200, { user: rows[0] });
        }
        res.setHeader('Allow', 'GET, POST, DELETE');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    } catch (error) {
        return respondError(res, error);
    }
};

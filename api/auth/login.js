const {
    codeHash,
    createSession,
    database,
    readBody,
    respondError,
    sameSecret,
    send
} = require('../../lib/backend');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    }
    try {
        const { code } = readBody(req);
        if (typeof code !== 'string' || code.length < 1 || code.length > 256) {
            return send(res, 400, { error: 'Vul een geldige gebruikerscode in.' });
        }

        const adminCode = process.env.ADMIN_CODE;
        if (!adminCode || adminCode.length < 32) {
            throw new Error('De beheercode ontbreekt of is te kort. Stel een code van minimaal 32 tekens in Vercel in.');
        }
        if (sameSecret(code, adminCode)) {
            return send(res, 200, { token: createSession('admin'), role: 'admin', name: 'Beheerder' });
        }

        const users = await database(
            'diary_users',
            `code_hash=eq.${codeHash(code)}&select=id,name,active,token_version&limit=1`
        );
        const user = users && users[0];
        if (!user || !user.active) return send(res, 401, { error: 'Deze gebruikerscode is niet geldig of is ingetrokken.' });
        return send(res, 200, { token: createSession('user', user), role: 'user', name: user.name });
    } catch (error) {
        return respondError(res, error);
    }
};

const { respondError, send, verify } = require('../../lib/backend');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return send(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
    }
    try {
        const session = await verify(req);
        return send(res, 200, {
            role: session.role,
            name: session.name || 'Beheerder'
        });
    } catch (error) {
        return respondError(res, error);
    }
};

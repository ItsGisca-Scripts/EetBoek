const {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual
} = require('node:crypto');

function config() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!url || !serviceKey || !sessionSecret || sessionSecret.length < 32) {
        throw new Error('De server is nog niet volledig ingesteld. Controleer de Vercel-omgevingsvariabelen.');
    }
    return {
        url: url.replace(/\/+$/, ''),
        serviceKey,
        sessionSecret
    };
}

function send(res, status, body) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

function readBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return {};
}

async function database(table, query = '', options = {}) {
    const settings = config();
    const response = await fetch(`${settings.url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
        method: options.method || 'GET',
        headers: {
            apikey: settings.serviceKey,
            Authorization: `Bearer ${settings.serviceKey}`,
            'Content-Type': 'application/json',
            ...(options.prefer ? { Prefer: options.prefer } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const text = await response.text();
    let result = null;
    if (text) {
        try {
            result = JSON.parse(text);
        } catch {
            throw new Error('De database gaf een ongeldig antwoord terug.');
        }
    }
    if (!response.ok) {
        console.error('Supabase-verzoek mislukt:', response.status, result);
        throw new Error(result && result.message
            ? `Supabase-verzoek mislukt: ${result.message}`
            : 'Het Supabase-verzoek is mislukt.');
    }
    return result;
}

function codeHash(code) {
    return createHash('sha256').update(code).digest('hex');
}

function sameSecret(input, expected) {
    const inputHash = codeHash(input);
    const expectedHash = codeHash(expected);
    return timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function sign(payload) {
    const settings = config();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsigned = `${header}.${body}`;
    const signature = createHmac('sha256', settings.sessionSecret).update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
}

async function verify(req, requiredRole) {
    const match = /^Bearer ([\w.-]+)$/.exec(req.headers.authorization || '');
    if (!match) throw Object.assign(new Error('Log opnieuw in om verder te gaan.'), { status: 401 });

    const parts = match[1].split('.');
    if (parts.length !== 3) throw Object.assign(new Error('Ongeldige sessie.'), { status: 401 });
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = createHmac('sha256', config().sessionSecret).update(unsigned).digest();
    let actual;
    let payload;
    try {
        actual = Buffer.from(parts[2], 'base64url');
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        throw Object.assign(new Error('Ongeldige sessie.'), { status: 401 });
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected) ||
        !payload || typeof payload !== 'object' ||
        !Number.isInteger(payload.iat) ||
        !['admin', 'user'].includes(payload.role)) {
        throw Object.assign(new Error('Ongeldige sessie. Log opnieuw in.'), { status: 401 });
    }
    if (requiredRole && payload.role !== requiredRole) {
        throw Object.assign(new Error('Je hebt geen toegang tot deze functie.'), { status: 403 });
    }
    if (payload.role === 'admin' && payload.ver !== codeHash(process.env.ADMIN_CODE || '')) {
        throw Object.assign(new Error('De beheercode is gewijzigd. Log opnieuw in.'), { status: 401 });
    }
    if (payload.role === 'user') {
        const users = await database(
            'diary_users',
            `id=eq.${encodeURIComponent(payload.sub)}&select=id,name,active,token_version&limit=1`
        );
        const user = users && users[0];
        if (!user || !user.active || user.token_version !== payload.ver) {
            throw Object.assign(new Error('Deze gebruikerscode is ingetrokken. Vraag de beheerder om een nieuwe code.'), { status: 401 });
        }
        payload.name = user.name;
    }
    return payload;
}

function createSession(role, user) {
    const now = Math.floor(Date.now() / 1000);
    return sign({
        sub: user ? user.id : 'admin',
        role,
        ...(user ? { ver: user.token_version, name: user.name } : { ver: codeHash(process.env.ADMIN_CODE || '') }),
        iat: now
    });
}

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function respondError(res, error) {
    const status = error.status || 500;
    if (status === 500) console.error('API-verzoek mislukt:', error);
    send(res, status, { error: status === 500 ? error.message || 'Er is een serverfout opgetreden.' : error.message });
}

module.exports = {
    codeHash,
    config,
    createSession,
    database,
    isRecord,
    randomBytes,
    readBody,
    respondError,
    sameSecret,
    send,
    validDate,
    verify
};

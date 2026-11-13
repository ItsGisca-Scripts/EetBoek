const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomInt, randomUUID, timingSafeEqual } = require('node:crypto');
const os = require('node:os');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const webPush = require('web-push');

const root = __dirname;
const dataDirectory = path.join(root, 'data');
const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';
const mealIds = [
    'ontbijt',
    'tussendoor-ochtend',
    'lunch',
    'tussendoor-middag',
    'warme-maaltijd',
    'tussendoor-avond'
];
const mealFields = ['time', 'food', 'drink', 'details', 'movement', 'symptoms', 'symptomScore'];
const reminderTemplates = [
    { id: 'new-day', title: 'Nieuwe dag en ontbijt', time: '07:00', body: 'Maak je nieuwe dag aan en noteer je ontbijt.', url: './?newDay=1' },
    { id: 'snack-morning', title: 'Tussendoor noteren', time: '09:45', body: 'Tijd om je ochtendtussendoortje te noteren.' },
    { id: 'lunch', title: 'Lunch noteren', time: '12:00', body: 'Tijd om je lunch en drinken te noteren.' },
    { id: 'snack-afternoon', title: 'Tussendoor noteren', time: '15:00', body: 'Tijd om je middagtussendoortje te noteren.' },
    { id: 'dinner', title: 'Warme maaltijd noteren', time: '18:00', body: 'Tijd om je warme maaltijd te noteren.' },
    { id: 'snack-evening', title: 'Avondtussendoortje noteren', time: '20:00', body: 'Tijd om je avondtussendoortje te noteren.' }
];
const vapidFile = path.join(dataDirectory, 'push-vapid.json');
const subscriptionsFile = path.join(dataDirectory, 'push-subscriptions.json');
const devCodeFile = path.join(dataDirectory, 'dev-code.json');
const devModeEnabled = process.env.NODE_ENV !== 'production';
const devSessionCookie = 'eetdagboek_dev_session';
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8'
};

let vapidKeys;
let devCode = null;
let devSessionToken = null;
let mysqlPool;

function getLanAddress() {
    const addresses = [];
    Object.values(os.networkInterfaces()).forEach(network => {
        (network || []).forEach(address => {
            if ((address.family === 'IPv4' || address.family === 4) &&
                !address.internal && !address.address.startsWith('169.254.')) {
                addresses.push(address.address);
            }
        });
    });
    return addresses.find(address =>
        /^10\./.test(address) ||
        /^192\.168\./.test(address) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(address)
    ) || addresses[0] || 'localhost';
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function send(response, status, payload, headers = {}) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers
    });
    response.end(JSON.stringify(payload));
}

function getCorsHeaders(request) {
    const origin = request.headers.origin;
    if (!origin) return {};
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) return null;

    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProtocol === 'string'
        ? forwardedProtocol.split(',')[0].trim()
        : request.socket && request.socket.encrypted ? 'https' : 'http';
    const requestOrigin = normalizeOrigin(`${protocol}://${request.headers.host || 'localhost'}`);
    if (normalizedOrigin === requestOrigin) return {};

    const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(value => value.trim())
        .map(normalizeOrigin)
        .filter(Boolean);
    if (!allowedOrigins.includes(normalizedOrigin)) return null;
    return {
        'Access-Control-Allow-Origin': normalizedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin'
    };
}

function normalizeOrigin(value) {
    try {
        const origin = new URL(value).origin;
        return origin === 'null' ? null : origin;
    } catch {
        return null;
    }
}

function getMysqlPool() {
    if (!mysqlUrl) {
        throw new Error('Stel MYSQL_URL in via de hostinstellingen of .env.local.');
    }
    if (!mysqlPool) {
        const url = new URL(mysqlUrl);
        if (!['mysql:', 'mariadb:'].includes(url.protocol)) {
            throw new Error('MYSQL_URL moet een mysql://- of mariadb://-verbinding zijn.');
        }
        const sslMode = (url.searchParams.get('ssl-mode') || url.searchParams.get('sslmode') || '').toUpperCase();
        const useSsl = process.env.MYSQL_SSL === 'true' ||
            url.searchParams.get('ssl') === 'true' ||
            ['REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'].includes(sslMode);
        mysqlPool = mysql.createPool({
            host: url.hostname,
            port: Number(url.port) || 3306,
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: decodeURIComponent(url.pathname.slice(1)),
            ssl: useSsl ? {} : undefined,
            waitForConnections: true,
            connectionLimit: 5,
            enableKeepAlive: true
        });
    }
    return mysqlPool;
}

function parseMysqlJson(value) {
    if (typeof value === 'string') return JSON.parse(value);
    if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
    return value;
}

function endpointHash(endpoint) {
    return createHash('sha256').update(endpoint, 'utf8').digest();
}

async function writeJsonFile(filePath, data) {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
        await fs.rename(temporaryPath, filePath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true });
        throw error;
    }
}

async function ensureVapidKeys() {
    if (mysqlUrl) {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (!publicKey || !privateKey) {
            throw new Error('Stel VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in voor de server.');
        }
        vapidKeys = { publicKey, privateKey };
    } else {
        await fs.mkdir(dataDirectory, { recursive: true });
        try {
            vapidKeys = JSON.parse(await fs.readFile(vapidFile, 'utf8'));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            vapidKeys = webPush.generateVAPIDKeys();
            await writeJsonFile(vapidFile, vapidKeys);
        }
    }
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
        throw new Error('De VAPID-sleutels in data/push-vapid.json zijn ongeldig.');
    }
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
}

async function ensureDevCode() {
    if (!devModeEnabled) return;

    if (process.env.DEV_CODE) {
        devCode = process.env.DEV_CODE;
    } else {
        try {
            const saved = JSON.parse(await fs.readFile(devCodeFile, 'utf8'));
            devCode = saved.code;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            devCode = String(randomInt(10_000_000, 100_000_000));
            await writeJsonFile(devCodeFile, { code: devCode });
        }
    }

    if (typeof devCode !== 'string' || devCode.length < 8 || devCode.length > 128) {
        throw new Error('De dev-code moet tussen 8 en 128 tekens lang zijn.');
    }
    devSessionToken = createHash('sha256').update(devCode).digest('hex');
    console.log(`Ontwikkelcode voor browsermodus: ${devCode}`);
}

function isValidDevSession(request) {
    if (!devModeEnabled || !devSessionToken) return false;
    const cookieHeader = request.headers.cookie || '';
    const cookie = cookieHeader.split(';')
        .map(part => part.trim())
        .find(part => part.startsWith(`${devSessionCookie}=`));
    if (!cookie) return false;

    const supplied = Buffer.from(cookie.slice(devSessionCookie.length + 1));
    const expected = Buffer.from(devSessionToken);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function setDevSessionCookie(request, response, clear = false) {
    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const isHttps = Boolean(request.socket.encrypted) ||
        (typeof forwardedProtocol === 'string' && forwardedProtocol.split(',')[0].trim() === 'https');
    const value = clear ? '' : devSessionToken;
    const maxAge = clear ? 0 : 315_360_000;
    response.setHeader(
        'Set-Cookie',
        `${devSessionCookie}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isHttps ? '; Secure' : ''}`
    );
}

async function handleDevSessionApi(request, response, url) {
    if (url.pathname !== '/api/dev/session') return false;

    if (request.method === 'GET') {
        send(response, 200, {
            enabled: devModeEnabled,
            unlocked: isValidDevSession(request)
        });
        return true;
    }

    if (!devModeEnabled) {
        send(response, 403, { error: 'Devmodus is uitgeschakeld op deze server.' });
        return true;
    }

    if (request.method === 'POST') {
        const body = await readJson(request);
        const code = body && typeof body === 'object' && typeof body.code === 'string'
            ? body.code
            : '';
        const supplied = Buffer.from(code);
        const expected = Buffer.from(devCode);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            send(response, 401, { error: 'De dev-code klopt niet.' });
            return true;
        }
        setDevSessionCookie(request, response);
        send(response, 200, { enabled: true, unlocked: true });
        return true;
    }

    if (request.method === 'DELETE') {
        if (!isValidDevSession(request)) {
            send(response, 401, { error: 'Je bent niet ingelogd in devmode.' });
            return true;
        }
        setDevSessionCookie(request, response, true);
        send(response, 200, { enabled: true, unlocked: false });
        return true;
    }

    send(response, 405, { error: 'Methode niet toegestaan.' }, { Allow: 'GET, POST, DELETE' });
    return true;
}

function isValidTimezone(timeZone) {
    if (typeof timeZone !== 'string' || timeZone.length > 80) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone });
        return true;
    } catch {
        return false;
    }
}

function validatePushSettings(settings) {
    if (!settings || typeof settings !== 'object' ||
        typeof settings.enabled !== 'boolean' ||
        !Array.isArray(settings.reminders) ||
        !isValidTimezone(settings.timeZone) ||
        settings.reminders.length !== reminderTemplates.length) return false;

    return reminderTemplates.every(template => {
        const reminder = settings.reminders.find(item => item && item.id === template.id);
        return reminder &&
            typeof reminder.enabled === 'boolean' &&
            typeof reminder.time === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time);
    });
}

function isValidSubscription(subscription) {
    if (!subscription || typeof subscription !== 'object' ||
        typeof subscription.endpoint !== 'string' ||
        typeof subscription.keys?.p256dh !== 'string' ||
        typeof subscription.keys?.auth !== 'string') return false;
    try {
        return new URL(subscription.endpoint).protocol === 'https:';
    } catch {
        return false;
    }
}

async function readSubscriptions() {
    if (mysqlUrl) {
        const [rows] = await getMysqlPool().execute(
            'SELECT endpoint, subscription, settings, last_sent FROM push_subscriptions'
        );
        return rows.map(row => ({
            subscription: parseMysqlJson(row.subscription),
            settings: parseMysqlJson(row.settings),
            lastSent: parseMysqlJson(row.last_sent) || {}
        }));
    }
    try {
        const subscriptions = JSON.parse(await fs.readFile(subscriptionsFile, 'utf8'));
        if (!Array.isArray(subscriptions)) throw new Error('Push-abonnementenbestand is ongeldig.');
        return subscriptions;
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function writeSubscriptions(subscriptions) {
    if (mysqlUrl) {
        const pool = getMysqlPool();
        for (const entry of subscriptions) {
            const endpoint = entry.subscription.endpoint;
            await pool.execute(
                `INSERT INTO push_subscriptions
                    (endpoint_hash, endpoint, subscription, settings, last_sent)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    endpoint = VALUES(endpoint),
                    subscription = VALUES(subscription),
                    settings = VALUES(settings),
                    last_sent = VALUES(last_sent)`,
                [
                    endpointHash(endpoint),
                    endpoint,
                    JSON.stringify(entry.subscription),
                    JSON.stringify(entry.settings),
                    JSON.stringify(entry.lastSent || {})
                ]
            );
        }
        return;
    }
    await writeJsonFile(subscriptionsFile, subscriptions);
}

async function handlePushApi(request, response, url) {
    if (url.pathname === '/api/push/public-key' && request.method === 'GET') {
        send(response, 200, { publicKey: vapidKeys.publicKey });
        return true;
    }

    if (url.pathname !== '/api/push/subscriptions') return false;

    if (request.method === 'POST' || request.method === 'PUT') {
        const body = await readJson(request);
        if (!isValidSubscription(body.subscription) || !validatePushSettings(body.settings)) {
            send(response, 400, { error: 'De meldingsinstellingen zijn ongeldig.' });
            return true;
        }
        const subscriptions = await readSubscriptions();
        const existingIndex = subscriptions.findIndex(entry =>
            entry.subscription.endpoint === body.subscription.endpoint
        );
        const existing = existingIndex < 0 ? null : subscriptions[existingIndex];
        const entry = {
            subscription: body.subscription,
            settings: body.settings,
            lastSent: existing && existing.lastSent ? existing.lastSent : {}
        };
        if (existingIndex < 0) subscriptions.push(entry);
        else subscriptions[existingIndex] = entry;
        await writeSubscriptions(subscriptions);
        send(response, 200, { saved: true });
        return true;
    }

    if (request.method === 'DELETE') {
        const body = await readJson(request);
        if (!body || typeof body.endpoint !== 'string') {
            send(response, 400, { error: 'Het push-abonnement is ongeldig.' });
            return true;
        }
        if (mysqlUrl) {
            await getMysqlPool().execute(
                'DELETE FROM push_subscriptions WHERE endpoint_hash = ?',
                [endpointHash(body.endpoint)]
            );
            send(response, 200, { removed: true });
            return true;
        }
        const subscriptions = await readSubscriptions();
        const remaining = subscriptions.filter(entry => entry.subscription.endpoint !== body.endpoint);
        if (remaining.length !== subscriptions.length) {
            await writeJsonFile(subscriptionsFile, remaining);
        }
        send(response, 200, { removed: true });
        return true;
    }

    send(response, 405, { error: 'Methode niet toegestaan.' }, { Allow: 'GET, POST, PUT, DELETE' });
    return true;
}

function getLocalDateTime(timeZone, date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = {};
    parts.forEach(part => { values[part.type] = part.value; });
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        time: `${values.hour}:${values.minute}`
    };
}

async function sendDueReminders() {
    const subscriptions = await readSubscriptions();

    let changed = false;
    const now = new Date();
    for (const entry of subscriptions) {
        if (!entry.settings.enabled) continue;
        let current;
        try {
            current = getLocalDateTime(entry.settings.timeZone, now);
        } catch (error) {
            console.error('Ongeldige tijdzone voor pushherinnering.', error);
            continue;
        }
        for (const reminder of entry.settings.reminders) {
            if (!reminder.enabled || reminder.time !== current.time) continue;
            const sentKey = `${current.date}:${reminder.id}`;
            if (entry.lastSent[sentKey]) continue;
            const template = reminderTemplates.find(item => item.id === reminder.id);
            try {
                await webPush.sendNotification(entry.subscription, JSON.stringify({
                    title: template.title,
                    body: template.body,
                    url: template.url || './',
                    tag: `eetdagboek-${sentKey}`
                }));
                entry.lastSent[sentKey] = now.toISOString();
                changed = true;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    entry.settings.enabled = false;
                    changed = true;
                    console.log('Ongeldig push-abonnement uitgeschakeld.');
                } else {
                    console.error('Pushherinnering kon niet worden verzonden.', error.message);
                }
            }
        }
    }
    if (changed) {
        await writeSubscriptions(subscriptions);
    }
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024) throw Object.assign(new Error('De invoer is te groot.'), { status: 413 });
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw Object.assign(new Error('Ongeldige JSON-invoer.'), { status: 400 });
    }
}

function validateDay(day) {
    if (!day || typeof day !== 'object' || Array.isArray(day) ||
        !day.meals || typeof day.meals !== 'object' || Array.isArray(day.meals) ||
        typeof day.notes !== 'string' || day.notes.length > 10000 ||
        !(day.stoolType === null || (Number.isInteger(day.stoolType) && day.stoolType >= 1 && day.stoolType <= 7))) {
        return false;
    }
    return mealIds.every(id => {
        const meal = day.meals[id];
        return meal && typeof meal === 'object' && !Array.isArray(meal) &&
            mealFields.every(field => typeof meal[field] === 'string' && meal[field].length <= 5000);
    }) && mealIds.every(id => {
        const meal = day.meals[id];
        const validScore = meal.symptomScore === '' ||
            (/^(?:[0-9]|10)$/.test(meal.symptomScore));
        const validStool = meal.stoolType === null ||
            (Number.isInteger(meal.stoolType) && meal.stoolType >= 1 && meal.stoolType <= 7);
        return validScore && validStool;
    });
}

async function handleApi(request, response, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'days') return false;

    if (parts.length === 2 && request.method === 'GET') {
        if (mysqlUrl) {
            const [rows] = await getMysqlPool().execute(
                "SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date FROM diary_days ORDER BY entry_date DESC"
            );
            send(response, 200, rows.map(row => row.entry_date));
            return true;
        }
        await fs.mkdir(dataDirectory, { recursive: true });
        const files = await fs.readdir(dataDirectory);
        const dates = files
            .filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
            .map(file => file.slice(0, 10))
            .filter(isValidDate)
            .sort()
            .reverse();
        send(response, 200, dates);
        return true;
    }

    if (parts.length !== 3 || !isValidDate(parts[2])) {
        send(response, 400, { error: 'Ongeldige datum.' });
        return true;
    }

    const date = parts[2];
    const filePath = path.join(dataDirectory, `${date}.json`);

    if (request.method === 'GET') {
        if (mysqlUrl) {
            const [rows] = await getMysqlPool().execute(
                'SELECT content FROM diary_days WHERE entry_date = ?',
                [date]
            );
            if (rows.length === 0) {
                send(response, 404, { error: 'Deze dag is nog niet opgeslagen.' });
                return true;
            }
            send(response, 200, parseMysqlJson(rows[0].content));
            return true;
        }
        try {
            const content = await fs.readFile(filePath, 'utf8');
            send(response, 200, JSON.parse(content));
        } catch (error) {
            if (error.code === 'ENOENT') {
                send(response, 404, { error: 'Deze dag is nog niet opgeslagen.' });
            } else {
                throw error;
            }
        }
        return true;
    }

    if (request.method === 'POST' || request.method === 'PUT') {
        const day = await readJson(request);
        if (!validateDay(day)) {
            send(response, 400, { error: 'De daggegevens zijn ongeldig.' });
            return true;
        }

        if (request.method === 'POST') {
            if (mysqlUrl) {
                try {
                    await getMysqlPool().execute(
                        'INSERT INTO diary_days (entry_date, content) VALUES (?, ?)',
                        [date, JSON.stringify(day)]
                    );
                } catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY') throw error;
                    send(response, 409, { error: 'Deze dag bestaat al.' });
                    return true;
                }
            } else {
                try {
                    const handle = await fs.open(filePath, 'wx');
                    try {
                        await handle.writeFile(`${JSON.stringify(day, null, 2)}\n`, 'utf8');
                    } finally {
                        await handle.close();
                    }
                } catch (error) {
                    if (error.code === 'EEXIST') {
                        send(response, 409, { error: 'Deze dag bestaat al.' });
                        return true;
                    }
                    throw error;
                }
            }
        } else if (mysqlUrl) {
            await getMysqlPool().execute(
                `INSERT INTO diary_days (entry_date, content) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE content = VALUES(content)`,
                [date, JSON.stringify(day)]
            );
        } else {
            const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
            try {
                await fs.writeFile(temporaryPath, `${JSON.stringify(day, null, 2)}\n`, { flag: 'wx' });
                await fs.rename(temporaryPath, filePath);
            } catch (error) {
                await fs.rm(temporaryPath, { force: true });
                throw error;
            }
        }
        send(response, 200, { saved: true, date });
        return true;
    }

    send(response, 405, { error: 'Methode niet toegestaan.' }, { Allow: 'GET, POST, PUT' });
    return true;
}

async function handleRequest(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    try {
        if (url.pathname.startsWith('/api/')) {
            const corsHeaders = getCorsHeaders(request);
            if (corsHeaders === null) {
                send(response, 403, { error: 'Dit domein heeft geen toegang tot de API.' });
                return;
            }
            Object.entries(corsHeaders).forEach(([name, value]) => response.setHeader(name, value));
            if (request.method === 'OPTIONS') {
                response.writeHead(204, {
                    ...corsHeaders,
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                response.end();
                return;
            }
            if (url.pathname.startsWith('/api/push/')) await ensureVapidKeys();
            if (await handleDevSessionApi(request, response, url)) return;
            if (await handlePushApi(request, response, url)) return;
            if (await handleApi(request, response, url)) return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            send(response, 405, { error: 'Methode niet toegestaan.' }, { Allow: 'GET, HEAD' });
            return;
        }

        const requestedPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (![
            'index.html',
            'style.css',
            'script.js',
            'export.html',
            'export.js',
            'manifest.webmanifest',
            'config.js',
            'service-worker.js',
            'icon.svg',
            'favicon.ico',
            'icon-180.png',
            'icon-192.png',
            'icon-512.png'
        ].includes(requestedPath)) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Niet gevonden');
            return;
        }

        const content = await fs.readFile(path.join(root, requestedPath));
        const headers = {
            'Content-Type': mimeTypes[path.extname(requestedPath)] || 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        };
        if (requestedPath === 'service-worker.js') {
            headers['Service-Worker-Allowed'] = '/';
        }
        response.writeHead(200, {
            ...headers
        });
        response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
        console.error('Verzoek mislukt:', error);
        if (!response.headersSent) {
            send(response, error.status || 500, {
                error: error.status ? error.message : 'Er ging iets mis bij het verwerken van je verzoek.'
            });
        } else {
            response.destroy();
        }
    }
}

async function startServer() {
    await ensureDevCode();
    if (mysqlUrl) await getMysqlPool().query('SELECT 1');
    if (!mysqlUrl || (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)) {
        await ensureVapidKeys();
    }
    const server = http.createServer(handleRequest);
    server.listen(port, host, () => {
        const accessHost = host === '0.0.0.0' ? getLanAddress() : host;
        console.log(`Eetdagboek draait op http://${accessHost}:${port}`);
        console.log(mysqlUrl
            ? 'Dagboekgegevens en pushinstellingen worden in MySQL opgeslagen.'
            : `Dagbestanden en pushinstellingen staan in ${dataDirectory}`);
    });
    if (vapidKeys) {
        const reminderTimer = setInterval(() => {
            sendDueReminders().catch(error => console.error('Pushherinneringen konden niet worden verwerkt.', error));
        }, 30_000);
        reminderTimer.unref();
    } else {
        console.warn('Pushherinneringen zijn uitgeschakeld; stel eerst de VAPID-sleutels in.');
    }
}

startServer().catch(error => {
    console.error('Eetdagboekserver kon niet starten.', error);
    process.exitCode = 1;
});

# GitHub Pages en MySQL

GitHub Pages host alleen statische bestanden. Het kan geen Node.js API draaien en mag niet rechtstreeks met MySQL verbinden. De app gebruikt daarom de GitHub Pages-website als frontend en een apart gehoste Node-server als API; alleen die server krijgt de MySQL-verbinding.

## Database instellen

1. Maak een MySQL-database en voer [`database/schema.sql`](./database/schema.sql) uit.
2. Kopieer `.env.local.example` naar `.env.local` voor lokaal gebruik (PowerShell: `Copy-Item .env.local.example .env.local`). Vul `MYSQL_URL` in met de connection string van je MySQL-host. Codeer speciale tekens in de gebruikersnaam of het wachtwoord als URL-tekens. Gebruik op je backend-host diens Environment Variables-instellingen. Zet de connection string nooit in `config.js`, GitHub Pages of Git.
3. Genereer de import voor de bestaande dagbestanden met `npm run export:mysql-data`. Importeer daarna `database/data-import.sql` in MySQL. Het exportbestand wordt lokaal gemaakt en staat in `.gitignore`, omdat het privé dagboekgegevens bevat.
4. Configureer op de Node-host ook `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` en `CORS_ORIGINS`. Genereer een nieuw VAPID-paar met `npx web-push generate-vapid-keys`, of gebruik de bestaande sleutels uit het genegeerde bestand `data/push-vapid.json` om pushabonnementen te behouden. Stel `CORS_ORIGINS` in op de GitHub Pages-origin, bijvoorbeeld `https://gebruikersnaam.github.io` (zonder `/repository`).
5. Deploy de Node-server op een host die Node.js-processen en uitgaande MySQL-verbindingen ondersteunt. Pushherinneringen werken alleen zolang die server draait.

## GitHub Pages instellen

1. Pas in [`config.js`](./config.js) `EETDAGBOEK_API_BASE_URL` aan naar de HTTPS-basis-URL van je Node-API, bijvoorbeeld `https://jouw-api.example.com`.
2. Push de repository naar GitHub en zet Pages aan via **Settings → Pages**, met de gewenste branch en map.
3. Open de Pages-URL. De database-URL en alle databasegegevens blijven uitsluitend op de Node-server.

Zonder een bereikbare Node-API kan GitHub Pages alleen de statische interface tonen; opslaan, laden en pushmeldingen vereisen de backend.

## Privacy

De API heeft geen gebruikersauthenticatie. CORS beperkt alleen browserverzoeken en is geen toegangsbeveiliging: iedereen die de API-URL kent kan dagboekgegevens lezen en wijzigen. Gebruik geen persoonlijke gegevens totdat er authenticatie aan de API is toegevoegd.

# Mijn eetdagboek

De app gebruikt Vercel voor de website en API en Supabase voor de dagboekopslag. Dagboekdagen worden per gebruikerscode gescheiden opgeslagen. De Supabase service-role sleutel blijft uitsluitend op Vercel.

## Eenmalige installatie

1. Maak een Supabase-project aan.
2. Open **SQL Editor** in Supabase en voer [`supabase/schema.sql`](./supabase/schema.sql) uit.
3. Importeer deze repository in Vercel. De API staat in `api/`; er zijn geen npm-pakketten nodig.
4. Voeg in **Vercel → Project → Settings → Environment Variables** deze variabelen toe voor Production en Preview:
   - `SUPABASE_URL`: de Project URL van Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: de `service_role`-sleutel uit Supabase Project Settings → API Keys. Zet deze nooit in frontendcode.
   - `SESSION_SECRET`: een willekeurige geheime waarde van minimaal 32 tekens.
   - `ADMIN_CODE`: een andere, willekeurige geheime waarde. Dit is de beheerderscode waarmee je inlogt.
5. Maak de eerste deployment opnieuw nadat je de variabelen hebt ingesteld.

Bij een bestaande installatie voer je het bijgewerkte `supabase/schema.sql` ook opnieuw uit om de changelogtabellen en meldingsversies toe te voegen.

Genereer twee verschillende sterke waarden in CMD met:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Gebruik de eerste waarde voor `SESSION_SECRET` en genereer de tweede voor `ADMIN_CODE`. Bewaar de beheerderscode veilig; deze wordt niet in de website opgeslagen.

Je kunt deployen met de Vercel CLI vanuit CMD:

```cmd
npx vercel login
npx vercel link
npx vercel --prod
```

Om een bestaande deployment bij te werken nadat Vercel-omgevingsvariabelen zijn gewijzigd:

```cmd
npx vercel --prod
```

## Lokaal testen in VS Code

Start **Live Server** op `localhost` of `127.0.0.1`. Het inlogscherm blijft beschikbaar; vul daar een willekeurige code in om de app lokaal te openen. De API, browseropslag en service worker worden niet gebruikt. Ingevoerde gegevens blijven alleen in het geheugen en verdwijnen zodra je teruggaat naar het inlogscherm, de pagina vernieuwt of sluit. Het dagoverzicht exporteren is in deze modus uitgeschakeld.

## Gebruikers en gegevens

Log in met `ADMIN_CODE` om gebruikers te beheren. Maak per gebruiker een code aan en deel die veilig; de volledige code wordt na aanmaak maar één keer getoond. De gebruiker logt in met alleen die code. De sessie blijft op het apparaat bewaard totdat de gebruiker uitlogt of de beheerder de toegang intrekt. Wijzig `ADMIN_CODE` om bestaande beheerderssessies ongeldig te maken. Gebruikers zien alleen hun eigen dagboek.

Wijzigingen worden na een korte typ-pauze automatisch naar Supabase verzonden. Een foutmelding verschijnt als opslaan niet lukt. Voor een ander apparaat log je in met dezelfde gebruikerscode. Import en export van JSON-bestanden is verwijderd; het dagoverzicht voor je diëtist en opslaan daarvan als afbeelding zijn nog beschikbaar. Oude browseropslag wordt niet automatisch overgezet.

Beheerders kunnen in **Profiel en informatie → Veranderingen** updates publiceren, aanpassen en verwijderen. Een aangepaste update verschijnt opnieuw als melding bij gebruikers die de eerdere versie al hebben gezien. Gebruikers kunnen updates daar later teruglezen.

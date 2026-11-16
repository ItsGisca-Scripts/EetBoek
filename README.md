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

## Gebruikers en gegevens

Log in met `ADMIN_CODE` om gebruikers te beheren. Maak per gebruiker een code aan en deel die veilig; de volledige code wordt na aanmaak maar één keer getoond. De gebruiker logt in met alleen die code. De sessie blijft maximaal tien jaar op het apparaat bewaard, totdat de gebruiker uitlogt of de beheerder de toegang intrekt. Gebruikers zien alleen hun eigen dagboek.

Wijzigingen worden na een korte typ-pauze automatisch naar Supabase verzonden. Een foutmelding verschijnt als opslaan niet lukt. Voor een ander apparaat log je in met dezelfde gebruikerscode. Maak daarnaast regelmatig een reservekopie via **Account en reservekopie**.

De bestaande browseropslag wordt niet automatisch naar Supabase gekopieerd. Download eerst een reservekopie uit de oude app en importeer die na het inloggen. Behandel gebruikerscodes en reservekopieën als privégegevens.

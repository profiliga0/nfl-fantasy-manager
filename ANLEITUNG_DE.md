# Detaillierte Einrichtung ohne Kreditkarte

## A. GitHub
1. Kostenloses GitHub-Konto anlegen und E-Mail verifizieren.
2. Neues öffentliches Repository anlegen, z. B. `nfl-fantasy-manager`.
3. Den **Inhalt des Ordners `site/`** in das Repository hochladen.
4. In GitHub: Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
5. GitHub erzeugt eine Adresse wie `https://DEINNAME.github.io/nfl-fantasy-manager/`.

GitHub Pages ist ein statischer Hosting-Dienst und steht in öffentlichen Repositorys mit GitHub Free zur Verfügung.

## B. Supabase
1. `https://supabase.com/` öffnen.
2. Free-Projekt wählen. Der Free-Tarif ist aktuell mit 0 USD/Monat ausgewiesen. Wenn die Registrierung entgegen deiner Erwartung eine Kreditkarte verlangt, **nicht** weitergehen und keine Zahlungsdaten eingeben. Dann müssen wir auf einen anderen Anbieter ausweichen.
3. Free-Projekt erstellen.
4. Einen Projektnamen vergeben, z. B. `nfl-fantasy-manager-2026`.
5. Ein sicheres Datenbank-Passwort setzen.
6. Nach dem Anlegen unter Project Settings → API die **Project URL** und den **Publishable/Anon Key** kopieren. Den Service Role Key nicht in GitHub speichern.

## C. Datenbank einrichten
1. Supabase → SQL Editor.
2. Datei `supabase/schema.sql` komplett öffnen/kopieren.
3. Alles im SQL Editor einfügen und ausführen.
4. Danach werden Tabellen, Indexe, RLS und Hilfsfunktionen angelegt.

## D. Edge Function `api`

1. Supabase → Edge Functions.
2. "Deploy a new function" → "Via Editor".
3. Funktion `api` anlegen und `supabase/functions/api/index.ts` komplett einfügen.
4. Deploy starten.
5. In den Function-Einstellungen die JWT-Prüfung deaktivieren, falls das Dashboard dafür einen Schalter anbietet. Die Funktion hat eine eigene Sitzungs-/PIN-Prüfung; die automatische Sync-Aufgabe wird zusätzlich mit `SYNC_SECRET` geschützt.

Supabase dokumentiert `verify_jwt=false` als Konfiguration für Funktionen, die nicht über einen User-JWT abgesichert werden. Die Datei `supabase/config.toml` enthält diese Einstellung für CLI-Deployments.

Für diesen ZIP-Weg ist `config.toml` bereits enthalten. Wenn du die Edge Function ausschließlich im Dashboard bearbeitest und dort keine JWT-Einstellung angeboten bekommst, verwende stattdessen den Abschnitt "CLI-Deployment via GitHub Actions" weiter unten.

## D2. Empfohlener Weg für die Edge Function: GitHub Actions

Falls das Supabase-Dashboard keine JWT-Konfiguration anbietet, ist dieser Weg zuverlässiger. In der ZIP liegt bereits `supabase/config.toml`. Du kannst dann die Functions über GitHub Actions deployen.

Dafür brauchst du in GitHub unter Settings → Secrets and variables → Actions:
- `SUPABASE_ACCESS_TOKEN` = persönlicher Supabase Access Token
- `SUPABASE_PROJECT_REF` = Projekt-ID
- `SUPABASE_SYNC_SECRET` = derselbe Wert wie das `SYNC_SECRET` in Supabase

Die ZIP enthält dafür bereits `.github/workflows/deploy-supabase.yml`; sie läuft nur manuell über `workflow_dispatch`, damit kein Deploy ohne dein Zutun passiert.

## E. Secret für die automatische Synchronisierung
In Supabase → Edge Functions → `api` → Secrets ein zusätzliches Secret anlegen:
- `SYNC_SECRET` = langer zufälliger Wert, z. B. 32+ Zeichen

`SUPABASE_URL` und der serverseitige Supabase-Secret-Key sind in der Edge-Function-Umgebung vorhanden; ein Secret-Key darf niemals in GitHub Pages stehen.

## F. Frontend konfigurieren
In `site/config.js`:
- `SUPABASE_URL`: Project URL
- `SUPABASE_ANON_KEY`: Publishable/Anon Key

Danach die Datei in GitHub ersetzen/hochladen. Der Schlüssel darf im Frontend sichtbar sein; er ist der öffentliche Publishable/Anon Key. **Niemals** einen Supabase Secret/Service-Role-Key dort eintragen.

## G. Automatische Aktualisierung
Supabase Cron kann die Edge Function regelmäßig aufrufen. Die Datei `supabase/cron.sql` richtet zwei Jobs ein:
- tägliche Spieler-/Kader-Synchronisierung
- häufige Wochenstatistik-/Schedule-Synchronisierung

Im SQL Editor ausführen, nachdem `api` existiert.

## H. Ersttest
1. Öffne die GitHub-Pages-Adresse.
2. "Neue Liga" wählen.
3. Deinen Namen und eine PIN festlegen.
4. Danach erscheint der Liga-Code.
5. Mit dem Code können drei weitere Personen beitreten.

## I. Wöchentlicher Ablauf
- Die Seite zeigt die aktuelle NFL-Woche und den Countdown bis zum ersten Spiel.
- Bis zum Kickoff: eigene Aufstellung frei ändern und speichern.
- Fremde Aufstellungen: verborgen.
- Sobald das erste Spiel startet: Aufstellungen werden aufgedeckt und der Spieltag ist für Änderungen gesperrt.
- Fehlende Speicherung: Vorwoche wird automatisch übernommen und für den Spieltag materialisiert.
- Danach zieht die automatische `api`-Synchronisierung die Statistiken von Sleeper nach und die Anwendung berechnet die Punkte.

## J. Wichtig zur kostenlosen Nutzung
Supabase Free ist aktuell $0/Monat und enthält u. a. 500 MB Datenbank, 5 GB Egress und 500.000 Edge-Function-Aufrufe. Free-Projekte pausieren nach 1 Woche Inaktivität. Eine aktive NFL-Freundesliga sollte deshalb regelmäßig benutzt werden.

## K. Sicherheit
- Niemals einen Supabase Secret-/Service-Role-Key in `site/config.js` oder GitHub eintragen.
- Für die vier Spieler sind nur Name + persönliche PIN nötig.
- Sessions sind serverseitig gespeichert.
- Fremde Lineups werden serverseitig bis zum Lock zurückgehalten; das Verstecken ist nicht nur eine UI-Funktion.

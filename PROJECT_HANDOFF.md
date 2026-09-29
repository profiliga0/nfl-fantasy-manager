# NFL Fantasy Manager – verbindlicher Projektstand

Stand: 2026-09-30

Diese Datei ist die verbindliche Referenz für neue Chats und weitere Änderungen am Projekt.
Wenn alter Code, frühere Fallbacks oder frühere Annahmen dieser Datei widersprechen, gilt diese Datei.

## Ziel

Private NFL-Fantasy-Liga für 4 Freunde, angelehnt an den früheren ran NFL Fantasy Manager.
Kein unnötiger Funktionsumfang: Liga erstellen, Link/Code teilen, Aufstellungen setzen, Punkte korrekt berechnen.

## Aufstellung

7 Slots:
- QB
- RB
- WR (TE ist hier ausdrücklich mit eingeschlossen)
- Passing Offense
- Rushing Offense
- Defense
- Special Teams / Kicker

Captain:
- nur QB, RB oder WR-Slot
- verdoppelt den kompletten Punktewert dieses Slots
- ein TE im WR-Slot kann damit ebenfalls Captain sein

Weitere Regeln:
- jede Spieler-/Team-Auswahl maximal 5 Einsätze pro Saison und Manager
- PASS, RUSH, DEF und ST müssen vier unterschiedliche NFL-Teams sein
- QB/RB/WR dürfen vom selben NFL-Team wie ein Team-Slot stammen
- Aufstellung bis zum ersten Kickoff offen, danach gesperrt
- fremde Aufstellungen vor Kickoff verborgen, danach sichtbar
- fehlt eine Aufstellung, wird die vorherige Woche übernommen; bei ausgeschöpftem 5er-Limit muss ein gültiger Ersatz gewählt werden

## Verbindliche Punkteberechnung

### QB / RB / WR / TE

Für alle individuellen Spieler gilt dieselbe Formel:

- Passing Yards: 1 Punkt je 25 Yards
- Rushing Yards: 1 Punkt je 10 Yards
- Receiving Yards: 1 Punkt je 10 Yards
- Passing TD: +6
- Rushing TD: +6
- Receiving TD: +6
- erfolgreiche 2-Point Conversion: +2
- Interception: -2
- Fumble: -2

WICHTIG:
- "Fumble" bedeutet jeden Fumble, nicht nur einen verlorenen Fumble.
- Diese Klarstellung wurde am 2026-09-29 ausdrücklich bestätigt.
- QB bekommt alle eigenen Passing Yards; Rushing Yards nur für eigene Läufe; Receiving Yards nur wenn der QB selbst einen Pass fängt.
- TE wird wie WR gewertet und im WR-Slot ausgewählt.

### Passing Offense

- Passing Yards: 1 Punkt je 25 Yards
- Passing TD: +6
- erfolgreiche 2-Point Conversion: +2
- Fumble: -2
- keine Receiving Yards
- keine Interception-Strafe

### Rushing Offense

- Rushing Yards: 1 Punkt je 10 Yards
- Rushing TD: +6
- erfolgreiche 2-Point Conversion: +2
- Fumble: -2

### Defense

Points Allowed:
- 0 Punkte erlaubt: 10
- 2 bis 9 Punkte erlaubt: 6
- 10 bis 20 Punkte erlaubt: 3
- 21 oder mehr Punkte erlaubt: 0

Zusätzlich:
- Interception: +2
- Fumble Recovery: +2
- Sack: +1
- Safety: +2
- Defensive TD: +6

Es gibt keinen Sonderfall für 1 Point Allowed; dieser Fall wird für die Liga nicht berücksichtigt.

### Special Teams / Kicker

- PAT: +2
- Field Goal 0–49 Yards: +3
- Field Goal 50+ Yards: +5
- Punt Return TD: +6
- Kickoff Return TD: +6
- Fumble Return TD: +6

## Darstellung im Frontend

Die Liga soll KEINEN ausführlichen Berechnungsblock dauerhaft anzeigen.

Gewünscht ist nur die kompakte Punkteübersicht pro Slot, z. B.:
QB 39,9 · RB 19,4 · WR 7,9 · PASS ... · RUSH ... · DEF ... · ST ...

Rohdaten und Rechenwege dürfen intern für Diagnose und Verifikation verfügbar sein, sollen aber nicht als großer Berechnungsblock in der normalen Ligaansicht erscheinen.

## Daten / technische Leitlinien

- Spieler und Basisdaten: Sleeper
- individuelle Spielerpunkte werden aus den Rohstats nach den obigen eigenen Regeln berechnet
- Teamwerte müssen so synchronisiert werden, dass PASS/RUSH/DEF/ST exakt die obigen Regeln erfüllen
- wenn Sleeper für Team-DEF/ST unvollständig ist, darf ein verlässlicher Fallback verwendet werden
- fehlende Stats dürfen niemals still als echte Null interpretiert werden, wenn Null einen Punktebonus auslösen würde
- insbesondere Defense Points Allowed = 0 darf nur ein echter Shutout sein

## Deployment / Sync

Verbindliche Reihenfolge:
1. Supabase Edge Function deployen
2. erst nach erfolgreichem Deploy NFL-Stats synchronisieren
3. gespeicherte Teamwerte nach dem Upsert zurücklesen/verifizieren

Ein paralleler Sync während eines API-Deploys ist unerwünscht und wurde entfernt.

## Wichtige bereits bereinigte Altlasten

- TE wird im Backend und Frontend als gültige WR-Auswahl unterstützt
- eine einzige Team-Code-Liste ist maßgeblich
- eine einzige individuelle Spieler-Punktefunktion ist maßgeblich
- ausführlicher Berechnungsblock wurde aus der Ligaoberfläche wieder entfernt
- Spieler-Fumble wurde von "fum_lost" auf jeden Fumble korrigiert

## Aktuelle relevante Commits

- 65fc83a610381cca90de801b9915f9c798a4e462 – jeder Spieler-Fumble zählt -2
- 9b01b4676bab5a4d8f705cbffdcfbdc1867ddbb0 – Scoring-Backend bereinigt, TE vollständig im WR-Slot
- edad038b8b00a23e4d39c2779456d60b8308cc6f – ausführlichen Berechnungsblock aus UI entfernt
- 667205708ec73a21eb364ac3665f3e9428ca61f5 – Team-Offense bei fehlenden Sleeper-Teamcodes rekonstruiert
- 540b272f9298e251b4b2812b0b5c07f860ed1210 / 1bd8b69a73f3444046bcd267a1f227269a20a9fc – Sync-Reihenfolge bereinigt

## Regel für weitere Änderungen

Vor jeder Änderung an der Punkteberechnung:
1. diese Datei als Soll-Spezifikation verwenden
2. nicht auf alte ran-Regeln zurückgreifen, wenn sie den hier bestätigten Regeln widersprechen
3. keine neue Scoring-Regel stillschweigend hinzufügen
4. nach Änderungen einen konkreten Week-/Lineup-Fall mit Rohstats gegen die Formel prüfen

# NFL Fantasy Manager – 4er Open League (kostenlos)

Diese Version ist für **GitHub Pages + Supabase Free** ausgelegt.

## Enthaltene Regeln
- 4 Mitspieler maximal
- Open League: Meister wird nach 18 Regular-Season-Wochen durch die höchste Gesamtpunktzahl
- 7 Slots: QB, RB, WR, Passing Offense, Rushing Offense, Defense, Special Teams/Kicker
- Kapitän aus QB/RB/WR, dessen Wochenpunkte werden verdoppelt
- QB/RB/WR: jeder Spieler maximal 5 Einsätze pro Saison
- Passing Offense/Rushing Offense/Defense/Special Teams: jede Team-Auswahl maximal 5 Einsätze pro Saison
- Passing/Rushing/Defense/Special Teams müssen in einer Woche vier verschiedene NFL-Teams sein
- **Lineup Lock:** Aufstellung kann bis zum Kickoff des ersten Spiels der aktuellen Woche geändert werden.
- Nach dem Kickoff ist sie gesperrt.
- Wer bis zum Lock nicht gespeichert hat, bekommt automatisch die **Vorwochen-Aufstellung** übernommen. In Woche 1 bleibt die Aufstellung leer, wenn nichts gespeichert wurde.
- Fremde Aufstellungen werden bis zum Start des ersten Spiels **nicht angezeigt**. Erst danach werden alle vier aktuellen Aufstellungen sichtbar.
- Spielerdaten werden aus Sleeper aktualisiert; aktuelle Teamzugehörigkeiten kommen aus dem täglichen Spielerpool.
- Wochenstatistiken werden automatisiert eingelesen und die Fantasy-Punkte daraus berechnet.

## Technische Architektur
- GitHub Pages: statisches Frontend
- Supabase Free: PostgreSQL + Edge Functions + Cron
- Kein Server, keine Kreditkarte nötig für die gewünschte Free-Struktur
- Der Supabase Service Role Key wird **nur** als Edge-Function-Secret verwendet und nie in GitHub Pages gespeichert.

## Einrichtung
Siehe `ANLEITUNG_DE.md`.

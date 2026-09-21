from pathlib import Path
import re

root = Path('/home/ubuntu/agenda')
html_path = root / 'client/index.html'
html = html_path.read_text()

# September 2026 starts on Tuesday. Keep the preceding and trailing cells muted,
# but make every visible cell explicit as "number weekday" for accessibility.
weekday_names = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
visible_cells = [
    (31, 'lundi', True),
    *[(day, weekday_names[day % 7], False) for day in range(1, 31)],
    (1, 'jeudi', True), (2, 'vendredi', True), (3, 'samedi', True), (4, 'dimanche', True),
]

cells = re.findall(r'<div class="day(?: puzzle-day)?(?: muted)?"[^>]*>.*?</div>', html)
if len(cells) != len(visible_cells):
    raise SystemExit(f'Unexpected calendar cell count: {len(cells)}')

for old, (number, weekday, muted) in zip(cells, visible_cells):
    label = f'{number} {weekday}'
    updated = re.sub(r'<div class="day-number"><span>[^<]+</span></div>',
                     f'<div class="day-number"><span>{label}</span></div>', old, count=1)
    updated = re.sub(r'aria-label="Modifier la journée"',
                     f'aria-label="Modifier la journée du {label}"', updated, count=1)
    html = html.replace(old, updated, 1)

html = html.replace(
    '<span>Agenda vide · notes locales</span>',
    '<span>Classements · temps · map de la semaine via PolyTrack</span>',
)
html = html.replace(
    '<footer class="agenda-footer"><span>Les notes restent enregistrées sur cet appareil.</span><span>Agenda v1.0 · privé</span></footer>',
    '<footer class="agenda-footer"><span>Les notes restent enregistrées sur cet appareil.</span><span>Agenda · PolyTrack 0.6.3 · serveur /v6</span></footer>',
)
html_path.write_text(html)

bundle_path = root / 'client/public/main.bundle.js'
bundle = bundle_path.read_text()
remote_literal = '"https://vps.kodub.com/"'
replacement = '(location.origin+"/")'
count = bundle.count(remote_literal)
if count < 3:
    raise SystemExit(f'Expected at least 3 PolyTrack API URLs, found {count}')
bundle = bundle.replace(remote_literal, replacement)
bundle_path.write_text(bundle)

package_path = root / 'package.json'
package = package_path.read_text().replace('"name": "polytrack-063-local"', '"name": "agenda"')
package_path.write_text(package)

manifest_path = root / 'client/public/manifest.json'
manifest = manifest_path.read_text().replace('"name": "PolyTrack"', '"name": "Agenda"')
manifest_path.write_text(manifest)

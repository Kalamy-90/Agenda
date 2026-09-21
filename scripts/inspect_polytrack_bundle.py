from pathlib import Path
import re

bundle = Path('/home/ubuntu/agenda/client/public/main.bundle.js').read_text()
patterns = [
    r'https?://[^"\'\\ ]+',
    r'[^"\'\\]{0,180}(?:profile|leaderboard|trackOfTheWeek|userEntry|ranking|record|import|export)[^"\'\\]{0,260}',
]
for pattern in patterns:
    print(f'--- pattern {pattern} ---')
    seen = set()
    for match in re.finditer(pattern, bundle, re.IGNORECASE):
        value = match.group(0)
        if value not in seen:
            seen.add(value)
            print(value[:700])
            if len(seen) >= 180:
                break

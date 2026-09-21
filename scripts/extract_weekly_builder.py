from pathlib import Path
bundle = Path('/home/ubuntu/agenda/client/public/main.bundle.js').read_text()
for needle in ['ne=function', 'ie=function', 'currentTrackOfTheWeek']:
    pos = bundle.find(needle)
    print(f'NEEDLE {needle} POS {pos}')
    if pos >= 0:
        print(bundle[max(0, pos-900):pos+7000])

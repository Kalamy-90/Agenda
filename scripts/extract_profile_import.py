from pathlib import Path
bundle = Path('/home/ubuntu/agenda/client/public/main.bundle.js').read_text()
needles = ['This user profile does not exist on the server', 'Paste user token here...', 'userToken=']
for needle in needles:
    pos = bundle.find(needle)
    print(f'NEEDLE {needle} POS {pos}')
    if pos >= 0:
        print(bundle[max(0, pos-1800):pos+4200])

from pathlib import Path
bundle = Path('/home/ubuntu/agenda/client/public/main.bundle.js').read_text()
needle = 'ie=function(){return Ae??'
start = bundle.find(needle)
print('start', start)
print(bundle[start:start + 14000])

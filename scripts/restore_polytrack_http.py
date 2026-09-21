from pathlib import Path

bundle_path = Path('/home/ubuntu/agenda/client/public/main.bundle.js')
bundle = bundle_path.read_text()
local_http_literal = '(location.origin+"/")'
official_http_literal = '"https://vps.kodub.com/"'
count = bundle.count(local_http_literal)
if count == 0:
    raise SystemExit('No local HTTP relay literals found')
bundle_path.write_text(bundle.replace(local_http_literal, official_http_literal))

"""¿Hay algo que hacer? Revisión rápida, sin instalar nada, antes de bajar el
motor de caras. Imprime seguir=si o seguir=no (para GITHUB_OUTPUT)."""
import json
import os
import urllib.request

url = os.environ['SUPABASE_URL'].rstrip('/')
secreta = os.environ['SUPABASE_SECRET']
cab = {'apikey': secreta, 'Content-Type': 'application/json'}
if secreta.startswith('eyJ'):
    cab['Authorization'] = f'Bearer {secreta}'
req = urllib.request.Request(f'{url}/rest/v1/rpc/caras_trabajo', data=b'{}', headers=cab, method='POST')
with urllib.request.urlopen(req, timeout=120) as r:
    t = json.loads(r.read())
clubes = {p['club_id'] for p in t['personas'] if p['estado'] == 'lista'}
hay = any(p['sacar_huella'] or (p['estado'] == 'lista' and not p['completa']) for p in t['personas']) \
    or any(p['sin_foto'] and p['estado'] != 'sin_foto' for p in t['personas']) \
    or any(not a['revisada'] and a['club_id'] in clubes for a in t['archivos'])
print('seguir=si' if hay else 'seguir=no')

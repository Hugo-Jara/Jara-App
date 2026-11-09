"""Buscarme en las fotos (migración 0042).

Corre en GitHub Actions (.github/workflows/caras.yml). Compara la cara de
quienes activaron "Buscarme en las fotos" con las fotos de la liga que la app
ya conoce (0041) y guarda solo "esta foto tiene a esta persona".

Motor: InsightFace (ArcFace, modelo buffalo_l), código abierto, en CPU.
De las demás caras no se guarda nada: se comparan en memoria y se olvidan.
El repo es público y los registros de GitHub también: aquí no se imprime
ningún dato de personas, solo cantidades.

Variables de entorno: SUPABASE_URL, SUPABASE_SECRET (clave secreta de Supabase).
"""
import collections
import json
import os
import sys
import time
import urllib.error
import urllib.request

import cv2
import numpy as np
from insightface.app import FaceAnalysis

UMBRAL = 0.40          # parecido mínimo (coseno ArcFace). En la prueba: la persona 0,62; los demás < 0,10.
LOTE = 20              # fotos por guardado
URL = os.environ['SUPABASE_URL'].rstrip('/')
SECRETA = os.environ['SUPABASE_SECRET']
DRIVE = os.environ.get('DRIVE_URL', 'https://www.googleapis.com/drive/v3')  # se cambia solo para probar
# La misma miniatura pública que muestra la app: no gasta la cuota de la API.
MINIATURA = os.environ.get('MINIATURA_URL', 'https://drive.google.com/thumbnail')
FALLAS = collections.Counter()   # por qué no se pudo bajar una foto (solo códigos, para el registro)


def cabeceras():
    h = {'apikey': SECRETA, 'Content-Type': 'application/json'}
    # Las claves antiguas (JWT) también van como Bearer; las nuevas (sb_secret_) solo como apikey.
    if SECRETA.startswith('eyJ'):
        h['Authorization'] = f'Bearer {SECRETA}'
    return h


def rpc(nombre, datos=None):
    req = urllib.request.Request(f'{URL}/rest/v1/rpc/{nombre}', data=json.dumps(datos or {}).encode(),
                                 headers=cabeceras(), method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            cuerpo = r.read()
            return json.loads(cuerpo) if cuerpo else None
    except urllib.error.HTTPError as e:
        # Solo el código y el mensaje corto de la base, nunca los datos enviados.
        raise SystemExit(f'La base respondió {e.code} en {nombre}: {e.read()[:300]!r}')


def bajar(url, cab=None, intentos=3):
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=cab or {}), timeout=60) as r:
                datos = r.read()
                if r.headers.get_content_type().startswith('image/'):
                    return datos
                FALLAS['no es imagen'] += 1
                return None
        except urllib.error.HTTPError as e:
            FALLAS[f'HTTP {e.code}'] += 1
            if e.code in (400, 401, 403, 404):
                return None
        except Exception as e:
            FALLAS[type(e).__name__] += 1
        time.sleep(2 ** i)
    return None


def foto_de_la_liga(archivo_id, llave):
    # Primero la miniatura grande (la que ve la app); si falla, el archivo original por la API.
    return (bajar(f'{MINIATURA}?id={archivo_id}&sz=w2000', intentos=2)
            or bajar(f'{DRIVE}/files/{archivo_id}?alt=media&key={llave}', intentos=2))


def imagen(datos):
    if not datos:
        return None
    return cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)


def main():
    t = rpc('caras_trabajo')
    personas, archivos, llaves = t['personas'], t['archivos'], t['llaves']
    for p in personas:
        p['tenia_huella'] = bool(p.get('huella'))
    print(f'{len(personas)} personas activadas · {len(archivos)} fotos de la liga')
    if not personas:
        print('Nadie activó "Buscarme en las fotos": nada que hacer.')
        return

    app = FaceAnalysis(name='buffalo_l', root=os.path.expanduser('~/.insightface'),
                       providers=['CPUExecutionProvider'])

    # 1. Huellas nuevas: de la foto de perfil (la app la guarda a 600 px).
    nuevas = 0
    for p in personas:
        if p['sin_foto']:
            if p['estado'] != 'sin_foto':
                rpc('caras_guardar_huella', {'p_persona': p['persona_id'], 'p_foto_ruta': None, 'p_huella': None, 'p_estado': 'sin_foto'})
            p['estado'] = 'sin_foto'
            continue
        if not p['sacar_huella']:
            continue
        if not nuevas:
            app.prepare(ctx_id=-1, det_size=(640, 640), det_thresh=0.4)
        nuevas += 1
        im = imagen(bajar(f"{URL}/storage/v1/object/authenticated/fotos-perfil/{p['foto_ruta']}", cabeceras()))
        caras = []
        if im is not None:
            # Con un borde alrededor, una selfie de cerca también se detecta.
            h, w = im.shape[:2]
            caras = app.get(cv2.copyMakeBorder(im, h // 2, h // 2, w // 2, w // 2, cv2.BORDER_CONSTANT, value=(0, 0, 0))) or app.get(im)
        if caras:
            cara = max(caras, key=lambda c: (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]))
            p['huella'] = [round(float(v), 6) for v in cara.normed_embedding]
            p['estado'], p['completa'] = 'lista', False
            rpc('caras_guardar_huella', {'p_persona': p['persona_id'], 'p_foto_ruta': p['foto_ruta'], 'p_huella': p['huella'], 'p_estado': 'lista'})
        else:
            p['estado'] = 'sin_cara'
            rpc('caras_guardar_huella', {'p_persona': p['persona_id'], 'p_foto_ruta': p['foto_ruta'], 'p_huella': None, 'p_estado': 'sin_cara'})
    print(f'{nuevas} huellas sacadas de fotos de perfil')
    # Por qué se sacaron (solo cantidades): sin huella guardada o foto de perfil distinta.
    if nuevas:
        sin = sum(1 for p in personas if p['sacar_huella'] and not p.get('tenia_huella'))
        print(f'  {sin} no tenían huella guardada · {nuevas - sin} cambiaron su foto')
        despues = {x['persona_id']: x for x in rpc('caras_trabajo')['personas']}
        quedan = sum(1 for p in personas if despues.get(p['persona_id'], {}).get('sacar_huella'))
        if quedan:
            print(f'  OJO: {quedan} huellas no quedaron guardadas en la base')

    listas = [p for p in personas if p['estado'] == 'lista' and p['huella']]
    for p in listas:
        v = np.array(p['huella'], dtype=np.float32)
        p['vec'] = v / (np.linalg.norm(v) or 1)

    # 2. Qué fotos revisar y contra quién: las fotos nuevas, contra todos los
    #    de su club; las ya revisadas, solo contra quienes recién entraron.
    trabajo = []
    for a in archivos:
        del_club = [p for p in listas if p['club_id'] == a['club_id']]
        contra = del_club if not a['revisada'] else [p for p in del_club if not p['completa']]
        if contra and llaves.get(a['club_id']):
            trabajo.append((a, contra))
    print(f'{len(trabajo)} fotos por revisar')
    if not trabajo:
        rpc('caras_terminar', {'p_personas': [p['persona_id'] for p in listas if not p['completa']]})
        return

    app.prepare(ctx_id=-1, det_size=(1280, 1280), det_thresh=0.4)
    lote, encontradas, fallidas, t0, mejor = [], 0, 0, time.time(), -1.0
    for i, (a, contra) in enumerate(trabajo, 1):
        im = imagen(foto_de_la_liga(a['archivo_id'], llaves[a['club_id']]))
        if im is None:
            fallidas += 1
            continue
        # Fotos de 3000 px: a 2000 se ven igual las caras y anda más rápido.
        h, w = im.shape[:2]
        if max(h, w) > 2000:
            f = 2000 / max(h, w)
            im = cv2.resize(im, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
        caras = app.get(im)
        hallazgos = []
        if caras:
            m = np.stack([c.normed_embedding for c in caras])
            for p in contra:
                s = float(np.max(m @ p['vec']))
                mejor = max(mejor, s)
                if s >= UMBRAL:
                    hallazgos.append({'persona_id': p['persona_id'], 'parecido': round(s, 3)})
        encontradas += len(hallazgos)
        lote.append({'archivo_id': a['archivo_id'], 'caras': len(caras), 'hallazgos': hallazgos})
        if len(lote) >= LOTE:
            rpc('caras_guardar', {'p_lote': lote})
            lote = []
            print(f'{i}/{len(trabajo)} fotos · {encontradas} encontradas · {time.time() - t0:.0f} s')
    if lote:
        rpc('caras_guardar', {'p_lote': lote})
    rpc('caras_terminar', {'p_personas': [p['persona_id'] for p in listas if not p['completa']]})
    print(f'Listo: {len(trabajo)} fotos, {encontradas} encontradas, {fallidas} no se pudieron bajar, {time.time() - t0:.0f} s')
    print(f'Parecido más alto visto: {mejor:.2f} (se guarda desde {UMBRAL:.2f})')
    if FALLAS:
        print('Fallas al bajar:', ', '.join(f'{k}: {v}' for k, v in FALLAS.most_common()))


if __name__ == '__main__':
    sys.exit(main())

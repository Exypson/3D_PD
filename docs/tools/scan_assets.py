# Scans the game's Java source and prints a JSON inventory of everything that needs a 3D asset.
import os, re, json, sys
ROOT = sys.argv[1]  # .../core/src/main/java/com/shatteredpixel/shatteredpixeldungeon
decl = re.compile(r'^([ \t]*)((?:(?:public|protected|private|static|abstract|final)\s+)*)class (\w+)(?:<[^>]*>)?\s+extends\s+([\w.]+)')
classes = {}
for dp, _, fs in os.walk(ROOT):
    for f in fs:
        if not f.endswith('.java'): continue
        path = os.path.join(dp, f); rel = os.path.relpath(path, ROOT)
        lines = open(path, encoding='utf-8').read().split('\n')
        top = f[:-5]
        found = []
        for i, l in enumerate(lines):
            m = decl.match(l)
            if m: found.append((i, len(m.group(1).expandtabs(4)), m))
        for k, (i, ind, m) in enumerate(found):
            end = len(lines)
            for j, ind2, _ in found[k + 1:]:
                if ind2 <= ind: end = j; break
            body = '\n'.join(lines[i:end])
            name = m.group(3)
            full = name if ind == 0 else top + '$' + name
            classes[full] = dict(name=name, full=full, parent=m.group(4), abstract='abstract' in m.group(2), file=rel, outer=top if ind else None, body=body)
def resolve(c):
    p = c['parent']
    if '.' in p:
        a = p.split('.'); k = a[-2] + '$' + a[-1]
        if k in classes: return k
        p = a[-1]
    if c['outer'] and (c['outer'] + '$' + p) in classes and (c['outer'] + '$' + p) != c['full']: return c['outer'] + '$' + p
    if p in classes: return p
    for k, v in classes.items():
        if v['name'] == p and k != c['full']: return k
    return None
for c in classes.values(): c['p'] = resolve(c)
def isa(c, root):
    seen = set()
    while c and c['full'] not in seen:
        seen.add(c['full'])
        if c['full'] == root or c['parent'].split('.')[-1] == root: return True
        c = classes.get(c['p'])
    return False
def concrete(root):
    return sorted([c for c in classes.values() if not c['abstract'] and c['full'] != root and isa(c, root)], key=lambda c: (c['file'], c['full']))
def grab(body, pat):
    m = re.search(pat, body); return m.group(1) if m else None
zap_sprites = set()
for f in os.listdir(os.path.join(ROOT, 'sprites')):
    t = open(os.path.join(ROOT, 'sprites', f), encoding='utf-8').read()
    if re.search(r'\bzap\s*=', t): zap_sprites.add(f[:-5])
out = {}
out['chars'] = [dict(full=c['full'], file=c['file'], sprite=grab(c['body'], r'spriteClass\s*=\s*(\w+)\.class'),
    props=sorted(set(re.findall(r'properties\.add\(\s*Property\.(\w+)', c['body']))), flying='flying = true' in c['body'] or 'flying=true' in c['body'])
    for c in concrete('Char')]
for ch in out['chars']: ch['zap'] = bool(ch['sprite'] and ch['sprite'] in zap_sprites)
out['items'] = [dict(full=c['full'], file=c['file'], image=grab(c['body'], r'image\s*=\s*ItemSpriteSheet\.(\w+)')) for c in concrete('Item')]
out['traps'] = [dict(full=c['full'], color=grab(c['body'], r'color\s*=\s*(\w+)'), shape=grab(c['body'], r'shape\s*=\s*(\w+)')) for c in concrete('Trap')]
out['plants'] = [dict(full=c['full'], file=c['file']) for c in concrete('Plant')]
out['blobs'] = [dict(full=c['full'], file=c['file']) for c in concrete('Blob')]
out['levels'] = [dict(full=c['full'], file=c['file']) for c in concrete('Level')]
out['tilemaps'] = [dict(full=c['full'], file=c['file']) for c in concrete('CustomTilemap')]
out['effects'] = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'effects')) if f.endswith('.java'))
out['particles'] = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'effects', 'particles')) if f.endswith('.java'))
t = open(os.path.join(ROOT, 'effects', 'MagicMissile.java')).read(); out['missiles'] = re.findall(r'public static final int (\w+)\s*=\s*\d+', t)
t = open(os.path.join(ROOT, 'effects', 'Speck.java')).read(); out['specks'] = re.findall(r'public static final int (\w+)\s*=\s*\d+', t)
t = open(os.path.join(ROOT, 'levels', 'Terrain.java')).read(); out['terrain'] = [(n, int(v)) for n, v in re.findall(r'int (\w+)\s*=\s*(\d+)\s*;', t) if n.isupper() and int(v) < 64]
t = open(os.path.join(ROOT, 'sprites', 'ItemSpriteSheet.java')).read(); out['sheet'] = re.findall(r'public static final int (\w+)\s*=', t)
t = open(os.path.join(ROOT, 'items', 'Heap.java')).read(); out['heaps'] = re.search(r'enum Type \{([^}]*)\}', t).group(1).replace('\n', '').replace('\t', '').split(',')
print(json.dumps(out))

import json,struct,sys
for p in sys.argv[1:]:
  f=open(p,'rb').read(); l=struct.unpack('<I',f[12:16])[0]; j=json.loads(f[20:20+l])
  verts=0; mins=[9]*3; maxs=[-9]*3
  for m in j.get('meshes',[]):
    for pr in m['primitives']:
      a=j['accessors'][pr['attributes']['POSITION']]; verts+=a['count']
      mins=[min(x,y) for x,y in zip(mins,a['min'])]; maxs=[max(x,y) for x,y in zip(maxs,a['max'])]
  prims=sum(len(m['primitives']) for m in j.get('meshes',[]))
  attrs=set(k for m in j.get('meshes',[]) for pr in m['primitives'] for k in pr['attributes'])
  print(p.split('/')[-1], 'v',verts,'prims',prims,'mats',len(j.get('materials',[])),'tex',len(j.get('images',[])),'nodes',[n.get('name') for n in j['nodes']][:6],'anim',[a.get('name') for a in j.get('animations',[])], sorted(attrs), [round(x,2) for x in mins],[round(x,2) for x in maxs])

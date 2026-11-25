import json,struct,sys,numpy as np
def load(p):
  f=open(p,'rb').read(); l=struct.unpack('<I',f[12:16])[0]; return json.loads(f[20:20+l])
def q2m(q):
  x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def local(n):
  M=np.eye(4); R=q2m(n.get('rotation',[0,0,0,1])); S=np.diag(n.get('scale',[1,1,1]))
  M[:3,:3]=R@S; M[:3,3]=n.get('translation',[0,0,0]); return M
def globals_(j):
  par={}
  for i,n in enumerate(j['nodes']):
    for c in n.get('children',[]): par[c]=i
  def g(i): return local(j['nodes'][i]) if i not in par else g(par[i])@local(j['nodes'][i])
  return {n.get('name'):g(i) for i,n in enumerate(j['nodes'])}
h=globals_(load(sys.argv[1])); w=globals_(load(sys.argv[2]))
T=h['grip_R']@np.linalg.inv(w['grip'])
for nm,c in (('pommel',[-0.257,0.02,0.289]),('tip',[0.257,0.02,-0.289])):
  print(nm,(T@np.array(c+[1]))[:3].round(3))
print('hand_R', h['hand_R'][:3,3].round(3))

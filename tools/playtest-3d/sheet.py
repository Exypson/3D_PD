import sys,glob,os
from PIL import Image,ImageDraw
files=sorted(glob.glob(sys.argv[1]))
cols=6; s=200
rows=(len(files)+cols-1)//cols
out=Image.new('RGB',(cols*s,rows*(s+14)),(40,40,40)); d=ImageDraw.Draw(out)
for i,f in enumerate(files):
  im=Image.open(f).resize((s,s)); x=(i%cols)*s; y=(i//cols)*(s+14)
  out.paste(im,(x,y+14)); d.text((x+2,y+1),os.path.basename(f)[:-4],fill=(255,255,0))
  # mark centre cell
  d.rectangle((x+s//2-2,y+14+s//2-2,x+s//2+2,y+14+s//2+2),outline=(255,0,0))
out.save(sys.argv[2])

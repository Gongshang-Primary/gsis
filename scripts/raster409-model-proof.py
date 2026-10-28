import json, sys, numpy as np
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
for p in Path('/tmp').glob('gsis-proof-*.json'):
 if len(sys.argv)>1 and p.stem.replace('gsis-proof-','') not in sys.argv[1:]:continue
 data=json.loads(p.read_text());faces=data['faces'];points=np.array([v for f in faces for v in f['p']]);lo=points[:,:2].min(axis=0);hi=points[:,:2].max(axis=0);scale=min(1260/(hi[0]-lo[0]),790/(hi[1]-lo[1]));offset=np.array([(1340-(hi[0]-lo[0])*scale)/2,90+(790-(hi[1]-lo[1])*scale)/2]);pixels=np.full((920,1340,3),[244,246,247],dtype=np.uint8);depth=np.full((920,1340),-np.inf)
 for f in faces:
  q=np.array(f['p']);xy=(q[:,:2]-lo)*scale+offset;x0,y0=np.maximum(0,np.floor(xy.min(axis=0))).astype(int);x1,y1=np.minimum([1339,919],np.ceil(xy.max(axis=0))).astype(int)
  if x1<x0 or y1<y0:continue
  xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);a,b,c=xy;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-8:continue
  u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w=1-u-v;z=u*q[0,2]+v*q[1,2]+w*q[2,2];region=depth[y0:y1+1,x0:x1+1];mask=(u>=0)&(v>=0)&(w>=0)&(z>region);region[mask]=z[mask];pixels[y0:y1+1,x0:x1+1][mask]=tuple(bytes.fromhex(f['color'][1:]))
 im=Image.fromarray(pixels);d=ImageDraw.Draw(im);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';d.text((30,13),data['title'],font=ImageFont.truetype(font,23),fill='#19344b');d.text((30,50),'GSiS v0.4.09 · Generated model geometry · approximate footprint · isolated cutaway',font=ImageFont.truetype(font,15),fill='#556673');im.save(Path('verification')/(p.stem.replace('gsis-proof-','')+'.png'))

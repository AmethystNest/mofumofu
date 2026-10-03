"""Local part warps from approved v12 PNGs; no generative redraw.
Requires Pillow, NumPy, SciPy. Existing idle-v12 files are read-only.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
from scipy.ndimage import map_coordinates
import numpy as np,json
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'public/assets/dog/idle-v12';OUT=ROOT/'public/assets/dog/motions-v1';OUT.mkdir(parents=True,exist_ok=True)
yy,xx=np.mgrid[:320,:320]
def smooth(t):
 t=np.clip(t,0,1);return t*t*(3-2*t)
def load(i):return np.array(Image.open(SRC/f'frame_{i:02}.png')).astype(float)/255

def premul(a):
 b=a.copy();b[:,:,:3]*=b[:,:,3,None];return b

def straight(a):
 b=a.copy();b[:,:,:3]=np.divide(b[:,:,:3],b[:,:,3,None],out=np.zeros_like(b[:,:,:3]),where=b[:,:,3,None]>1e-8);return np.clip(b,0,1)

def over(top,base):return top+base*(1-top[:,:,3,None])
def part(a,kind,angle):
 if kind=='left':pivot=(96,111);m=(1-smooth((yy-80)/45))*(1-smooth((xx-115)/25))
 elif kind=='right':pivot=(220,111);m=(1-smooth((yy-80)/45))*smooth((xx-180)/25)
 else:pivot=(232,256);m=smooth((xx-224)/24)*smooth((yy-190)/20)
 theta=np.deg2rad(angle)*m;cx,cy=pivot;c=np.cos(theta);s=np.sin(theta);sx=c*(xx-cx)+s*(yy-cy)+cx;sy=-s*(xx-cx)+c*(yy-cy)+cy
 p=premul(a);result=straight(np.stack([map_coordinates(p[:,:,ch],[sy,sx],order=1,mode='constant',cval=0) for ch in range(4)],axis=2))
 if kind=='tail':result[:,:224]=a[:,:224];result[:190]=a[:190];result[:203,:245]=a[:203,:245]
 else:result[125:]=a[125:]
 return result

def nod(a,amount,chew=0):
 weight=1-smooth((yy-200)/43);sy=yy-amount*weight
 if chew:sy-=chew*np.exp(-((xx-160)/17)**2-((yy-182)/7)**2)
 p=premul(a);result=straight(np.stack([map_coordinates(p[:,:,ch],[sy,xx],order=1,mode='constant',cval=0) for ch in range(4)],axis=2));result[245:]=a[245:];return result

def save(name,a):
 im=Image.fromarray(np.rint(a*255).astype('uint8'),'RGBA');im.save(OUT/(name+'.png'));return 'motions-v1/'+name+'.png'
base=load(0);smile=load(2);half=load(1);files={}
for side in ['left','right']:
 for k,angle in enumerate([3.5,7],1):files[f'ear-{side}-{k}']=save(f'ear-{side}-{k}',part(base,side,angle if side=='left' else -angle))
for k,angle in enumerate([-7,0,7,0],1):
 a=part(smile,'tail',angle) if angle else smile.copy();a=part(a,'left',3 if k%2 else -2);files[f'pet-{k}']=save(f'pet-{k}',a)
for k,angle in enumerate([-9,-4,4,9,4,-4],1):
 a=part(base,'tail',angle);a=part(a,'left',2 if k%2 else -2);files[f'play-{k}']=save(f'play-{k}',a)
for k,(amount,chew) in enumerate([(0,0),(2,.6),(4,1.3),(3,.8),(1,.2)],1):files[f'eat-{k}']=save(f'eat-{k}',nod(half,amount,chew))
for k,amount in enumerate([0,1,2,1],1):files[f'sleep-{k}']=save(f'sleep-{k}',nod(smile,amount))
a=part(half,'left',-5);a=part(a,'right',5);files['sad-1']=save('sad-1',a);files['sad-2']=save('sad-2',nod(a,1.5))
old=lambda i:f'idle-v12/frame_{i:02}.png'
ent=lambda src,ms:{'src':src,'ms':ms}
idle=[ent(old(0),600),ent(files['ear-left-1'],70),ent(files['ear-left-2'],90),ent(files['ear-left-1'],80),ent(old(0),460),ent(old(1),90),ent(old(2),140),ent(old(1),90),ent(old(0),300),ent(files['ear-right-1'],70),ent(files['ear-right-2'],100),ent(files['ear-right-1'],80),ent(old(0),200),ent(old(4),200),ent(old(5),650),ent(old(4),200),ent(old(0),800),ent(old(7),200),ent(old(8),650),ent(old(7),200),ent(old(0),1100)]
clips={'idle':idle,'pet':[ent(old(1),90),ent(files['pet-1'],180),ent(files['pet-2'],230),ent(files['pet-3'],220),ent(files['pet-4'],220),ent(old(2),600)],'play':[ent(files[f'play-{k}'],110) for k in range(1,7)],'eat':[ent(files[f'eat-{k}'],180) for k in [1,2,3,4,3,2,5]],'sleep':[ent(files[f'sleep-{k}'],900) for k in range(1,5)],'sad':[ent(files['sad-1'],1400),ent(files['sad-2'],1200)]}
# Animated WebP previews are optional; the game uses the PNG timeline.
for name,frames in clips.items():
 ims=[Image.open(SRC.parent/f['src']) for f in frames]
 ims[0].save(OUT/(name+'.webp'),save_all=True,append_images=ims[1:],duration=[f['ms'] for f in frames],loop=0,lossless=True)
assert sum(e['ms'] for e in idle)==6370
manifest={'version':1,'width':320,'height':320,'source':'approved idle-v12; local ear/tail/head warps only','clips':clips};(OUT/'motions.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Check the fixed paws/lower torso of every new reaction. Tail has its own animation area.
checks=[]
for name in files:
 a=np.array(Image.open(OUT/(name+'.png')));reference=np.array(Image.open(SRC/f'frame_{2 if name.startswith(("pet-","sleep-")) else 1 if name.startswith(("eat-","sad-")) else 0:02}.png'))
 assert np.array_equal(a[245:,:224],reference[245:,:224]),name
 if name.startswith('ear-'):assert np.array_equal(a[125:],reference[125:]),name
 checks.append({'file':name+'.png','fixedPawsAndLowerTorso':True})
(OUT/'validation.json').write_text(json.dumps({'sourceUnchanged':True,'idleDurationMs':6370,'frames':checks},indent=2)+'\n')
# Same-scale contact sheet for self-review.
names=['ear-left-2','ear-right-2','pet-1','pet-3','play-1','play-4','eat-1','eat-3','sleep-1','sleep-3','sad-1','sad-2'];o=Image.new('RGB',(1280,1020),'#ebe3d5');d=ImageDraw.Draw(o)
for j,name in enumerate(names):
 im=Image.open(OUT/(name+'.png'));b=Image.new('RGBA',im.size,'#ebe3d5');b.alpha_composite(im);x=j%4*320;y=j//4*340;o.paste(b,(x,y+20));d.text((x+8,y+4),name,fill='#333333')
o.save(ROOT/'docs/verification/dog-reactions.png');print(len(files),'reaction frames; paws and lower torso fixed')

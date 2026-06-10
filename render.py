# Blender headless renderer for the marble-race "tape".
# usage: blender -b -P render.py -- <tape.json> <out_dir> [theme]
# Produces a photoreal 1080x1920 frame sequence on the GPU (Cycles/OptiX), then you mux with ffmpeg.
import bpy, json, sys, math, os, random

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
TAPE   = argv[0] if len(argv)>0 else 'tape.json'
OUTDIR = argv[1] if len(argv)>1 else 'frames'
THEME  = argv[2] if len(argv)>2 else 'chrome'
os.makedirs(OUTDIR, exist_ok=True)

tape = json.load(open(TAPE))
R   = tape['R']; WT=432.0; HT=768.0; FPS=60
frames = tape['frames']; NF=len(frames); N=tape['N']
SCALE = 0.01   # tape px -> blender metres (keeps scene a sane size)
def P(x,y): return (( x - WT/2.0)*SCALE, 0.0, (-y)*SCALE)   # X right, Z up(-y down), Y depth

random.seed(tape.get('seed',0))

# ---------- scene reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine='CYCLES'
try:
    sc.cycles.device='GPU'
    prefs=bpy.context.preferences.addons['cycles'].preferences
    for ct in ('OPTIX','CUDA'):
        try: prefs.compute_device_type=ct; break
        except: pass
    prefs.get_devices()
    for d in prefs.devices: d.use = (getattr(d,'type','') in ('OPTIX','CUDA'))
except Exception as e: print('GPU setup note:',e)
sc.cycles.samples=48
try: sc.cycles.use_denoising=True
except: pass
sc.render.resolution_x=1080; sc.render.resolution_y=1920
sc.render.fps=FPS; sc.frame_start=1; sc.frame_end=NF
sc.render.use_motion_blur=True
sc.render.image_settings.file_format='PNG'
sc.view_settings.view_transform='Filmic'

# ---------- helpers ----------
def setp(bsdf, name, val):
    try: bsdf.inputs[name].default_value=val; return True
    except: return False
def mat_metal(col, rough=0.3):
    m=bpy.data.materials.new('metal'); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF')
    setp(b,'Base Color',(*col,1)); setp(b,'Metallic',1.0); setp(b,'Roughness',rough); return m
def mat_plastic(col, rough=0.5):
    m=bpy.data.materials.new('plastic'); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF')
    setp(b,'Base Color',(*col,1)); setp(b,'Metallic',0.0); setp(b,'Roughness',rough); setp(b,'Coat Weight',0.6); setp(b,'Specular IOR Level',0.6); return m
def mat_glass(col):
    m=bpy.data.materials.new('glass'); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF')
    setp(b,'Base Color',(*col,1)); setp(b,'Roughness',0.0); setp(b,'IOR',1.5)
    if not setp(b,'Transmission Weight',1.0): setp(b,'Transmission',1.0)  # 4.x vs 3.x
    return m
def hsl_rgb(h,s,l):
    import colorsys; r,g,bl=colorsys.hls_to_rgb((h%360)/360.0,l,s); return (r,g,bl)

# theme presets (material for track + how marbles look + world brightness)
THEMES={
 'chrome': dict(track=mat_metal((0.62,0.65,0.7),0.18), frame=mat_metal((0.18,0.2,0.24),0.6), marble='glass', world=0.35),
 'wood':   dict(track=mat_plastic((0.45,0.28,0.12),0.55), frame=mat_plastic((0.2,0.13,0.07),0.7), marble='glass', world=0.4),
 'gold':   dict(track=mat_metal((0.83,0.66,0.22),0.22), frame=mat_metal((0.15,0.12,0.05),0.5), marble='glass', world=0.4),
 'candy':  dict(track=mat_plastic((0.9,0.9,0.95),0.35), frame=mat_plastic((0.3,0.3,0.35),0.5), marble='plastic', world=0.5),
}
TH = THEMES.get(THEME, THEMES['chrome'])

# ---------- world ----------
world=bpy.data.worlds.new('W'); sc.world=world; world.use_nodes=True
bg=world.node_tree.nodes.get('Background'); bg.inputs[0].default_value=(0.03,0.035,0.05,1); bg.inputs[1].default_value=TH['world']

# ---------- lights (studio key + fill, sun for crisp shadows) ----------
def add_light(kind,name,energy,loc,rot=(0,0,0),size=4):
    d=bpy.data.lights.new(name,kind); d.energy=energy
    if kind=='AREA': d.size=size
    o=bpy.data.objects.new(name,d); o.location=loc; o.rotation_euler=rot; sc.collection.objects.link(o); return o
sun=add_light('SUN','key',3.0,(0,-10,5),(math.radians(55),0,math.radians(25)))
add_light('AREA','fill',400,(-6,-8,2),(math.radians(70),0,0),size=10)

# ---------- static obstacles (merged into a few objects) ----------
def add_cyl(x,y,r,mat,depth=None):
    d=(R*1.6)*SCALE if depth is None else depth
    bpy.ops.mesh.primitive_cylinder_add(radius=r*SCALE, depth=d, location=P(x,y))
    o=bpy.context.object; o.rotation_euler=(math.radians(90),0,0); o.data.materials.append(mat); o.scale=(1,1,1)
    return o
def add_box(cx,cy,w,h,ang,mat):
    bpy.ops.mesh.primitive_cube_add(location=P(cx,cy))
    o=bpy.context.object; o.scale=(w/2*SCALE, (R*1.6)/2*SCALE, h/2*SCALE); o.rotation_euler=(0,math.radians(-math.degrees(ang)) if False else -ang,0)
    o.data.materials.append(mat); return o

def rect_from_v(v):
    cx=(v[0]['x']+v[1]['x']+v[2]['x']+v[3]['x'])/4; cy=(v[0]['y']+v[1]['y']+v[2]['y']+v[3]['y'])/4
    e1x=v[1]['x']-v[0]['x']; e1y=v[1]['y']-v[0]['y']; e2x=v[2]['x']-v[1]['x']; e2y=v[2]['y']-v[1]['y']
    import math as _m
    return cx,cy,_m.hypot(e1x,e1y),_m.hypot(e2x,e2y),_m.atan2(e1y,e1x)

# side walls
for wx in (tape['wallL'], tape['wallR']):
    add_box(wx, tape['worldH']/2, R*1.4, tape['worldH']+HT, 0, TH['frame'])
for s in tape['statics']:
    if s['t']=='c':
        add_cyl(s['x'],s['y'],s['r'], TH['frame'] if s['k']=='bumper' else TH['track'])
    else:
        cx,cy,w,h,ang = rect_from_v(s['v']); add_box(cx,cy,w,h,ang, TH['track'])

# dynamic obstacles (keyframed rotation)
dyn_objs=[]
for i,meta in enumerate(tape['dynMeta']):
    d0=frames[0]['d'][i]
    o=add_box(d0['x'],d0['y'],meta['len'],meta['thick'],0,TH['track']); dyn_objs.append(o)

# ---------- marbles (glass/plastic spheres, keyframed) ----------
marble_objs=[]
mm=tape['marbleMeta']
for i in range(N):
    col=hsl_rgb(mm[i]['h'],0.85,0.55)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R*SCALE, segments=32, ring_count=16, location=P(frames[0]['m'][i]['x'],frames[0]['m'][i]['y']))
    o=bpy.context.object
    o.data.materials.append(mat_glass(col) if TH['marble']=='glass' else mat_plastic(col,0.12))
    try: bpy.ops.object.shade_smooth()
    except: pass
    marble_objs.append(o)

# ---------- camera (orthographic, follows the leader) ----------
cam_d=bpy.data.cameras.new('cam'); cam_d.type='ORTHO'; cam_d.ortho_scale=HT*SCALE
cam=bpy.data.objects.new('cam',cam_d); sc.collection.objects.link(cam); sc.camera=cam
cam.rotation_euler=(math.radians(90),0,0)   # look along +Y toward the scene plane

def leader_y(fr):
    by=-1e9
    for m in fr['m']:
        if m['f']: continue
        if m['y']>by: by=m['y']
    return by if by>-1e9 else HT*0.12

# ---------- keyframe everything ----------
for f in range(NF):
    fr=frames[f]; frame=f+1
    # marbles
    for i,o in enumerate(marble_objs):
        m=fr['m'][i]
        if m['f']:
            o.location=(0,9999,0)  # hide finished/eliminated far away
        else:
            o.location=P(m['x'],m['y'])
        o.keyframe_insert('location',frame=frame)
    # dynamic obstacles
    for i,o in enumerate(dyn_objs):
        d=fr['d'][i]; o.location=P(d['x'],d['y']); o.rotation_euler=(0,-d['a'],0)
        o.keyframe_insert('location',frame=frame); o.keyframe_insert('rotation_euler',frame=frame)
    # camera follow
    ly=leader_y(fr); camY=max(0,min(tape['worldH']-HT, ly-HT*0.34))
    cam.location=(0,-12,(-(camY+HT/2))*SCALE)
    cam.keyframe_insert('location',frame=frame)

# linear interpolation so motion is smooth (no easing on physics)
for o in marble_objs+dyn_objs+[cam]:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation='LINEAR'

sc.render.filepath=os.path.join(OUTDIR,'f_')
print(f'Rendering {NF} frames @ {sc.render.resolution_x}x{sc.render.resolution_y}, theme={THEME}')
bpy.ops.render.render(animation=True)
print('DONE frames in', OUTDIR)

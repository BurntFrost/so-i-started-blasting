"""Original procedural hard-surface models for So I Started Blasting.

Run: blender --background --factory-startup --python tools/author-assets.py
All coordinates are Blender Z-up; glTF exporter converts to Y-up.
"""
import bpy, math, json, random, os
from collections import defaultdict
from mathutils import Vector

OUT='/tmp/blasting-models'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name,color,metal=0,rough=.5,emission=None):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    m.use_backface_culling=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1)
        p.inputs['Emission Strength'].default_value=2.5
    return m

glass=material('Architectural smoked blue glass',(.052,.105,.145),.65,.16)
trim=material('Brushed titanium trim',(.21,.24,.27),.7,.29)
lit=material('Warm occupied windows',(.53,.35,.17),.15,.25,(.6,.34,.1))

class Geometry:
    def __init__(self): self.data=defaultdict(lambda:[[],[]])
    def add(self,mat,vertices,faces):
        v,f=self.data[mat]; n=len(v)
        v.extend(vertices); f.extend(tuple(i+n for i in q) for q in faces)
    def box(self,mat,c,s,bevel=0,angle=0,slope=0):
        # Beveled boxes have a real chamfer on all twelve edges.
        x,y,z=(n*.5 for n in s); b=min(bevel,x*.8,y*.8,z*.8)
        if b:
            verts=[]; faces=[]
            # Each corner has three points lying along its incident edges.
            for sx,sy,sz in [(a,b,c) for a in (-1,1) for b in (-1,1) for c in (-1,1)]:
                verts.extend([(sx*(x-b),sy*(y-b),sz*z),(sx*(x-b),sy*y,sz*(z-b)),(sx*x,sy*(y-b),sz*(z-b))])
            # Convex hull computes consistent bevel face winding, and meshes are batched later.
            import bmesh
            bm=bmesh.new()
            for p in verts: bm.verts.new(p)
            bm.verts.ensure_lookup_table()
            bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
            bm.verts.index_update()
            faces=[tuple(v.index for v in f.verts) for f in bm.faces]
            verts=[tuple(v.co) for v in bm.verts]
            bm.free()
        else:
            verts=[(a*x,b*y,d*z) for a in (-1,1) for b in (-1,1) for d in (-1,1)]
            faces=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
        co,si=math.cos(angle),math.sin(angle)
        self.add(mat,[(c[0]+a*co-b*si,c[1]+a*si+b*co,c[2]+d+a*slope) for a,b,d in verts],faces)
    def cylinder(self,mat,c,r,h,segments=12,r2=None):
        if r2 is None:r2=r
        v=[(c[0]+rad*math.cos(i*math.tau/segments),c[1]+rad*math.sin(i*math.tau/segments),c[2]+z) for z,rad in [(-h/2,r),(h/2,r2)] for i in range(segments)]
        f=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))]
        f += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
        self.add(mat,v,f)
    def beam(self,mat,a,b,width,depth=None):
        direction=Vector(b)-Vector(a); axis=direction.normalized()
        side=axis.cross(Vector((0,0,1)))
        if side.length<.01:side=Vector((1,0,0))
        side.normalize(); up=axis.cross(side).normalized(); d=depth or width
        v=[tuple(Vector(p)+side*ss*width/2+up*su*d/2) for p in (a,b) for ss in (-1,1) for su in (-1,1)]
        self.add(mat,v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)])
    def ring(self,mat,profile,segments=96,start=0,end=math.tau,center=(0,0,0)):
        # Revolve a closed radial / height profile. Partial sweeps are closed at both ends.
        full=abs(end-start-math.tau)<.001; count=segments if full else segments+1
        v=[(center[0]+r*math.cos(start+(end-start)*i/segments),center[1]+r*math.sin(start+(end-start)*i/segments),center[2]+z) for i in range(count) for r,z in profile]
        n=len(profile); f=[]
        for i in range(segments):
            nxt=(i+1)%count
            for j in range(n): f.append((i*n+j,nxt*n+j,nxt*n+(j+1)%n,i*n+(j+1)%n))
        if not full:f += [tuple(reversed(range(n))),tuple((count-1)*n+j for j in range(n))]
        self.add(mat,v,f)
    def export_meshes(self,root):
        for mat,(verts,faces) in self.data.items():
            mesh=bpy.data.meshes.new(root.name+' — '+mat.name)
            mesh.from_pydata(verts,[],faces); mesh.materials.append(mat);mesh.update()
            import bmesh
            bm=bmesh.new();bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            bm.to_mesh(mesh);bm.free()
            obj=bpy.data.objects.new(root.name+'__'+mat.name,mesh)
            bpy.context.collection.objects.link(obj);obj.parent=root

def root(name):
    obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj);return obj

def roof_plant(g,stone,z,w,d,style):
    # Roof parapet, lift overrun, HVAC fan decks, access rails and aerial mast.
    for x in (-w/2+.12,w/2-.12):g.box(stone,(x,0,z+.22),(.24,d,.44))
    for y in (-d/2+.12,d/2-.12):g.box(stone,(0,y,z+.22),(w,.24,.44))
    g.box(stone,(-w*.2,d*.1,z+.65),(w*.28,d*.27,1.3),.1)
    for i in range(2):
        x=w*.21;y=-d*.22+i*d*.4
        g.box(trim,(x,y,z+.26),(w*.22,d*.23,.52),.06)
        g.cylinder(trim,(x,y,z+.59),min(w,d)*.075,.14,12)
        for j in (-1,0,1):g.box(glass,(x+j*w*.045,y,z+.666),(.07,d*.16,.014))
    if style in (2,3):
        x=-w*.2;y=-d*.26
        for dx in (-.3,.3):
            for dy in (-.3,.3):g.beam(trim,(x+dx,y+dy,z),(x+dx,y+dy,z+1),.07)
        g.cylinder(stone,(x,y,z+1.6),.65,1.25,12)
        g.cylinder(trim,(x,y,z+2.28),.74,.22,12,r2=.12)
        for zh in (z+1.12,z+1.62,z+2.1):g.ring(trim,[(.652,zh),(.684,zh),(.684,zh+.07),(.652,zh+.07)],12,center=(x,y,0))
    else:
        x=-w*.3;y=d*.3
        g.cylinder(trim,(x,y,z+1.8),.055,3.6,8,r2=.025)
        g.beam(trim,(x-.7,y,z+2.9),(x+.7,y,z+2.9),.04)
        g.beam(trim,(x,y-.45,z+2.4),(x,y+.45,z+2.4),.04)

def facade(g,stone,w,d,z0,z1,floor=2.5,style=0,seed=0):
    # Separate face orientations keep real glass surfaces, shadowed frames and ledges.
    levels=max(1,int((z1-z0)/floor));step=(z1-z0)/levels
    for side in range(4):
        horizontal=w if side%2==0 else d; depth=d if side%2==0 else w
        sign=1 if side<2 else -1
        angle=0 if side%2==0 else math.pi/2
        def put(mat,x,z,sx,sz,out=0,thickness=.075):
            v=sign*(depth/2+.03+out)
            c=(x,v,z) if side%2==0 else (v,x,z)
            s=(sx,thickness,sz) if side%2==0 else (thickness,sx,sz)
            g.box(mat,c,s)
        bays=max(3,round(horizontal/1.3)); bw=(horizontal-.4)/bays
        for level in range(levels):
            z=z0+(level+.5)*step
            if style==2:
                for bay in range(bays):
                    x=-horizontal/2+.2+(bay+.5)*bw
                    mat=lit if (level*13+bay*7+side+seed)%11 in (0,1) else glass
                    put(mat,x,z,bw*.69,step*.58,.04)
                    put(stone,x,z-step*.33,bw*.88,.13,.13,.24)
            else:
                put(glass,0,z,horizontal-.35,step*.76,.025)
                for bay in range(bays):
                    if (level*17+bay*7+side*11+seed)%17<2:
                        put(lit,-horizontal/2+.2+(bay+.5)*bw,z,bw*.76,step*.67,.072,.01)
            put(stone,0,z0+level*step,horizontal+.12,.14 if style!=3 else .38,.06,.16)
        for bay in range(bays+1):
            x=-horizontal/2+.2+bay*bw
            put(trim if style in (1,4) else stone,x,(z0+z1)/2,.065 if style in (1,4) else .16,z1-z0,.13,.19)

city=[]
configs=[
    ('Tower_A',(.32,.35,.36),[(8.6,8.6,0,32),(7.1,7.1,32,47),(5.5,5.5,47,56)],0),
    ('Tower_B',(.16,.2,.24),[(9,8,0,17),(8,7.4,17,40),(6.4,6.6,40,51)],1),
    ('Tower_C',(.34,.19,.13),[(9.3,8.4,0,26)],2),
    ('Tower_D',(.38,.35,.29),[(10,7.5,0,7),(8.8,6.8,7,37)],3),
    ('Tower_E',(.25,.3,.34),[(8.4,8.4,0,8),(6.8,6.8,8,48),(5.6,5.6,48,58)],4),
]
for k,(name,color,tiers,style) in enumerate(configs):
    r=root(name);city.append(r);g=Geometry();stone=material(name+' stone / masonry',color,.1,.62)
    for w,d,z0,z1 in tiers:
        g.box(stone,(0,0,(z0+z1)/2),(w,d,z1-z0),.09)
        # Raised polished lobby base and monumental entrance portal.
        start=max(z0,2.8)
        facade(g,stone,w,d,start,z1-.4,2.6 if style==2 else 2.65,style,k*7)
        for zh in (z0+.15,z1-.16):g.box(stone,(0,0,zh),(w+.22,d+.22,.32),.08)
    w,d,_,top=tiers[-1];roof_plant(g,stone,top+(.8 if style==2 else 1.6 if style==3 else 0),w,d,style)
    basew,based=tiers[0][:2]
    g.box(glass,(0,-based/2-.052,1.35),(basew*.65,.08,2.4))
    for x in (-basew*.34,0,basew*.34):g.box(stone,(x,-based/2-.13,1.4),(.26,.32,2.8))
    g.box(trim,(0,-based/2-.5,2.8),(basew*.82,1.05,.2),.04)
    g.box(stone,(0,0,.18),(basew+.6,based+.6,.36),.06)
    if style==0:
        # Art Deco crown is tapered through three nested stepped drums and a needle.
        g.box(stone,(0,0,top+1.15),(3.8,3.8,2.3),.1)
        g.box(stone,(0,0,top+2.7),(2.6,2.6,1),.08)
        g.cylinder(trim,(0,0,top+5.9),.34,5.4,8,r2=.035)
        for x in (-2.3,2.3):
            for y in (-2.3,2.3):g.box(stone,(x,y,top+.7),(.5,.5,1.4),.07)
    if style==1:
        # Split blade crown with a horizontal service bridge.
        for x in (-2.4,2.4):g.box(trim,(x,0,top+1.1),(.2,5.9,2.2),.05)
        g.box(trim,(0,1.8,top+1.9),(5.1,.3,.3),.04)
    if style==2:
        # Distinct brick cornice with closely spaced stone corbels.
        g.box(stone,(0,0,top+.52),(w+.55,d+.55,.5),.06)
        for i in range(12):
            x=-w/2+.35+i*(w-.7)/11
            for sy in (-1,1):g.box(stone,(x,sy*(d/2+.09),top-.4),(.26,.38,.4),.025)
    if style==3:
        # Massive side piers and cantilevered penthouse distinguish the hotel.
        for x in (-3.65,3.65):
            for sy in (-1,1):g.box(stone,(x,sy*3.52,21.9),(.47,.56,30),.04)
        g.box(stone,(0,0,top+.8),(9.65,7.5,1.6),.1)
    if style==4:
        # Cross-braced glass faces and narrow mechanical crown.
        for z0,z1 in [(10,23),(23,36),(36,47)]:
            for sy in (-1,1):
                g.beam(trim,(-3.12,sy*3.58,z0),(3.12,sy*3.58,z1),.1,.08)
                g.beam(trim,(3.12,sy*3.58,z0),(-3.12,sy*3.58,z1),.1,.08)
        g.box(trim,(0,0,top+1),(3.6,3.6,2),.08)
        g.cylinder(trim,(0,0,top+3.5),.2,3,8,r2=.04)
    g.export_meshes(r)

def export(name,roots):
    # Recenter all geometry, not root transforms, for predictable runtime instancing.
    for r in roots:
        points=[v.co for o in r.children_recursive for v in o.data.vertices]
        offset=Vector(((max(v.x for v in points)+min(v.x for v in points))/2,(max(v.y for v in points)+min(v.y for v in points))/2,min(v.z for v in points) if r.name!='Mothership' else (max(v.z for v in points)+min(v.z for v in points))/2))
        for o in r.children_recursive:
            for vertex in o.data.vertices:vertex.co-=offset
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT+'/'+name,export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True)

tree=root('Tree_A');tg=Geometry();rng=random.Random(2084)
bark=material('Tree silver birch bark',(.24,.19,.13),0,.92)
leaves=material('Tree layered green canopy',(.18,.28,.10),0,.91)
def branch(a,b,r1,r2):
    direction=Vector(b)-Vector(a);q=Vector((0,0,1)).rotation_difference(direction)
    v=[]
    for point,rad in [(a,r1),(b,r2)]:
        for i in range(8):v.append(tuple(Vector(point)+q@Vector((rad*math.cos(i*math.tau/8),rad*math.sin(i*math.tau/8),0))))
    tg.add(bark,v,[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)])
branch((0,0,0),(.2,-.13,6.5),.43,.23)
branch((.2,-.13,6.5),(-.55,.23,12.9),.23,.055)
def crown(center,scale,detail):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1)
    temporary=bpy.context.object
    v=[tuple(center[j]+p.co[j]*scale[j]*(1+rng.uniform(-.12,.12)) for j in range(3)) for p in temporary.data.vertices]
    tg.add(leaves,v,[tuple(p.vertices) for p in temporary.data.polygons])
    bpy.data.objects.remove(temporary,do_unlink=True)
for i in range(9):
    a=i*2.399;z=5.8+i*.66;r=3.9 if i<5 else 2.8
    mid=(math.cos(a)*r*.5,math.sin(a)*r*.5,z+1.4)
    tip=(math.cos(a)*r,math.sin(a)*r,z+3.2)
    branch((.1,0,z),mid,.17-i*.009,.09)
    branch(mid,tip,.09,.025)
    crown(tip,(2.4,2.0,2.8),3)
    for j in (-1,1):
        side=(tip[0]+j*math.cos(a+1.3)*1.2,tip[1]+j*math.sin(a+1.3)*1.2,tip[2]-.9)
        crown(side,(1.4,1.5,1.7),2)
crown((-.55,.23,13.8),(2.3,2.15,2.8),3)
tg.export_meshes(tree);city.append(tree)
export('city-kit-v2.glb',city)

# ORIGINAL ALIEN CAPITAL CRAFT: radial armor, recessed machinery and underside reactor.
craft=root('Mothership');g=Geometry()
hull=material('Alien oxidized hull',(.065,.095,.10),.84,.4)
armor=material('Alien chamfered armor',(.16,.21,.22),.8,.3)
edge=material('Alien machined edge',(.25,.31,.32),.92,.24)
recess=material('Alien recessed machinery',(.017,.024,.029),.65,.5)
reactor=material('Alien reactor plasma',(.025,.44,.37),.25,.2,(.02,.8,.58))
amber=material('Alien amber running lamps',(.7,.28,.04),.1,.23,(1,.22,.015))

# The central shell is a deliberate multi-level profile with an inset equatorial trench.
g.ring(hull,[(.8,4.8),(8,5.6),(18,4.8),(28,3.4),(37,1.6),(40,.65),(40,-.7),(33,-2.7),(22,-4.15),(9,-5.6),(.8,-4.9)],192)
g.ring(recess,[(30.7,2.86),(33.4,2.3),(33.4,2.1),(30.7,2.66)],192)
g.ring(recess,[(39.94,.4),(40.27,.2),(40.27,-.45),(39.94,-.65)],192)
g.ring(edge,[(38.5,1.18),(40.55,.48),(40.55,.26),(38.5,.94)],192)
g.ring(edge,[(38.5,-1.05),(40.55,-.58),(40.55,-.35),(38.5,-.82)],192)

for i in range(36):
    a=i*math.tau/36; gap=.015
    # Broad stepped panels stop short of their neighbors, leaving actual engraved seams.
    g.ring(armor,[(10,5.34),(18.6,4.98),(29.6,3.32),(29.6,3.04),(18.6,4.7),(10,5.06)],4,a+gap,a+math.tau/36-gap)
    g.ring(armor,[(34,2.52),(38.1,1.82),(41.2,.62),(41.2,.28),(37.9,1.5),(34,2.2)],3,a+gap*.7,a+math.tau/36-gap*.7)
    g.ring(armor,[(10,-5.38),(20,-4.07),(32.2,-2.35),(32.2,-2.68),(20,-4.4),(10,-5.71)],4,a+gap,a+math.tau/36-gap)
    # Each repeated sector has coordinated vent racks and a spine, not random decoration.
    mid=a+math.tau/72
    def radial(mat,r,z,length,width,height,offset=0,bev=0,slope=0):
        theta=mid+offset
        g.box(mat,(r*math.cos(theta),r*math.sin(theta),z),(length,width,height),bev,theta,slope)
    radial(edge,24,4.48,8.8,.18,.26,0,.035,-.15)
    radial(recess,31.9,2.97,2.2,3.6,.46,0,.06)
    for j in range(6):radial(edge,31.06+j*.32,3.25,.1,3.12,.25)
    radial(hull,37.9,-1.3,3.9,2.8,.8,0,.12)
    for j in range(4):radial(recess,36.5+j*.63,-1.75,.32,2.35,.14)
    radial(reactor,40.65,-.04,.11,.72,.14)
    # Long alternating buttresses break the saucer silhouette with cantilevered armor.
    if i%3==0:
        radial(hull,29,3.7,18.5,1.2,1.12,0,.17,-.18)
        radial(edge,30.1,4.1,15.9,.38,.15,0,.025,-.18)
        radial(armor,39.8,.25,4.1,2.2,.84,0,.18)
        radial(amber,41.78,.29,.08,.42,.2)
    # Underside radial cooling ribs surround the central gun well.
    radial(edge,16.6,-5.08,9.8,.23,.32,0,.04,.132)
    for j in range(4):radial(hull,23.8+j*1.25,-3.82+j*.16,.45,1.75,.6,0,.055)

# Low central armored bastion plus radial ducts: no dome primitive.
g.ring(armor,[(1.8,5.4),(1.8,6.65),(5.2,6.65),(8.6,5.42),(8.6,5.12)],64)
g.ring(recess,[(2.1,6.66),(4.8,6.66),(4.8,6.73),(2.1,6.73)],64)
g.ring(edge,[(1.72,6.1),(1.95,6.1),(1.95,6.93),(1.72,6.93)],64)
for i in range(16):
    a=i*math.tau/16
    g.box(hull,(6.8*math.cos(a),6.8*math.sin(a),5.86),(4.5,.55,.55),.08,a)
    g.box(edge,(5.3*math.cos(a),5.3*math.sin(a),6.26),(.8,.7,.25),.05,a)

# Recessed concentric reactor assembly with a segmented iris and glowing inner rings.
g.ring(recess,[(2.1,-4.95),(7.8,-4.95),(8.7,-5.9),(8.7,-6.3),(2.1,-6.3)],96)
g.ring(armor,[(7.2,-5.13),(8.4,-5.5),(8.5,-6.38),(7.9,-6.73),(7.2,-6.5)],96)
for radius,z in [(6.6,-6.38),(4.85,-6.28),(3.25,-6.2)]:
    g.ring(reactor,[(radius-.12,z),(radius+.12,z),(radius+.12,z-.13),(radius-.12,z-.13)],96)
    g.ring(edge,[(radius+.14,z+.1),(radius+.42,z+.1),(radius+.42,z-.1),(radius+.14,z-.1)],96)
for i in range(24):
    a=i*math.tau/24
    g.box(armor,(5.5*math.cos(a),5.5*math.sin(a),-6.24),(2.5,.36,.36),.05,a+.17)
    g.box(hull,(8*math.cos(a),8*math.sin(a),-6.33),(1.5,.43,.6),.08,a)
g.cylinder(reactor,(0,0,-5.97),2.18,.25,64)
g.ring(edge,[(2.25,-5.8),(2.58,-5.8),(2.58,-6.28),(2.25,-6.28)],64)
g.export_meshes(craft)
export('mothership-v2.glb',[craft])

report={}
for r in city+[craft]:
    objects=list(r.children_recursive);points=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
    triangles=0;verts=0
    for o in objects:
        o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles);verts+=len(o.data.vertices)
    report[r.name]={'dimensions_blender_xyz':[round(max(p[i] for p in points)-min(p[i] for p in points),3) for i in range(3)],'vertices':verts,'triangles':triangles,'material_meshes':len(objects),'root_matrix_identity':r.matrix_local==__import__('mathutils').Matrix.Identity(4)}
with open(OUT+'/asset-stats-v2.json','w') as f:json.dump(report,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/blasting-assets-v2.blend')
print('ASSET_STATS '+json.dumps(report))

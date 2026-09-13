"""Bake an original turbulent volume puff. Blender renders RGBA; FFmpeg packs the atlas.

blender -b -t 4 --python tools/bake-explosion.py -- --frames 32
Frames are production assets, not a fluid simulation or captured film footage.
"""
import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=int, default=32)
parser.add_argument('--only', type=int)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
root = Path(__file__).resolve().parents[1]
output = root / 'work/explosion-bake/frames'
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Dark studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .12

material = bpy.data.materials.new('Baked turbulent combustion')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
nodes.clear()
def node(kind, **values):
    result = nodes.new(kind)
    for name, value in values.items():
        result.inputs[name].default_value = value
    return result
def math_node(operation, a, b):
    result = node('ShaderNodeMath')
    result.operation = operation
    for index, value in enumerate((a, b)):
        if isinstance(value, (float, int)):
            result.inputs[index].default_value = value
        else:
            links.new(value, result.inputs[index])
    return result.outputs[0]

coordinates = node('ShaderNodeTexCoord')
turbulence = node('ShaderNodeTexNoise', Scale=4.8, Detail=5.0, Roughness=.7, Distortion=.35)
turbulence.noise_dimensions = '4D'
links.new(coordinates.outputs['Generated'], turbulence.inputs['Vector'])
# A soft radial envelope avoids a hard sphere boundary in the sprite.
distance = node('ShaderNodeVectorMath')
distance.operation = 'DISTANCE'
links.new(coordinates.outputs['Generated'], distance.inputs[0])
distance.inputs[1].default_value = (.5, .5, .5)
edge = math_node('ADD', .30, math_node('MULTIPLY', turbulence.outputs['Fac'], .30))
envelope = math_node('MULTIPLY', math_node('MAXIMUM', math_node('SUBTRACT', edge, distance.outputs['Value']), 0), 14)
density = math_node('MULTIPLY', math_node('MAXIMUM', math_node('SUBTRACT', turbulence.outputs['Fac'], .49), 0), 110)
volume = node('ShaderNodeVolumePrincipled', Color=(.22, .19, .16, 1), Anisotropy=.2)
links.new(math_node('MULTIPLY', density, envelope), volume.inputs['Density'])
ramp = node('ShaderNodeValToRGB')
ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
for i, (position, color) in enumerate([
    (.32, (.015, .001, .0001, 1)), (.48, (.5, .025, .001, 1)),
    (.60, (1, .22, .008, 1)), (.74, (1, .72, .18, 1))
]):
    element = ramp.color_ramp.elements[0] if i == 0 else ramp.color_ramp.elements.new(position)
    element.position, element.color = position, color
links.new(turbulence.outputs['Fac'], ramp.inputs[0])
links.new(ramp.outputs['Color'], volume.inputs['Emission Color'])
heat = node('ShaderNodeValue')
links.new(math_node('MULTIPLY', math_node('MULTIPLY', density, envelope), heat.outputs[0]), volume.inputs['Emission Strength'])
out = node('ShaderNodeOutputMaterial')
links.new(volume.outputs['Volume'], out.inputs['Volume'])
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32)
bpy.context.object.data.materials.append(material)

camera_data = bpy.data.cameras.new('Bake camera')
camera = bpy.data.objects.new('Bake camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -4, .3)
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 2.22
scene.camera = camera
light_data = bpy.data.lights.new('Soft upper rim', 'AREA')
light_data.energy, light_data.shape, light_data.size = 650, 'DISK', 3
light = bpy.data.objects.new('Soft upper rim', light_data)
scene.collection.objects.link(light)
light.location = (-2, -1, 3)
light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
frames = range(args.frames) if args.only is None else [args.only]
for frame in frames:
    age = frame / (args.frames - 1)
    turbulence.inputs['W'].default_value = .35 + age * 1.8
    heat.outputs[0].default_value = 3.0 * (1 - age) ** 3
    scene.render.filepath = str(output / f'{frame:03d}.png')
    bpy.ops.render.render(write_still=True)
    print(f'BAKED {frame + 1}/{args.frames}', flush=True)

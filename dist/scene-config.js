// Rendering identity and environment ownership are independent of picker order.
export const defaultGrade = {exposure:1.6,bloomStrength:.48,bloomRadius:.65,bloomThreshold:1.1,tint:[1,1,1],saturation:.94,grain:.012,aberration:.0012};
const city = {world:'city',camera:[122,58,155],target:[-8,35,-15]};
const space = {world:'space',space:true,camera:[122,58,155],target:[0,35,0]};
const daylight = {fog:'#5a6364',fogDensity:.0024,fogGrowth:0,sun:'#ffc596',sunIntensity:2.7,hemi:'#9eafbe',hemiIntensity:.38,rim:'#8cb7ef',rimIntensity:2.2,environmentIntensity:.72,skyTint:'#b4c7c4',skyExposure:.65,skyStorm:.3};
const starlight = {...daylight,fogDensity:0,sun:'#e4ebff',sunIntensity:1.5,hemiIntensity:.12,environmentIntensity:.2,skyTint:'#ffffff'};
export const sceneConfigs = {
  'independence-day': {...city,renderer:'original',environment:{...daylight,rim:'#4aaca2'}},
  'deep-impact': {...city,renderer:'terrestrial',camera:[148,76,204],target:[-5,33,-22],phaseTimes:[13,20],environment:{...daylight,skyTint:'#bba899',rim:'#77b8d9'}},
  'day-after-tomorrow': {...city,renderer:'terrestrial',camera:[122,52,155],target:[-8,33,-15],environment:{...daylight,fog:"#526c83",fogDensity:0.0013,fogGrowth:0.0007,sun:"#d6e7f3",sunIntensity:2.1,hemi:"#7298b5",hemiIntensity:0.3,rim:"#abdafa",rimIntensity:2.8,environmentIntensity:0.55,skyTint:"#6c8fa9",skyExposure:0.25,skyStorm:0.9}},
  'day-the-earth-stood-still': {world:'landscape',renderer:'terrestrial',camera:[84,47,142],target:[-4,35,-22],phaseTimes:[10,19],environment:{...daylight,fog:"#263d40",fogDensity:0.0012,fogGrowth:0.0003,sun:"#c9d4d9",sunIntensity:1.65,hemi:"#729398",hemiIntensity:0.36,rim:"#a8e4d8",rimIntensity:2.4,environmentIntensity:0.6,skyTint:"#617d83",skyExposure:0.22,skyStorm:0.84}},
  'terminator-2': {...city,renderer:'terrestrial',camera:[138,74,176],target:[-8,48,-15],phaseTimes:[4,13],environment:{...daylight,fog:"#454b55",fogDensity:0.0016,fogGrowth:0.0005,sun:"#efd4b2",sunIntensity:1.9,hemi:"#91a5bd",hemiIntensity:0.3,rim:"#a8c9ed",rimIntensity:2.2,environmentIntensity:0.5,skyTint:"#a2acb5",skyExposure:0.34,skyStorm:0.82}},
  '2012': {...city,renderer:'terrestrial',camera:[132,88,166],target:[0,15,-8],phaseTimes:[3,21],environment:{...daylight,fog:'#46515d',fogDensity:.0018,sun:'#f4d8b8',sunIntensity:2.2,rim:'#a4c4e1',rimIntensity:2.5,skyTint:'#9aabb9',skyExposure:.32,skyStorm:.86}},
  'war-of-the-worlds': {...city,renderer:'terrestrial',camera:[132,64,180],target:[0,37,-12],phaseTimes:[8,20.5],environment:{...daylight,fog:'#263545',fogDensity:.0015,sun:'#c8d9ea',sunIntensity:2.1,rim:'#acd7f4',rimIntensity:3,hemi:'#718caa',hemiIntensity:.4,skyTint:'#7c92b0',skyExposure:.2,skyStorm:.94}},
  'knowing': {...space,renderer:'cosmic',camera:[106,62,170],target:[4,38,0],phaseTimes:[5,23],environment:{...starlight}},
  'armageddon': {...space,renderer:'cosmic',camera:[78,59,132],target:[-20,43,-8],environment:{...starlight,sun:'#f4d1b3',sunIntensity:2.4,hemi:'#7394b2',hemiIntensity:.16,rim:'#80b8ed',rimIntensity:3.2}},
  'interstellar': {...space,renderer:'cosmic',camera:[122,78,155],target:[0,45,0],environment:{...starlight}},
  'twister': {world:'landscape',renderer:'terrestrial',camera:[112,75,194],target:[-18,48,-45],cameraMaxDistance:380,phaseTimes:[13,21],environment:{...daylight,fog:"#3d4c59",fogDensity:0.0018,fogGrowth:0.0006,sun:"#e0dac9",sunIntensity:1.7,hemi:"#91a8bd",hemiIntensity:0.6,rim:"#a6d5f4",rimIntensity:2.7,environmentIntensity:0.45,skyTint:"#8499ac",skyExposure:0.32,skyStorm:0.92}},
  'dantes-peak': {world:'landscape',renderer:'terrestrial',camera:[165,180,390],target:[-25,100,-160],cameraMaxDistance:650,phaseTimes:[6,13.5],environment:{...daylight,fog:"#64717b",fogDensity:0.0004,fogGrowth:0.0002,sun:"#ffe1bd",sunIntensity:2.2,hemi:"#9eafc1",hemiIntensity:0.4,rim:"#c1d4e6",rimIntensity:2.7,environmentIntensity:0.5,skyTint:"#7f95a8",skyExposure:0.3,skyStorm:0.78}},
  'gravity': {...space,renderer:'cosmic',camera:[82,88,144],target:[-12,40,0],phaseTimes:[8,22],environment:{...starlight,sun:"#e8efff",sunIntensity:2.25,hemi:"#769abb",hemiIntensity:0.24,rim:"#80b9e8",rimIntensity:2.7,environmentIntensity:0.34}},
  'wandering-earth': {...space,renderer:'cosmic',camera:[112,70,170],target:[-4,46,-20],phaseTimes:[8,22],environment:{...starlight,sun:"#d4e4ff",sunIntensity:1.6,hemi:"#6f91bc",hemiIntensity:0.16,rim:"#91c9f2",rimIntensity:2.2,environmentIntensity:0.22}},
  'evangelion': {...city,renderer:'terrestrial',camera:[145,130,330],target:[0,100,-75],cameraMaxDistance:550,phaseTimes:[10,19],environment:{...daylight,fog:"#332735",fogDensity:0.0011,fogGrowth:0.0003,sun:"#f1b2a0",sunIntensity:1.65,hemi:"#8d9fcb",hemiIntensity:0.46,rim:"#b7d4ff",rimIntensity:2.65,environmentIntensity:0.42,skyTint:"#b77579",skyExposure:0.27,skyStorm:0.74}},
};

// Explicit scene entries keep the look independent of renderer and catalogue order.
const grades = {
  'independence-day': {...defaultGrade},
  'deep-impact': {...defaultGrade},
  'day-after-tomorrow': {...defaultGrade,exposure:1.55,bloomStrength:0.18,bloomRadius:0.35,tint:[0.95,1,1.04],saturation:0.84},
  'day-the-earth-stood-still': {...defaultGrade,exposure:1.45,bloomStrength:0.23,bloomRadius:0.4,bloomThreshold:1.2,tint:[0.97,1,1.02],saturation:0.86},
  'terminator-2': {...defaultGrade,exposure:1.5,bloomStrength:0.34,bloomRadius:0.42,bloomThreshold:1.2,tint:[1,0.99,0.98],saturation:0.87},
  '2012': {...defaultGrade,exposure:1.45,bloomStrength:.24,bloomThreshold:1.3,tint:[.98,1,1.02],saturation:.9},
  'war-of-the-worlds': {...defaultGrade,exposure:1.45,bloomStrength:.3,bloomThreshold:1.2,saturation:.88},
  'knowing': {...defaultGrade,exposure:1.25,bloomStrength:.17,bloomRadius:.32,bloomThreshold:1.3,saturation:1},
  'armageddon': {...defaultGrade,exposure:1.5,bloomStrength:.3,bloomRadius:.35,bloomThreshold:1.2,tint:[.96,.99,1.03],saturation:.92},
  'interstellar': {...defaultGrade,bloomStrength:.12,bloomRadius:.35,saturation:.97},
  'twister': {...defaultGrade,exposure:1.55,bloomStrength:0.16,bloomRadius:0.35,bloomThreshold:1.2,tint:[0.97,1,1.04],saturation:0.88},
  'dantes-peak': {...defaultGrade,exposure:1.5,bloomStrength:0.25,bloomRadius:0.4,bloomThreshold:1.2,tint:[0.98,1,1.02],saturation:0.87},
  'gravity': {...defaultGrade,exposure:1.5,bloomStrength:0.15,bloomRadius:0.35,bloomThreshold:1.2,tint:[0.97,1,1.03],saturation:0.94},
  'wandering-earth': {...defaultGrade,exposure:1.45,bloomStrength:0.18,bloomRadius:0.32,bloomThreshold:1.25,tint:[0.97,1,1.03],saturation:0.92},
  'evangelion': {...defaultGrade,exposure:1.4,bloomStrength:0.2,bloomRadius:0.38,bloomThreshold:1.25,tint:[0.99,0.98,1.03],saturation:0.88},
};
// Windows are [start, full strength, start fading, end] in timeline seconds.
export const heroEmitters = {
  'independence-day': {id:'beam',position:[-8,78,-20],object:'Mothership beam emitter',lightPosition:[-8,18,-20],color:'#9cffe0',intensity:950,distance:210,strength:.24,window:[9,12,17,20]},
  'deep-impact': {id:'strike',position:[-50,20,-100],color:'#ffc98b',intensity:1800,distance:240,strength:.22,window:[13,13.6,17,24]},
  'terminator-2': {id:"fireball",position:[-18,23,-27],object:"Nuclear fireball",color:"#ffd0a0",intensity:1100,distance:230,strength:0.23,window:[4,4.25,4.65,5.7]},
  'war-of-the-worlds': {id:'heat-ray',position:[20,58,19],object:'Articulated tripod 1',offset:[0,58,7],color:'#9ebdff',intensity:300,distance:95,strength:.16,window:[7,11,29,30]},
  'knowing': {id:'sun',position:[-35,54,-8],color:'#ffb75e',intensity:0,distance:0,strength:.15,window:[0,3,26,30]},
  'armageddon': {id:'fracture',position:[2,49,-10],object:'Fracturing asteroid',offset:[0,0,12],color:'#ffd1a0',intensity:800,distance:170,strength:.16,window:[15.85,16.1,16.2,17.1]},
  'day-the-earth-stood-still': {id:"sphere",position:[-25,31,-42],object:"Luminous sphere",color:"#8ff0d8",intensity:400,distance:190,strength:0.13,window:[0,4,27,30]},
  'evangelion': {id:"cross",position:[-10,113.6,-70],object:"Crosses of light",instance:1,color:"#ffad8c",intensity:420,distance:240,strength:0.09,window:[12,13.4,18.5,23.5]},
  'dantes-peak': {id:"vent",position:[-53,108,-254],color:"#ff8738",intensity:750,distance:280,strength:0.12,window:[5,6.5,9,16]},
  'wandering-earth': {id:"jupiter",position:[-185,110,-540],object:"Jupiter ignition",color:"#ffc08b",intensity:0,distance:0,strength:0.075,window:[22,22.7,23.1,25.5]},
};
for (const [id, grade] of Object.entries(grades)) sceneConfigs[id].grade = {...grade,emitter:heroEmitters[id]||null};

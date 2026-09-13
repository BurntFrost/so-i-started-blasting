// Rendering identity and environment ownership are independent of picker order.
const city = {world:'city',camera:[122,58,155],target:[-8,35,-15]};
const space = {world:'space',space:true,camera:[122,58,155],target:[0,35,0]};
const daylight = {fog:'#5a6364',fogDensity:.0024,fogGrowth:0,sun:'#ffc596',sunIntensity:2.7,hemi:'#9eafbe',hemiIntensity:.38,rim:'#8cb7ef',rimIntensity:2.2,environmentIntensity:.72,skyTint:'#b4c7c4',skyExposure:.65,skyStorm:.3};
const starlight = {...daylight,fogDensity:0,sun:'#e4ebff',sunIntensity:1.5,hemiIntensity:.12,environmentIntensity:.2,skyTint:'#ffffff'};
export const sceneConfigs = {
  'independence-day': {...city,renderer:'original',environment:{...daylight,rim:'#4aaca2'}},
  'deep-impact': {...city,renderer:'original',environment:{...daylight,skyTint:'#bba899',rim:'#77b8d9'}},
  'day-after-tomorrow': {...city,renderer:'original',environment:{...daylight,fog:'#718797',fogDensity:.0035,fogGrowth:.003,sun:'#bfdbef',sunIntensity:1.1,hemi:'#93b5d4',environmentIntensity:.6,skyTint:'#91afca',skyExposure:.3,skyStorm:.96}},
  'melancholia': {world:'landscape',renderer:'original',camera:[85,31,130],target:[-8,39,-45],environment:{...daylight,fog:'#283e50',fogDensity:.0018,sun:'#a7cfff',rimIntensity:1.4,skyTint:'#7db9d4',skyExposure:.14,skyStorm:.96}},
  'terminator-2': {...city,renderer:'terrestrial',environment:{...daylight,fog:'#594139',skyTint:'#dba879',skyStorm:.96}},
  '2012': {...city,renderer:'terrestrial',environment:{...daylight,fog:'#51403e',skyTint:'#ca9a81',skyStorm:.96}},
  'war-of-the-worlds': {...city,renderer:'terrestrial',environment:{...daylight,fog:'#353340',sun:'#c0b4de',skyTint:'#a297b4',skyExposure:.25,skyStorm:.96}},
  'knowing': {...space,renderer:'cosmic',environment:{...starlight}},
  'armageddon': {...space,renderer:'cosmic',environment:{...starlight}},
  'interstellar': {...space,renderer:'cosmic',camera:[122,78,155],target:[0,45,0],environment:{...starlight}},
  'twister': {world:'landscape',renderer:'terrestrial',camera:[72,36,104],target:[-20,32,-52],environment:{...daylight,fog:'#46524d',fogDensity:.0027,fogGrowth:.0018,sun:'#b7c4b4',sunIntensity:1.05,hemi:'#8da39c',hemiIntensity:.34,rim:'#9fb7c6',rimIntensity:1.2,environmentIntensity:.5,skyTint:'#8da093',skyExposure:.27,skyStorm:.96}},
  'dantes-peak': {world:'landscape',renderer:'terrestrial',camera:[92,52,136],target:[-22,48,-95],environment:{...daylight,fog:'#5b5350',fogDensity:.0015,fogGrowth:.0024,sun:'#ffd0a4',sunIntensity:2.1,hemi:'#a9b1b3',hemiIntensity:.36,rimIntensity:1.6,environmentIntensity:.6,skyTint:'#b3aea6',skyExposure:.44,skyStorm:.7}},
  'gravity': {...space,renderer:'cosmic',camera:[88,58,112],target:[0,40,0],environment:{...starlight}},
  'wandering-earth': {...space,renderer:'cosmic',target:[0,42,0],environment:{...starlight}},
};

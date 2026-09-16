// Rendering identity and environment ownership are independent of picker order.
export const defaultGrade = {exposure:1.6,bloomStrength:.48,bloomRadius:.65,bloomThreshold:1.1,tint:[1,1,1],saturation:.94,grain:.012,aberration:.0012};
const city = {world:'city',camera:[122,58,155],target:[-8,35,-15]};
const space = {world:'space',space:true,camera:[122,58,155],target:[0,35,0]};
const daylight = {fog:'#5a6364',fogDensity:.0024,fogGrowth:0,sun:'#ffc596',sunIntensity:2.7,hemi:'#9eafbe',hemiIntensity:.38,rim:'#8cb7ef',rimIntensity:2.2,environmentIntensity:.72,skyTint:'#b4c7c4',skyExposure:.65,skyStorm:.3};
const starlight = {...daylight,fogDensity:0,sun:'#e4ebff',sunIntensity:1.5,hemiIntensity:.12,environmentIntensity:.2,skyTint:'#ffffff'};
export const sceneConfigs = {
  'independence-day': {...city,renderer:'original',environment:{...daylight,rim:'#4aaca2'}},
  'deep-impact': {...city,renderer:'terrestrial',environment:{...daylight,skyTint:'#bba899',rim:'#77b8d9'}},
  'day-after-tomorrow': {...city,renderer:'terrestrial',environment:{...daylight,fog:'#8a9fae',fogDensity:.0035,fogGrowth:.0052,sun:'#bfdbef',sunIntensity:1.1,hemi:'#93b5d4',environmentIntensity:.6,skyTint:'#91afca',skyExposure:.3,skyStorm:.96}},
  'day-the-earth-stood-still': {world:'landscape',renderer:'terrestrial',camera:[88,26,128],target:[-8,30,-40],environment:{...daylight,fog:'#2c3a43',fogDensity:.0016,fogGrowth:.0024,sun:'#c9d8e3',sunIntensity:1.5,hemi:'#8fa4b4',hemiIntensity:.34,rim:'#9fd8cf',rimIntensity:1.6,environmentIntensity:.55,skyTint:'#8ea6b4',skyExposure:.2,skyStorm:.85}},
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
  'evangelion': {...city,renderer:'terrestrial',camera:[112,50,148],target:[-6,52,-28],environment:{...daylight,fog:'#4a2329',fogDensity:.002,fogGrowth:.0016,sun:'#ff9d75',sunIntensity:2,hemi:'#a37a85',hemiIntensity:.34,rim:'#ffa070',rimIntensity:2.6,environmentIntensity:.5,skyTint:'#c96e5e',skyExposure:.4,skyStorm:.62}},
};

// Explicit scene entries keep the look independent of renderer and catalogue order.
const grades = {
  'independence-day': {...defaultGrade},
  'deep-impact': {...defaultGrade},
  'day-after-tomorrow': {...defaultGrade,bloomStrength:.22,tint:[.96,1,1],saturation:.88},
  'day-the-earth-stood-still': {...defaultGrade,bloomStrength:.38},
  'terminator-2': {...defaultGrade,tint:[1,1,.96]},
  '2012': {...defaultGrade,tint:[1,1,.96]},
  'war-of-the-worlds': {...defaultGrade},
  'knowing': {...defaultGrade,bloomStrength:.25,bloomRadius:.35,saturation:.97},
  'armageddon': {...defaultGrade,bloomStrength:.25,bloomRadius:.35,saturation:.97},
  'interstellar': {...defaultGrade,bloomStrength:.12,bloomRadius:.35,saturation:.97},
  'twister': {...defaultGrade},
  'dantes-peak': {...defaultGrade},
  'gravity': {...defaultGrade,bloomStrength:.18,bloomRadius:.35,saturation:.97},
  'wandering-earth': {...defaultGrade,bloomStrength:.25,bloomRadius:.35,saturation:.97},
  'evangelion': {...defaultGrade},
};
for (const [id, grade] of Object.entries(grades)) sceneConfigs[id].grade = grade;

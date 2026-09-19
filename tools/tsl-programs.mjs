// Checked-in GLSL, not extracted from runtime materials during generation.
// Math is from render-kit.js / cosmic.js / terrestrial.js (A baseline). Only
// function names and explicit parameter lists differ. Native adapters own spaces,
// texture lifecycle, output transforms, and the complete volume march interface.
export const fieldSource = String.raw`
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){return noise3(p)*.57+noise3(p*2.03)*.28+noise3(p*4.11)*.15;}

float fbm4(vec3 p){return noise3(p)*.53+noise3(p*2.03)*.27+noise3(p*4.07)*.13+noise3(p*8.11)*.07;}

float terrainHeight(vec2 xz){return -.5+(sin(xz.x*.022)*cos(xz.y*.027)*5.-sin(xz.y*.06)*1.5)*clamp((length(xz)-25.)/80.,0.,1.);}

float funnelProfile(float h,vec4 shape){return mix(shape.x,shape.y,pow(clamp(h,0.,1.),shape.w));}

vec3 coronaDensity(vec3 p,bool detail,float time,vec3 origin,float activity,vec3 site){
      vec3 q=p-origin;float r=length(q);if(r<31.6||r>62.)return vec3(0.);
      vec3 n=q/r;float fall=exp(-(r-31.6)*.18)*(1.-smoothstep(45.,62.,r));if(fall<.02)return vec3(0.);
      float streamer=smoothstep(.55,.85,fbm3(n*4.2+vec3(time*.03,0.,0.)));
      float helmet=pow(max(dot(n,site),0.),6.)*(.6+activity*.8);
      float d=fall*(.08+.92*streamer+helmet*.8);if(d<.01)return vec3(0.);
      float wisp=detail?noise3(n*11.+vec3(0.,0.,r*.14-time*.5)):.5;
      return vec3(d*(.55+.45*wisp),helmet,wisp);
    }

vec3 ejectionDensity(vec3 p,bool detail,float time,vec3 origin,float radius,vec3 axis,vec3 uAxis,vec3 vAxis,float front){
      vec3 q=(p-origin)/radius;float rr=length(q);if(rr>1.1)return vec3(0.);
      float ahead=dot(q,axis);
      // A bright thin front on the Earth-facing side, a nearly empty cavity and a dense core of ejected prominence.
      float shell=exp(-pow((rr-.9)/.09,2.))*smoothstep(-.3,.5,ahead/max(rr,1e-3)),edge=smoothstep(.5,.9,rr);
      float core=exp(-length(q+axis*.35)*3.5);
      if(shell<.02&&core<.02&&edge<.02)return vec3(0.);
      vec3 flow=p-origin-axis*time*9.;
      float strands=edge>.02?smoothstep(.35,.75,fbm3(vec3(dot(q,uAxis)*6.,dot(q,vAxis)*6.,time*.4))):.5;
      float filaments=edge>.02?smoothstep(.5,.85,fbm3(vec3(dot(q,uAxis)*5.,dot(q,vAxis)*5.,ahead*1.2-time*.6)))*edge:0.;
      float d=(shell*(.3+.7*strands)+filaments*.35+core*.9*(.5+.5*fbm3(flow*.15))+(1.-edge)*.012)*front;if(d<.01)return vec3(0.);
      float grain=detail?fbm3(flow*.2+3.):.5;
      return vec3(d*(.6+.4*grain),shell,grain);
    }

vec3 engulfDensity(vec3 p,bool detail,float time,vec3 origin,vec3 axis,float swallow){
      vec3 q=p-origin;float r=length(q);if(r<9.2)return vec3(0.);
      float along=dot(q,axis);vec3 perp=q-axis*along;float rp=length(perp);
      float shock=exp(-pow((r-11.2)/1.5,2.))*(1.-smoothstep(-.5,.1,along/r));
      float sheath=1.-smoothstep(9.4,13.,r);
      float wake=(1.-smoothstep(8.,15.,rp))*smoothstep(0.,6.,along)*(1.-smoothstep(12.,26.,along));
      float turb=fbm3(q*.25-axis*time*4.);
      float d=(shock*2.+sheath*.08+wake*.3)*(.4+.8*turb)*swallow;if(d<.01)return vec3(0.);
      float grain=detail?fbm3(q*.6-axis*time*6.+2.):.5;
      return vec3(d*(.6+.4*grain),shock,grain);
    }

vec3 funnelDensity(vec3 p,bool detail,float time,vec3 origin,vec4 shape,vec2 lean,float spread,float skirt){
      float h=(p.y-origin.y)/shape.z;if(h<0.||h>1.)return vec3(0.);
      vec2 q=p.xz-origin.xz-lean*h*h;float radius=length(q),angle=atan(q.y,q.x),R=funnelProfile(h,shape);
      float twist=angle-time*(2.4-h*1.5)-h*7.;
      vec3 n=vec3(cos(twist)*(1.+radius/R)*1.6,h*9.-time*.9,sin(twist)*(1.+radius/R)*1.6);
      float ragged=fbm3(n*1.25);
      float body=(1.-smoothstep(.72,1.,radius/(R*(.7+ragged*.55))))*smoothstep(0.,.015,h);
      float sub=0.;
      for(int k=0;k<3;k++){float ph=float(k)*2.0944+time*3.3;sub+=1.-smoothstep(0.,R*.22,length(q-vec2(cos(ph),sin(ph))*R*.95));}
      float d=body+sub*(1.-smoothstep(0.,.3,h))*spread*.8;
      float grain=detail&&d>.001?fbm3(n*3.3+11.):.5;
      d*=.6+.4*grain;
      float bowl=0.;
      if(h<.36&&skirt>0.){
        float spin=angle-time*1.5;vec2 qr=vec2(cos(spin),sin(spin))*radius;
        float lobes=detail?fbm3(vec3(qr*.11,h*20.)):.5;
        float low=1.-smoothstep(0.,.25*(.55+.9*lobes),h);
        float reach=R+skirt*low*(.8+.5*lobes);
        bowl=(1.-smoothstep(.3,1.,radius/reach))*low*(.5+.5*lobes)*1.1;}
      d+=bowl;return vec3(d,bowl/max(d,1e-3),grain);
    }

vec3 wallCloudDensity(vec3 p,bool detail,float time,vec3 origin,float radius,float thickness){
      vec2 q=p.xz-origin.xz;float radial=length(q)/radius;if(radial>1.)return vec3(0.);
      float h=(p.y-origin.y)/thickness,angle=atan(q.y,q.x),rot=angle-time*.12-radial*1.6;
      vec3 n=vec3(cos(rot)*radial*3.2,h*2.2+time*.04,sin(rot)*radial*3.2);
      float lumps=fbm3(n*1.3),under=.3-(1.-radial)*.22+(lumps-.5)*.3;
      float body=(1.-smoothstep(.5,1.,radial/(.55+lumps*.4)))*smoothstep(under,under+.15,h)*(1.-smoothstep(.75,1.05,h));
      if(detail&&body>.001)body*=.6+.4*fbm3(n*3.1+5.);
      return vec3(body,0.,0.);
    }

vec3 entryTrailDensity(vec3 p,bool detail,float time,vec3 origin,vec3 axis,float trailLength){
      vec3 q=p-origin;float s=dot(q,axis);if(s<0.||s>trailLength)return vec3(0.);
      vec3 perp=q-axis*s;float r=length(perp),f=s/trailLength,hot=1.-smoothstep(0.,.35,f);
      if(r>(1.5+f*5.5)*1.3)return vec3(0.);
      float wisp=fbm3(q*.35-axis*time*9.);
      float body=(1.-smoothstep(.4,1.,r/((1.5+f*5.5)*(.7+wisp*.6))))*(1.-smoothstep(.5,1.,f))*(.45+.55*hot);
      float grain=detail&&body>.001?fbm3(q*.9-axis*time*14.+3.):.5;
      return vec3(body*(.6+.4*grain),hot,grain);
    }

vec3 impactColumnDensity(vec3 p,bool detail,float time,vec3 origin,float height,float flare,float base,float fade,float heat){
      float h=(p.y-origin.y)/height;if(h<0.||h>1.)return vec3(0.);
      vec2 q=p.xz-origin.xz;float r=length(q),angle=atan(q.y,q.x);
      float cap=smoothstep(.62,.9,h)*(1.-smoothstep(.9,1.,h)),foot=1.-smoothstep(0.,.14,h),reach=10.+h*h*flare*.6+cap*flare+foot*base;
      if(r>reach*1.3)return vec3(0.);
      float boil=fbm3(vec3(cos(angle)*2.2,h*7.-time*2.8,sin(angle)*2.2));
      float R=reach*(.7+boil*.6);
      float body=(1.-smoothstep(.5,1.,r/R))*smoothstep(0.,.03,h)*(1.-smoothstep(.85,1.,h));
      float grain=detail&&body>.001?fbm3(vec3(q*.05,h*8.-time*2.2)+7.):.5;
      return vec3(body*(.55+.45*grain)*fade,heat*(1.-smoothstep(.1,.6,h)),grain);
    }

vec3 crestSprayDensity(vec3 p,bool detail,float time,vec3 origin){
      vec3 q=p-origin;float up=q.y-sin(p.x*.13+time)*1.2;if(up<-4.)return vec3(0.);
      vec2 back=vec2(max(up,0.),max(-q.z,0.));float along=dot(back,vec2(.75,.66)),off=abs(dot(back,vec2(-.66,.75)));
      float veil=(1.-smoothstep(.3,1.,off/(2.5+along*.4)))*(1.-smoothstep(8.,30.,along))*(1.-smoothstep(150.,190.,abs(p.x)));if(veil<.01)return vec3(0.);
      // Cheapest first: the low-frequency patches decide whether the wisps are worth sampling at all.
      float patches=smoothstep(.3,.7,noise3(vec3(p.x*.045+time*.25,along*.05,1.)));if(veil*patches<.01)return vec3(0.);
      float wisps=smoothstep(.4,.72,noise3(vec3(p.x*.12,along*.14-time*3.,q.z*.12+time*.8))*.65+noise3(vec3(p.x*.3,along*.35-time*5.,q.z*.3))*.35);
      float d=veil*patches*wisps;if(d<.005)return vec3(0.);
      float grain=detail?noise3(vec3(p.x*.25,up*.3-time*4.,q.z*.25)+5.):.5;
      return vec3(d*(.6+.4*grain),0.,grain);
    }

vec4 photosphereColor(vec3 point,vec3 viewNormal,vec3 viewDirection,float time,float phase,float activity,float radiance,vec3 site){vec3 p=normalize(point);float grain=fbm3(p*39.+vec3(0.,time*.12,0.));float churn=fbm3(p*17.-vec3(time*.05,0.,time*.03));
    float cells=noise3(p*83.+grain*2.);float spots=smoothstep(.63,.76,fbm3(p*8.));
    float limb=.48+.52*pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.35);
    vec3 color=mix(vec3(1.05,.16,.02),vec3(2.2,.95,.2),smoothstep(.22,.74,grain*.75+churn*.25));
    float region=pow(max(dot(p,site),0.),14.);float faculae=smoothstep(.42,.72,fbm3(p*15.+vec3(time*.25)))*region;
    color*=mix(.6,1.3,cells)*(1.-spots*.75)*limb;
    color+=vec3(2.2,1.2,.35)*activity*(region*.6+faculae*1.6)+vec3(.8,.45,.18)*phase*.3;
    return vec4(color*radiance,1.);}`;

export const programs = [{ name: 'createNodeFields', source: fieldSource }];

// Representative final material sources, including the particle-atlas patch.
// Replace/extend the registry by supplying the all-scenes collection to --registry.
export const registryRecords = [
  {
    "label": "photosphere",
    "vertexShader": "varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;varying vec3 worldNormal;\nvoid main(){point=position;vec4 mv=modelViewMatrix*vec4(position,1.);viewNormal=normalize(normalMatrix*normal);worldNormal=normalize(mat3(modelMatrix)*normal);viewDirection=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}",
    "fragmentShader": "uniform float time,phase,activity,radiance;uniform vec3 site;varying vec3 point;varying vec3 viewNormal;varying vec3 viewDirection;\nfloat hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\nfloat noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);\nreturn mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),\nmix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}\nfloat fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}\n    void main(){vec3 p=normalize(point);float grain=fbm(p*39.+vec3(0.,time*.12,0.));float churn=fbm(p*17.-vec3(time*.05,0.,time*.03));\n    float cells=noise(p*83.+grain*2.);float spots=smoothstep(.63,.76,fbm(p*8.));\n    float limb=.48+.52*pow(abs(dot(normalize(viewNormal),normalize(viewDirection))),.35);\n    vec3 color=mix(vec3(1.05,.16,.02),vec3(2.2,.95,.2),smoothstep(.22,.74,grain*.75+churn*.25));\n    float region=pow(max(dot(p,site),0.),14.);float faculae=smoothstep(.42,.72,fbm(p*15.+vec3(time*.25)))*region;\n    color*=mix(.6,1.3,cells)*(1.-spots*.75)*limb;\n    color+=vec3(2.2,1.2,.35)*activity*(region*.6+faculae*1.6)+vec3(.8,.45,.18)*phase*.3;\n    gl_FragColor=vec4(color*radiance,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
  },
  {
    "label": "particles",
    "vertexShader": "attribute vec4 seed;uniform float time,phase,pixelRatio;uniform vec3 origin,target;varying float opacity;varying float warmth;\n      varying float particleCell,particleAngle;\n\nvoid main(){float a=seed.x*6.283185;vec3 p;warmth=seed.z;\n      float d=fract(seed.y+time*.09);float reach=pow(d,.85)*104.;float spread=pow(d,.7)*(4.+seed.z*26.)*(1.+phase*.3);\n      vec3 u=normalize(cross(target,vec3(0.,1.,0.)));vec3 v=cross(target,u);float swirl=a+d*7.+time*.6;\n      p=origin+target*reach+(u*cos(swirl)+v*sin(swirl))*spread;\n      float arrived=1.-smoothstep((time-5.)*7.-8.,(time-5.)*7.,reach);\n      warmth=d;opacity=smoothstep(.01,.12,d)*(1.-smoothstep(.72,1.,d))*phase*arrived*(.5+.5*seed.w);\n      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+seed.w*3.)*pixelRatio*230./max(1.,-mv.z),1.,12.);\n      particleCell=4.+floor(min(seed.w,.999999)*4.);\n      particleAngle=seed.x*6.283185;\n      \n    }",
    "fragmentShader": "uniform vec3 tint;varying float opacity;varying float warmth;void particleFallback(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(tint,tint*vec3(1.2,.55,.25),warmth),pow(1.-r,2.)*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}\n\n\nuniform sampler2D opaqueDepth;\nuniform float opaqueDepthAvailable,opaqueNear,opaqueFar;\nuniform vec2 opaqueInverseSize;\nuniform mat4 opaqueProjectionInverse,opaqueCameraWorld;\nvec3 opaqueWorldPoint(vec2 uv,float depth){\n  vec4 view=opaqueProjectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);\n  return (opaqueCameraWorld*vec4(view.xyz/view.w,1.)).xyz;\n}\nuniform sampler2D particleAtlas;\nuniform float particleAtlasReady,particleSoftness;\nvarying float particleCell,particleAngle;\nfloat particleMask(){\n  vec2 p=gl_PointCoord-.5;\n  float c=cos(particleAngle),s=sin(particleAngle);\n  p=mat2(c,-s,s,c)*p+.5;\n  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return 0.;\n  // Half-texel inset and transparent cell gutters prevent neighboring shapes leaking at the edges.\n  vec2 cell=vec2(mod(particleCell,4.),3.-floor(particleCell/4.));\n  vec2 uv=(cell*256.+vec2(.5)+vec2(p.x,1.-p.y)*255.)/1024.;\n  return texture2D(particleAtlas,uv).r;\n}\nfloat particleViewDepth(float depth){return opaqueNear*opaqueFar/(opaqueFar-depth*(opaqueFar-opaqueNear));}\nfloat particleDepthFade(){\n  if(opaqueDepthAvailable<.5)return 1.;\n  float depth=texture2D(opaqueDepth,gl_FragCoord.xy*opaqueInverseSize).x;\n  if(depth>=1.)return 1.;\n  return smoothstep(0.,max(.001,particleSoftness),particleViewDepth(depth)-particleViewDepth(gl_FragCoord.z));\n}\nvoid main(){\n    if(particleAtlasReady>.5){gl_FragColor=vec4(mix(tint,tint*vec3(1.2,.55,.25),warmth),particleMask()*opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}\n    else{particleFallback();}\n    gl_FragColor.a*=particleDepthFade();\n  }"
  },
  {
    "label": "Corona volume",
    "vertexShader": "varying vec3 hullPoint;void main(){vec4 world=modelMatrix*vec4(position,1.);hullPoint=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}",
    "fragmentShader": "uniform float time,steps,inside,flash,fogDensity;uniform vec3 origin,sunDirection,sunColor,skyColor,fogColor,flashPoint;varying vec3 hullPoint;\n      \nfloat hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\nfloat noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);\nreturn mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),\nmix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}\nfloat fbm(vec3 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.11)*.15;}\nfloat terrain(vec2 xz){return -.5+(sin(xz.x*.022)*cos(xz.y*.027)*5.-sin(xz.y*.06)*1.5)*clamp((length(xz)-25.)/80.,0.,1.);}\n      \nuniform sampler2D opaqueDepth;\nuniform float opaqueDepthAvailable,opaqueNear,opaqueFar;\nuniform vec2 opaqueInverseSize;\nuniform mat4 opaqueProjectionInverse,opaqueCameraWorld;\nvec3 opaqueWorldPoint(vec2 uv,float depth){\n  vec4 view=opaqueProjectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);\n  return (opaqueCameraWorld*vec4(view.xyz/view.w,1.)).xyz;\n}\n      uniform float phase,activity;uniform vec3 site;\n      vec3 field(vec3 p,bool detail){\n      vec3 q=p-origin;float r=length(q);if(r<31.6||r>62.)return vec3(0.);\n      vec3 n=q/r;float fall=exp(-(r-31.6)*.18)*(1.-smoothstep(45.,62.,r));if(fall<.02)return vec3(0.);\n      float streamer=smoothstep(.55,.85,fbm(n*4.2+vec3(time*.03,0.,0.)));\n      float helmet=pow(max(dot(n,site),0.),6.)*(.6+activity*.8);\n      float d=fall*(.08+.92*streamer+helmet*.8);if(d<.01)return vec3(0.);\n      float wisp=detail?noise(n*11.+vec3(0.,0.,r*.14-time*.5)):.5;\n      return vec3(d*(.55+.45*wisp),helmet,wisp);\n    }\n      void main(){\n        vec3 rayDir=normalize(hullPoint-cameraPosition);\n        vec3 start=inside>.5?cameraPosition:hullPoint;\n        float span=inside>.5?length(hullPoint-cameraPosition):(70.);\n        if(opaqueDepthAvailable>.5){\n          vec2 uv=gl_FragCoord.xy*opaqueInverseSize;\n          float depth=texture2D(opaqueDepth,uv).x;\n          if(depth<1.)span=min(span,dot(opaqueWorldPoint(uv,depth)-start,rayDir));\n        }\n        if(span<=0.)discard;\n        // A per-pixel offset turns step slices into fine noise; it depends only on the pixel, so scrubbing stays exact.\n        float dt=clamp(span/steps,1.5,5.),s=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*dt;\n        float alpha=0.,firstHit=-1.;vec3 col=vec3(0.);\n        for(int i=0;i<32;i++){\n          if(float(i)>=steps||alpha>.97||s>span)break;\n          vec3 p=start+rayDir*s;\n          if(length(p-origin)<31.6)break;\n          vec3 f=field(p,true);\n          if(f.x>.002){\n            vec3 sampleColor;\n            sampleColor=mix(vec3(.9,.32,.08),vec3(1.25,.8,.35),f.z)*(.8+activity*.3+phase*.3+f.y*.5);\n            float a=1.-exp(-f.x*dt*.08);\n            col+=(1.-alpha)*a*sampleColor;alpha+=(1.-alpha)*a;\n            if(firstHit<0.)firstHit=s;\n            s+=dt;\n          } else s+=dt*1.7;\n        }\n        if(alpha<.003)discard;\n        float dist=length(start+rayDir*max(firstHit,0.)-cameraPosition);\n        gl_FragColor=vec4(mix(col/alpha,fogColor,1.-exp(-fogDensity*fogDensity*dist*dist)),alpha);\n        #include <tonemapping_fragment>\n        #include <colorspace_fragment>\n      }"
  },
  {
    "label": "explosion-atlas",
    "vertexShader": "varying vec2 puffUv;\n    void main(){\n      puffUv=uv;\n      vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);\n      mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));\n      gl_Position=projectionMatrix*mvPosition;\n    }",
    "fragmentShader": "uniform sampler2D atlas;uniform float frame,opacity,cell;varying vec2 puffUv;\n    vec4 sampleFrame(float index){\n      vec2 tile=vec2(mod(index,8.),3.-floor(index/8.));\n      vec2 uv=(tile+(puffUv*(cell-1.)+.5)/cell)/vec2(8.,4.);\n      vec4 texel=texture2D(atlas,uv);\n      return vec4(texel.rgb*texel.a,texel.a);\n    }\n    void main(){\n      vec4 puff=mix(sampleFrame(floor(frame)),sampleFrame(min(31.,floor(frame)+1.)),fract(frame));\n      if(puff.a<.003)discard;\n      gl_FragColor=vec4(puff.rgb/max(puff.a,.001),puff.a*opacity);\n      #include <tonemapping_fragment>\n      #include <colorspace_fragment>\n    }"
  }
];

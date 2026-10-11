/* FV360 Studio v2. Edición fotográfica / trazos no métricos sobre panorámicas. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const pano=$('panorama'),overlay=$('drawing'),viewer=$('viewer');
const ov=overlay.getContext('2d');
const CATEGORIES=[
 {id:'DC',name:'Corriente directa · C.D.',short:'C.D.',color:'#f04d4d',cad:'FV_DC'},
 {id:'AC',name:'Corriente alterna · C.A.',short:'C.A.',color:'#39aafa',cad:'FV_AC'},
 {id:'GROUND',name:'Tierra física',short:'Tierra',color:'#40cc8a',cad:'FV_TIERRA'},
 {id:'COMMS',name:'Comunicaciones / control',short:'Comunic.',color:'#c691fa',cad:'FV_COMUNIC'},
 {id:'TRAY',name:'Charola / bandeja',short:'Charola',color:'#f9b34c',cad:'FV_CHAROLA'},
 {id:'OTHER',name:'Otro / referencia',short:'Otro',color:'#e5e9ee',cad:'FV_OTROS'}
];
const PATTERNS=[
 {name:'Continua',dash:[]},{name:'Guion corto',dash:[7,5]},{name:'Guion largo',dash:[20,8]},
 {name:'Guion abierto',dash:[14,14]},{name:'Puntos finos',dash:[1,5]},
 {name:'Puntos separados',dash:[1,11]},{name:'Guion + punto',dash:[17,5,1,5]},
 {name:'Guion + 2 puntos',dash:[17,4,1,4,1,4]},{name:'Centro',dash:[25,5,6,5]},
 {name:'Oculta',dash:[5,4]},{name:'Fantasma',dash:[25,5,5,5,5,5]},{name:'Mixta',dash:[11,3,2,3]}
];
const visible=Object.fromEntries(CATEGORIES.map(c=>[c.id,true]));
let routes=[],activeRoute=null,selectedRoute=-1,selectedSegment=-1,selectedVertex=-1;
let mode='navigate',styleIndex=0,history=[],yaw=0,pitch=0,fov=78;
let image=new Image(),imageReady=false,imageWidth=0,imageHeight=0,currentSrc='',originalBlob=null,originalFilename='ejemplo_dji_360.jpg',flatMode=false;
let viewW=1,viewH=1,pointer=null,ghost=null,dirty=true,framePending=false,toastTimer;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),rad=180/Math.PI;
const category=id=>CATEGORIES.find(c=>c.id===id)||CATEGORIES[0];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
function mobileNotify(){window.dispatchEvent(new Event('fv360:changed'))}
function info(text,showToast=false){$('statusText').textContent=text;if(showToast){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500)}}
function snapshot(){history.push(JSON.stringify(routes));if(history.length>70)history.shift();mobileNotify()}
function vecNormalize(a){const l=Math.hypot(a.x,a.y,a.z)||1;return{x:a.x/l,y:a.y/l,z:a.z/l}}
function addv(a,b){return{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}}
function interp(a,b,t){if(flatMode&&(a.flat||b.flat)){const uv=p=>{if(p.flat)return p;const q=sphereProject(p,viewW,viewH);return q?{x:q.x/viewW,y:q.y/viewH}:{x:.5,y:.5}};const x=uv(a),y=uv(b);return{x:x.x*(1-t)+y.x*t,y:x.y*(1-t)+y.y*t,z:0,flat:true}}if(a.flat&&b.flat)return{x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,z:0,flat:true};return vecNormalize({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,z:a.z*(1-t)+b.z*t})}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function basis(){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);return{f:{x:sy*cp,y:sp,z:-cy*cp},r:{x:cy,y:0,z:sy},u:{x:-sy*sp,y:cp,z:cy*sp}}}
// Flat photographs use their own normalized image coordinates; panoramas keep the original 3D projection.
function flatRect(w,h){const iw=Math.max(1,imageWidth),ih=Math.max(1,imageHeight),scale=Math.min(w/iw,h/ih),rw=iw*scale,rh=ih*scale;return{x:(w-rw)/2,y:(h-rh)/2,w:rw,h:rh}}
function sphereDirAt(px,py){const b=basis(),t=Math.tan(fov*Math.PI/360),a=viewW/viewH,nx=(2*px/viewW-1)*t*a,ny=(1-2*py/viewH)*t;return vecNormalize({x:b.f.x+nx*b.r.x+ny*b.u.x,y:b.f.y+nx*b.r.y+ny*b.u.y,z:b.f.z+nx*b.r.z+ny*b.u.z})}
function dirAt(px,py){if(flatMode){const r=flatRect(viewW,viewH);if(px<r.x||py<r.y||px>r.x+r.w||py>r.y+r.h)return null;return{x:clamp((px-r.x)/r.w,0,1),y:clamp((py-r.y)/r.h,0,1),z:0,flat:true}}return sphereDirAt(px,py)}
function sphereProject(d,w,h){const b=basis(),t=Math.tan(fov*Math.PI/360),z=dot(d,b.f);if(z<.07)return null;const sx=dot(d,b.r)/(z*t*(w/h)),sy=dot(d,b.u)/(z*t);return{x:(sx+1)*w/2,y:(1-sy)*h/2,inside:Math.abs(sx)<1.1&&Math.abs(sy)<1.1}}
function project(d,w=viewW,h=viewH){if(!d)return null;if(!flatMode)return sphereProject(d,w,h);const rect=flatRect(w,h);let u=d.x,v=d.y;if(!d.flat){/* Older projects drew flat photos as stretched images: preserve approximate position. */const prev=sphereProject(d,w,h);if(!prev)return null;u=prev.x/w;v=prev.y/h;}return{x:rect.x+u*rect.w,y:rect.y+v*rect.h,inside:u>=0&&u<=1&&v>=0&&v<=1}}
function linePoints(a,b,w,h){if(flatMode)return[project(a,w,h),project(b,w,h)];const v=[];for(let i=0;i<=14;i++)v.push(project(interp(a,b,i/14),w,h));return v}
function pointDistance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy))}
function screenPoint(e){const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)*viewW/r.width,y:(e.clientY-r.top)*viewH/r.height}}
function dimensions(){const r=viewer.getBoundingClientRect();viewW=Math.max(1,r.width);viewH=Math.max(1,r.height);const dpr=Math.min(window.devicePixelRatio||1,2);const dw=Math.round(Math.min(3200,viewW*dpr)),dh=Math.round(Math.min(2300,viewH*dpr));if(pano.width!==dw||pano.height!==dh){pano.width=dw;pano.height=dh}if(overlay.width!==dw||overlay.height!==dh){overlay.width=dw;overlay.height=dh}ov.setTransform(dw/viewW,0,0,dh/viewH,0,0);dirty=true;queueFrame()}
// WebGL: sample directly from full-resolution source texture. No coarse pixel-grid rendering.
let gl=null,shaderProgram=null,uniforms={},texture=null,webglError='';
function compileShader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh}
function initWebGL(){try{
 gl=pano.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'})||pano.getContext('experimental-webgl',{alpha:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('WebGL no disponible en este navegador');
 const vertex=compileShader(gl.VERTEX_SHADER,`attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=(aPosition+1.0)*0.5;gl_Position=vec4(aPosition,0.0,1.0);}`);
 const fragment=compileShader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 vUv;uniform sampler2D uImage;uniform vec3 uFront;uniform vec3 uRight;uniform vec3 uUp;uniform float uTan;uniform float uAspect;uniform float uFlat;uniform vec2 uFlatScale;const float PI=3.14159265359;void main(){vec2 coord=vUv*2.0-1.0;if(uFlat>0.5){vec2 imageUv=(vUv-vec2(0.5))/uFlatScale+vec2(0.5);if(any(lessThan(imageUv,vec2(0.0)))||any(greaterThan(imageUv,vec2(1.0)))){gl_FragColor=vec4(0.05,0.06,0.075,1.0);return;}gl_FragColor=texture2D(uImage,imageUv);return;}vec3 ray=normalize(uFront+uRight*coord.x*uTan*uAspect+uUp*coord.y*uTan);float lon=atan(ray.x,-ray.z);float lat=asin(clamp(ray.y,-1.0,1.0));vec2 texCoord=vec2(fract(0.5+lon/(2.0*PI)),0.5+lat/PI);gl_FragColor=texture2D(uImage,texCoord);}`);
 shaderProgram=gl.createProgram();gl.attachShader(shaderProgram,vertex);gl.attachShader(shaderProgram,fragment);gl.linkProgram(shaderProgram);if(!gl.getProgramParameter(shaderProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(shaderProgram));gl.useProgram(shaderProgram);
 const vertices=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);const loc=gl.getAttribLocation(shaderProgram,'aPosition');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 for(const key of ['uImage','uFront','uRight','uUp','uTan','uAspect','uFlat','uFlatScale'])uniforms[key]=gl.getUniformLocation(shaderProgram,key);
 gl.uniform1i(uniforms.uImage,0);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(.02,.025,.035,1);
 return true;
 }catch(e){webglError=e.message;console.error('FV360 WebGL:',e);return false}}
function uploadTexture(){if(!gl)return;try{if(texture)gl.deleteTexture(texture);texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,(imageWidth&(imageWidth-1))?gl.CLAMP_TO_EDGE:gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);if(imageWidth&(imageWidth-1)||imageHeight&(imageHeight-1)){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)}else{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D)}}catch(e){console.error(e);info('No se pudo usar la fotografía como textura. '+e.message,true)}}
function renderPano(){if(!imageReady)return;if(!gl){const c=pano.getContext('2d');if(c){c.fillStyle='#181b20';c.fillRect(0,0,pano.width,pano.height);flatMode?(c.drawImage(image,flatRect(pano.width,pano.height).x,flatRect(pano.width,pano.height).y,flatRect(pano.width,pano.height).w,flatRect(pano.width,pano.height).h)):c.drawImage(image,0,0,pano.width,pano.height)}return}const b=basis();gl.viewport(0,0,pano.width,pano.height);gl.useProgram(shaderProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform3f(uniforms.uFront,b.f.x,b.f.y,b.f.z);gl.uniform3f(uniforms.uRight,b.r.x,b.r.y,b.r.z);gl.uniform3f(uniforms.uUp,b.u.x,b.u.y,b.u.z);gl.uniform1f(uniforms.uTan,Math.tan(fov*Math.PI/360));gl.uniform1f(uniforms.uAspect,pano.width/pano.height);gl.uniform1f(uniforms.uFlat,flatMode?1:0);const rect=flatRect(pano.width,pano.height);gl.uniform2f(uniforms.uFlatScale,rect.w/pano.width,rect.h/pano.height);gl.drawArrays(gl.TRIANGLES,0,6)}
function drawAnnotations(ctx,w,h,opts={}){
 const lines=opts.lines!==false,measures=opts.measures!==false,points=opts.points!==false,highlight=opts.highlight!==false;
 const scale=w/viewW;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.textAlign='center';ctx.textBaseline='middle';
 function routeDraw(r,index,drawing=false){if(!visible[r.category]||r.points.length<1)return;
 const width=(r.width||3)*scale;
 if(lines&&r.points.length>=2){for(let j=1;j<r.points.length;j++){
 const path=linePoints(r.points[j-1],r.points[j],w,h);ctx.beginPath();let started=false;for(const p of path){if(!p||Math.abs(p.x)>w*6||Math.abs(p.y)>h*6){started=false;continue}if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y)}
 ctx.lineWidth=width+(highlight&&index===selectedRoute&&j-1===selectedSegment?3*scale:0);ctx.strokeStyle=highlight&&index===selectedRoute&&j-1===selectedSegment?'#ffffff':r.color;ctx.setLineDash((PATTERNS[r.pattern||0]?.dash||[]).map(v=>v*scale));ctx.stroke();
 if(highlight&&index===selectedRoute&&j-1===selectedSegment){ctx.beginPath();started=false;for(const p of path){if(!p){started=false;continue}if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y)}ctx.lineWidth=width;ctx.strokeStyle=r.color;ctx.stroke()}
 }}ctx.setLineDash([]);
 if(measures){for(let j=1;j<r.points.length;j++){
 const len=r.lengths?.[j-1];if(len===null||len===undefined||!Number.isFinite(Number(len)))continue;
 const p=project(interp(r.points[j-1],r.points[j],.5),w,h);if(!p||p.x<0||p.x>w||p.y<0||p.y>h)continue;
 const fontSize=(r.labelSize||18)*scale;const y=p.y+(r.labelPosition==='below'?fontSize*1.15:r.labelPosition==='center'?0:-fontSize*.95);
 const txt=`${Number(len).toFixed(2)} m`;ctx.font=`700 ${fontSize}px Inter,Arial,sans-serif`;const metrics=ctx.measureText(txt),pad=7*scale,boxWidth=metrics.width+2*pad;
 ctx.fillStyle='rgba(16,19,23,.82)';ctx.beginPath();const x=p.x-boxWidth/2,by=y-fontSize*.76,bh=fontSize*1.45;if(ctx.roundRect)ctx.roundRect(x,by,boxWidth,bh,4*scale);else ctx.rect(x,by,boxWidth,bh);ctx.fill();ctx.fillStyle=r.labelColor||'#ffffff';ctx.fillText(txt,p.x,y)
 }}
 if(points&&(drawing||index===selectedRoute||opts.allPoints)){r.points.forEach((pt,j)=>{const p=project(pt,w,h);if(!p||!p.inside)return;ctx.beginPath();ctx.arc(p.x,p.y,(j===selectedVertex&&index===selectedRoute?9:5)*scale,0,Math.PI*2);ctx.fillStyle=j===selectedVertex&&index===selectedRoute?'#f0f3f8':'#171a1e';ctx.fill();ctx.lineWidth=2*scale;ctx.strokeStyle=drawing?'#ffffff':r.color;ctx.stroke();if(drawing&&j===0){ctx.beginPath();ctx.arc(p.x,p.y,12*scale,0,Math.PI*2);ctx.strokeStyle='#ffffff88';ctx.lineWidth=1.5*scale;ctx.stroke()}})}
 }
 routes.forEach((r,i)=>routeDraw(r,i));if(activeRoute&&opts.active!==false){routeDraw(activeRoute,-99,true);if(ghost&&activeRoute.points.length&&lines){const a=project(activeRoute.points.at(-1),w,h),b=project(ghost,w,h);if(a&&b){ctx.setLineDash([7*scale,5*scale]);ctx.strokeStyle='#f1f3f6aa';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([])}}}
 ctx.restore();
}
function queueFrame(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;if(dirty){renderPano();dirty=false}ov.clearRect(0,0,viewW,viewH);drawAnnotations(ov,viewW,viewH,{lines:$('showLines').checked,measures:$('showMeasurements').checked,points:$('showVertices').checked});$('heading').textContent='N '+String(Math.round((yaw*rad%360+360)%360)).padStart(3,'0')+'°';$('zoomText').textContent='FOV '+Math.round(fov)+'°'})}
function resetImage(src,name,blob){imageReady=false;$('viewerLoading').hidden=false;image=new Image();image.onload=()=>{imageReady=true;imageWidth=image.naturalWidth;imageHeight=image.naturalHeight;flatMode=Math.abs(imageWidth/imageHeight-2)>.2;if(flatMode)info('Foto convencional detectada: se presenta en vista frontal (sin navegación esférica).',true);$('photoPixels').textContent=imageWidth+' × '+imageHeight;uploadTexture();$('viewerLoading').hidden=true;dirty=true;queueFrame()};image.onerror=()=>{imageReady=false;$('viewerLoading').textContent='No se pudo abrir la fotografía. Selecciona Importar foto.';info('Error al cargar foto: '+name,true)};currentSrc=src;originalFilename=name;originalBlob=blob;image.src=src}
function currentStyle(){return{category:$('routeClass').value,color:$('lineColor').value,width:Number($('lineWidth').value),pattern:styleIndex,labelSize:Number($('labelSize').value),labelColor:$('labelColor').value,labelPosition:$('labelPosition').value}}
function routeNew(){return{id:Date.now()+'-'+Math.floor(Math.random()*100000),points:[],lengths:[],...currentStyle()}}
function setMode(value){mode=value;pointer=null;ghost=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===value));overlay.style.cursor=value==='draw'?'crosshair':value==='select'?'pointer':'grab';$('btnFinish').disabled=!(activeRoute&&activeRoute.points.length>=2);$('mobileFinish').hidden=value!=='draw';$('mobileFinish').disabled=!(activeRoute&&activeRoute.points.length>=2);$('drawInstruction').hidden=value!=='draw';$('hint').hidden=value==='draw';instruction();$('hint').textContent=value==='draw'?'Toca el primer punto, después cada cambio de dirección. Pulsa «Finalizar».':value==='select'?'Toca la línea para editar. Arrastra cualquiera de sus puntos para corregir el trazado.':'Arrastra la foto para girar. Rueda del mouse o usa + / − para acercarte.';queueFrame()}
function instruction(){const n=activeRoute?.points.length||0;$('instructionTitle').textContent=n===0?'PASO 1 · Marca el primer punto':'PASO '+(n+1)+' · Marca el siguiente punto';$('instructionBody').textContent=n===0?'Haz clic o toca el inicio del recorrido eléctrico.':'Toca cada cambio de dirección. Al terminar pulsa ✓ Finalizar.';$('instruction-dot')?.remove;$('btnFinish').disabled=n<2;$('mobileFinish').disabled=n<2}
function finish(){if(!activeRoute||activeRoute.points.length<2){if(activeRoute)info('Marca al menos dos puntos para terminar la línea.',true);return}snapshot();routes.push(activeRoute);selectedRoute=routes.length-1;selectedSegment=activeRoute.lengths.length-1;selectedVertex=-1;activeRoute=null;ghost=null;setMode('select');syncSelection();updateTotals();info('Trayectoria guardada. Toca un tramo para escribir su distancia real; puedes arrastrar los vértices para corregir.',true)}
function cancel(){activeRoute=null;ghost=null;setMode('navigate');info('Trazado en curso cancelado. Las rutas guardadas siguen intactas.')}
function getHit(p){let bestVert={d:Infinity,route:-1,vertex:-1},bestSeg={d:Infinity,route:-1,segment:-1};routes.forEach((r,i)=>{if(!visible[r.category])return;r.points.forEach((pt,j)=>{const q=project(pt);if(!q)return;const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bestVert.d)bestVert={d,route:i,vertex:j}});for(let j=1;j<r.points.length;j++){const path=linePoints(r.points[j-1],r.points[j],viewW,viewH);for(let k=1;k<path.length;k++){if(!path[k]||!path[k-1])continue;const d=pointDistance(p.x,p.y,path[k-1],path[k]);if(d<bestSeg.d)bestSeg={d,route:i,segment:j-1}}}});if(bestVert.d<19)return{type:'vertex',...bestVert};if(bestSeg.d<21)return{type:'segment',...bestSeg};return null}
function syncSelection(){if(selectedRoute<0||!routes[selectedRoute]){$('selectedDescriptor').textContent='Ningún tramo seleccionado';$('distance').value='';$('editHelp').textContent='Elige «Trazar línea» y toca el primer punto sobre la fotografía.';queueFrame();return}
 const r=routes[selectedRoute];$('routeClass').value=r.category;$('lineColor').value=r.color;$('colorHex').textContent=r.color.toUpperCase();$('lineWidth').value=String(r.width);$('labelSize').value=String(r.labelSize);$('labelColor').value=r.labelColor;$('labelPosition').value=r.labelPosition;styleIndex=r.pattern||0;markPattern();$('distance').value=selectedSegment>=0?(r.lengths[selectedSegment]??''):'';$('selectedDescriptor').textContent=`Ruta ${selectedRoute+1} · Tramo ${selectedSegment+1} / ${r.lengths.length}`+(selectedVertex>=0?` · Vértice ${selectedVertex+1}`:'');$('editHelp').textContent='Arrastra un punto blanco de la ruta en la foto para corregir su posición.';queueFrame()}
function markPattern(){document.querySelectorAll('.pattern').forEach((b,i)=>b.classList.toggle('active',i===styleIndex))}
function updateTotals(){mobileNotify();let total=0,segments=0,measured=0;const values={};CATEGORIES.forEach(c=>values[c.id]={meters:0,measured:0,pending:0,routes:0});allPhotoRoutes().forEach(({r})=>{const v=values[r.category]||values.OTHER;v.routes++;(r.lengths||[]).forEach(x=>{segments++;if(x!==null&&x!==undefined&&Number.isFinite(Number(x))&&Number(x)>=0){const m=Number(x);measured++;total+=m;v.meters+=m;v.measured++}else v.pending++})});$('metricRoutes').textContent=allPhotoRoutes().length;$('metricMeasured').textContent=measured+' / '+segments;$('metricTotal').innerHTML=total.toFixed(2)+' <small>m</small>';$('grandTotal').innerHTML=total.toFixed(2)+' <small>m</small>';$('totalsFooter').textContent=(segments-measured)+' tramos pendientes de medir · '+allPhotoRoutes().length+' rutas trazadas en '+photos.length+' fotos';
 $('totalRows').innerHTML=CATEGORIES.map(c=>`<div class="total-item"><span class="total-dot" style="background:${c.color}"></span><div><strong>${c.name}</strong><small>${values[c.id].measured} medidos · ${values[c.id].pending} pendientes · ${values[c.id].routes} rutas</small></div><span>${values[c.id].meters.toFixed(2)} m</span></div>`).join('');
 $('layerList').innerHTML=CATEGORIES.map(c=>`<div class="layer-item"><span class="layer-swatch" style="background:${c.color}"></span><span class="layer-name">${c.name}</span><span class="layer-length">${values[c.id].meters.toFixed(2)} m</span><input class="layer-toggle" data-layer="${c.id}" type="checkbox" ${visible[c.id]?'checked':''} aria-label="Mostrar ${c.name}"/></div>`).join('');document.querySelectorAll('[data-layer]').forEach(t=>t.onchange=()=>{visible[t.dataset.layer]=t.checked;queueFrame()});queueFrame()}
function removeSelected(){if(selectedRoute<0)return info('Selecciona primero una ruta que quieras borrar.',true);snapshot();routes.splice(selectedRoute,1);selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection();updateTotals();info('Ruta eliminada.',true)}
function undo(){if(activeRoute&&activeRoute.points.length){activeRoute.points.pop();if(activeRoute.lengths.length>=activeRoute.points.length)activeRoute.lengths.pop();if(!activeRoute.points.length)activeRoute=null;instruction();queueFrame();return}if(!history.length)return info('No hay más cambios para deshacer.',true);routes=JSON.parse(history.pop());selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection();updateTotals();info('Última modificación deshecha.')}
function addVertex(){if(selectedRoute<0||selectedSegment<0)return info('Selecciona primero un segmento.',true);const r=routes[selectedRoute],j=selectedSegment;const mid=interp(r.points[j],r.points[j+1],.5);snapshot();r.points.splice(j+1,0,mid);r.lengths.splice(j,1,null,null);selectedVertex=j+1;selectedSegment=j;syncSelection();updateTotals();info('Vértice añadido. Los dos nuevos tramos quedan pendientes de medir.',true)}
function removeVertex(){if(selectedRoute<0||selectedVertex<0)return info('Selecciona un punto de la ruta antes de quitarlo.',true);const r=routes[selectedRoute],j=selectedVertex;if(r.points.length<=2)return info('Una ruta necesita al menos dos puntos. Puedes borrar toda la ruta.',true);snapshot();r.points.splice(j,1);if(j===0)r.lengths.shift();else if(j>=r.points.length)r.lengths.pop();else r.lengths.splice(j-1,2,null);selectedVertex=-1;selectedSegment=Math.min(j,r.lengths.length-1);syncSelection();updateTotals();info('Vértice eliminado. Verifica las medidas de los tramos modificados.',true)}
function applyStyle(){const color=$('lineColor').value;$('colorHex').textContent=color.toUpperCase();if(selectedRoute<0){queueFrame();return}snapshot();Object.assign(routes[selectedRoute],currentStyle());updateTotals()}
function selectTab(id){document.querySelectorAll('[data-tab]').forEach(b=>{const sel=b.dataset.tab===id;b.classList.toggle('active',sel);b.setAttribute('aria-selected',String(sel))});document.querySelectorAll('[data-content]').forEach(el=>el.classList.toggle('active',el.dataset.content===id));}
function pointerDown(e){if(!imageReady)return;if(e.button!==undefined&&e.button!==0)return;e.preventDefault();const p=screenPoint(e);pointer={id:e.pointerId,lastX:p.x,lastY:p.y,startX:p.x,startY:p.y,mode,moved:false,hit:null,editing:false};overlay.setPointerCapture(e.pointerId);
 if(mode==='select'){
 const hit=getHit(p);pointer.hit=hit;if(hit){selectedRoute=hit.route;selectedVertex=hit.type==='vertex'?hit.vertex:-1;selectedSegment=hit.type==='segment'?hit.segment:Math.min(hit.vertex,routes[hit.route].lengths.length-1);syncSelection();if(hit.type==='vertex'){pointer.editing=true;pointer.snapshotted=false;overlay.style.cursor='grabbing'}}else{selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection()}}
}
function pointerMove(e){if(!imageReady)return;const p=screenPoint(e);if(!pointer||pointer.id!==e.pointerId){if(mode==='draw'&&activeRoute){ghost=dirAt(p.x,p.y);queueFrame()}return}
 const dx=p.x-pointer.lastX,dy=p.y-pointer.lastY;if(Math.hypot(p.x-pointer.startX,p.y-pointer.startY)>6)pointer.moved=true;
 if(pointer.mode==='navigate'&&pointer.moved&&!flatMode){yaw-=dx/viewH*1.36;pitch=clamp(pitch+dy/viewH*1.36,-1.52,1.52);dirty=true;queueFrame()}
 if(pointer.mode==='select'&&pointer.editing&&pointer.moved){if(!pointer.snapshotted){snapshot();pointer.snapshotted=true}const movedPoint=dirAt(p.x,p.y);if(movedPoint)routes[selectedRoute].points[selectedVertex]=movedPoint;queueFrame()}
 pointer.lastX=p.x;pointer.lastY=p.y;
}
function pointerUp(e){if(!pointer||pointer.id!==e.pointerId)return;const p=screenPoint(e);const move=pointer.moved;const original=pointer;pointer=null;try{overlay.releasePointerCapture(e.pointerId)}catch{}overlay.style.cursor=mode==='draw'?'crosshair':mode==='select'?'pointer':'grab';
 if(mode==='draw'&&!move){const newPoint=dirAt(p.x,p.y);if(!newPoint){info('Toca dentro de la fotografía para marcar el punto.',true);return}if(!activeRoute)activeRoute=routeNew();activeRoute.points.push(newPoint);if(activeRoute.points.length>=2)activeRoute.lengths.push(null);ghost=null;instruction();queueFrame();if(activeRoute.points.length===1)info('Primer punto marcado. Toca ahora el siguiente punto o cambio de dirección.',true);else info('Punto '+activeRoute.points.length+' colocado. Puedes añadir más o finalizar la ruta.')}
 if(original.mode==='navigate'&&move)mobileNotify();
 if(original.mode==='select'&&original.editing&&move){mobileNotify();info('Vértice reposicionado. Las medidas reales se conservaron; verifica si cambiaron en campo.',true)}
}
async function loadPhotoFile(file){if(file)await addPhotos([file])}
function slug(){return ($('projectName').value||'FV360').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').slice(0,70)}
function download(name,blobOrText,mime='application/octet-stream'){const blob=blobOrText instanceof Blob?blobOrText:new Blob([blobOrText],{type:mime});const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),12000)}
function canvasBlob(canvas,mime='image/png'){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo convertir la vista en una imagen.')),mime,1))}
// Fallback for PNG exports if GPU/WebGL isn't available: preserve the real photo.
function renderCPU(ctx,w,h){
 if(flatMode){ctx.fillStyle='#0c0f13';ctx.fillRect(0,0,w,h);const r=flatRect(w,h);ctx.drawImage(image,r.x,r.y,r.w,r.h);return}
 const src=document.createElement('canvas');src.width=Math.min(imageWidth,4096);src.height=Math.max(1,Math.round(src.width*imageHeight/imageWidth));
 const sourceCtx=src.getContext('2d',{willReadFrequently:true});sourceCtx.drawImage(image,0,0,src.width,src.height);
 const input=sourceCtx.getImageData(0,0,src.width,src.height).data,output=ctx.createImageData(w,h),dest=output.data;
 const b=basis(),tan=Math.tan(fov*Math.PI/360),asp=w/h,pi=Math.PI;
 for(let y=0;y<h;y++){
   const sy=(1-2*(y+.5)/h)*tan;
   for(let x=0;x<w;x++){
     const sx=(2*(x+.5)/w-1)*tan*asp;
     const xx=b.f.x+b.r.x*sx+b.u.x*sy,yy=b.f.y+b.r.y*sx+b.u.y*sy,zz=b.f.z+b.r.z*sx+b.u.z*sy;
     const length=Math.hypot(xx,yy,zz),lon=Math.atan2(xx,-zz),lat=Math.asin(clamp(yy/length,-1,1));
     const tx=((Math.round((.5+lon/(2*pi))*src.width)%src.width)+src.width)%src.width;
     const ty=clamp(Math.round((.5-lat/pi)*src.height),0,src.height-1);
     const a=(ty*src.width+tx)*4,c=(y*w+x)*4;
     dest[c]=input[a];dest[c+1]=input[a+1];dest[c+2]=input[a+2];dest[c+3]=255;
   }
 }
 ctx.putImageData(output,0,0);
}
async function composite(opts,forceWidth,forceHeight){if(!imageReady)throw Error('Primero carga una imagen 360°.');const target=forceWidth||Number($('exportResolution').value)||2560;let w=Math.min(target,gl?gl.getParameter(gl.MAX_RENDERBUFFER_SIZE):target),h=forceHeight?Math.max(1,Math.round(forceHeight*w/target)):Math.max(1,Math.round(w*viewH/viewW));if(flatMode&&!forceHeight){w=Math.min(w,imageWidth);h=Math.round(w*imageHeight/imageWidth);const cap=6144;if(h>cap){w=Math.round(w*cap/h);h=cap}}const origW=pano.width,origH=pano.height;
 const result=document.createElement('canvas');result.width=w;result.height=h;const ctx=result.getContext('2d',{alpha:false});
 try{if(flatMode){renderCPU(ctx,w,h)}else if(gl&&texture){pano.width=w;pano.height=h;renderPano();ctx.drawImage(pano,0,0,w,h)}else{try{renderCPU(ctx,w,h)}catch(err){console.warn('Render CPU no disponible',err);ctx.drawImage(image,0,0,w,h)}}if(opts.lines||opts.measures||opts.points){drawAnnotations(ctx,w,h,{lines:opts.lines,measures:opts.measures,points:opts.points,highlight:false,active:false,allPoints:true})}return result}finally{pano.width=origW;pano.height=origH;dirty=true;queueFrame()}}
async function exportPNG(clean=false,quick=false){if(!imageReady)return info('Carga una fotografía antes de exportar.',true);try{info('Preparando fotografía en alta resolución…');const opts=clean?{lines:false,measures:false,points:false}:quick?{lines:true,measures:$('showMeasurements').checked,points:false}:{lines:$('exportLines').checked,measures:$('exportMeasures').checked,points:$('exportPoints').checked};
 const c=await composite(opts);const b=await canvasBlob(c);download(slug()+(clean?'_sin_anotaciones':opts.measures?'_lineas_y_medidas':'_lineas_sin_medidas')+'.png',b,'image/png');info(`PNG exportado ${c.width} × ${c.height}, con fotografía y anotaciones seleccionadas.`,true)}catch(e){console.error(e);info('Error al exportar PNG: '+e.message,true)}}
function originalDownload(){if(originalBlob){download(originalFilename,originalBlob,originalBlob.type);return}const a=document.createElement('a');a.href=currentSrc;a.download=originalFilename;document.body.appendChild(a);a.click();a.remove();info('Descargando fotografía original sin modificar.',true)}
const csvCell=v=>'"'+String(v).replace(/"/g,'""')+'"';
function buildCsv(summary=false){const all=allPhotoRoutes(),rows=summary?[['Capa','Longitud medida (m)','Tramos medidos','Tramos pendientes','Rutas']]:[['Fotografía','Ruta','Capa','Tramo','Longitud real (m)','Estado']];if(summary){CATEGORIES.forEach(c=>{const rr=all.filter(x=>x.r.category===c.id).map(x=>x.r),lens=rr.flatMap(r=>r.lengths||[]);rows.push([c.name,lens.reduce((a,v)=>a+(v!=null?Number(v):0),0).toFixed(2),lens.filter(v=>v!=null).length,lens.filter(v=>v==null).length,rr.length])})}else all.forEach(({r,photo})=>(r.lengths||[]).forEach((v,j)=>rows.push([photo.name,photo.routes.indexOf(r)+1,category(r.category).name,j+1,v??'',v!=null?'MEDIDO':'PENDIENTE'])));return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')}
function exportDXF(){return exportCAD()}
async function saveProject(){return saveProjectZip()}
async function openProject(file){return loadProjectV3(file)}
async function report(){return reportMultipage()}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
/* FV360 v3: fotografías por proyecto, vistas guardadas y reporte multipágina. */
let photos=[],currentPhotoId=null,reportViews=[],idSerial=1,previewQueue=Promise.resolve();
const newId=prefix=>prefix+'_'+Date.now().toString(36)+'_'+(idSerial++);
const photoById=id=>photos.find(p=>p.id===id);
function persistPhoto(){const p=photoById(currentPhotoId);if(!p)return;p.routes=routes;p.orientation={yaw,pitch,fov};p.caption=$('viewName').value||p.caption}
function allPhotoRoutes(){persistPhoto();return photos.flatMap(p=>(p.routes||[]).map(r=>({r,photo:p}))) }
function photoType(p){return p.width&&p.height&&Math.abs(p.width/p.height-2)<.2?'360°':'frontal'}
function esc(s){return escapeHTML(s??'')}
function renderPhotos(){mobileNotify();const el=$('photoList');if(!el)return;el.innerHTML=photos.map(p=>`<div class="collection-card ${p.id===currentPhotoId?'active-card':''}"><img class="collection-thumb" src="${p.src}" alt="${esc(p.name)}"><div class="collection-details"><div class="collection-title">${esc(p.caption)}</div><div class="collection-subtitle">${esc(p.name)} · ${photoType(p)} · ${p.width||'?'}×${p.height||'?'}</div><div class="collection-actions"><button type="button" data-open-photo="${p.id}">Abrir y dibujar</button><button type="button" data-remove-photo="${p.id}" class="danger" ${photos.length===1?'disabled':''}>Eliminar</button></div></div></div>`).join('');el.querySelectorAll('[data-open-photo]').forEach(b=>b.onclick=()=>switchPhoto(b.dataset.openPhoto));el.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>removePhoto(b.dataset.removePhoto));}
function renderReportViews(){
 mobileNotify();
 const el=$('reportList');if(!el)return;$('reportCount').textContent=`${reportViews.length} lámina${reportViews.length===1?'':'s'} en el reporte`;
 el.innerHTML=reportViews.map((v,i)=>{const p=photoById(v.photoId);return `<div class="collection-card report-card"><img class="collection-thumb" src="${v.thumb||(p?p.src:'')}" alt="Lámina ${i+1}"><div class="collection-details"><div class="collection-subtitle">LÁMINA ${String(i+1).padStart(2,'0')} · ${esc(p?.name||'')}</div><div class="collection-title">${esc(v.title||'Vista')}</div><div class="mini-switches"><label class="cad-check"><input type="checkbox" data-report-lines="${v.id}" ${v.lines?'checked':''}> Trazos</label><label class="cad-check"><input type="checkbox" data-report-measures="${v.id}" ${v.measures?'checked':''}> Números</label></div><div class="collection-actions"><button data-edit-view="${v.id}">✎ Editar foto</button><button data-download-view="${v.id}">⬇ PNG</button><button data-open-view="${v.id}">Ver en 360°</button><button data-move-up="${v.id}" ${i===0?'disabled':''}>↑</button><button data-move-down="${v.id}" ${i===reportViews.length-1?'disabled':''}>↓</button><button data-remove-view="${v.id}" class="danger">×</button></div></div></div>`}).join('');
 el.querySelectorAll('[data-report-lines]').forEach(b=>b.onchange=()=>{const v=reportViews.find(v=>v.id===b.dataset.reportLines);if(v)v.lines=b.checked});
 el.querySelectorAll('[data-report-measures]').forEach(b=>b.onchange=()=>{const v=reportViews.find(v=>v.id===b.dataset.reportMeasures);if(v)v.measures=b.checked});
 el.querySelectorAll('[data-edit-view]').forEach(b=>b.onclick=()=>openSheetEditor(b.dataset.editView));
 el.querySelectorAll('[data-download-view]').forEach(b=>b.onclick=()=>downloadSheet(b.dataset.downloadView));
 el.querySelectorAll('[data-open-view]').forEach(b=>b.onclick=()=>openReportView(b.dataset.openView));
 el.querySelectorAll('[data-remove-view]').forEach(b=>b.onclick=()=>{reportViews=reportViews.filter(v=>v.id!==b.dataset.removeView);renderReportViews();info('Lámina retirada del reporte; las fotografías y los trazos siguen guardados.',true)});
 const reorder=(id,delta)=>{const i=reportViews.findIndex(v=>v.id===id),j=i+delta;if(j<0||j>=reportViews.length)return;[reportViews[i],reportViews[j]]=[reportViews[j],reportViews[i]];renderReportViews()};
 el.querySelectorAll('[data-move-up]').forEach(b=>b.onclick=()=>reorder(b.dataset.moveUp,-1));el.querySelectorAll('[data-move-down]').forEach(b=>b.onclick=()=>reorder(b.dataset.moveDown,1));
}
function makeReportPreview(v){
 previewQueue=previewQueue.then(async()=>{
  const p=photoById(v.photoId);if(!p||!reportViews.some(item=>item.id===v.id))return;
  let im=p.img;if(!im||!im.complete||!im.naturalWidth){im=await new Promise((res,rej)=>{const x=new Image();x.onload=()=>res(x);x.onerror=rej;x.src=p.src});p.img=im;p.width=im.naturalWidth;p.height=im.naturalHeight}
  const w=360,h=203,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});
  if(Math.abs(im.naturalWidth/im.naturalHeight-2)>.2){(ctx.fillStyle='#16191d',ctx.fillRect(0,0,w,h),(()=>{const scale=Math.min(w/im.naturalWidth,h/im.naturalHeight),fw=im.naturalWidth*scale,fh=im.naturalHeight*scale;ctx.drawImage(im,(w-fw)/2,(h-fh)/2,fw,fh)})())}else{
   const inputCanvas=document.createElement('canvas');inputCanvas.width=Math.min(im.naturalWidth,4096);inputCanvas.height=Math.round(inputCanvas.width*im.naturalHeight/im.naturalWidth);const ic=inputCanvas.getContext('2d',{willReadFrequently:true});ic.drawImage(im,0,0,inputCanvas.width,inputCanvas.height);
   const input=ic.getImageData(0,0,inputCanvas.width,inputCanvas.height).data,out=ctx.createImageData(w,h),dst=out.data;
   const cy=Math.cos(v.yaw),sy=Math.sin(v.yaw),cp=Math.cos(v.pitch),sp=Math.sin(v.pitch);
   const front={x:sy*cp,y:sp,z:-cy*cp},right={x:cy,y:0,z:sy},up={x:-sy*sp,y:cp,z:cy*sp},tan=Math.tan(v.fov*Math.PI/360),asp=w/h;
   for(let iy=0;iy<h;iy++){const v0=(1-2*(iy+.5)/h)*tan;for(let ix=0;ix<w;ix++){const u0=(2*(ix+.5)/w-1)*tan*asp,px=front.x+right.x*u0+up.x*v0,py=front.y+right.y*u0+up.y*v0,pz=front.z+right.z*u0+up.z*v0;const lon=Math.atan2(px,-pz),lat=Math.asin(clamp(py/Math.hypot(px,py,pz),-1,1)),sx=((Math.round((.5+lon/(Math.PI*2))*inputCanvas.width)%inputCanvas.width)+inputCanvas.width)%inputCanvas.width,sy=clamp(Math.round((.5-lat/Math.PI)*inputCanvas.height),0,inputCanvas.height-1),idx=(sy*inputCanvas.width+sx)*4,d=(iy*w+ix)*4;dst[d]=input[idx];dst[d+1]=input[idx+1];dst[d+2]=input[idx+2];dst[d+3]=255}}
   ctx.putImageData(out,0,0)
  }
  v.thumb=c.toDataURL('image/jpeg',.78);renderReportViews();
 }).catch(e=>console.warn('Miniatura FV360:',e));return previewQueue
}
function createReportView(p,automatic=false){persistPhoto();const nth=reportViews.length+1;const v={id:newId('vista'),photoId:p.id,title:automatic?(p.caption||'Fotografía '+nth):($('viewName').value.trim()||'Vista '+nth),notes:'',yaw:p.id===currentPhotoId?yaw:(p.orientation?.yaw??0),pitch:p.id===currentPhotoId?pitch:(p.orientation?.pitch??0),fov:p.id===currentPhotoId?fov:(p.orientation?.fov??78),lines:true,measures:$('showMeasurements').checked,ratio:p.width&&p.height&&p.height>p.width?'3:4':'16:9',scale:100,offsetX:0,offsetY:0};reportViews.push(v);renderReportViews();makeReportPreview(v);return v}
function saveCurrentView(){const p=photoById(currentPhotoId);if(!p)return info('Primero añade una fotografía al proyecto.',true);const v=createReportView(p);selectTab('report');info('Vista '+reportViews.length+' guardada. Cambia el título y ordénala en el reporte.',true);return v}
function switchPhoto(id){if(id===currentPhotoId)return;const p=photoById(id);if(!p)return;persistPhoto();currentPhotoId=id;routes=p.routes||[];yaw=p.orientation?.yaw??0;pitch=p.orientation?.pitch??0;fov=p.orientation?.fov??78;history=[];activeRoute=null;selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;$('viewName').value=p.caption||p.name;resetImage(p.src,p.name,p.blob||null);setMode('navigate');syncSelection();updateTotals();renderPhotos();info('Fotografía activa: '+p.name,true)}
function openReportView(id){const v=reportViews.find(v=>v.id===id);if(!v)return;switchPhoto(v.photoId);yaw=v.yaw;pitch=v.pitch;fov=v.fov;$('viewName').value=v.title;dirty=true;queueFrame();info('Encuadre del reporte recuperado. Los trazos son los actuales de esta fotografía.',true)}
function removePhoto(id){if(photos.length<=1)return info('Conserva al menos una foto en el proyecto.',true);const p=photoById(id);if(!p)return;if(!confirm(`¿Eliminar «${p.name}» y sus ${p.routes.length} rutas del proyecto? También se quitarán sus vistas del reporte.`))return;const wasActive=id===currentPhotoId;photos=photos.filter(p=>p.id!==id);reportViews=reportViews.filter(v=>v.photoId!==id);if(wasActive){currentPhotoId=null;switchPhoto(photos[0].id)}if(p.blob&&p.src.startsWith('blob:'))URL.revokeObjectURL(p.src);renderPhotos();renderReportViews();updateTotals()}
async function addPhotos(files){const chosen=Array.from(files||[]).filter(f=>f.type.startsWith('image/'));if(!chosen.length)return info('Elige fotografías JPG, PNG o WEBP.',true);let firstId=null;for(const f of chosen){const p={id:newId('foto'),name:f.name,caption:f.name.replace(/\.[^.]+$/,''),src:URL.createObjectURL(f),blob:f,routes:[],orientation:{yaw:0,pitch:0,fov:78},width:0,height:0,img:null};photos.push(p);if(!firstId)firstId=p.id;const im=new Image();im.onload=()=>{p.img=im;p.width=im.naturalWidth;p.height=im.naturalHeight;if(p.height>p.width){reportViews.filter(v=>v.photoId===p.id&&v.ratio==='16:9').forEach(v=>{v.ratio='3:4';makeReportPreview(v)})}renderPhotos()};im.src=p.src;createReportView(p,true)}switchPhoto(firstId);renderPhotos();renderReportViews();selectTab('photos');info(chosen.length+' fotografía(s) añadida(s) al proyecto y al reporte.',true)}
async function setFramePhoto(v){const p=photoById(v.photoId);if(!p)throw Error('Fotografía no encontrada para '+v.title);if(!p.img||!p.img.complete||!p.img.naturalWidth){p.img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('No se pudo leer '+p.name));i.src=p.src})}image=p.img;imageReady=true;imageWidth=p.img.naturalWidth;imageHeight=p.img.naturalHeight;flatMode=Math.abs(imageWidth/imageHeight-2)>.2;routes=p.routes||[];yaw=v.yaw;pitch=v.pitch;fov=v.fov;uploadTexture();return p}
async function frameForView(v,{lines=v.lines,measures=v.measures,width=1920,height=1080}={}){persistPhoto();const old={image,imageReady,imageWidth,imageHeight,flatMode,routes,yaw,pitch,fov};try{await setFramePhoto(v);return await composite({lines,measures,points:false},width,height)}finally{image=old.image;imageReady=old.imageReady;imageWidth=old.imageWidth;imageHeight=old.imageHeight;flatMode=old.flatMode;routes=old.routes;yaw=old.yaw;pitch=old.pitch;fov=old.fov;uploadTexture();dirty=true;queueFrame()}}
function layerSummaries(){const result=Object.fromEntries(CATEGORIES.map(c=>[c.id,{total:0,measured:0,pending:0}]));allPhotoRoutes().forEach(({r})=>(r.lengths||[]).forEach(v=>{const o=result[r.category]||result.OTHER;if(v==null||!Number.isFinite(Number(v)))o.pending++;else{o.total+=Number(v);o.measured++}}));return result}
function cleanTitle(s){return String(s||'Vista').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'').replace(/[\r\n]/g,' ').slice(0,65)||'Vista'}
// Cadena DXF generada a partir de plantillas R2010 previamente validadas con ezdxf.
// Cada imagen es IMAGE raster enlazada, y cada tramo es LINE/TEXT en capas CAD editables.
function cadGeometry(view,index){const startX=20+(index%2)*345,topY=-(Math.floor(index/2)*235),width=320,height=180;
 const srcW=1920,srcH=1080,result=[];let handleBase=0xf00000+index*0x100000;
 const push=(...parts)=>result.push(...parts.map(String));const code=n=>String(n).padStart(3,' ');
 const pointXY=p=>[startX+width*p.x/srcW,topY-height*p.y/srcH];
 function segmentClipped(a,b){let t0=0,t1=1,dx=b.x-a.x,dy=b.y-a.y;for(const [p,q] of [[-dx,a.x],[dx,srcW-a.x],[-dy,a.y],[dy,srcH-a.y]]){if(!p){if(q<0)return null;continue}const r=q/p;if(p<0){if(r>t1)return null;if(r>t0)t0=r}else{if(r<t0)return null;if(r<t1)t1=r}}return[{x:a.x+t0*dx,y:a.y+t0*dy},{x:a.x+t1*dx,y:a.y+t1*dy}]}
 function line(a,b,cat,r){const [ax,ay]=pointXY(a),[bx,by]=pointXY(b);let col=parseInt(String(r.color||cat.color).slice(1),16);if(!Number.isFinite(col))col=16777215;
 push('  0','LINE','  5',(handleBase++).toString(16).toUpperCase(),'330','17','100','AcDbEntity','  8',cat.cad,'  6',r.pattern?'FV_PATRON_'+r.pattern:'CONTINUOUS','420',col,'370',r.width>=8?70:r.width>=5?50:r.width>=3?35:18,'100','AcDbLine',' 10',ax.toFixed(5),' 20',ay.toFixed(5),' 30','0.0',' 11',bx.toFixed(5),' 21',by.toFixed(5),' 31','0.0')}
 function text(p,label,r){const [x,y]=pointXY(p);const col=parseInt(String(r.labelColor||'#ffffff').slice(1),16)||16777215;push('  0','TEXT','  5',(handleBase++).toString(16).toUpperCase(),'330','17','100','AcDbEntity','  8','FV_COTAS','420',col,'100','AcDbText',' 10',x.toFixed(5),' 20',(y+3).toFixed(5),' 30','0.0',' 40','3.5','  1',cleanTitle(label))}
 routes.forEach(r=>{if(!visible[r.category]||r.points?.length<2)return;for(let j=1;j<r.points.length;j++){if(view.lines){const pts=linePoints(r.points[j-1],r.points[j],srcW,srcH);for(let k=1;k<pts.length;k++){if(!pts[k-1]||!pts[k])continue;const clip=segmentClipped(pts[k-1],pts[k]);if(clip)line(clip[0],clip[1],category(r.category),r)}}const len=r.lengths?.[j-1];if(view.measures&&len!==undefined&&len!==null&&Number.isFinite(Number(len))){const p=project(interp(r.points[j-1],r.points[j],.5),srcW,srcH);if(p&&p.x>0&&p.x<srcW&&p.y>0&&p.y<srcH)text(p,Number(len).toFixed(2)+' m',r)}}});return result.join('\n')+'\n'}
function injectCAD(template,drawings){const marker='  0\nENDSEC\n  0\nSECTION\n  2\nOBJECTS\n';const index=template.indexOf(marker);if(index<0)throw Error('Plantilla DXF sin sección OBJECTS');return template.slice(0,index)+drawings+template.slice(index)}
async function exportCAD(){if(!reportViews.length)return info('Guarda al menos una vista en la pestaña Reporte.',true);if(reportViews.length>24)return info('Por ahora, exporta hasta 24 vistas por paquete CAD.',true);await previewQueue;info('Preparando DXF con fotografías vinculadas…',true);$('btnDXF').disabled=true;try{persistPhoto();const images=[],annotated=[];let vectors='';for(let i=0;i<reportViews.length;i++){const v=reportViews[i];const clean=await frameForView(v,{lines:false,measures:false,width:1920,height:1080});const raw=await canvasBlob(clean);images.push({name:`imagenes/VISTA_${String(i+1).padStart(2,'0')}.png`,data:raw});const marked=await frameForView(v,{lines:v.lines,measures:v.measures,width:1920,height:1080});annotated.push({name:`vistas_anotadas/VISTA_${String(i+1).padStart(2,'0')}.png`,data:await canvasBlob(marked)});
const state={image,imageReady,imageWidth,imageHeight,flatMode,routes,yaw,pitch,fov};try{await setFramePhoto(v);vectors+=cadGeometry(v,i)}finally{image=state.image;imageReady=state.imageReady;imageWidth=state.imageWidth;imageHeight=state.imageHeight;flatMode=state.flatMode;routes=state.routes;yaw=state.yaw;pitch=state.pitch;fov=state.fov;uploadTexture();dirty=true;queueFrame()}}
 const template=window.FV_DXF_TEMPLATES?.[String(reportViews.length)];if(!template)throw Error('La plantilla CAD no está disponible');let dxf=injectCAD(template,vectors);reportViews.forEach((v,i)=>{dxf=dxf.replace(`TITULO_${String(i+1).padStart(2,'0')}`,cleanTitle(v.title))});
 const instructions=`FV360 Studio v3 - PAQUETE CAD\r\n\r\n1. EXTRAER TODO el contenido del ZIP en una misma carpeta.\r\n2. Abrir FV360_REPORTE.dxf en AutoCAD 2010 o posterior.\r\n3. Mantener la carpeta imagenes/ junto al DXF; las fotografias son referencias raster relativas.\r\n4. Si AutoCAD no encuentra la imagen, revisar referencias externas o la ruta de busqueda.\r\n5. Las fotografias y polilineas no estan a escala geometrica; las cifras son mediciones de campo.\r\n6. Las capas FV_DC/FV_AC/... contienen las lineas editables; FV_COTAS contiene las medidas.\r\n7. Las imagenes de vistas_anotadas/ ya tienen dibujos incorporados y sirven para reportes.\r\n8. Las imagenes del DXF son limpias, y el CAD dibuja encima elementos separados editables.\r\n\r\nOrden del reporte: dos vistas por fila.\r\n`;
 const manifest=reportViews.map((v,i)=>`${String(i+1).padStart(2,'0')} - ${v.title} | ${photoById(v.photoId)?.name||''} | lineas=${v.lines} | cotas=${v.measures}`).join('\r\n');
 const pkg=await FVZip.build([{name:'FV360_REPORTE.dxf',data:dxf},...images,...annotated,{name:'LEEME_CAD.txt',data:instructions+manifest}]);download(slug()+'_CAD_con_fotos.zip',pkg,'application/zip');info(`CAD exportado con ${reportViews.length} vista(s), imágenes vinculadas y trazos editables. Extrae todo el ZIP.`,true)
 }catch(e){console.error('Error CAD',e);info('No fue posible exportar CAD: '+e.message,true)}finally{$('btnDXF').disabled=false;persistPhoto();dirty=true;queueFrame()}}
async function reportMultipage(){return exportPhotoPDF()}
async function saveProjectZip(){try{persistPhoto();const meta={app:'FV360 Studio',version:5,project:$('projectName').value,technician:$('technicianName').value,reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,photos:[],reportViews};const files=[];for(let i=0;i<photos.length;i++){const p=photos[i],ext=(p.name.match(/\.(jpe?g|png|webp)$/i)?.[1]||'jpg').toLowerCase(),name=`fotos/FOTO_${String(i+1).padStart(2,'0')}.${ext}`;meta.photos.push({id:p.id,name:p.name,caption:p.caption,orientation:p.orientation,routes:p.routes,asset:name});files.push({name,data:p.blob||await (await fetch(p.src)).blob()})}files.unshift({name:'proyecto.json',data:JSON.stringify(meta,null,2)});download(slug()+'_PROYECTO.fv360.zip',await FVZip.build(files),'application/zip');info('Proyecto completo guardado en ZIP con todas las fotos, trazos y vistas.',true)}catch(e){console.error(e);info('No se pudo guardar el proyecto: '+e.message,true)}}
// Respaldo JSON autosuficiente: incluye fotos originales en base64, rutas y láminas.
// Puede ser grande si hay muchas fotografías. Para proyectos muy grandes también existe el ZIP.
async function photoDataURL(p){
 if(typeof p.src==='string'&&p.src.startsWith('data:image/'))return p.src;
 const blob=p.blob||await (await fetch(p.src)).blob();
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer '+p.name));reader.readAsDataURL(blob)});
}
async function saveProjectJSON(){
 try{
  const name=slug()+'_'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'_PROYECTO_COMPLETO.json';
  // Mostrar el selector de carpeta antes de procesar fotografías pesadas (gesto del usuario).
  const handle=window.FV360FileSave?await window.FV360FileSave.prepare(name):null;
  if(handle===false)return;
  persistPhoto();info('Preparando JSON con fotografías originales…',true);
  const metadata={app:'FV360 Studio',version:5,format:'FV360_JSON_AUTOSUFICIENTE',savedAt:new Date().toISOString(),project:$('projectName').value,
   reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,technician:$('technicianName').value,photos:[],reportViews:JSON.parse(JSON.stringify(reportViews))};
  for(const p of photos){metadata.photos.push({id:p.id,name:p.name,caption:p.caption,orientation:p.orientation,
   routes:JSON.parse(JSON.stringify(p.routes)),inlineData:await photoDataURL(p)});}
  const json=JSON.stringify(metadata,null,2);
  const payload=new Blob([json],{type:'application/json;charset=utf-8'});
  const result=window.FV360FileSave?await window.FV360FileSave.save(name,payload,handle):(download(name,payload,'application/json'),{mode:'download'});
  if(result?.cancelled){info('Exportación JSON cancelada. El proyecto local no ha cambiado.',true);return}
  window.dispatchEvent(new CustomEvent('fv360:file-exported',{detail:{format:'json',name,project:$('projectName').value,method:result?.mode||'download'}}));
  info(result?.mode==='file-picker'?'Archivo JSON guardado en la carpeta elegida.':result?.mode==='share'?'JSON enviado a la opción Compartir. Comprueba la carpeta elegida.':'JSON preparado para descargar. Comprueba Descargas o la carpeta elegida por tu navegador.',true);
 }catch(e){console.error('Error guardando JSON:',e);info('No se pudo guardar JSON: '+e.message,true)}
}
async function loadProjectV3(file){try{let metadata,assets=null;if(file.name.toLowerCase().endsWith('.zip')){assets=await FVZip.read(file);const json=assets.get('proyecto.json');if(!json)throw Error('El ZIP no contiene proyecto.json');metadata=JSON.parse(await json.text())}else metadata=JSON.parse(await file.text());if(metadata.version===2){const src=metadata.photoData||(metadata.photoIsDemo?window.FV_DEMO_DATA:null);if(!src)throw Error('El proyecto v2 necesita su fotografía original.');metadata={version:3,project:metadata.project,reportViews:[],photos:[{id:newId('foto'),name:metadata.photoName||'foto.jpg',caption:metadata.view||'Vista importada',orientation:metadata.orientation||{yaw:0,pitch:0,fov:78},routes:metadata.routes||[],inlineData:src}]};metadata.reportViews=[{id:newId('vista'),photoId:metadata.photos[0].id,title:metadata.view||'Vista importada',notes:'',...metadata.orientation,lines:true,measures:true}]}
 if(![3,4,5].includes(metadata.version)||!Array.isArray(metadata.photos)||!metadata.photos.length)throw Error('Archivo de proyecto no compatible.');const newPhotos=[];for(const p of metadata.photos){let blob=null,src=p.inlineData;if(assets){blob=assets.get(p.asset);if(!blob)throw Error('Falta fotografía '+p.asset);src=URL.createObjectURL(blob)}if(!src)throw Error('No está incluida la foto '+p.name);newPhotos.push({id:p.id,name:p.name,caption:p.caption||p.name,src,blob,routes:p.routes||[],orientation:p.orientation||{yaw:0,pitch:0,fov:78},width:0,height:0,img:null})}
 photos.forEach(p=>{if(p.blob&&p.src.startsWith('blob:'))URL.revokeObjectURL(p.src)});photos=newPhotos;reportViews=metadata.reportViews||[];currentPhotoId=null;$('projectName').value=metadata.project||'Nuevo proyecto';$('reportSubtitle').value=metadata.reportSubtitle||'Levantamiento fotovoltaico';$('reportNotes').value=metadata.reportNotes||'';$('technicianName').value=metadata.technician||'';switchPhoto(photos[0].id);renderPhotos();renderReportViews();reportViews.forEach(v=>makeReportPreview(v));selectTab('report');mobileNotify();window.dispatchEvent(new CustomEvent('fv360:project-imported',{detail:{filename:file.name,project:$('projectName').value}}));info('Proyecto cargado con '+photos.length+' fotografías y '+reportViews.length+' vistas.',true);return true
 }catch(e){console.error(e);info('Error al abrir proyecto: '+e.message,true);return false}}

/* FV360 v4 — reporte visual, control de encuadre y tabla CAD. */
const sheetRatio=(v)=>{const [a,b]=String(v.ratio||'16:9').split(':').map(Number);return a>0&&b>0?a/b:16/9};
const sheetWidth=()=>Number($('reportQuality').value)||3840;
const sheetNumber=index=>String(index+1).padStart(2,'0');
let currentEditId=null,editorTimer=null,editorGeneration=0,reportBusy=false;
function sheetLayout(v){return{zoom:clamp(num(v.scale)||100,100,240)/100,x:clamp(num(v.offsetX),-60,60)/100,y:clamp(num(v.offsetY),-60,60)/100}}
async function renderSheet(v,index,width=3840,number=true){
 const ratio=sheetRatio(v),w=Math.round(width),h=Math.round(w/ratio);
 const base=await frameForView(v,{lines:v.lines,measures:v.measures,width:w,height:h});
 const out=document.createElement('canvas');out.width=base.width;out.height=base.height;
 const ctx=out.getContext('2d',{alpha:false});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);
 const {zoom,x,y}=sheetLayout(v),scaledW=out.width*zoom,scaledH=out.height*zoom;
 ctx.drawImage(base,(out.width-scaledW)/2+x*out.width,(out.height-scaledH)/2+y*out.height,scaledW,scaledH);
 if(number){const fs=Math.max(19,Math.round(w*.016));const pad=Math.round(fs*.72),margin=Math.round(w*.015),label=sheetNumber(index);
 ctx.font=`700 ${fs}px Arial, sans-serif`;const tw=Math.ceil(ctx.measureText(label).width);const rectW=tw+pad*2,rectH=fs+pad*1.4,rx=out.width-margin-rectW,ry=out.height-margin-rectH;
 ctx.fillStyle='rgba(13,17,22,.84)';ctx.fillRect(rx,ry,rectW,rectH);ctx.fillStyle='#ffffff';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(label,rx+rectW/2,ry+rectH/2+1);}
 return out;
}
function syncEditorControls(v){$('editorTitle').textContent=`LÁMINA ${sheetNumber(reportViews.indexOf(v))} · ${v.title||'Foto'}`;$('editorRatio').value=v.ratio||'16:9';$('editorScale').value=v.scale||100;$('editorX').value=v.offsetX||0;$('editorY').value=v.offsetY||0;$('editorLines').checked=!!v.lines;$('editorMeasures').checked=!!v.measures;syncEditorNumbers()}
function syncEditorNumbers(){$('scaleVal').textContent=$('editorScale').value+'%';$('xVal').textContent=$('editorX').value+'%';$('yVal').textContent=$('editorY').value+'%'}
function readEditor(v){mobileNotify();v.ratio=$('editorRatio').value;v.scale=Number($('editorScale').value);v.offsetX=Number($('editorX').value);v.offsetY=Number($('editorY').value);v.lines=$('editorLines').checked;v.measures=$('editorMeasures').checked;syncEditorNumbers()}
function openSheetEditor(id){const v=reportViews.find(x=>x.id===id);if(!v)return;currentEditId=id;$('reportEditor').hidden=false;document.body.classList.add('modal-open');syncEditorControls(v);scheduleEditorPreview()}
function closeSheetEditor(){currentEditId=null;editorGeneration++;$('reportEditor').hidden=true;document.body.classList.remove('modal-open');clearTimeout(editorTimer);renderReportViews()}
function scheduleEditorPreview(){const v=reportViews.find(x=>x.id===currentEditId);if(!v)return;readEditor(v);clearTimeout(editorTimer);const job=++editorGeneration;editorTimer=setTimeout(async()=>{try{const r=sheetRatio(v),canvas=$('reportEditCanvas'),w=960,h=Math.round(w/r);$('editorProgress').textContent='Generando vista previa…';const img=await renderSheet(v,reportViews.indexOf(v),w);if(job!==editorGeneration)return;canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);$('editorProgress').textContent=`Vista previa ${w} × ${h} · foto y trazos en una sola lámina`;}catch(e){console.error(e);$('editorProgress').textContent='Error de vista previa: '+e.message}},130)}
async function withReportLock(fn){if(reportBusy)return info('Espera a que termine la exportación anterior.',true);reportBusy=true;try{await previewQueue;persistPhoto();return await fn()}catch(e){console.error(e);info('No se pudo exportar: '+e.message,true)}finally{reportBusy=false}}
async function downloadSheet(id){return withReportLock(async()=>{const i=reportViews.findIndex(v=>v.id===id);if(i<0)return;info('Generando lámina '+sheetNumber(i)+' en alta calidad…',true);const c=await renderSheet(reportViews[i],i,sheetWidth());const blob=await canvasBlob(c);download(`${slug()}_LAMINA_${sheetNumber(i)}.png`,blob,'image/png');info(`Lámina ${sheetNumber(i)} descargada: ${c.width} × ${c.height} PNG.`,true)})}
async function exportAllSheets(){if(!reportViews.length)return info('Agrega por lo menos una lámina al reporte.',true);return withReportLock(async()=>{const entries=[],w=sheetWidth();for(let i=0;i<reportViews.length;i++){info(`ZIP: preparando lámina ${i+1}/${reportViews.length}…`);const c=await renderSheet(reportViews[i],i,w);entries.push({name:`LAMINA_${sheetNumber(i)}.png`,data:await canvasBlob(c)});}entries.push({name:'LEEME.txt',data:'FV360 Studio v4 - laminas fotograficas\nLas imagenes PNG contienen los trazos y las medidas visibles elegidas en el editor.\nLas medidas son registros de campo, no una escala metrica automatica.\nFotografias 360 originales conservadas en el proyecto FV360.\n'});download(`${slug()}_LAMINAS_PNG.zip`,await FVZip.build(entries),'application/zip');info(`${entries.length-1} láminas PNG incluidas en el ZIP.`,true)})}
const textBytes=(s)=>new TextEncoder().encode(s);
const concatBytes=(arr)=>{const total=arr.reduce((a,x)=>a+x.length,0),o=new Uint8Array(total);let pos=0;for(const a of arr){o.set(a,pos);pos+=a.length}return o};
async function createPhotoPDF(canvases){
 const objects=[null,null];
 const obj=(content)=>{objects.push(content);return objects.length};
 const pageIds=[];
 for(const c of canvases){const jpg=await canvasBlob(c,'image/jpeg');const raw=new Uint8Array(await jpg.arrayBuffer());const img=obj(concatBytes([textBytes(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raw.length} >>\nstream\n`),raw,textBytes('\nendstream')]));
 const portrait=c.height>c.width,pageW=portrait?595:842,pageH=portrait?842:595,maxW=pageW-37,maxH=pageH-37,sc=Math.min(maxW/c.width,maxH/c.height),cw=c.width*sc,ch=c.height*sc,x=(pageW-cw)/2,y=(pageH-ch)/2;
 const commands=textBytes(`q\n${cw.toFixed(4)} 0 0 ${ch.toFixed(4)} ${x.toFixed(4)} ${y.toFixed(4)} cm\n/Im0 Do\nQ\n`);
 const stream=obj(concatBytes([textBytes(`<< /Length ${commands.length} >>\nstream\n`),commands,textBytes('endstream')]));
 const page=obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${stream} 0 R >>`);
 pageIds.push(page);
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`;
 const output=[textBytes('%PDF-1.4\n%FV360\n')],offsets=[0];let length=output[0].length;
 for(let i=0;i<objects.length;i++){const id=i+1;offsets[id]=length;const payload=typeof objects[i]==='string'?textBytes(objects[i]):objects[i];const data=concatBytes([textBytes(`${id} 0 obj\n`),payload,textBytes('\nendobj\n')]);output.push(data);length+=data.length}
 const xrefStart=length;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<=objects.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
 output.push(textBytes(xref));return new Blob(output,{type:'application/pdf'});
}
async function exportPhotoPDF(){if(!reportViews.length)return info('Agrega al menos una foto al reporte.',true);return withReportLock(async()=>{const frames=[];for(let i=0;i<reportViews.length;i++){info(`PDF: preparando fotografía ${i+1}/${reportViews.length}…`);frames.push(await renderSheet(reportViews[i],i,sheetWidth()))}const pdf=await createPhotoPDF(frames);download(`${slug()}_REPORTE_FOTOGRAFICO.pdf`,pdf,'application/pdf');info(`PDF generado con ${frames.length} página(s) de fotografía grande y numerada.`,true)})}
/* DXF independiente de las imágenes: tabla limpia con filas/columnas configurables. */
const CAD_LABELS={DC:'TRAYECTORIA C.D.',AC:'TRAYECTORIA C.A.',GROUND:'TIERRA FISICA',COMMS:'COMUNICACIONES',TRAY:'CHAROLA / BANDEJA',OTHER:'OTROS / REFERENCIA'};
function cadSelection(){return CATEGORIES.filter(c=>$('cadcat_'+c.id)?.checked).map(c=>c.id)}
function cadData(){const sums=layerSummaries(),ids=cadSelection(),cols=[{id:'label',name:'CLASIFICACION',width:72}];if($('cadShowRoutes').checked)cols.push({id:'routes',name:'RUTAS',width:25});if($('cadShowSegments').checked)cols.push({id:'measured',name:'TRAMOS MED.',width:38});if($('cadShowPending').checked)cols.push({id:'pending',name:'PENDIENTES',width:40});cols.push({id:'total',name:'LONGITUD (m)',width:49});const countRoutes=(id)=>allPhotoRoutes().filter(x=>x.r.category===id).length;
 const rows=ids.map(id=>({label:CAD_LABELS[id],routes:countRoutes(id),measured:sums[id].measured,pending:sums[id].pending,total:sums[id].total}));if($('cadShowTotal').checked)rows.push({label:'TOTAL GENERAL',routes:rows.reduce((n,r)=>n+r.routes,0),measured:rows.reduce((n,r)=>n+r.measured,0),pending:rows.reduce((n,r)=>n+r.pending,0),total:rows.reduce((n,r)=>n+r.total,0),summary:true});return{cols,rows}}
function updateCADPreview(){const el=$('cadPreview');if(!el)return;const {cols,rows}=cadData();const tbody=rows.map(r=>`<tr${r.summary?' class="sum"':''}>${cols.map(c=>`<td>${c.id==='total'?r[c.id].toFixed(2):esc(r[c.id])}</td>`).join('')}</tr>`).join('');el.innerHTML=`<div class="cad-options-title">VISTA PREVIA DE TABLA</div><div class="cad-table-scroll"><table><thead><tr>${cols.map(c=>`<th>${c.name}</th>`).join('')}</tr></thead><tbody>${tbody||`<tr><td colspan="${cols.length}">Selecciona una categoría</td></tr>`}</tbody></table></div>`}
function exportDistanceDXF(){
 const {cols,rows}=cadData();
 if(!rows.length)return info('Selecciona al menos una fila de capa en el panel CAD.',true);
 if(!window.FV_DXF_R12_TEMPLATE)return info('No se cargó la plantilla CAD compatible. Extrae todos los archivos del ZIP.',true);
 persistPhoto();
 // El dibujo se escribe en DXF R12 (AC1009), compatible con AutoCAD clásico y moderno.
 // Partimos de una plantilla con HEADER, TABLES, BLOCKS y LAYER válidos.
 const asc=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').slice(0,160);
 const pairs=[];let handle=0x1000;
 const push=(code,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw Error('Coordenada CAD inválida');pairs.push(String(code).padStart(3,' '),String(value))};
 const entity=(type,layer)=>{push(0,type);push(5,(handle++).toString(16).toUpperCase());push(8,layer)};
 const line=(x1,y1,x2,y2,layer='FV_TABLA')=>{entity('LINE',layer);for(const [c,n] of [[10,x1],[20,y1],[30,0],[11,x2],[21,y2],[31,0]])push(c,Number(n).toFixed(4))};
 const cadText=(x,y,content,height=4,layer='FV_TEXTO')=>{entity('TEXT',layer);push(10,Number(x).toFixed(4));push(20,Number(y).toFixed(4));push(30,0);push(40,Number(height).toFixed(3));push(1,asc(content));push(7,'STANDARD')};
 const width=cols.reduce((a,c)=>a+c.width,0),left=10,top=0,rowH=14,titleH=25,bodyTop=top-titleH,numRows=rows.length+1,bottom=bodyTop-rowH*numRows;
 cadText(left+3,top-7,'FV360 / CUANTIFICACION DE CANALIZACIONES',5.8);
 cadText(left+3,top-17,slug().replace(/_/g,' ').slice(0,58),3.2);
 line(left,bodyTop,left+width,bodyTop);line(left,bottom,left+width,bottom);line(left,bodyTop,left,bottom);line(left+width,bodyTop,left+width,bottom);
 let acc=left;for(const c of cols.slice(0,-1)){acc+=c.width;line(acc,bodyTop,acc,bottom)}
 for(let r=1;r<numRows;r++)line(left,bodyTop-r*rowH,left+width,bodyTop-r*rowH);
 let off=left;for(const c of cols){cadText(off+2,bodyTop-9,c.name,3);off+=c.width}
 rows.forEach((r,i)=>{let x=left;const y=bodyTop-(i+2)*rowH+4.7;for(const c of cols){const val=c.id==='total'?r.total.toFixed(2):r[c.id];cadText(x+2,y,val,r.summary?3.8:3.5);x+=c.width}});
 cadText(left,bottom-11,'UNIDADES: METROS - LONGITUDES REGISTRADAS EN CAMPO',3);
 cadText(left,bottom-18,'DOCUMENTO REFERENCIAL. NO CONSTITUYE PLANO A ESCALA.',3);
 const marker='  0\nENDSEC\n  0\nEOF\n';
 const base=window.FV_DXF_R12_TEMPLATE;
 const cut=base.lastIndexOf(marker);
 if(cut<0||!base.includes('  2\nENTITIES\n'))throw Error('Plantilla CAD incompleta');
 const dxf=(base.slice(0,cut)+pairs.join('\n')+'\n'+base.slice(cut)).replace(/\r?\n/g,'\r\n');
 download(slug()+'_TABLA_DISTANCIAS.dxf',new Blob([dxf],{type:'application/dxf'}),'application/dxf');
 info(`Tabla DXF compatible R12: ${rows.length} filas, ${cols.length} columnas.`,true);
}

function initV4(){
 $('btnAllReportZIP').onclick=exportAllSheets;$('btnExportReportZIP').onclick=exportAllSheets;
 const cats=$('cadCategories');cats.innerHTML=CATEGORIES.map(c=>`<label class="cad-check"><input id="cadcat_${c.id}" type="checkbox" checked><span class="layer-swatch" style="background:${c.color}"></span>${esc(c.name)}</label>`).join('');$('cadOptions').querySelectorAll('input').forEach(el=>el.addEventListener('change',updateCADPreview));updateCADPreview();
 $('editorClose').onclick=closeSheetEditor;$('editorSave').onclick=()=>{const v=reportViews.find(x=>x.id===currentEditId),c=$('reportEditCanvas');if(v&&c.width&&c.height)v.thumb=c.toDataURL('image/jpeg',.86);closeSheetEditor();info('Ajustes de lámina guardados en el proyecto.',true)};
 ['editorRatio','editorScale','editorX','editorY','editorLines','editorMeasures'].forEach(id=>$(id).addEventListener('input',scheduleEditorPreview));
 $('editorCenter').onclick=()=>{$('editorX').value=0;$('editorY').value=0;scheduleEditorPreview()};
 $('editorReset').onclick=()=>{$('editorRatio').value='16:9';$('editorScale').value=100;$('editorX').value=0;$('editorY').value=0;scheduleEditorPreview()};
 $('editorDownload').onclick=()=>{const id=currentEditId;closeSheetEditor();downloadSheet(id)};
 $('reportEditor').addEventListener('click',e=>{if(e.target===$('reportEditor'))closeSheetEditor()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('reportEditor').hidden){e.stopImmediatePropagation();closeSheetEditor()}},true);
}

function register(){
 CATEGORIES.forEach(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name;$('routeClass').append(opt)});$('routeClass').value='DC';$('lineColor').value=category('DC').color;$('colorHex').textContent=category('DC').color.toUpperCase();
 PATTERNS.forEach((p,i)=>{const b=document.createElement('button');b.className='pattern'+(i===styleIndex?' active':'');b.type='button';b.innerHTML=`<svg viewBox="0 0 104 14"><path d="M2 7H102" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="${p.dash.length?p.dash.join(' '):'none'}"/></svg><span>${p.name}</span>`;b.onclick=()=>{styleIndex=i;markPattern();applyStyle()};$('patterns').append(b)});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setMode(b.dataset.tool));document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
 $('railDraw').onclick=()=>setMode('draw');$('railPhoto').onclick=()=>selectTab('photos');$('btnImport').onclick=()=>$('photoInput').click();$('btnAddPhotos').onclick=()=>$('photoInput').click();$('railReport').onclick=()=>selectTab('report');$('btnCaptureView').onclick=saveCurrentView;$('btnSaveViewFromGallery').onclick=saveCurrentView;$('btnSaveReportView').onclick=saveCurrentView;$('btnReportFromManager').onclick=exportPhotoPDF;$('btnCADFromManager').onclick=exportDistanceDXF;$('railTotals').onclick=$('btnGoTotals').onclick=()=>{selectTab('totals');$('inspector').scrollIntoView({behavior:'smooth',block:'nearest'})};$('railHelp').onclick=()=>alert('FV360 v5: Añade fotos, dibuja y registra medidas. Guarda varias vistas panorámicas. En Reporte edita cada lámina y descarga PDF o ZIP PNG. En Exportar selecciona capas y columnas de la tabla DXF.');
 $('btnFinish').onclick=finish;$('mobileFinish').onclick=finish;$('btnCancel').onclick=cancel;$('btnUndo').onclick=undo;$('btnDelete').onclick=removeSelected;$('btnAddVertex').onclick=addVertex;$('btnRemoveVertex').onclick=removeVertex;
 $('routeClass').onchange=()=>{$('lineColor').value=category($('routeClass').value).color;applyStyle()};['lineColor','lineWidth','labelSize','labelColor','labelPosition'].forEach(id=>$(id).addEventListener('change',applyStyle));$('lineColor').addEventListener('input',()=>{$('colorHex').textContent=$('lineColor').value.toUpperCase();queueFrame()});
 $('btnMeasure').onclick=()=>{if(selectedRoute<0||selectedSegment<0)return info('Toca primero un tramo en «Editar línea».',true);const v=$('distance').value;if(v===''||!Number.isFinite(Number(v))||Number(v)<0)return info('Escribe una distancia válida (metros, mayor o igual a cero).',true);snapshot();routes[selectedRoute].lengths[selectedSegment]=Number(v);updateTotals();info('Tramo '+(selectedSegment+1)+' guardado: '+Number(v).toFixed(2)+' m.',true)};$('distance').onkeydown=e=>{if(e.key==='Enter'){$('btnMeasure').click();e.preventDefault()}};
 const mirror=(a,b)=>{const v=$(a).checked;$(b).checked=v;queueFrame()};$('showMeasurements').onchange=()=>mirror('showMeasurements','showMeasures2');$('showMeasures2').onchange=()=>mirror('showMeasures2','showMeasurements');$('showVertices').onchange=()=>mirror('showVertices','showPoints2');$('showPoints2').onchange=()=>mirror('showPoints2','showVertices');$('showLines').onchange=queueFrame;
 $('btnFront').onclick=()=>{yaw=0;pitch=0;fov=70;dirty=true;queueFrame()};$('btnPlus').onclick=()=>{fov=clamp(fov-10,30,112);dirty=true;queueFrame()};$('btnMinus').onclick=()=>{fov=clamp(fov+10,30,112);dirty=true;queueFrame()};$('btnFullscreen').onclick=()=>{if(!document.fullscreenElement)viewer.requestFullscreen?.();else document.exitFullscreen?.()};
 $('btnExportPNG').onclick=()=>exportPNG(false);$('btnExportClean').onclick=()=>exportPNG(true);$('quickAnnotated').onclick=()=>exportPNG(false,true);$('btnOriginal').onclick=originalDownload;$('btnDXF').onclick=exportDistanceDXF;$('btnCSV').onclick=()=>{download(slug()+'_tramos.csv',buildCsv(false),'text/csv;charset=utf-8');info('CSV de tramos descargado.',true)};$('btnTotalsCSV').onclick=()=>{download(slug()+'_resumen_capas.csv',buildCsv(true),'text/csv;charset=utf-8');info('Resumen de capas descargado.',true)};$('btnReport').onclick=exportPhotoPDF;$('btnSave').onclick=saveProject;$('btnSaveAgain').onclick=saveProject;$('btnSaveJSON').onclick=saveProjectJSON;$('btnSaveJSONAgain').onclick=saveProjectJSON;
 $('photoInput').onchange=e=>{addPhotos(e.target.files);e.target.value=''};
 overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',pointerUp);overlay.addEventListener('pointercancel',e=>{if(pointer&&pointer.id===e.pointerId)pointer=null});overlay.addEventListener('wheel',e=>{e.preventDefault();if(flatMode)return;fov=clamp(fov+Math.sign(e.deltaY)*4,30,112);dirty=true;queueFrame()},{passive:false});
 overlay.addEventListener('dblclick',e=>{if(mode==='draw'&&activeRoute&&activeRoute.points.length>=2){e.preventDefault();finish()}});
 overlay.addEventListener('dragover',e=>e.preventDefault());overlay.addEventListener('drop',e=>{e.preventDefault();loadPhotoFile(e.dataTransfer.files[0])});
 window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){if(activeRoute)cancel();else setMode('navigate')}if(e.key==='Enter'&&mode==='draw')finish();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}if(e.key==='Delete'&&mode==='select')removeSelected()});
 new ResizeObserver(dimensions).observe(viewer);window.addEventListener('resize',dimensions);document.addEventListener('visibilitychange',()=>{if(!document.hidden){dirty=true;queueFrame()}});
 document.addEventListener('dragover',e=>e.preventDefault());
 $('btnImport').insertAdjacentHTML('afterend','<button class="action-btn" id="btnLoadProject">Abrir JSON / ZIP</button>');$('btnLoadProject').onclick=()=>$('projectInput').click();$('projectInput').onchange=e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value=''};
 }
/* API interna para la aplicación móvil. Sin incrustar fotos grandes en el JSON del autoguardado. */
window.FV360Bridge={
 snapshot(){
  persistPhoto();
  return {app:'FV360 Studio Mobile',version:5,format:'FV360_MOBILE_LOCAL',project:$('projectName').value,
   reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,technician:$('technicianName').value,
   activePhotoId:currentPhotoId, savedAt:new Date().toISOString(),
   photos:photos.map(p=>({id:p.id,name:p.name,caption:p.caption,orientation:structuredClone(p.orientation),routes:structuredClone(p.routes),
    source:p.src,blob:p.blob||null})),
   reportViews:structuredClone(reportViews.map(({thumb,...v})=>v))};
 },
 async restore(snap,blobMap={}){
  if(!snap||!Array.isArray(snap.photos))throw Error('Proyecto local no válido');
  const entries=[];
  for(const p of snap.photos){let blob=blobMap[p.id]||p.blob||null;
   if(!blob&&p.source&&String(p.source).startsWith('data:image/'))blob=await (await fetch(p.source)).blob();
   if(!blob)throw Error('Falta la fotografía original: '+p.name);
   entries.push({id:p.id,name:p.name,caption:p.caption||p.name,orientation:p.orientation||{yaw:0,pitch:0,fov:78},
    routes:structuredClone(p.routes||[]),blob,src:URL.createObjectURL(blob),width:0,height:0,img:null});
  }
  photos.forEach(p=>{if(p.blob&&p.src?.startsWith('blob:'))URL.revokeObjectURL(p.src)});
  photos=entries;reportViews=structuredClone(snap.reportViews||[]);
  currentPhotoId=null;routes=[];history=[];activeRoute=null;selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;
  $('projectName').value=snap.project||'Proyecto sin nombre';
  $('reportSubtitle').value=snap.reportSubtitle||'Reporte fotográfico';$('reportNotes').value=snap.reportNotes||'';$('technicianName').value=snap.technician||localStorage.getItem('fv360.technician')||'';
  if(photos.length){switchPhoto(photos.some(p=>p.id===snap.activePhotoId)?snap.activePhotoId:photos[0].id)}
  else this.clearViewer();
  renderPhotos();renderReportViews();updateTotals();syncSelection();selectTab('photos');
  reportViews.forEach(v=>makeReportPreview(v));
 },
 clearViewer(){
  imageReady=false;currentPhotoId=null;routes=[];yaw=0;pitch=0;fov=78;currentSrc='';
  $('photoPixels').textContent='SIN FOTOGRAFÍAS';$('viewName').value='Nueva vista';
  $('viewerLoading').textContent='Añade una fotografía para comenzar el levantamiento.';
  $('viewerLoading').hidden=false;ov.clearRect(0,0,viewW,viewH);
  const ctx=gl?null:pano.getContext('2d');if(ctx){ctx.fillStyle='#15181d';ctx.fillRect(0,0,pano.width,pano.height)}
  setMode('navigate');
 },
 fresh(name){
  photos.forEach(p=>{if(p.blob&&p.src?.startsWith('blob:'))URL.revokeObjectURL(p.src)});
  photos=[];reportViews=[];activeRoute=null;routes=[];history=[];selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;
  $('projectName').value=name||'Nuevo levantamiento';
  $('reportSubtitle').value='Reporte fotográfico';$('reportNotes').value='';
  this.clearViewer();renderPhotos();renderReportViews();updateTotals();syncSelection();selectTab('photos');
 },
 notify:mobileNotify,
 openTab:selectTab,
 addPhotoFiles:addPhotos,
 importProject:loadProjectV3,
 changeMode:setMode,
 finishRoute:finish,
 getStats(){persistPhoto();return{photos:photos.length,views:reportViews.length,routes:photos.reduce((n,p)=>n+(p.routes||[]).length,0)}},
 getProjectName(){return $('projectName').value||'Nuevo levantamiento'}
};
 register();initV4();initWebGL();window.FV360Bridge.fresh('Nuevo levantamiento');dimensions();

})();

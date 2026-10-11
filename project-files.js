/* FV360 - gestión de archivos de proyectos. No altera las rutas ni el visor. */
(()=>{'use strict';
 const $=id=>document.getElementById(id), MOBILE=!!$('mobileProjectPanel');
 const STORE='fv360.lastFileExport.v1';
 const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
 const fmt=s=>{try{return new Date(s).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return '—'}};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={lastFile:null,imported:null};
 try{state.lastFile=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
 function update(){
  const current=($('projectName')?.value||'Nuevo levantamiento').trim();
  document.querySelectorAll('[data-fv-active-name]').forEach(n=>n.textContent=current);
  const isCurrent=state.lastFile&&state.lastFile.project===current;
  const label=isCurrent?`JSON: ${state.lastFile.name} · ${fmt(state.lastFile.date)}`:
   state.lastFile?`Último respaldo: ${state.lastFile.name} (${fmt(state.lastFile.date)}); no corresponde al nombre actual.`:
   'Aún no has exportado un archivo JSON desde este navegador.';
  document.querySelectorAll('[data-fv-last-json]').forEach(n=>n.textContent=label);
  document.querySelectorAll('[data-fv-origin]').forEach(n=>n.textContent=state.imported?`Último archivo abierto: ${state.imported}`:(MOBILE?'Proyectos guardados automáticamente en este teléfono.':'Los proyectos de PC se recuperan abriendo su JSON o ZIP.'));
 }
 window.FV360FileSave={
  async prepare(name){
   // Sólo Chrome/Edge y otros navegadores compatibles permiten escoger ruta al guardar.
   if(!isIOS&&typeof window.showSaveFilePicker==='function'&&window.isSecureContext){
    try{return await window.showSaveFilePicker({suggestedName:name,types:[{description:'Proyecto editable FV360 (JSON)',accept:{'application/json':['.json']}}]})}
    catch(e){if(e?.name==='AbortError')return false;console.warn('Selector de guardado no disponible:',e)}
   }
   return null;
  },
  async save(name,blob,handle){
   if(handle===false)return {cancelled:true};
   if(handle){const output=await handle.createWritable();await output.write(blob);await output.close();return {mode:'file-picker'};}
   // En Safari iOS, Compartir permite usar «Guardar en Archivos» cuando está disponible.
   if((isIOS||/Android/.test(navigator.userAgent))&&navigator.share&&navigator.canShare){
    try{const file=new File([blob],name,{type:'application/json'});
     if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Proyecto FV360'});return {mode:'share'};}
    }catch(e){if(e?.name==='AbortError')return {cancelled:true};console.warn('Compartir archivo no disponible:',e)}
   }
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   return {mode:'download'};
  }
 };
 window.addEventListener('fv360:file-exported',e=>{
  const d=e.detail||{};if(d.format==='json'){
   state.lastFile={name:d.name,project:d.project,date:new Date().toISOString()};
   try{localStorage.setItem(STORE,JSON.stringify(state.lastFile))}catch{}
   update();
  }
 });
 window.addEventListener('fv360:project-imported',e=>{state.imported=e.detail?.filename||'JSON / ZIP';update()});
 $('projectName')?.addEventListener('input',update);
 document.querySelectorAll('[data-fv-import]').forEach(b=>b.addEventListener('click',()=>$('projectInput')?.click()));
 document.querySelectorAll('[data-fv-export-json]').forEach(b=>b.addEventListener('click',()=>$('btnSaveJSON')?.click()));
 document.querySelectorAll('[data-fv-export-zip]').forEach(b=>b.addEventListener('click',()=>$('btnSave')?.click()));
 const help=isIOS?'En iPhone: elige «Guardar en Archivos» si aparece al compartir; allí seleccionas iPhone o iCloud Drive y la carpeta. Si Safari lo descarga, búscalo en Archivos → Descargas.':
  /Android/.test(navigator.userAgent)?'En Android: utiliza el menú Compartir cuando aparezca para elegir Archivos o Drive. Si el navegador descarga directamente, revisa Descargas.':
  'En Chrome o Edge, «Guardar JSON» permite elegir carpeta cuando el navegador lo admite. En otros casos se usa la carpeta de Descargas configurada en tu navegador.';
 document.querySelectorAll('[data-fv-file-location-help]').forEach(n=>n.textContent=help);
 document.querySelectorAll('[data-fv-local-location-help]').forEach(n=>n.textContent='El autoguardado interno de FV360 se conserva en el almacenamiento privado de este navegador y no permite elegir otra carpeta. Para escoger una ubicación externa, exporta JSON/ZIP. No elimines los datos de la app sin hacer un respaldo.');
 update();
})();
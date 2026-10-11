/* FV360 Studio Mobile — biblioteca local independiente, sin cuentas ni servidores. */
(()=>{'use strict';
 const api=window.FV360Bridge, $=id=>document.getElementById(id);
 if(!api){console.error('FV360 Mobile: app.js debe cargarse primero');return}
 const DB='FV360_MOBILE_DB',STORE='projects',ASSETS='assets',ACTIVE='fv360.activeProject.v1';
 let db=null,activeId=null,loading=true,saveTimer=0,saving=null,again=false,assetKeys=new Set(),installPrompt=null;
 const id=()=>('FV-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
 const prettyDate=value=>new Date(value).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 function status(t,err=false){$('autoSaveState').textContent=t;$('autoSaveState').style.color=err?'#ff9e9e':'#cdd3dc';if($('fvLocalLastSave')){$('fvLocalLastSave').textContent=t;$('fvLocalLastSave').style.color=err?'#ff9e9e':'#bde6c8'}}
 function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Error de almacenamiento'));tx.onabort=()=>reject(tx.error||Error('Operación cancelada'))})}
 function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
 function connect(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('Este navegador no permite IndexedDB.'));const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:'id'});if(!database.objectStoreNames.contains(ASSETS))database.createObjectStore(ASSETS)};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
 async function items(){const tx=db.transaction(STORE,'readonly');const done=transactionDone(tx);const list=await req(tx.objectStore(STORE).getAll());await done;return list.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))}
 async function asset(projectId,photoId){return req(db.transaction(ASSETS,'readonly').objectStore(ASSETS).get(projectId+'::'+photoId))}
 async function getRecord(projectId){return req(db.transaction(STORE,'readonly').objectStore(STORE).get(projectId))}
 async function resolveBlob(photo){if(photo.blob instanceof Blob)return photo.blob;if(photo.source){const response=await fetch(photo.source);if(!response.ok)throw Error('No se pudo leer la fotografía '+photo.name);return await response.blob()}throw Error('Fotografía sin origen: '+photo.name)}
 async function storageInfo(){if(!navigator.storage?.estimate)return;try{const e=await navigator.storage.estimate();const mb=n=>(n/1048576).toFixed(0);$('storageState').textContent=mb(e.usage||0)+' / '+mb(e.quota||0)+' MB';}catch{}}
 function schedule(){if(loading||!db)return;clearTimeout(saveTimer);status('Cambios pendientes…');saveTimer=setTimeout(()=>{saveCurrent().catch(console.error)},1800)}
 async function writeSnapshot(){const snap=api.snapshot();const metas=snap.photos.map(({blob,source,...p})=>p);const needed=snap.photos.filter(p=>!assetKeys.has(activeId+'::'+p.id));
  const blobs=await Promise.all(needed.map(async p=>({key:activeId+'::'+p.id,data:await resolveBlob(p)})));
  const metadata={...snap,photos:metas,reportViews:snap.reportViews.map(({thumb,...v})=>v)};
  const now=new Date().toISOString();const tx=db.transaction([STORE,ASSETS],'readwrite');const store=tx.objectStore(STORE);const photosStore=tx.objectStore(ASSETS);
  store.put({id:activeId,title:snap.project||'Nuevo levantamiento',updatedAt:now,meta:metadata,countPhotos:metas.length,countViews:snap.reportViews.length});
  blobs.forEach(b=>photosStore.put(b.data,b.key));
  const alive=new Set(metas.map(p=>activeId+'::'+p.id));
  const cursor=photosStore.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;
    if(String(c.key).startsWith(activeId+'::')&&!alive.has(c.key))c.delete();c.continue();};
  await transactionDone(tx);blobs.forEach(b=>assetKeys.add(b.key));
  assetKeys=new Set([...assetKeys].filter(key=>!key.startsWith(activeId+'::')||alive.has(key)));
  localStorage.setItem(ACTIVE,activeId);
  status('Guardado local ✓ · '+prettyDate(now));await storageInfo();return metadata;
 }
 async function saveCurrent(force=false){if(loading||!db||!activeId)return;if(saving){again=true;await saving;if(again){again=false;return saveCurrent(force)}return}
  clearTimeout(saveTimer);status('Guardando proyecto…');saving=writeSnapshot();try{await saving;if(force)await render()}catch(e){status('No se pudo guardar: '+e.message,true);console.error('FV360 Mobile autosave',e);throw e}finally{saving=null}}
 async function ensureSaved(){clearTimeout(saveTimer);await saveCurrent()}
 async function load(idToLoad){loading=true;status('Abriendo proyecto…');try{const record=await getRecord(idToLoad);if(!record)throw Error('Proyecto no encontrado');const photoMap={};for(const p of record.meta.photos){const b=await asset(idToLoad,p.id);if(!b)throw Error('No se encontró la foto '+p.name);photoMap[p.id]=b}
  await api.restore(record.meta,photoMap);activeId=idToLoad;assetKeys=new Set(record.meta.photos.map(p=>idToLoad+'::'+p.id));localStorage.setItem(ACTIVE,activeId);status('Proyecto abierto ✓ · último guardado '+prettyDate(record.updatedAt));
 }finally{loading=false}await render();closePanel()}
 async function freshProject(){const text=prompt('Nombre del nuevo levantamiento:', 'Nuevo levantamiento');if(text===null)return;const name=text.trim()||'Nuevo levantamiento';await ensureSaved();loading=true;
  try{activeId=id();assetKeys.clear();api.fresh(name);localStorage.setItem(ACTIVE,activeId)}finally{loading=false}
  await saveCurrent(true);closePanel();$('btnImport').click();}
 async function deleteProject(projectId){if(projectId===activeId){alert('No puedes eliminar el proyecto abierto. Abre otro primero.');return}if(!confirm('¿Eliminar definitivamente este proyecto local? Exporta un ZIP antes si necesitas conservarlo.'))return;
  const tx=db.transaction([STORE,ASSETS],'readwrite');tx.objectStore(STORE).delete(projectId);
  const storage=tx.objectStore(ASSETS);const cursor=storage.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(String(c.key).startsWith(projectId+'::'))c.delete();c.continue()};
  await transactionDone(tx);await render();await storageInfo();}
 function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
 async function render(){if(!db)return;const projects=await items();const host=$('mobileProjectsList');document.querySelectorAll('[data-fv-active-name]').forEach(n=>n.textContent=api.getProjectName());host.innerHTML=projects.map(p=>`<div class="mp-item ${p.id===activeId?'mp-active':''}"><div class="mp-title">${esc(p.title)} ${p.id===activeId?'<span class="mp-current">ABIERTO</span>':''}</div><div class="mp-desc">${p.countPhotos||0} fotografías · ${p.countViews||0} vistas · Guardado local: ${prettyDate(p.updatedAt)} · ID: ${esc(p.id.slice(-6))}</div><div class="mp-controls"><button data-open="${p.id}" ${p.id===activeId?'disabled':''}>Abrir</button><button data-delete="${p.id}" ${p.id===activeId?'disabled':''}>Eliminar</button></div></div>`).join('')||'<p class="mp-empty">Sin proyectos guardados todavía.</p>';
  host.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{try{await ensureSaved();await load(b.dataset.open)}catch(e){alert('No se pudo abrir: '+e.message);status(e.message,true)}});
  host.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.delete).catch(e=>alert(e.message)));
 }
 function openPanel(){const panel=$('mobileProjectPanel');panel.hidden=false;document.body.classList.add('mobile-modal-open');render().catch(console.error);storageInfo()}
 function closePanel(){$('mobileProjectPanel').hidden=true;document.body.classList.remove('mobile-modal-open')}
 function focusViewer(){$('viewer').scrollIntoView({behavior:'smooth',block:'center'})}
 function jumpPanel(name){api.openTab(name);$('inspector').scrollIntoView({behavior:'smooth',block:'start'})}
 function onlineUI(){const connected=navigator.onLine;$('offlineNotice').hidden=connected;$('connectionStatus').innerHTML=connected?'<span class="health-dot"></span> LISTO PARA VISITA':'<span class="health-dot"></span> SIN CONEXIÓN'}
 async function install(){if(installPrompt){installPrompt.prompt();const result=await installPrompt.userChoice;installPrompt=null;if(result?.outcome==='accepted')$('installHelp').textContent='Instalación iniciada.';return}
  $('installHelp').hidden=false;
  $('installHelp').innerHTML=/iPad|iPhone|iPod/.test(navigator.userAgent)?'En iPhone: abre la dirección HTTPS de FV360 en Safari, toca <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>.':'En Android: abre la dirección HTTPS en Chrome, toca el menú ⋮ y selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla principal</strong>.';
 }
 async function init(){
  if(matchMedia('(max-width: 620px)').matches)$('reportQuality').value='2560';
  onlineUI();window.addEventListener('online',onlineUI);window.addEventListener('offline',onlineUI);
  $('btnProjectsMobile').onclick=openPanel;$('navProjects').onclick=openPanel;$('closeMobileProjects').onclick=closePanel;
  $('mobileProjectPanel').addEventListener('click',e=>{if(e.target===$('mobileProjectPanel'))closePanel()});
  $('createMobileProject').onclick=()=>freshProject().catch(e=>{alert('Error al crear proyecto: '+e.message);loading=false});
  $('saveMobileNow').onclick=()=>{if(!db)return alert('El almacenamiento local no está disponible. Exporta JSON o ZIP.');saveCurrent(true).then(()=>alert('Proyecto «'+api.getProjectName()+'» guardado en este dispositivo. Para elegir una carpeta externa pulsa «Guardar archivo JSON».')).catch(e=>alert(e.message))};
  $('openMobileImport').onclick=()=>{$('projectInput').click();closePanel()};
  // Importar crea un proyecto LOCAL NUEVO; nunca sustituye silenciosamente el anterior.
  $('projectInput').onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await ensureSaved();loading=true;const ok=await api.importProject(file);
      if(!ok){loading=false;return}
      activeId=id();assetKeys.clear();localStorage.setItem(ACTIVE,activeId);loading=false;
      await saveCurrent(true);status('Importado '+file.name+' · guardado en este teléfono ✓');
    }catch(err){loading=false;status('Error al importar: '+err.message,true);alert('No se pudo importar: '+err.message)}
  };
  $('navViewer').onclick=()=>{api.changeMode('navigate');focusViewer()};
  $('navDraw').onclick=()=>{api.changeMode('draw');focusViewer()};
  $('navEdit').onclick=()=>{api.changeMode('select');focusViewer()};
  $('navReport').onclick=()=>jumpPanel('report');
  $('mobileInstall').onclick=install;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
  $('technicianName').value=localStorage.getItem('fv360.technician')||'';
  $('technicianName').addEventListener('input',()=>{try{localStorage.setItem('fv360.technician',$('technicianName').value)}catch{}schedule()});
  $('projectName').addEventListener('input',schedule);$('viewName').addEventListener('change',schedule);
  $('reportQuality').addEventListener('change',schedule);
  window.addEventListener('fv360:changed',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveCurrent().catch(console.error)});
  window.addEventListener('pagehide',()=>saveCurrent().catch(console.error));
  if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('PWA service worker:',e))}
  if(location.protocol==='file:'){$('mobileInstall').textContent='La instalación requiere HTTPS';$('installHelp').hidden=false;$('installHelp').textContent='Puedes probar el HTML desde aquí, pero para instalarlo y usarlo sin conexión debes publicarlo en HTTPS.'}
  try{db=await connect();const remembered=localStorage.getItem(ACTIVE);
   if(remembered&&await getRecord(remembered)){await load(remembered)}
   else{activeId=id();assetKeys.clear();localStorage.setItem(ACTIVE,activeId);loading=false;await saveCurrent(true)}
   // saveCurrent/load ya notificó nombre del proyecto y hora del último guardado.
  }catch(e){loading=false;status('Sin biblioteca local: '+e.message,true);console.error(e);$('mobileProjectsList').innerHTML='<p class="mp-empty">No hay almacenamiento local disponible. Exporta JSON o ZIP después de cada visita.</p>'}
  await storageInfo();
 }
 init();
})();

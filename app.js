const SUPABASE_URL = 'https://gdrpdiwykmnybmkadlrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcnBkaXd5a21ueWJta2FkbHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjMyMTIsImV4cCI6MjA5NjA5OTIxMn0.Z7ih_vQic1GtzCyZmTEV-RWJnmuaNZQDfOV2_Fvan5g';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = sel => document.querySelector(sel);

let appData = { staging: [], shipped: [] };
let activeShipTargetItem = null;
let currentEditId = null;
let editTargetRecord = { table: null, id: null, photo_urls: [] };
let selectedPhotoBlobs = [];
let mainPhotoBlobs = [];
let openMapInstance = null;
let openMapMarkers = [];
let hiddenMemory = JSON.parse(localStorage.getItem('swift_hidden_memory') || '[]');

function bootstrapStandalonePWA() {
  const pwaData = {
    "short_name": "StagingTracker", "name": "Swift Staging Tracker Hub",
    "icons": [{"src": "https://cdn-icons-png.flaticon.com/512/3014/3014166.png", "type": "image/png", "sizes": "512x512"}],
    "start_url": ".", "background_color": "#f6f7f9", "theme_color": "#dd4d25", "display": "standalone", "orientation": "portrait"
  };
  if($('#pwa-manifest')) $('#pwa-manifest').setAttribute('href', 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pwaData)));
}

function adjustCount(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); }
function adjustEditCount(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); }

function formatContainer(count, type) {
  if(!count || count === 0) return '';
  if(count === 1) return `1 ${type}`;
  if(type === 'Box') return `${count} Boxes`;
  if(type === 'Pipe/Rod' || type === 'Other') return `${count} ${type}`;
  return `${count} ${type}s`;
}

function fetchBrowserGPS(targetInputId) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => { if($('#'+targetInputId)) $('#'+targetInputId).value = position.coords.latitude.toFixed(6) + ", " + position.coords.longitude.toFixed(6); },
      (error) => { alert("GPS Tracking Denied: " + error.message); }
    );
  }
}

function initOpenStreetMapEngine() {
  if(!$('#openFreightMap')) return;
  openMapInstance = L.map('openFreightMap').setView([53.5461, -113.4938], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(openMapInstance);
  syncMapPins();
}

function syncMapPins() {
  if (!openMapInstance) return;
  openMapMarkers.forEach(m => openMapInstance.removeLayer(m));
  openMapMarkers = [];
  let pointsForBoundFocus = [];

  appData.staging.forEach(item => {
    if (!item.coords || !item.coords.includes(',')) return;
    const segments = item.coords.split(',');
    const latVal = parseFloat(segments[0].trim());
    const lngVal = parseFloat(segments[1].trim());
    if (!isNaN(latVal) && !isNaN(lngVal)) {
      const marker = L.marker([latVal, lngVal]).addTo(openMapInstance);
      marker.on('click', () => { openStaticMapPromptWindow(item); });
      openMapMarkers.push(marker);
      pointsForBoundFocus.push([latVal, lngVal]);
    }
  });

  if (pointsForBoundFocus.length === 1) {
    openMapInstance.setView(pointsForBoundFocus[0], 18);
  } else if (pointsForBoundFocus.length > 1) {
    openMapInstance.fitBounds(L.latLngBounds(pointsForBoundFocus), { padding: [5, 5], maxZoom: 18 });
  }
}

function banishMemory(inputId) {
  if(!$('#'+inputId)) return;
  const val = $('#'+inputId).value.trim();
  if(!val) return;
  if(confirm(`Remove "${val}" from autocomplete memory?`)) {
    if(!hiddenMemory.includes(val)) {
      hiddenMemory.push(val);
      localStorage.setItem('swift_hidden_memory', JSON.stringify(hiddenMemory));
    }
    $('#'+inputId).value = '';
    loadCloudData();
  }
}

async function loadCloudData() {
  const [st, sh] = await Promise.all([
    supabaseClient.from('staging').select('*').order('entry_date', { ascending: false }),
    supabaseClient.from('shipped').select('*').order('shipped_at', { ascending: false })
  ]);
  appData.staging = st.data || []; 
  appData.shipped = sh.data || [];
  
  const allData = [...appData.staging, ...appData.shipped];
  const filterMem = (arr) => [...new Set(arr.filter(Boolean))].filter(x => !hiddenMemory.includes(x));

  if($('#dl_customers')) $('#dl_customers').innerHTML = filterMem(allData.map(x=>x.customer)).map(c=>`<option value="${c}">`).join('');
  if($('#dl_locations')) $('#dl_locations').innerHTML = filterMem(allData.map(x=>x.location)).map(l=>`<option value="${l}">`).join('');
  if($('#dl_stagers')) $('#dl_stagers').innerHTML = filterMem(allData.map(x=>(x.staged_by || x.shipped_by))).map(s=>`<option value="${s}">`).join('');
  if($('#dl_pastEmails')) $('#dl_pastEmails').innerHTML = filterMem(appData.shipped.map(x=>x.pmd_email)).map(em=>`<option value="${em}@swiftsupply.ca">`).join('');
  
  renderTables(); 
  if(typeof syncMapPins === 'function') syncMapPins();
}

function parseContainerString(typeStr) {
  let sk = 0, bx = 0, cr = 0, pi = 0, ot = 0; if(!typeStr) return { sk, bx, cr, pi, ot };
  const matchSk = typeStr.match(/(\d+)\s*Skid/); if(matchSk) sk = parseInt(matchSk[1]);
  const matchBx = typeStr.match(/(\d+)\s*Box/);  if(matchBx) bx = parseInt(matchBx[1]);
  const matchCr = typeStr.match(/(\d+)\s*Crate/);if(matchCr) cr = parseInt(matchCr[1]);
  const matchPi = typeStr.match(/(\d+)\s*Pipe\/Rod/);if(matchPi) pi = parseInt(matchPi[1]);
  const matchOt = typeStr.match(/(\d+)\s*Other/);if(matchOt) ot = parseInt(matchOt[1]);
  return { sk, bx, cr, pi, ot };
}

function getDynamicType(prefix) {
  const sk = parseInt($(`#${prefix}_skid`) ? $(`#${prefix}_skid`).value : 0)||0;
  const bx = parseInt($(`#${prefix}_box`) ? $(`#${prefix}_box`).value : 0)||0;
  const cr = parseInt($(`#${prefix}_crate`) ? $(`#${prefix}_crate`).value : 0)||0;
  const pi = parseInt($(`#${prefix}_pipe`) ? $(`#${prefix}_pipe`).value : 0)||0;
  const ot = parseInt($(`#${prefix}_other`) ? $(`#${prefix}_other`).value : 0)||0;
  let typeParts = []; 
  if(sk) typeParts.push(formatContainer(sk, 'Skid'));
  if(bx) typeParts.push(formatContainer(bx, 'Box'));
  if(cr) typeParts.push(formatContainer(cr, 'Crate'));
  if(pi) typeParts.push(formatContainer(pi, 'Pipe/Rod'));
  if(ot) typeParts.push(formatContainer(ot, 'Other'));
  return typeParts.join(', ') || '1 Skid';
}

function getDynamicQty(prefix) {
  const sk = parseInt($(`#${prefix}_skid`) ? $(`#${prefix}_skid`).value : 0)||0;
  const bx = parseInt($(`#${prefix}_box`) ? $(`#${prefix}_box`).value : 0)||0;
  const cr = parseInt($(`#${prefix}_crate`) ? $(`#${prefix}_crate`).value : 0)||0;
  const pi = parseInt($(`#${prefix}_pipe`) ? $(`#${prefix}_pipe`).value : 0)||0;
  const ot = parseInt($(`#${prefix}_other`) ? $(`#${prefix}_other`).value : 0)||0;
  return sk+bx+cr+pi+ot;
}

function renderTables() {
  const q = $('#q') ? $('#q').value.toLowerCase() : '';
  const fStaging = appData.staging.filter(o => (o.so||'').toLowerCase().includes(q) || (o.customer||'').toLowerCase().includes(q));
  const fShipped = appData.shipped.filter(o => (o.so||'').toLowerCase().includes(q) || (o.customer||'').toLowerCase().includes(q));

  if($('#tblStaging')) {
    const sBody = $('#tblStaging').querySelector('tbody'); 
    sBody.innerHTML = '';
    const limitStaging = $('#stageLimitNotice') ? 20 : 999999;
    fStaging.slice(0, limitStaging).forEach(o => {
      const geoLink = o.coords ? `<a class="coord-link" href="geo:0,0?q=${encodeURIComponent(o.coords)}" target="_blank">${o.coords}</a>` : '—';
      const picBtn = (o.photo_urls && o.photo_urls.length > 0) ? `<button class="btn" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="openPhotoViewer('${o.id}')">View</button>` : '';
      
      sBody.insertAdjacentHTML('beforeend', `<tr>
        <td><button class="btn-edit" onclick="openUniversalEditor('staging', '${o.id}')">Edit</button></td>
        <td>${picBtn}</td><td><b>${o.so}</b></td><td>${o.customer}</td><td>${new Date(o.entry_date).toLocaleString()}</td><td>${o.type}</td><td>${o.location}</td><td><small>${geoLink}</small></td><td>${o.weight || '—'}</td><td>${o.status}</td><td>${o.staged_by||'—'}</td>
        <td style="position:sticky;right:0;text-align:center;"><input type="checkbox" onchange="if(this.checked)triggerShipModal('${o.id}')"></td></tr>`);
    });
  }

  if($('#tblShipped')) {
    const shBody = $('#tblShipped').querySelector('tbody'); 
    shBody.innerHTML = '';
    const limitShipped = $('#shippedLimitNotice') ? 20 : 999999;
    fShipped.slice(0, limitShipped).forEach(o => {
      const geoLink = o.coords ? `<a class="coord-link" href="geo:0,0?q=${encodeURIComponent(o.coords)}" target="_blank">${o.coords}</a>` : '—';
      const isRet = (o.carrier === 'RETURNED TO STOCK' || o.carrier === 'CONSOLIDATED');
      const rowClass = isRet ? 'style="color:#9ca3af; text-decoration:line-through;"' : '';
      const picBtn = (o.photo_urls && o.photo_urls.length > 0) ? `<button class="btn" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="openPhotoViewer('${o.id}')">View</button>` : '';
      
      shBody.insertAdjacentHTML('beforeend', `<tr ${rowClass}>
        <td><button class="btn-edit" onclick="openUniversalEditor('shipped', '${o.id}')">Edit</button></td>
        <td>${picBtn}</td>
        <td><b>${o.so}</b></td><td>${o.customer}</td><td>${o.type}</td><td>${o.carrier || '—'}</td><td>${o.location}</td><td><small>${geoLink}</small></td><td>${o.weight || '—'}</td><td>${new Date(o.shipped_at).toLocaleString()}</td><td>${o.shipped_by || '—'}</td><td>${o.pmd_email ? o.pmd_email+(isRet?'':'<span class="green-check"> ✓</span>') : '—'}</td></tr>`);
    });
  }

  const sumByType = t => appData.staging.reduce((acc, c) => c.type?.includes(t) ? acc + (parseInt(c.type.match(new RegExp(`(\\d+)\\s*${t}`))) || 0) : acc, 0);
  if($('#kOrders')) $('#kOrders').textContent = appData.staging.length; 
  if($('#kContainers')) $('#kContainers').textContent = appData.staging.reduce((acc, c) => acc + (parseInt(c.qty) || 0), 0);
  if($('#kSkids')) $('#kSkids').textContent = sumByType('Skid'); 
  if($('#kBoxes')) $('#kBoxes').textContent = sumByType('Box'); 
  if($('#kCrates')) $('#kCrates').textContent = sumByType('Crate'); 
  if($('#kPipe')) $('#kPipe').textContent = sumByType('Pipe/Rod'); 
  if($('#kOther')) $('#kOther').textContent = sumByType('Other');
  if($('#kShipped')) $('#kShipped').textContent = appData.shipped.filter(x => x.carrier !== 'RETURNED TO STOCK' && x.carrier !== 'CONSOLIDATED').length;
}

function openUniversalEditor(table, id) {
  const o = appData[table].find(x => x.id === id);
  if (!o) return;
  currentEditId = o.id;
  editTargetRecord = { table: table, id: o.id, so: o.so, photo_urls: o.photo_urls || [] };
  
  const isRet = (table === 'shipped' && (o.carrier === 'RETURNED TO STOCK' || o.carrier === 'CONSOLIDATED'));
  
  if($('#e_so')) $('#e_so').value = o.so; 
  if($('#e_cust')) $('#e_cust').value = o.customer; 
  if($('#e_loc')) $('#e_loc').value = o.location || ''; 
  if($('#e_coords')) $('#e_coords').value = o.coords || ''; 
  if($('#e_weight')) $('#e_weight').value = o.weight || '';
  
  const counts = parseContainerString(o.type);
  if($('#e_skid')) $('#e_skid').value = counts.sk; 
  if($('#e_box')) $('#e_box').value = counts.bx; 
  if($('#e_crate')) $('#e_crate').value = counts.cr;
  if($('#e_pipe')) $('#e_pipe').value = counts.pi; 
  if($('#e_other')) $('#e_other').value = counts.ot;
  
  const inputsToLock = ['e_so','e_cust','e_loc','e_weight','e_status','e_staged_by','e_carrier','e_shipped_by','e_pm'];
  inputsToLock.forEach(i => { if($(`#${i}`)) $(`#${i}`).disabled = isRet; });
  document.querySelectorAll('#editModal .counter-btn').forEach(b => b.disabled = isRet);
  document.querySelectorAll('#editPhotoSection .photo-uploader').forEach(b => b.style.display = isRet ? 'none' : 'block');
  
  if($('#editPhotoSection')) $('#editPhotoSection').style.display = 'flex';
  if($('#editDelBtn')) $('#editDelBtn').style.display = 'block';
  
  if (table === 'staging') {
    if($('#editModalTitle')) $('#editModalTitle').textContent = 'Edit Staging Entry'; 
    if($('#editStagingFields')) $('#editStagingFields').style.display = 'block';
    if($('#editShippedFields')) $('#editShippedFields').style.display = 'none'; 
    if($('#editUndoBtn')) $('#editUndoBtn').style.display = 'none'; 
    if($('#editReturnBtn')) $('#editReturnBtn').style.display = 'block'; 
    if($('#editConsolidateBtn')) $('#editConsolidateBtn').style.display = 'block';
    if($('#editSaveBtn')) $('#editSaveBtn').style.display = 'block';
    if($('#e_status')) $('#e_status').value = o.status; 
    if($('#e_staged_by')) $('#e_staged_by').value = o.staged_by || '';
  } else {
    if($('#editModalTitle')) $('#editModalTitle').textContent = isRet ? 'View Locked Record' : 'Edit Shipped Entry Logs'; 
    if($('#editStagingFields')) $('#editStagingFields').style.display = 'none'; 
    if($('#editShippedFields')) $('#editShippedFields').style.display = 'block'; 
    if($('#editUndoBtn')) $('#editUndoBtn').style.display = 'block'; 
    if($('#editReturnBtn')) $('#editReturnBtn').style.display = 'none'; 
    if($('#editConsolidateBtn')) $('#editConsolidateBtn').style.display = 'none';
    if($('#editSaveBtn')) $('#editSaveBtn').style.display = isRet ? 'none' : 'block';
    if($('#e_carrier')) $('#e_carrier').value = o.carrier || ''; 
    if($('#e_shipped_by')) $('#e_shipped_by').value = o.shipped_by || ''; 
    if($('#e_pm')) $('#e_pm').value = o.pmd_email || '';
  }
  
  renderEditPhotoStrip();
  if($('#editModal')) $('#editModal').style.display = 'flex';
}

async function deleteCurrentRecord() {
  if(confirm("Are you sure you want to PERMANENTLY delete this record?")) {
    await supabaseClient.from(editTargetRecord.table).delete().eq('id', currentEditId);
    if($('#editModal')) $('#editModal').style.display = 'none';
    loadCloudData();
  }
}

function triggerReturnModal() {
  if($('#returnModal')) $('#returnModal').style.display = 'flex'; 
  if($('#editModal')) $('#editModal').style.display = 'none';
  if($('#r_picked_by')) $('#r_picked_by').value = ''; 
  if($('#r_returned_by')) $('#r_returned_by').value = ''; 
  if($('#r_reason')) $('#r_reason').value = ''; 
  if($('#r_pm_chk')) $('#r_pm_chk').checked = false; 
  if($('#r_pm_email')) { $('#r_pm_email').value = ''; $('#r_pm_email').disabled = true; }
  if($('#r_pm_email_btn')) $('#r_pm_email_btn').disabled = true;
}

async function submitReturnToStock() {
  const pickedBy = $('#r_picked_by').value.trim(); const returnedBy = $('#r_returned_by').value.trim();
  const reason = $('#r_reason').value.trim();
  const pmEmail = $('#r_pm_email').value.trim(); const pmChecked = $('#r_pm_chk').checked;

  if(!pickedBy || !returnedBy || !reason || (pmChecked && !pmEmail)) return alert("Missing required inputs.");
  
  try {
    const e = appData.staging.find(x => x.id === currentEditId);
    const currentTimeStamp = new Date().toLocaleString();
    let pmName = pmEmail ? pmEmail.split('@')[0].split('.')[0] : null;
    if(pmName) pmName = pmName.charAt(0).toUpperCase() + pmName.slice(1);
    
    const { error: insertError } = await supabaseClient.from('shipped').insert([{
      so: editTargetRecord.so, customer: $('#e_cust').value.trim(), type: getDynamicType('e'), qty: getDynamicQty('e'),
      carrier: 'RETURNED TO STOCK', location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(),
      weight: $('#e_weight').value.trim(), shipped_by: returnedBy, pmd_email: pickedBy, photo_urls: editTargetRecord.photo_urls
    }]); 
    if(insertError) throw insertError;
    
    await supabaseClient.from('staging').delete().eq('id', editTargetRecord.id);

    const photoLinks = editTargetRecord.photo_urls.length > 0 ? `\nAttached Photos:\n${editTargetRecord.photo_urls.map((p,i)=> `Image ${i+1}: ${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}`).join('\n')}\n` : '';

    const cachedSubject = `RETURN TO STOCK: ${editTargetRecord.so} for ${$('#e_cust').value.trim()}`;
    const cachedBody = `Your order/pick has now been Returned to Stock. Return details:\n\n` +
      `Reason for Return to Stock: ${reason}\n\n` +
      `----------------------------------------------------------------------\n` +
      `SO#                   | ${editTargetRecord.so}\n` +
      `Customer              | ${$('#e_cust').value.trim()}\n` +
      `Container(s)          | ${getDynamicType('e')}\n` +
      `Total Weight (In lbs) | ${$('#e_weight').value.trim() || '—'}\n` +
      `Picked by             | ${pickedBy}\n` +
      `Returned At           | ${currentTimeStamp}\n` +
      `Returned By           | ${returnedBy}\n` +
      `----------------------------------------------------------------------\n` +
      photoLinks +
      `\nFor more shipment details, visit the following link: https://swiftoperations.github.io/staging-tracker/\n\n` +
      `Thanks\n`;

    if($('#returnModal')) $('#returnModal').style.display='none';
    loadCloudData();
    if(pmChecked) { window.location.href = `mailto:${pmEmail}?cc=warehouse1@swiftsupply.ca&subject=${encodeURIComponent(cachedSubject)}&body=${encodeURIComponent(cachedBody)}`; }
  } catch(err) { alert("Return to Stock error: " + err.message); }
}

async function executeConsolidate() {
  if(!confirm("Are you sure you want to mark this order as Consolidated?")) return;
  try {
    const e = appData.staging.find(x => x.id === currentEditId);
    
    const { error: insertError } = await supabaseClient.from('shipped').insert([{
      so: e.so, customer: $('#e_cust').value.trim(), type: getDynamicType('e'), qty: getDynamicQty('e'),
      carrier: 'CONSOLIDATED', location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(),
      weight: $('#e_weight').value.trim(), shipped_by: $('#e_staged_by').value.trim(), pmd_email: null, photo_urls: editTargetRecord.photo_urls
    }]); 
    if(insertError) throw insertError;
    
    await supabaseClient.from('staging').delete().eq('id', currentEditId);
    if($('#editModal')) $('#editModal').style.display='none';
    loadCloudData();
  } catch(err) { alert("Consolidate error: " + err.message); }
}

function renderEditPhotoStrip() {
  const strip = $('#editPhotoPreviewStrip'); 
  if(!strip) return;
  strip.innerHTML = '';
  editTargetRecord.photo_urls.forEach((url, index) => {
    strip.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Photo-${index+1} <span onclick="editTargetRecord.photo_urls.splice(${index},1); renderEditPhotoStrip()">×</span></span>`);
  });
}

function addEditPhotoBlob(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(async (file) => {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
    const path = `${editTargetRecord.so || 'edit'}-${Date.now()}-${cleanFileName}`;
    const { error } = await supabaseClient.storage.from('freight-photos').upload(path, file);
    if(!error) { 
      if(!editTargetRecord.photo_urls) editTargetRecord.photo_urls = [];
      editTargetRecord.photo_urls.push(path); 
      renderEditPhotoStrip(); 
    }
  });
}

async function saveEditedRecord() {
  const dynamicType = getDynamicType('e');
  const basePayload = { so: $('#e_so').value.trim(), customer: $('#e_cust').value.trim(), location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(), weight: $('#e_weight').value.trim(), type: dynamicType, qty: getDynamicQty('e') };

  if (editTargetRecord.table === 'staging') {
    const { error } = await supabaseClient.from('staging').update({ ...basePayload, status: $('#e_status').value.trim(), staged_by: $('#e_staged_by').value.trim(), photo_urls: editTargetRecord.photo_urls }).eq('id', editTargetRecord.id);
    if(error) { alert("Database Error: " + error.message); return; }
  } else {
    const { error } = await supabaseClient.from('shipped').update({ ...basePayload, carrier: $('#e_carrier').value.trim(), shipped_by: $('#e_shipped_by').value.trim(), pmd_email: $('#e_pm').value.trim() || null, photo_urls: editTargetRecord.photo_urls }).eq('id', editTargetRecord.id);
    if(error) { alert("Database Error: " + error.message); return; }
  }
  if($('#editModal')) $('#editModal').style.display = 'none'; 
  loadCloudData();
}

async function executeShippedUndo() {
  if(!confirm("Are you sure you want to undo this action and return it to Staging?")) return;
  try {
    const { data: currentRecord } = await supabaseClient.from('shipped').select('*').eq('id', editTargetRecord.id).single();
    const { error } = await supabaseClient.from('staging').insert([{ so: currentRecord.so, customer: currentRecord.customer, type: currentRecord.type, qty: currentRecord.qty, location: currentRecord.location, coords: currentRecord.coords, weight: currentRecord.weight, status: 'Partial', photo_urls: currentRecord.photo_urls }]);
    if (error) { alert("Undo Database Error: " + error.message); return; }
    
    await supabaseClient.from('shipped').delete().eq('id', editTargetRecord.id);
    if($('#editModal')) $('#editModal').style.display = 'none'; 
    loadCloudData();
  } catch(e) { alert("Undo error: " + e.message); }
}

function openPhotoViewer(id) {
  const o = appData.shipped.find(x => x.id === id) || appData.staging.find(x => x.id === id);
  const paths = o ? o.photo_urls : [];
  const gallery = $('#modalPhotoGallery'); 
  if(!gallery) return;
  gallery.innerHTML = '';
  if(!paths || paths.length === 0) {
    gallery.innerHTML = '<p style="grid-column: 1/-1; text-align:center; font-weight:700; color:#6b7280; padding:12px 0;">No photos attached to this order.</p>';
  } else {
    paths.forEach(p => {
      gallery.insertAdjacentHTML('beforeend', `
        <a href="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}" target="_blank" style="display:block; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
          <img src="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}" style="width:100%; height:110px; object-fit:cover; display:block;" />
        </a>
      `);
    });
  }
  if($('#viewModal')) $('#viewModal').style.display = 'flex';
}

function openStaticMapPromptWindow(item) {
  if(!$('#mapViewModal')) return;
  $('#v_so').value = item.so; $('#v_cust').value = item.customer; $('#v_date').value = new Date(item.entry_date).toLocaleString();
  $('#v_type').value = item.type || '—'; $('#v_loc').value = item.location || '—'; $('#v_coords').value = item.coords || '—';
  $('#v_weight').value = item.weight || '—'; $('#v_status').value = item.status || '—'; $('#v_staged_by').value = item.staged_by || '—';
  
  const gallery = $('#mapViewGalleryStrip');
  if(gallery) {
    gallery.innerHTML = '';
    if (item.photo_urls && item.photo_urls.length > 0) {
      $('#mapViewPhotoSection').style.display = 'flex';
      item.photo_urls.forEach(path => {
        gallery.insertAdjacentHTML('beforeend', `<a href="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${path}" target="_blank"><img src="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${path}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; border:1px solid #ddd;"/></a>`);
      });
    } else {
      $('#mapViewPhotoSection').style.display = 'none';
    }
  }
  if($('#mapViewModal')) $('#mapViewModal').style.display = 'flex';
}

function triggerShipModal(id) {
  const item = appData.staging.find(x => x.id === id);
  if (!item) return;
  activeShipTargetItem = item; 
  if($('#photoPreviewStrip')) $('#photoPreviewStrip').innerHTML = ''; 
  selectedPhotoBlobs = [];
  
  if($('#m_so')) $('#m_so').value = item.so; 
  if($('#m_cust')) $('#m_cust').value = item.customer; 
  if($('#m_qty')) $('#m_qty').value = item.type;
  if($('#m_carrier')) $('#m_carrier').value = ''; 
  if($('#m_loc')) $('#m_loc').value = item.location; 
  if($('#m_weight')) $('#m_weight').value = item.weight || '—'; 
  if($('#m_by')) $('#m_by').value = '';
  
  if($('#m_pm_chk')) $('#m_pm_chk').checked = false; 
  if($('#m_pm_email')) $('#m_pm_email').disabled = true; 
  if($('#m_pm_email_btn')) $('#m_pm_email_btn').disabled = true;
  if($('#shipModal')) $('#shipModal').style.display = 'flex';
}
function closeShipModal() { if($('#shipModal')) $('#shipModal').style.display = 'none'; loadCloudData(); }

function addPhotoBlob(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(selectedPhotoBlobs.length < 10) selectedPhotoBlobs.push(f); });
  renderPhotoStrip('#photoPreviewStrip', selectedPhotoBlobs);
}

async function submitFreightDispatch() {
  const dispatcher = $('#m_by').value.trim(); const pmEmail = $('#m_pm_email').value.trim(); const pmChecked = $('#m_pm_chk').checked;
  const carrierVal = $('#m_carrier').value.trim() || 'Unassigned Carrier';
  if(!dispatcher || (pmChecked && !pmEmail)) return alert("Missing required inputs.");
  
  if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = true;
  try {
    let photoUrls = [];
    for (let i = 0; i < selectedPhotoBlobs.length; i++) {
      const file = selectedPhotoBlobs[i]; 
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
      const path = `${activeShipTargetItem.so}-${Date.now()}-${i}-${cleanFileName}`;
      await supabaseClient.storage.from('freight-photos').upload(path, file); photoUrls.push(path);
    }
    
    let pmName = pmEmail ? pmEmail.split('@')[0].split('.')[0] : null;
    if(pmName) pmName = pmName.charAt(0).toUpperCase() + pmName.slice(1);
    const currentTimeStamp = new Date().toLocaleString();

    const { error: insertError } = await supabaseClient.from('shipped').insert([{
      so: activeShipTargetItem.so, customer: activeShipTargetItem.customer, type: activeShipTargetItem.type,
      qty: activeShipTargetItem.qty, carrier: carrierVal, location: activeShipTargetItem.location, coords: activeShipTargetItem.coords,
      weight: activeShipTargetItem.weight, shipped_by: dispatcher, pmd_email: pmName, photo_urls: photoUrls
    }]);
    if (insertError) {
      alert("Database Error: " + insertError.message);
      if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false;
      return;
    }

    await supabaseClient.from('staging').delete().eq('id', activeShipTargetItem.id);
    
    const photoLinks = photoUrls.length > 0 ? `\nAttached Photos:\n${photoUrls.map((p,i)=> `Image ${i+1}: ${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}`).join('\n')}\n` : '';
    
    const cachedSubject = `CONFIRMATION OF SHIPOUT: ${activeShipTargetItem.customer} ${activeShipTargetItem.so} @ ${activeShipTargetItem.type} via ${carrierVal}`;
    const cachedBody = `Your order has now been shipped! Order details:\n\n` +
      `----------------------------------------------------------------------\n` +
      `SO#                   | ${activeShipTargetItem.so}\n` +
      `Customer              | ${activeShipTargetItem.customer}\n` +
      `Container(s)          | ${activeShipTargetItem.type}\n` +
      `Total Weight (In lbs) | ${activeShipTargetItem.weight || '—'}\n` +
      `Carrier               | ${carrierVal}\n` +
      `Shipped At            | ${currentTimeStamp}\n` +
      `Shipped By            | ${dispatcher}\n` +
      `----------------------------------------------------------------------\n` +
      photoLinks +
      `\nFor more shipment details, visit the following link: https://swiftoperations.github.io/staging-tracker/\n\n` +
      `Thanks\n`;

    closeShipModal();
    if(pmChecked) { window.location.href = `mailto:${pmEmail}?cc=warehouse1@swiftsupply.ca&subject=${encodeURIComponent(cachedSubject)}&body=${encodeURIComponent(cachedBody)}`; }
  } catch(e) { alert("Data dispatch error."); } finally { if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false; }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrapStandalonePWA(); 
  initOpenStreetMapEngine(); 
  loadCloudData(); 
  setInterval(loadCloudData, 5000); 

  if($('#add')) {
    $('#add').onclick = async () => {
      const sk = parseInt($('#c_skid').value)||0, bx = parseInt($('#c_box').value)||0, cr = parseInt($('#c_crate').value)||0, pi = parseInt($('#c_pipe').value)||0, ot = parseInt($('#c_other').value)||0;
      if(!$('#so').value || !$('#customer').value || !$('#loc').value) return alert("Fields Missing.");
      
      let type = []; 
      if(sk) type.push(formatContainer(sk, 'Skid'));
      if(bx) type.push(formatContainer(bx, 'Box'));
      if(cr) type.push(formatContainer(cr, 'Crate'));
      if(pi) type.push(formatContainer(pi, 'Pipe/Rod'));
      if(ot) type.push(formatContainer(ot, 'Other'));
      
      $('#add').disabled = true;
      $('#add').textContent = 'Saving...';
      
      try {
        let photoUrls = [];
        for (let i = 0; i < mainPhotoBlobs.length; i++) {
          const file = mainPhotoBlobs[i]; 
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
          const path = `${$('#so').value.trim()}-staging-${Date.now()}-${i}-${cleanFileName}`;
          const { error: uploadError } = await supabaseClient.storage.from('freight-photos').upload(path, file);
          if(!uploadError) photoUrls.push(path);
        }
      
        const { error } = await supabaseClient.from('staging').insert([{ so: $('#so').value.trim(), customer: $('#customer').value.trim(), status: $('#status').value, location: $('#loc').value.trim(), coords: $('#coords').value.trim(), weight: $('#weight').value.trim(), staged_by: $('#staged_by').value.trim(), type: type.join(', '), qty: sk+bx+cr+pi+ot, photo_urls: photoUrls }]);
        
        if (error) {
          alert("Database Error: " + error.message + "\n\nIMPORTANT: Add a 'photo_urls' column (Type: text array) to your 'staging' table in Supabase!");
          $('#add').disabled = false; $('#add').textContent = 'Add'; return;
        }
        
        $('#so').value=''; $('#customer').value=''; $('#loc').value=''; $('#coords').value=''; $('#staged_by').value=''; $('#weight').value=''; $('#c_skid').value=0; $('#c_box').value=0; $('#c_crate').value=0; $('#c_pipe').value=0; $('#c_other').value=0; 
        mainPhotoBlobs = []; renderMainPhotoStrip();
        loadCloudData();
      } catch(e) { alert("System Error: " + e.message); }
      
      $('#add').disabled = false;
      $('#add').textContent = 'Add';
    };
  }

  if($('#q')) $('#q').oninput = renderTables;
});
</script>

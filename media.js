window.fetchBrowserGPS = function(targetInputId) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => { if($('#'+targetInputId)) $('#'+targetInputId).value = position.coords.latitude.toFixed(6) + ", " + position.coords.longitude.toFixed(6); },
      (error) => { alert("GPS Tracking Denied: " + error.message); }
    );
  }
};

window.initOpenStreetMapEngine = function() {
  if(!$('#openFreightMap')) return;
  openMapInstance = L.map('openFreightMap').setView([53.5461, -113.4938], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(openMapInstance);
  window.syncMapPins();
};

window.syncMapPins = function() {
  if (!openMapInstance) return;
  openMapMarkers.forEach(m => openMapInstance.removeLayer(m));
  openMapMarkers = []; let bounds = L.latLngBounds(); let hasPins = false;

  appData.staging.forEach(item => {
    if (item.coords && item.coords.includes(',')) {
      const [lat, lng] = item.coords.split(',').map(n => parseFloat(n.trim()));
      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = L.marker([lat, lng]).addTo(openMapInstance);
        const pp = item.photo_urls && item.photo_urls.length > 0 ? `<br><img src="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${item.photo_urls[0]}" style="width:100%;max-height:120px;object-fit:cover;margin-top:8px;border-radius:6px;">` : '';
        marker.bindPopup(`<b>${item.so}</b> - ${item.customer}<br>Location: ${item.location}<br>Status: ${item.status}<br><button class="btn" style="margin-top:8px; width:100%; font-size:12px; padding:6px; height:auto;" onclick="window.viewMapDetails('${item.id}')">View Details</button>${pp}`);
        openMapMarkers.push(marker); bounds.extend([lat, lng]); hasPins = true;
      }
    }
  });
  if (hasPins) openMapInstance.fitBounds(bounds, { padding: [30, 30] });
};

window.viewMapDetails = function(id) {
  const item = appData.staging.find(x => x.id === id);
  if(!item) return;
  $('#v_so').value = item.so; $('#v_cust').value = item.customer; $('#v_date').value = new Date(item.entry_date).toLocaleString();
  $('#v_type').value = item.type; $('#v_loc').value = item.location; $('#v_coords').value = item.coords;
  $('#v_weight').value = item.weight || '—'; $('#v_status').value = item.status; $('#v_staged_by').value = item.staged_by || '—';
  
  if(item.photo_urls && item.photo_urls.length > 0) {
    $('#mapViewPhotoSection').style.display = 'flex';
    $('#mapViewGalleryStrip').innerHTML = item.photo_urls.map((p,i) => `<span class="photo-badge" onclick="window.openPhotoViewer('${item.id}', ${i})">📎 View Image ${i+1}</span>`).join('');
  } else { $('#mapViewPhotoSection').style.display = 'none'; }
  $('#mapViewModal').style.display = 'flex';
};

window.addMainPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(mainPhotoBlobs.length < 10) mainPhotoBlobs.push(f); });
  window.renderMainPhotoStrip();
};

window.renderMainPhotoStrip = function() {
  const container = $('#mainPhotoPreviewStrip'); if(!container) return; container.innerHTML = '';
  mainPhotoBlobs.forEach((f, idx) => {
    container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Img-${idx+1} <span onclick="mainPhotoBlobs.splice(${idx},1); window.renderMainPhotoStrip()">&times;</span></span>`);
  });
};

window.addPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(selectedPhotoBlobs.length < 10) selectedPhotoBlobs.push(f); });
  window.renderPhotoStrip('#photoPreviewStrip', selectedPhotoBlobs);
};

window.renderPhotoStrip = function(containerSel, blobArray) {
  const container = $(containerSel); if(!container) return; container.innerHTML = '';
  if (containerSel === '#photoPreviewStrip' && activeShipTargetItem && activeShipTargetItem.photo_urls) {
    activeShipTargetItem.photo_urls.forEach((url, idx) => {
      container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Staged-${idx+1} <span onclick="activeShipTargetItem.photo_urls.splice(${idx},1); window.renderPhotoStrip('${containerSel}', selectedPhotoBlobs)">&times;</span></span>`);
    });
  }
  blobArray.forEach((f, idx) => {
    container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Upload-${idx+1} <span onclick="selectedPhotoBlobs.splice(${idx},1); window.renderPhotoStrip('${containerSel}', selectedPhotoBlobs)">&times;</span></span>`);
  });
};

window.addEditPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => {
    const cleanFileName = f.name.replace(/[^a-zA-Z0-9.]/g, ''); const path = `edit-${Date.now()}-${cleanFileName}`;
    supabaseClient.storage.from('freight-photos').upload(path, f).then(({error}) => {
      if(!error) { editTargetRecord.photo_urls.push(path); window.renderEditPhotoStrip(); } else alert("Photo upload failed: " + error.message);
    });
  });
};

window.renderEditPhotoStrip = function() {
  const container = $('#editPhotoPreviewStrip'); if(!container) return; container.innerHTML = '';
  editTargetRecord.photo_urls.forEach((url, idx) => {
    container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Image-${idx+1} <span onclick="editTargetRecord.photo_urls.splice(${idx},1); window.renderEditPhotoStrip()">&times;</span></span>`);
  });
};

window.openPhotoViewer = function(id, indexToOpen = 0) {
  const o = appData.staging.find(x => x.id === id) || appData.shipped.find(x => x.id === id);
  if(!o || !o.photo_urls || o.photo_urls.length === 0) return;
  const gal = $('#modalPhotoGallery');
  gal.innerHTML = o.photo_urls.map(p => `<a href="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}" target="_blank" style="display:block; text-decoration:none;"><img src="${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}" style="width:100%; height:140px; object-fit:cover; border-radius:10px; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.1);"><div style="text-align:center; font-size:11px; margin-top:6px; font-weight:700; color:#4b5563;">TAP TO ENLARGE</div></a>`).join('');
  $('#viewModal').style.display = 'flex';
};

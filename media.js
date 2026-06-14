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
  openMapMarkers = [];
  let bounds = L.latLngBounds();
  let hasPins = false;

  appData.staging.forEach(item => {
    if (item.coords && item.coords.includes(',')) {
      const [lat, lng] = item.coords.split(',').map(n => parseFloat(n.trim()));
      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = L.marker([lat, lng]).addTo(openMapInstance);
        marker.on('click', () => window.openStaticMapPromptWindow(item));
        openMapMarkers.push(marker);
        bounds.extend([lat, lng]);
        hasPins = true;
      }
    }
  });
  if (hasPins) openMapInstance.fitBounds(bounds, { padding: [5, 5], maxZoom: 18 });
};

window.renderEditPhotoStrip = function() {
  const strip = $('#editPhotoPreviewStrip'); 
  if(!strip) return;
  strip.innerHTML = '';
  editTargetRecord.photo_urls.forEach((url, index) => {
    strip.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Photo-${index+1} <span onclick="editTargetRecord.photo_urls.splice(${index},1); window.renderEditPhotoStrip()">&times;</span></span>`);
  });
};

window.addEditPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(async (file) => {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
    const path = `${editTargetRecord.so || 'edit'}-${Date.now()}-${cleanFileName}`;
    const { error } = await supabaseClient.storage.from('freight-photos').upload(path, file);
    if(!error) { 
      if(!editTargetRecord.photo_urls) editTargetRecord.photo_urls = [];
      editTargetRecord.photo_urls.push(path); 
      window.renderEditPhotoStrip(); 
    }
  });
};

window.openPhotoViewer = function(id) {
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
};

window.openStaticMapPromptWindow = function(item) {
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
};

window.addMainPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(mainPhotoBlobs.length < 10) mainPhotoBlobs.push(f); });
  window.renderMainPhotoStrip();
};

window.renderMainPhotoStrip = function() {
  const container = $('#mainPhotoPreviewStrip'); 
  if(!container) return;
  container.innerHTML = '';
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
  const container = $(containerSel); 
  if(!container) return;
  container.innerHTML = '';
  
  if (containerSel === '#photoPreviewStrip' && activeShipTargetItem && activeShipTargetItem.photo_urls) {
    activeShipTargetItem.photo_urls.forEach((url, idx) => {
      container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Staged-${idx+1} <span onclick="activeShipTargetItem.photo_urls.splice(${idx},1); window.renderPhotoStrip('${containerSel}', selectedPhotoBlobs)">&times;</span></span>`);
    });
  }

  blobArray.forEach((f, idx) => {
    const badge = document.createElement('span'); badge.className = 'photo-badge';
    badge.innerHTML = `📎 New-${idx+1} <span onclick="selectedPhotoBlobs.splice(${idx},1); window.renderPhotoStrip('${containerSel}', selectedPhotoBlobs)">&times;</span>`;
    container.appendChild(badge);
  });
};

window.banishMemory = function(inputId) {
  if(!$('#'+inputId)) return;
  const val = $('#'+inputId).value.trim();
  if(!val) return;
  if(confirm(`Remove "${val}" from autocomplete memory?`)) {
    if(!hiddenMemory.includes(val)) {
      hiddenMemory.push(val);
      localStorage.setItem('swift_hidden_memory', JSON.stringify(hiddenMemory));
    }
    $('#'+inputId).value = '';
    window.loadCloudData();
  }
};

window.loadCloudData = async function() {
  try {
    const [st, sh] = await Promise.all([
      supabaseClient.from('staging').select('*').order('entry_date', { ascending: false }),
      supabaseClient.from('shipped').select('*').order('shipped_at', { ascending: false })
    ]);
    
    if (!st.error && st.data) appData.staging = st.data; 
    if (!sh.error && sh.data) appData.shipped = sh.data;
    
    const allData = [...appData.staging, ...appData.shipped];
    const filterMem = (arr) => [...new Set(arr.filter(Boolean))].filter(x => !hiddenMemory.includes(x));

    if($('#dl_customers')) $('#dl_customers').innerHTML = filterMem(allData.map(x=>x.customer)).map(c=>`<option value="${c}">`).join('');
    if($('#dl_locations')) $('#dl_locations').innerHTML = filterMem(allData.map(x=>x.location)).map(l=>`<option value="${l}">`).join('');
    if($('#dl_stagers')) $('#dl_stagers').innerHTML = filterMem(allData.map(x=>(x.staged_by || x.shipped_by))).map(s=>`<option value="${s}">`).join('');
    if($('#dl_pastEmails')) $('#dl_pastEmails').innerHTML = filterMem(appData.shipped.map(x=>x.pmd_email)).map(em=>`<option value="${em}@swiftsupply.ca">`).join('');
    
    window.renderTables(); 
    if(typeof window.syncMapPins === 'function') window.syncMapPins();
  } catch(e) { console.error("Data load failed:", e); }
};

window.deleteCurrentRecord = async function() {
  if(confirm("Are you sure you want to PERMANENTLY delete this record?")) {
    await supabaseClient.from(editTargetRecord.table).delete().eq('id', currentEditId);
    window.logAction(editTargetRecord.table, `Deleted entry for SO: ${editTargetRecord.so}`);
    if($('#editModal')) $('#editModal').style.display = 'none';
    window.loadCloudData();
  }
};

window.submitReturnToStock = async function() {
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
      so: editTargetRecord.so, customer: $('#e_cust').value.trim(), type: window.getDynamicType('e'), qty: window.getDynamicQty('e'),
      carrier: 'RETURNED TO STOCK', location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(),
      weight: $('#e_weight').value.trim(), comments: e.comments, shipped_by: returnedBy, pmd_email: pickedBy, photo_urls: editTargetRecord.photo_urls
    }]); 
    if(insertError) throw insertError;
    
    await supabaseClient.from('staging').delete().eq('id', currentEditId);
    window.logAction('staging', `Returned to Stock SO: ${editTargetRecord.so}`);
    window.logAction('shipped', `Added Return to Stock log for SO: ${editTargetRecord.so}`);

    const photoLinks = editTargetRecord.photo_urls.length > 0 ? `\nAttached Photos:\n${editTargetRecord.photo_urls.map((p,i)=> `Image ${i+1}: ${SUPABASE_URL}/storage/v1/object/public/freight-photos/${p}`).join('\n')}\n` : '';

    const cachedSubject = `RETURN TO STOCK: ${editTargetRecord.so} for ${$('#e_cust').value.trim()}`;
    const cachedBody = `Your order/pick has now been Returned to Stock. Return details:\n\n` +
      `Reason for Return to Stock: ${reason}\n\n` +
      `----------------------------------------------------------------------\n` +
      `SO#                   | ${editTargetRecord.so}\n` +
      `Customer              | ${$('#e_cust').value.trim()}\n` +
      `Container(s)          | ${window.getDynamicType('e')}\n` +
      `Total Weight (In lbs) | ${$('#e_weight').value.trim() || '—'}\n` +
      `Picked by             | ${pickedBy}\n` +
      `Returned At           | ${currentTimeStamp}\n` +
      `Returned By           | ${returnedBy}\n` +
      `----------------------------------------------------------------------\n` +
      photoLinks +
      `\nFor more shipment details, visit the following link: https://swiftoperations.github.io/staging-tracker/\n\n` +
      `Thanks\n`;

    if($('#returnModal')) $('#returnModal').style.display='none';
    window.loadCloudData();
    if(pmChecked) { window.location.href = `mailto:${pmEmail}?cc=warehouse1@swiftsupply.ca&subject=${encodeURIComponent(cachedSubject)}&body=${encodeURIComponent(cachedBody)}`; }
  } catch(err) { alert("Return to Stock error: " + err.message); }
};

window.saveEditedRecord = async function() {
  const dynamicType = window.getDynamicType('e');
  const basePayload = { so: $('#e_so').value.trim(), customer: $('#e_cust').value.trim(), location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(), weight: $('#e_weight').value.trim(), comments: $('#e_comments').value.trim(), type: dynamicType, qty: window.getDynamicQty('e') };

  if (editTargetRecord.table === 'staging') {
    const { error } = await supabaseClient.from('staging').update({ ...basePayload, status: $('#e_status').value.trim(), staged_by: $('#e_staged_by').value.trim(), photo_urls: editTargetRecord.photo_urls }).eq('id', currentEditId);
    if(error) { alert("Database Error: " + error.message); return; }
  } else {
    const { error } = await supabaseClient.from('shipped').update({ ...basePayload, carrier: $('#e_carrier').value.trim(), shipped_by: $('#e_shipped_by').value.trim(), pmd_email: $('#e_pm').value.trim() || null, photo_urls: editTargetRecord.photo_urls }).eq('id', currentEditId);
    if(error) { alert("Database Error: " + error.message); return; }
  }
  if($('#editModal')) $('#editModal').style.display = 'none'; 
  window.loadCloudData();
};

window.executeShippedUndo = async function() {
  if(!confirm("Are you sure you want to undo this action and return it to Staging?")) return;
  try {
    const { data: currentRecord } = await supabaseClient.from('shipped').select('*').eq('id', editTargetRecord.id).single();
    const { error } = await supabaseClient.from('staging').insert([{ so: currentRecord.so, customer: currentRecord.customer, type: currentRecord.type, qty: currentRecord.qty, location: currentRecord.location, coords: currentRecord.coords, weight: currentRecord.weight, comments: currentRecord.comments, status: 'Partial', photo_urls: currentRecord.photo_urls }]);
    if (error) { alert("Undo Database Error: " + error.message); return; }
    
    await supabaseClient.from('shipped').delete().eq('id', editTargetRecord.id);
    if($('#editModal')) $('#editModal').style.display = 'none'; 
    window.loadCloudData();
  } catch(e) { alert("Undo error: " + e.message); }
};

window.submitFreightDispatch = async function() {
  const dispatcher = $('#m_by').value.trim(); const pmEmail = $('#m_pm_email').value.trim(); const pmChecked = $('#m_pm_chk').checked;
  const carrierVal = $('#m_carrier').value.trim() || 'Unassigned Carrier';
  if(!dispatcher || (pmChecked && !pmEmail)) return alert("Missing required inputs.");
  
  if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = true;
  try {
    let photoUrls = (activeShipTargetItem && activeShipTargetItem.photo_urls) ? [...activeShipTargetItem.photo_urls] : [];
    
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
      weight: activeShipTargetItem.weight, comments: activeShipTargetItem.comments, shipped_by: dispatcher, pmd_email: pmName, photo_urls: photoUrls
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

    window.closeShipModal();
    if(pmChecked) { window.location.href = `mailto:${pmEmail}?cc=warehouse1@swiftsupply.ca&subject=${encodeURIComponent(cachedSubject)}&body=${encodeURIComponent(cachedBody)}`; }
  } catch(e) { alert("Data dispatch error."); } finally { if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false; }
};

window.submitStagingEntry = async function() {
  const sk = parseInt($('#c_skid').value)||0, bx = parseInt($('#c_box').value)||0, cr = parseInt($('#c_crate').value)||0, pi = parseInt($('#c_pipe').value)||0, ot = parseInt($('#c_other').value)||0;
  if(!$('#so').value || !$('#customer').value || !$('#loc').value) return alert("Fields Missing.");
  
  let type = []; 
  if(sk) type.push(window.formatContainer(sk, 'Skid'));
  if(bx) type.push(window.formatContainer(bx, 'Box'));
  if(cr) type.push(window.formatContainer(cr, 'Crate'));
  if(pi) type.push(window.formatContainer(pi, 'Pipe/Rod'));
  if(ot) type.push(window.formatContainer(ot, 'Other'));
  
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
  
    const { error } = await supabaseClient.from('staging').insert([{ so: $('#so').value.trim(), customer: $('#customer').value.trim(), status: $('#status').value, location: $('#loc').value.trim(), coords: $('#coords').value.trim(), weight: $('#weight').value.trim(), comments: $('#comments').value.trim(), staged_by: $('#staged_by').value.trim(), type: type.join(', '), qty: sk+bx+cr+pi+ot, photo_urls: photoUrls }]);
    
    if (error) {
      alert("Database Error: " + error.message);
      $('#add').disabled = false; $('#add').textContent = 'Add'; return;
    }
    
    $('#so').value=''; $('#customer').value=''; $('#loc').value=''; $('#coords').value=''; $('#staged_by').value=''; $('#weight').value=''; $('#c_skid').value=0; $('#c_box').value=0; $('#c_crate').value=0; $('#c_pipe').value=0; $('#c_other').value=0; 
    if($('#comments')) $('#comments').value='';
    mainPhotoBlobs = []; window.renderMainPhotoStrip();
    window.loadCloudData();
  } catch(e) { alert("System Error: " + e.message); }
  
  $('#add').disabled = false;
  $('#add').textContent = 'Add';
};

window.saveQuickComment = async function() {
  const newComment = $('#quick_comments').value.trim();
  const { error } = await supabaseClient.from(currentCommentTarget.table)
    .update({ comments: newComment }).eq('id', currentCommentTarget.id);
  if(error) return alert("Error saving comment: " + error.message);
  if($('#commentModal')) $('#commentModal').style.display = 'none';
  window.loadCloudData();
};

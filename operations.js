// --- operations.js ---

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

    const activeEl = document.activeElement;
    const activeListId = (activeEl && activeEl.tagName === 'INPUT') ? activeEl.getAttribute('list') : null;

    const safeUpdateDatalist = (id, newHtml) => {
      const el = $('#' + id);
      if (el && el.innerHTML !== newHtml) {
        if (activeListId !== id) { 
          el.innerHTML = newHtml; 
        }
      }
    };

    safeUpdateDatalist('dl_customers', filterMem(allData.map(x=>x.customer)).map(c=>`<option value="${c}">`).join(''));
    safeUpdateDatalist('dl_locations', filterMem(allData.map(x=>x.location)).map(l=>`<option value="${l}">`).join(''));
    safeUpdateDatalist('dl_stagers', filterMem(allData.map(x=>(x.staged_by || x.shipped_by))).map(s=>`<option value="${s}">`).join(''));
    safeUpdateDatalist('dl_pastEmails', filterMem(appData.shipped.map(x=>x.pmd_email)).map(em=>`<option value="${em}@swiftsupply.ca">`).join(''));
    
    window.renderTables(); 
    if(typeof window.syncMapPins === 'function') window.syncMapPins();
  } catch(e) { console.error("Data load failed:", e); }
};

window.deleteCurrentRecord = async function() {
  if(confirm("Are you sure you want to PERMANENTLY delete this record?")) {
    await supabaseClient.from(editTargetRecord.table).delete().eq('id', currentEditId);
    window.logAction(editTargetRecord.table, `Deleted entry for SO: ${editTargetRecord.so}`);
    if($('#editModal')) $('#editModal').style.display = 'none';
    if(typeof window.showNotification === 'function') window.showNotification('Record Deleted Permanently');
    window.loadCloudData();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Deletion'); }
  }
};

window.submitReturnToStock = async function() {
  const pickedBy = $('#r_picked_by').value.trim(); const returnedBy = $('#r_returned_by').value.trim();
  const reason = $('#r_reason').value.trim();
  const pmRaw = $('#r_pm_email').value.trim(); const pmChecked = $('#r_pm_chk').checked;

  if(!pickedBy || !returnedBy || !reason) return alert("Missing required inputs.");
  
  let finalPmEmail = null;
  if (pmChecked) {
    finalPmEmail = window.resolveEmail(pmRaw);
    if (!finalPmEmail) return alert("Invalid PM Entry. Please select a valid PM from the list or type a valid email address.");
  }
  
  try {
    const e = appData.staging.find(x => x.id === currentEditId);
    const currentTimeStamp = new Date().toLocaleString();
    let pmName = finalPmEmail ? finalPmEmail.split('@')[0].split('.')[0] : null;
    if(pmName) pmName = pmName.charAt(0).toUpperCase() + pmName.slice(1);
    
    const { error: insertError } = await supabaseClient.from('shipped').insert([{
      so: editTargetRecord.so, customer: $('#e_cust').value.trim(), type: window.getDynamicType('e'), qty: window.getDynamicQty('e'),
      carrier: 'RETURNED TO STOCK', location: $('#e_loc').value.trim(), coords: $('#e_coords').value.trim(),
      weight: $('#e_weight').value.trim(), comments: e.comments, shipped_by: returnedBy, pmd_email: pmName || pickedBy, photo_urls: editTargetRecord.photo_urls
    }]); 
    if(insertError) throw insertError;
    
    await supabaseClient.from('staging').delete().eq('id', currentEditId);
    window.logAction('staging', `Returned to Stock SO: ${editTargetRecord.so}`);
    window.logAction('shipped', `Added Return to Stock log for SO: ${editTargetRecord.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Returned to Stock Successfully');

    // UNIFIED WEBHOOK PAYLOAD
    if(pmChecked && finalPmEmail) {
      const cachedSubject = `RETURN TO STOCK: ${editTargetRecord.so} for ${$('#e_cust').value.trim()}`;
      const cachedBody = `Your order/pick has now been Returned to Stock. Return details:<br><br><b>Reason:</b> ${reason}<br><br>----------------------------------------------------------------------<br><b>SO#</b>                   | ${editTargetRecord.so}<br><b>Customer</b>              | ${$('#e_cust').value.trim()}<br><b>Container(s)</b>          | ${window.getDynamicType('e')}<br><b>Total Weight (In lbs)</b> | ${$('#e_weight').value.trim() || '—'}<br><b>Picked by</b>             | ${pickedBy}<br><b>Returned At</b>           | ${currentTimeStamp}<br><b>Returned By</b>           | ${returnedBy}<br>----------------------------------------------------------------------<br><br>For more shipment details, visit: <a href="https://swiftoperations.github.io/staging-tracker/">Swift Staging Tracker</a><br><br>Thanks`;

      const attachmentUrls = editTargetRecord.photo_urls ? editTargetRecord.photo_urls.map(p => `https://gdrpdiwykmnybmkadlrv.supabase.co/storage/v1/object/public/freight-photos/${p}`) : [];

      fetch('https://hook.us2.make.com/xouhxvxi22q9b3gdwnthe4bre7z2jgu9', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to: finalPmEmail, 
          cc: "warehouse1@swiftsupply.ca", 
          subject: cachedSubject, 
          body: cachedBody,
          attachments: attachmentUrls,
          has_attachments: attachmentUrls.length > 0 // NEW: Bulletproof boolean switch
        })
      }).catch(err => console.warn(err));
    }

    if($('#returnModal')) $('#returnModal').style.display='none';
    window.loadCloudData();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Return to Stock'); }

  } catch(err) { alert("Return to Stock error: " + err.message); }
};

window.saveEditedRecord = async function() {
  const dynamicQty = window.getDynamicQty('e');
  if (dynamicQty === 0) return alert("Error: You must have at least 1 container to save this record.");
  const locValue = $('#e_loc').value.trim(); const soVal = $('#e_so').value.trim();

  if (editTargetRecord.table === 'staging') {
    const proceed = await window.checkSoConflict(soVal, currentEditId);
    if(!proceed) return;
  }
  
  const dynamicType = window.getDynamicType('e');
  const basePayload = { so: soVal, customer: $('#e_cust').value.trim(), location: locValue, coords: $('#e_coords').value.trim(), weight: $('#e_weight').value.trim(), comments: $('#e_comments').value.trim(), type: dynamicType, qty: dynamicQty };

  if (editTargetRecord.table === 'staging') {
    const newStatus = window.getDbStatus($('#e_status').value.trim());
    const { error } = await supabaseClient.from('staging').update({ ...basePayload, status: newStatus, staged_by: $('#e_staged_by').value.trim(), photo_urls: editTargetRecord.photo_urls }).eq('id', currentEditId);
    if(error) { alert("Database Error: " + error.message); return; }
  } else {
    const newCarrier = $('#e_carrier').value.trim();
    const { error } = await supabaseClient.from('shipped').update({ ...basePayload, carrier: newCarrier, shipped_by: $('#e_shipped_by').value.trim(), pmd_email: $('#e_pm').value.trim() || null, photo_urls: editTargetRecord.photo_urls }).eq('id', currentEditId);
    if(error) { alert("Database Error: " + error.message); return; }
  }
  
  window.logAction(editTargetRecord.table, `Edited SO ${basePayload.so}`);
  if($('#editModal')) $('#editModal').style.display = 'none'; 
  if(typeof window.showNotification === 'function') window.showNotification('Record Updated Successfully');
  window.loadCloudData();
};

window.executeShippedUndo = async function() {
  if(!confirm("Are you sure you want to undo this action and return it to Staging?")) return;
  try {
    const { data: currentRecord } = await supabaseClient.from('shipped').select('*').eq('id', editTargetRecord.id).single();
    const proceed = await window.checkSoConflict(currentRecord.so, null);
    if(!proceed) return;
    const { error } = await supabaseClient.from('staging').insert([{ so: currentRecord.so, customer: currentRecord.customer, type: currentRecord.type, qty: currentRecord.qty, location: currentRecord.location, coords: currentRecord.coords, weight: currentRecord.weight, comments: currentRecord.comments, status: '', photo_urls: currentRecord.photo_urls }]);
    if (error) return alert("Undo Database Error: " + error.message); 
    
    await supabaseClient.from('shipped').delete().eq('id', editTargetRecord.id);
    window.logAction('shipped', `Undo Shipment Action for SO: ${currentRecord.so}`);
    window.logAction('staging', `Restored to Staging via Undo for SO: ${currentRecord.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Shipment Action Undone');
    if($('#editModal')) $('#editModal').style.display = 'none'; 
    window.loadCloudData();
  } catch(e) { alert("Undo error: " + e.message); }
};

window.submitFreightDispatch = async function() {
  const dispatcher = $('#m_by').value.trim(); 
  const pmRaw = $('#m_pm_email').value.trim(); const pmChecked = $('#m_pm_chk').checked;
  const carrierVal = $('#m_carrier').value.trim() || 'Unassigned Carrier';
  const shipComments = $('#m_comments') ? $('#m_comments').value.trim() : (activeShipTargetItem.comments || '');
  
  if(!dispatcher) return alert("Missing required dispatcher input.");
  
  let finalPmEmail = null;
  if (pmChecked) {
    finalPmEmail = window.resolveEmail(pmRaw);
    if (!finalPmEmail) return alert("Invalid PM Entry. Please select a valid PM from the list or type a valid email address.");
  }
  
  if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = true;
  try {
    let photoUrls = (activeShipTargetItem && activeShipTargetItem.photo_urls) ? [...activeShipTargetItem.photo_urls] : [];
    
    for (let i = 0; i < selectedPhotoBlobs.length; i++) {
      const file = selectedPhotoBlobs[i]; 
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
      const path = `${activeShipTargetItem.so}-${Date.now()}-${i}-${cleanFileName}`;
      await supabaseClient.storage.from('freight-photos').upload(path, file); photoUrls.push(path);
    }
    
    let pmName = finalPmEmail ? finalPmEmail.split('@')[0].split('.')[0] : null;
    if(pmName) pmName = pmName.charAt(0).toUpperCase() + pmName.slice(1);

    const { error: insertError } = await supabaseClient.from('shipped').insert([{
      so: activeShipTargetItem.so, customer: activeShipTargetItem.customer, type: activeShipTargetItem.type,
      qty: activeShipTargetItem.qty, carrier: carrierVal, location: activeShipTargetItem.location, coords: activeShipTargetItem.coords,
      weight: activeShipTargetItem.weight, comments: activeShipTargetItem.comments, shipped_by: dispatcher, pmd_email: pmName, photo_urls: photoUrls
    }]);
    
    if (insertError) {
      alert("Database Error: " + insertError.message);
      if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false; return;
    }

    await supabaseClient.from('staging').delete().eq('id', activeShipTargetItem.id);
    window.logAction('staging', `Ship Confirmed SO: ${activeShipTargetItem.so}`);
    window.logAction('shipped', `Added via Ship Confirm: SO: ${activeShipTargetItem.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Freight Dispatched Successfully');

    // UNIFIED WEBHOOK PAYLOAD
    if(pmChecked && finalPmEmail) {
      const currentTimeStamp = new Date().toLocaleString();
      const cachedSubject = `CONFIRMATION OF SHIPOUT: ${activeShipTargetItem.customer} ${activeShipTargetItem.so} @ ${activeShipTargetItem.type} via ${carrierVal}`;
      const cachedBody = `Your order has now been shipped! Order details:<br><br>----------------------------------------------------------------------<br><b>SO#</b>                   | ${activeShipTargetItem.so}<br><b>Customer</b>              | ${activeShipTargetItem.customer}<br><b>Container(s)</b>          | ${activeShipTargetItem.type}<br><b>Total Weight (In lbs)</b> | ${activeShipTargetItem.weight || '—'}<br><b>Carrier</b>               | ${carrierVal}<br><b>Shipped At</b>            | ${currentTimeStamp}<br><b>Shipped By</b>            | ${dispatcher}<br><b>Comments</b>              | ${shipComments || 'None'}<br>----------------------------------------------------------------------<br><br>For more shipment details, visit: <a href="https://swiftoperations.github.io/staging-tracker/">Swift Staging Tracker</a><br><br>Thanks`;

      const attachmentUrls = photoUrls.map(p => `https://gdrpdiwykmnybmkadlrv.supabase.co/storage/v1/object/public/freight-photos/${p}`);

      fetch('https://hook.us2.make.com/xouhxvxi22q9b3gdwnthe4bre7z2jgu9', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to: finalPmEmail, 
          cc: "warehouse1@swiftsupply.ca", 
          subject: cachedSubject, 
          body: cachedBody,
          attachments: attachmentUrls,
          has_attachments: attachmentUrls.length > 0 // NEW: Bulletproof boolean switch
        })
      }).catch(err => console.warn(err));
    }

    window.closeShipModal();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Shipped Out'); }

  } catch(e) { alert("Data dispatch error."); } 
  finally { if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false; }
};

window.submitStagingEntry = async function() {
  const sk = parseInt($('#c_skid').value)||0, bx = parseInt($('#c_box').value)||0, cr = parseInt($('#c_crate').value)||0, pi = parseInt($('#c_pipe').value)||0, ot = parseInt($('#c_other').value)||0;
  if(!$('#so').value || !$('#customer').value || !$('#loc').value) return alert("Fields Missing.");
  const totalQty = sk + bx + cr + pi + ot;
  if (totalQty === 0) return alert("Error: You must add at least 1 container to confirm this entry.");
  const soVal = $('#so').value.trim(); const locValue = $('#loc').value.trim();

  const proceed = await window.checkSoConflict(soVal, null); if(!proceed) return;

  let type = []; 
  if(sk) type.push(window.formatContainer(sk, 'Skid'));
  if(bx) type.push(window.formatContainer(bx, 'Box'));
  if(cr) type.push(window.formatContainer(cr, 'Crate'));
  if(pi) type.push(window.formatContainer(pi, 'Pipe/Rod'));
  if(ot) type.push(window.formatContainer(ot, 'Other'));
  
  $('#add').disabled = true; $('#add').textContent = 'Saving...';
  
  try {
    let photoUrls = []; 
    for (let i = 0; i < mainPhotoBlobs.length; i++) {
      const file = mainPhotoBlobs[i]; 
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
      const path = `${soVal}-staging-${Date.now()}-${i}-${cleanFileName}`;
      const { error: uploadError } = await supabaseClient.storage.from('freight-photos').upload(path, file);
      if(!uploadError) photoUrls.push(path);
    }
  
    const { error } = await supabaseClient.from('staging').insert([{ so: soVal, customer: $('#customer').value.trim(), status: window.getDbStatus($('#status').value), location: locValue, coords: $('#coords').value.trim(), weight: $('#weight').value.trim(), comments: $('#comments').value.trim(), staged_by: $('#staged_by').value.trim(), type: type.join(', '), qty: totalQty, photo_urls: photoUrls }]);
    if (error) { alert("Database Error: " + error.message); $('#add').disabled = false; $('#add').textContent = 'Add'; return; }
    
    window.logAction('staging', `Added new entry for SO: ${soVal}`);
    if(typeof window.showNotification === 'function') window.showNotification('Staging Entry Added');
    
    $('#so').value=''; $('#customer').value=''; $('#loc').value=''; $('#coords').value=''; $('#staged_by').value=''; $('#weight').value=''; $('#c_skid').value=0; $('#c_box').value=0; $('#c_crate').value=0; $('#c_pipe').value=0; $('#c_other').value=0; 
    if($('#comments')) $('#comments').value='';
    mainPhotoBlobs = []; window.renderMainPhotoStrip();
    window.loadCloudData();
  } catch(e) { alert("System Error: " + e.message); }
  
  $('#add').disabled = false; $('#add').textContent = 'Add';
};

window.saveQuickComment = async function() {
  const newComment = $('#quick_comments').value.trim();
  const { error } = await supabaseClient.from(currentCommentTarget.table).update({ comments: newComment }).eq('id', currentCommentTarget.id);
  if(error) return alert("Error saving comment: " + error.message);
  const o = appData[currentCommentTarget.table].find(x => x.id === currentCommentTarget.id);
  if(o) window.logAction(currentCommentTarget.table, `Added/Edited comment for SO: ${o.so}`);
  if(typeof window.showNotification === 'function') window.showNotification('Comment Saved');
  if($('#commentModal')) $('#commentModal').style.display = 'none'; window.loadCloudData();
};

// --- NOTIFY OF RETURNS LOGIC ---

window.nrPhotoBlobs = [];

window.addNRPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(window.nrPhotoBlobs.length < 10) window.nrPhotoBlobs.push(f); });
  window.renderNRPhotoStrip();
};

window.renderNRPhotoStrip = function() {
  const container = $('#nr_photoPreviewStrip'); if(!container) return; container.innerHTML = '';
  window.nrPhotoBlobs.forEach((f, idx) => {
    container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Img-${idx+1} <span onclick="window.nrPhotoBlobs.splice(${idx},1); window.renderNRPhotoStrip()">&times;</span></span>`);
  });
};

window.openNotifyReturnModal = function() {
  $('#nr_so').value=''; $('#nr_cust').value=''; $('#nr_skid').value=0; $('#nr_box').value=0; $('#nr_crate').value=0; $('#nr_pipe').value=0; $('#nr_other').value=0; 
  $('#nr_loc').value=''; $('#nr_coords').value=''; $('#nr_weight').value=''; $('#nr_comments').value=''; 
  $('#nr_received_by').value = currentUser ? currentUser.email.split('@')[0] : '';
  if($('#nr_cc_pm')) $('#nr_cc_pm').value = ''; 
  window.nrPhotoBlobs = []; window.renderNRPhotoStrip();
  $('#notifyReturnModal').style.display = 'flex';
};

window.submitNotifyReturn = async function() {
  const soVal = $('#nr_so').value.trim();
  const custVal = $('#nr_cust').value.trim();
  const locVal = $('#nr_loc').value.trim();
  const receivedByVal = $('#nr_received_by').value.trim();
  const pmInputEl = $('#nr_pm_email') || $('#nr_cc_pm');
  const pmRaw = pmInputEl ? pmInputEl.value.trim() : ''; 
  
  if(!soVal || !custVal || !locVal || !receivedByVal) return alert("Please fill out all required fields (*).");
  if(!pmRaw) return alert("Please specify a PM to notify of this return.");
  
  const finalPmEmail = window.resolveEmail(pmRaw);
  if (!finalPmEmail) return alert("Invalid PM Entry. Please select a valid PM from the list or type a full email address (e.g., name@domain.com).");

  $('#nr_submitBtn').disabled = true; $('#nr_submitBtn').textContent = 'Sending Notification...';
  
  try {
    const dynamicType = window.getDynamicType('nr');
    const weightVal = $('#nr_weight').value.trim();
    const coordsVal = $('#nr_coords').value.trim();
    const commentsVal = $('#nr_comments').value.trim();
    
    let attachmentUrls = []; 
    
    for (let i = 0; i < window.nrPhotoBlobs.length; i++) {
      const file = window.nrPhotoBlobs[i]; 
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
      const path = `${soVal}-return-${Date.now()}-${i}-${cleanFileName}`;
      const { error: uploadError } = await supabaseClient.storage.from('freight-photos').upload(path, file);
      if(!uploadError) {
        const publicUrl = `https://gdrpdiwykmnybmkadlrv.supabase.co/storage/v1/object/public/freight-photos/${path}`;
        attachmentUrls.push(publicUrl); 
      }
    }

    const currentTimeStamp = new Date().toLocaleString();
    const emailSubject = `WAREHOUSE RETURN NOTIFICATION: SO ${soVal} - ${custVal}`;
    let emailBody = `A new return has been received at the warehouse. Details below:<br><br>
    ----------------------------------------------------------------------<br>
    <b>SO#</b>                   | ${soVal}<br>
    <b>Customer</b>              | ${custVal}<br>
    <b>Container(s)</b>          | ${dynamicType || 'None specified'}<br>
    <b>Location</b>              | ${locVal}<br>
    <b>Total Weight (In lbs)</b> | ${weightVal || '—'}<br>
    <b>Coords</b>                | ${coordsVal || '—'}<br>
    <b>Received By</b>           | ${receivedByVal}<br>
    <b>Received At</b>           | ${currentTimeStamp}<br>
    <b>Comments</b>              | ${commentsVal || 'None'}<br>
    ----------------------------------------------------------------------<br><br>`;
    
    emailBody += `For more details, visit: <a href="https://swiftoperations.github.io/staging-tracker/">Swift Staging Tracker</a>`;

    // UNIFIED WEBHOOK PAYLOAD
    fetch('https://hook.us2.make.com/xouhxvxi22q9b3gdwnthe4bre7z2jgu9', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        to: finalPmEmail, 
        cc: "warehouse1@swiftsupply.ca", 
        subject: emailSubject, 
        body: emailBody,
        attachments: attachmentUrls,
        has_attachments: attachmentUrls.length > 0 // NEW: Bulletproof boolean switch
      })
    }).catch(e => console.warn('Webhook silently caught error:', e));

    window.logAction('staging', `Sent Automated Return Notification for SO: ${soVal}`);
    if(typeof window.showNotification === 'function') window.showNotification('Return Notification Sent Successfully');
    $('#notifyReturnModal').style.display = 'none';

  } catch(e) { alert("System Error: " + e.message); }
  
  $('#nr_submitBtn').disabled = false; $('#nr_submitBtn').textContent = 'Submit Return Notification';
};

// NEW: Email Auto-Corrector. Safely converts typed names into valid emails.
window.resolveEmail = function(inputVal) {
  if (!inputVal) return null;
  let val = inputVal.trim();
  if (val.includes('@') && val.includes('.')) return val; 
  if (typeof rawContactsData !== 'undefined') {
    const match = rawContactsData.find(c => c.name.toLowerCase() === val.toLowerCase() || c.name.toLowerCase().includes(val.toLowerCase()));
    if (match && match.email && match.email !== 'N/A') return match.email;
  }
  return null; 
};

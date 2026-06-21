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
    if(typeof window.showNotification === 'function') window.showNotification('Record Deleted Permanently');
    window.loadCloudData();
    
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Deletion'); }
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
    if(typeof window.showNotification === 'function') window.showNotification('Returned to Stock Successfully');

    if(pmChecked) {
      const cachedSubject = `RETURN TO STOCK: ${editTargetRecord.so} for ${$('#e_cust').value.trim()}`;
      const cachedBody = `Your order/pick has now been Returned to Stock. Return details:\n\nReason: ${reason}\n\n----------------------------------------------------------------------\nSO#                   | ${editTargetRecord.so}\nCustomer              | ${$('#e_cust').value.trim()}\nContainer(s)          | ${window.getDynamicType('e')}\nTotal Weight (In lbs) | ${$('#e_weight').value.trim() || '—'}\nPicked by             | ${pickedBy}\nReturned At           | ${currentTimeStamp}\nReturned By           | ${returnedBy}\n----------------------------------------------------------------------\n\nFor more shipment details, visit: https://swiftoperations.github.io/staging-tracker/\n\nThanks`;
      
      fetch('PASTE_YOUR_MAKE_WEBHOOK_URL_HERE', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: pmEmail, cc: "warehouse1@swiftsupply.ca", subject: cachedSubject, body: cachedBody })
      });
    }

    if($('#returnModal')) $('#returnModal').style.display='none';
    window.loadCloudData();
    
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Return to Stock'); }

  } catch(err) { alert("Return to Stock error: " + err.message); }
};

window.saveEditedRecord = async function() {
  const dynamicQty = window.getDynamicQty('e');
  if (dynamicQty === 0) return alert("Error: You must have at least 1 container to save this record.");
  
  const locValue = $('#e_loc').value.trim();
  const soVal = $('#e_so').value.trim();

  if (editTargetRecord.table === 'staging') {
    const proceed = await window.checkSoConflict(soVal, currentEditId);
    if(!proceed) return;
  }
  
  const aisleRegex = /^[A-Z]-\d{2}-[A-F]-[12]$/i;
  if (editTargetRecord.table === 'staging' && aisleRegex.test(locValue)) {
    const isOccupied = appData.staging.some(x => x.id !== currentEditId && (x.location || '').toLowerCase() === locValue.toLowerCase());
    if (isOccupied) {
      if (!confirm(`Conflict Warning: Aisle location ${locValue.toUpperCase()} is already occupied. Do you want to proceed and place them together?`)) return;
    }
  }

  const dynamicType = window.getDynamicType('e');
  const basePayload = { so: soVal, customer: $('#e_cust').value.trim(), location: locValue, coords: $('#e_coords').value.trim(), weight: $('#e_weight').value.trim(), comments: $('#e_comments').value.trim(), type: dynamicType, qty: dynamicQty };

  if (editTargetRecord.table === 'staging') {
    const newStatus = $('#e_status').value.trim();
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
  
  if(window.activeReportMode) { window.reportRecordAction('Fixed via Manual Edit'); }
};

window.executeShippedUndo = async function() {
  if(!confirm("Are you sure you want to undo this action and return it to Staging?")) return;
  try {
    const { data: currentRecord } = await supabaseClient.from('shipped').select('*').eq('id', editTargetRecord.id).single();
    
    const proceed = await window.checkSoConflict(currentRecord.so, null);
    if(!proceed) return;

    const { error } = await supabaseClient.from('staging').insert([{ so: currentRecord.so, customer: currentRecord.customer, type: currentRecord.type, qty: currentRecord.qty, location: currentRecord.location, coords: currentRecord.coords, weight: currentRecord.weight, comments: currentRecord.comments, status: 'Partial', photo_urls: currentRecord.photo_urls }]);
    if (error) { alert("Undo Database Error: " + error.message); return; }
    
    await supabaseClient.from('shipped').delete().eq('id', editTargetRecord.id);
    window.logAction('shipped', `Undo Shipment Action for SO: ${currentRecord.so}`);
    window.logAction('staging', `Restored to Staging via Undo for SO: ${currentRecord.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Shipment Action Undone');
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

        await supabaseClient.from('staging').delete().eq('id', activeShipTargetItem.id);
    window.logAction('staging', `Ship Confirmed SO: ${activeShipTargetItem.so}`);
    window.logAction('shipped', `Added via Ship Confirm: SO: ${activeShipTargetItem.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Freight Dispatched Successfully');

    if(pmChecked) {
      const currentTimeStamp = new Date().toLocaleString();
      const cachedSubject = `CONFIRMATION OF SHIPOUT: ${activeShipTargetItem.customer} ${activeShipTargetItem.so} @ ${activeShipTargetItem.type} via ${carrierVal}`;
      const cachedBody = `Your order has now been shipped! Order details:\n\n----------------------------------------------------------------------\nSO#                   | ${activeShipTargetItem.so}\nCustomer              | ${activeShipTargetItem.customer}\nContainer(s)          | ${activeShipTargetItem.type}\nTotal Weight (In lbs) | ${activeShipTargetItem.weight || '—'}\nCarrier               | ${carrierVal}\nShipped At            | ${currentTimeStamp}\nShipped By            | ${dispatcher}\n----------------------------------------------------------------------\n\nFor more shipment details, visit: https://swiftoperations.github.io/staging-tracker/\n\nThanks`;
      
      fetch('PASTE_YOUR_MAKE_WEBHOOK_URL_HERE', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: pmEmail, cc: "warehouse1@swiftsupply.ca", subject: cachedSubject, body: cachedBody })
      });
    }

    window.closeShipModal();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Shipped Out'); }

      if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false;
      return;
    }

    await supabaseClient.from('staging').delete().eq('id', activeShipTargetItem.id);
    window.logAction('staging', `Ship Confirmed SO: ${activeShipTargetItem.so}`);
    window.logAction('shipped', `Added via Ship Confirm: SO: ${activeShipTargetItem.so}`);
    if(typeof window.showNotification === 'function') window.showNotification('Freight Dispatched Successfully');

    window.closeShipModal();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Shipped Out'); }
  } catch(e) { alert("Data dispatch error."); } finally { if($('#modalConfirmBtn')) $('#modalConfirmBtn').disabled = false; }
};

window.submitStagingEntry = async function() {
  const sk = parseInt($('#c_skid').value)||0, bx = parseInt($('#c_box').value)||0, cr = parseInt($('#c_crate').value)||0, pi = parseInt($('#c_pipe').value)||0, ot = parseInt($('#c_other').value)||0;
  if(!$('#so').value || !$('#customer').value || !$('#loc').value) return alert("Fields Missing.");
  
  const totalQty = sk + bx + cr + pi + ot;
  if (totalQty === 0) return alert("Error: You must add at least 1 container to confirm this entry.");
  
  const soVal = $('#so').value.trim();
  const locValue = $('#loc').value.trim();

  const proceed = await window.checkSoConflict(soVal, null);
  if(!proceed) return;

  const aisleRegex = /^[A-Z]-\d{2}-[A-F]-[12]$/i;
  if (aisleRegex.test(locValue)) {
    const isOccupied = appData.staging.some(x => (x.location || '').toLowerCase() === locValue.toLowerCase());
    if (isOccupied) {
      if (!confirm(`Conflict Warning: Aisle location ${locValue.toUpperCase()} is already occupied. Do you want to proceed and place them together?`)) return;
    }
  }
  
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
      const path = `${soVal}-staging-${Date.now()}-${i}-${cleanFileName}`;
      const { error: uploadError } = await supabaseClient.storage.from('freight-photos').upload(path, file);
      if(!uploadError) photoUrls.push(path);
    }
  
    const { error } = await supabaseClient.from('staging').insert([{ so: soVal, customer: $('#customer').value.trim(), status: $('#status').value, location: locValue, coords: $('#coords').value.trim(), weight: $('#weight').value.trim(), comments: $('#comments').value.trim(), staged_by: $('#staged_by').value.trim(), type: type.join(', '), qty: totalQty, photo_urls: photoUrls }]);
    
    if (error) {
      alert("Database Error: " + error.message);
      $('#add').disabled = false; $('#add').textContent = 'Add'; return;
    }
    
    window.logAction('staging', `Added new entry for SO: ${soVal}`);
    if(typeof window.showNotification === 'function') window.showNotification('Staging Entry Added');
    
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
  const o = appData[currentCommentTarget.table].find(x => x.id === currentCommentTarget.id);
  if(o) window.logAction(currentCommentTarget.table, `Added/Edited comment for SO: ${o.so}`);
  if(typeof window.showNotification === 'function') window.showNotification('Comment Saved');
  if($('#commentModal')) $('#commentModal').style.display = 'none';
  window.loadCloudData();
};

window.openOrderHistory = async function(so) {
  if(!$('#orderHistoryModal')) return;
  $('#history_so_title').textContent = so;
  $('#history_content').innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280;">Loading history...</div>';
  $('#orderHistoryModal').style.display = 'flex';

  try {
    const activeEntries = appData.staging.filter(x => x.so === so);
    const shippedEntries = appData.shipped.filter(x => x.so === so);
    let html = `<div class="history-section" style="background:#fff; border-radius:8px; padding:12px; border:1px solid #cbd5e1;">`;

    html += `<h4 style="margin:0 0 8px 0; color:#0ea5e9; border-bottom:2px solid #e0f2fe; padding-bottom:6px; font-size:14px;">Current Active Staging</h4>`;
    if(activeEntries.length === 0) html += `<p style="font-size:12px; color:#6b7280;">No active staging entries found.</p>`;
    else {
      html += `<ul style="margin:0 0 12px 0; padding-left:20px; font-size:13px; color:#334155;">`;
      activeEntries.forEach(e => {
        html += `<li style="margin-bottom:6px;"><b>${e.type}</b> @ <b>${e.location}</b> <br><span style="font-size:11px; color:#64748b;">(Staged by ${e.staged_by || 'Unknown'} on ${new Date(e.entry_date).toLocaleString()})</span></li>`;
      });
      html += `</ul>`;
    }

    html += `<h4 style="margin:0 0 8px 0; color:#10b981; border-bottom:2px solid #d1fae5; padding-bottom:6px; font-size:14px;">Past Shipments</h4>`;
    if(shippedEntries.length === 0) html += `<p style="font-size:12px; color:#6b7280;">No past shipments found.</p>`;
    else {
      html += `<ul style="margin:0 0 12px 0; padding-left:20px; font-size:13px; color:#334155;">`;
      shippedEntries.forEach(e => {
        const action = e.carrier === 'RETURNED TO STOCK' ? 'Returned to Stock' : (e.carrier === 'CONSOLIDATED' ? 'Consolidated' : `Shipped via ${e.carrier}`);
        html += `<li style="margin-bottom:6px;"><b>${e.type}</b> - ${action} from <b>${e.location}</b> <br><span style="font-size:11px; color:#64748b;">(By ${e.shipped_by || 'Unknown'} on ${new Date(e.shipped_at).toLocaleString()})</span></li>`;
      });
      html += `</ul>`;
    }

    html += `<h4 style="margin:0 0 8px 0; color:#8b5cf6; border-bottom:2px solid #ede9fe; padding-bottom:6px; font-size:14px;">Changelog History</h4>`;
    const { data, error } = await supabaseClient.from('changelog').select('*').ilike('action', `%${so}%`).order('created_at', { ascending: false });
    if(error) throw error;
    if(!data || data.length === 0) {
      html += `<p style="font-size:12px; color:#6b7280;">No log history.</p>`;
    } else {
      html += `<ul style="margin:0; padding-left:20px; font-size:12px; color:#4b5563; max-height:200px; overflow-y:auto;">`;
      data.forEach(log => { html += `<li style="margin-bottom:8px;"><b>${new Date(log.created_at).toLocaleString()}</b> <span style="color:#0ea5e9; font-weight:bold;">[${log.user_email}]</span><br/>${log.action}</li>`; });
      html += `</ul>`;
    }

    html += `</div>`;
    $('#history_content').innerHTML = html;
  } catch (e) { $('#history_content').innerHTML = `<span style="color:red;">Error: ${e.message}</span>`; }
};

window.checkSoConflict = function(so, currentId = null) {
  return new Promise(resolve => {
    const exists = appData.staging.some(x => x.so === so && x.id !== currentId);
    if (!exists) return resolve(true);

    $('#conflict_so_title').textContent = so;
    $('#conflict_content').innerHTML = '<div style="text-align:center; padding:10px; color:#6b7280;">Loading history...</div>';
    $('#soConflictModal').style.display = 'flex';

    supabaseClient.from('changelog').select('*').ilike('action', `%${so}%`).order('created_at', { ascending: false }).then(({data, error}) => {
      if(error || !data || data.length === 0) {
        $('#conflict_content').innerHTML = '<span style="color:#6b7280; padding:10px;">No previous history found.</span>';
      } else {
        let html = '<ul style="text-align:left; padding-left:20px; margin:0; font-size:13px; color:#4b5563; max-height:200px; overflow-y:auto;">';
        data.forEach(log => { html += `<li style="margin-bottom:8px;"><b>${new Date(log.created_at).toLocaleString()}</b> [${log.user_email}]<br/>${log.action}</li>`; });
        html += '</ul>';
        $('#conflict_content').innerHTML = html;
      }
    });

    $('#conflictCancelBtn').onclick = () => { $('#soConflictModal').style.display = 'none'; resolve(false); };
    $('#conflictProceedBtn').onclick = () => { $('#soConflictModal').style.display = 'none'; resolve(true); };
  });
};

window.splitEngine = { targetId: null, total: 0, current: 0, dataArray: [], sourceItem: null };

window.openSplitPrompt = function() {
  window.splitEngine.targetId = window.activeReportMode ? window.reportQueue[window.reportIndex] : currentEditId;
  $('#split_count_input').value = 2;
  if($('#editModal')) $('#editModal').style.display = 'none';
  $('#splitPromptModal').style.display = 'flex';
};

window.submitSplitCount = function() {
  const count = parseInt($('#split_count_input').value);
  if(isNaN(count) || count < 2) return alert("Must select at least 2 splits.");
  
  window.splitEngine.total = count;
  window.splitEngine.current = 1;
  window.splitEngine.dataArray = [];
  window.splitEngine.sourceItem = appData.staging.find(x => x.id === window.splitEngine.targetId);
  
  $('#splitPromptModal').style.display = 'none';
  window.renderSplitConfig();
};

window.renderSplitConfig = function() {
  const item = window.splitEngine.sourceItem;
  $('#splitConfigTitle').textContent = `Configure Split (${window.splitEngine.current} of ${window.splitEngine.total})`;
  $('#sp_so').value = item.so;
  $('#sp_cust').value = item.customer;
  
  $('#sp_skid').value = 0; $('#sp_box').value = 0; $('#sp_crate').value = 0; $('#sp_pipe').value = 0; $('#sp_other').value = 0;
  $('#sp_loc').value = ''; $('#sp_coords').value = ''; $('#sp_weight').value = ''; $('#sp_comments').value = '';
  $('#sp_status').value = 'Partial';
  $('#sp_staged_by').value = currentUser ? currentUser.email.split('@')[0] : '';
  
  $('#configureSplitModal').style.display = 'flex';
};

window.saveConfigureSplit = async function() {
  const dynamicQty = window.getDynamicQty('sp');
  if (dynamicQty === 0) return alert("Error: You must add at least 1 container to confirm this split.");
  if (!$('#sp_loc').value.trim()) return alert("Error: You must assign a Location for this split.");
  
  const payload = {
    so: $('#sp_so').value.trim(), customer: $('#sp_cust').value.trim(), location: $('#sp_loc').value.trim(),
    coords: $('#sp_coords').value.trim(), weight: $('#sp_weight').value.trim(), status: $('#sp_status').value.trim(),
    comments: $('#sp_comments').value.trim(), staged_by: $('#sp_staged_by').value.trim() + ' (Split)',
    type: window.getDynamicType('sp'), qty: dynamicQty, photo_urls: window.splitEngine.sourceItem.photo_urls || []
  };
  
  window.splitEngine.dataArray.push(payload);
  window.splitEngine.current++;
  
  if (window.splitEngine.current > window.splitEngine.total) {
    $('#configureSplitModal').style.display = 'none';
    try {
      const { error: insErr } = await supabaseClient.from('staging').insert(window.splitEngine.dataArray);
      if(insErr) throw insErr;
      await supabaseClient.from('staging').delete().eq('id', window.splitEngine.targetId);
      
      window.logAction('staging', `Split Order SO ${payload.so} into ${window.splitEngine.total} separate entries.`);
      if(typeof window.showNotification === 'function') window.showNotification(`Order Split Successfully`);
      window.loadCloudData();
      
      if(window.activeReportMode) { window.reportRecordAction('Fixed via Split'); }
    } catch(e) { alert("Split Error: " + e.message); }
  } else {
    $('#configureSplitModal').style.display = 'none';
    setTimeout(window.renderSplitConfig, 200);
  }
};

window.activeReportMode = false;
window.reportQueue = [];
window.reportIndex = 0;
window.reportResults = [];

function locSortKey(loc) {
  const match = (loc||'').toUpperCase().match(/^([A-Z])-(\d{2})-([A-Z])-(1|2|1\+2)$/);
  if (!match) return [1, loc||'']; 
  let suffixWeight = 0;
  if (match[4] === '1') suffixWeight = 1;
  else if (match[4] === '2') suffixWeight = 2;
  else if (match[4] === '1+2') suffixWeight = 3;
  return [0, match[1], parseInt(match[2], 10), match[3], suffixWeight];
}

window.startStagingReport = function(mode) {
  const saved = localStorage.getItem('swift_report_state');
  if(saved) {
    try {
      const state = JSON.parse(saved);
      if(state.queue && state.queue.length > 0 && state.index < state.queue.length) {
        window.pendingReportMode = mode;
        if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'flex';
        return;
      }
    } catch(e) {}
  }
  window.initStagingReport(mode);
};

window.resumeStagingReport = function() {
  const state = JSON.parse(localStorage.getItem('swift_report_state'));
  window.reportQueue = state.queue;
  window.reportIndex = state.index;
  window.reportResults = state.results || [];
  window.activeReportMode = true;
  if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'none';
  window.renderNextReportItem();
};

window.initStagingReport = function(mode = 'all') {
  if(!mode && window.pendingReportMode) mode = window.pendingReportMode;
  const aisleRegex = /^([A-Z])-\d{2}-([A-Z])-(1|2|1\+2)$/i;
  
  let sourceData = appData.staging;
  if (mode === 'aisle') sourceData = sourceData.filter(x => aisleRegex.test(x.location||''));
  else if (mode === 'non_aisle') sourceData = sourceData.filter(x => !aisleRegex.test(x.location||''));
  else if (mode === 'discrepancies') sourceData = sourceData.filter(x => discrepancyList && discrepancyList.includes(x.id));

  let sorted = [...sourceData].sort((a, b) => {
    const keyA = locSortKey(a.location), keyB = locSortKey(b.location);
    if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
    if (keyA[0] === 1) return (a.location||'').localeCompare(b.location||''); 
    if (keyA[1] !== keyB[1]) return keyA[1].localeCompare(keyB[1]);
    if (keyA[2] !== keyB[2]) return keyA[2] - keyB[2];
    if (keyA[3] !== keyB[3]) return keyA[3].localeCompare(keyB[3]);
    return keyA[4] - keyB[4];
  });
  
  window.reportQueue = sorted.map(x => x.id);
  window.reportIndex = 0;
  window.reportResults = [];
  window.activeReportMode = true;
  window.saveReportState();
  if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'none';
  window.renderNextReportItem();
};

window.saveReportState = function() {
  localStorage.setItem('swift_report_state', JSON.stringify({queue: window.reportQueue, index: window.reportIndex, results: window.reportResults}));
};

window.downloadCSV = function(data, filename) {
  const headers = ['SO', 'Customer', 'Location', 'Entry Date', 'Result'];
  let csv = headers.join(',') + '\n';
  data.forEach(r => { csv += `"${r.so||''}","${r.customer||''}","${r.location||''}","${r.date||''}","${r.result||''}"\n`; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

window.renderNextReportItem = function() {
  if(!window.activeReportMode) return;
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); 
  
  if (window.reportIndex >= window.reportQueue.length) {
    alert("Staging Verification Report Complete!");
    window.activeReportMode = false;
    localStorage.removeItem('swift_report_state');
    if(window.reportResults && window.reportResults.length > 0) {
      window.downloadCSV(window.reportResults, 'Verification_Results.csv');
      const discrepancies = window.reportResults.filter(r => r.result !== 'Verified');
      if(discrepancies.length > 0) window.downloadCSV(discrepancies, 'Verification_Discrepancies.csv');
    }
    return;
  }

  const itemId = window.reportQueue[window.reportIndex];
  const item = appData.staging.find(x => x.id === itemId);
  
  if (!item) {
    window.reportIndex++; window.saveReportState(); return window.renderNextReportItem();
  }

  if($('#rep_loc')) $('#rep_loc').textContent = item.location || 'No Location';
  if($('#rep_so')) $('#rep_so').textContent = item.so;
  if($('#rep_cust')) $('#rep_cust').textContent = item.customer;
  if($('#rep_date')) $('#rep_date').textContent = new Date(item.entry_date).toLocaleString();
  if($('#rep_qty')) $('#rep_qty').textContent = item.type;
  if($('#rep_status')) $('#rep_status').textContent = item.status;
  if($('#rep_by')) $('#rep_by').textContent = item.staged_by || '—';
  
  if($('#rep_comment_box')) {
    if(item.comments && item.comments.trim() !== '') {
      $('#rep_comment_box').style.display = 'block';
      $('#rep_comments_text').value = item.comments;
    } else { $('#rep_comment_box').style.display = 'none'; }
  }
  
  if($('#rep_progress')) $('#rep_progress').textContent = `${window.reportIndex + 1} of ${window.reportQueue.length}`;
  if($('#reportMainModal')) $('#reportMainModal').style.display = 'flex';
};

window.reportRecordAction = function(resultStr) {
  const item = appData.staging.find(x => x.id === window.reportQueue[window.reportIndex]);
  if(item) {
    window.reportResults.push({ so: item.so, customer: item.customer, location: item.location, date: new Date(item.entry_date).toLocaleString(), result: resultStr });
    discrepancyList = discrepancyList.filter(id => id !== item.id);
    if(resultStr !== 'Verified') discrepancyList.push(item.id);
    localStorage.setItem('swift_discrepancies', JSON.stringify(discrepancyList));
  }
  window.reportIndex++;
  window.saveReportState();
  setTimeout(window.renderNextReportItem, 600);
};

window.reportHandleYes = function() {
  window.reportRecordAction('Verified');
};

window.reportHandleNo = function() {
  if($('#reportMainModal')) $('#reportMainModal').style.display = 'none';
  if($('#reportNoModal')) $('#reportNoModal').style.display = 'flex';
};

window.reportHandleBack = function() {
  if (window.reportIndex > 0) {
    window.reportResults.pop();
    window.reportIndex--;
    window.saveReportState();
    window.renderNextReportItem();
  } else {
    alert("You are at the beginning of the report.");
  }
};

window.reportAction = function(action) {
  const itemId = window.reportQueue[window.reportIndex];
  if($('#reportNoModal')) $('#reportNoModal').style.display = 'none';
  
  if(action === 'settle') {
    window.reportRecordAction('Discrepancy - Unresolved');
  } 
  else if (action === 'change') {
    if($('#report_new_loc')) $('#report_new_loc').value = '';
    if($('#reportChangeLocModal')) $('#reportChangeLocModal').style.display = 'flex';
  } 
  else if (action === 'split') {
    window.openSplitPrompt();
  }
  else if (action === 'ship') {
    window.triggerShipModal(itemId);
  }
  else {
    window.openUniversalEditor('staging', itemId);
    if($('#editModal')) $('#editModal').style.display = 'none'; 
    
    if (action === 'delete') window.deleteCurrentRecord();
    else if (action === 'return') window.triggerReturnModal();
    else if (action === 'consolidate') window.openSameSoModal();
  }
};

window.reportSubmitNewLocation = async function() {
  const newLoc = $('#report_new_loc').value.trim();
  if(!newLoc) return alert("Enter a valid location.");
  
  const targetId = window.reportQueue[window.reportIndex];
  const target = appData.staging.find(x => x.id === targetId);
  
  $('#reportChangeLocModal').style.display = 'none';
  try {
    const { error } = await supabaseClient.from('staging').update({ location: newLoc }).eq('id', targetId);
    if(error) throw error;
    
    window.logAction('staging', `Report Fix: Changed Location for SO ${target.so} to ${newLoc}`);
    if(typeof window.showNotification === 'function') window.showNotification('Location Updated');
    
    window.loadCloudData();
    window.reportRecordAction(`Fixed via Location Change (${newLoc})`);
  } catch(e) { alert("Error updating location: " + e.message); window.renderNextReportItem(); }
};

window.logAction = async function(table, actionDesc) {
  const userEmail = currentUser ? currentUser.email.split('@')[0] : 'Guest';
  try {
    await supabaseClient.from('changelog').insert([{
      table_name: table, action: actionDesc, user_email: userEmail
    }]);
  } catch(e) { console.error("Changelog log failed:", e); }
};

window.openChangelogModal = async function(table) {
  if(!$('#changelogModal')) return;
  $('#changelogTitle').textContent = table === 'staging' ? 'Staging Entries Changelog' : 'Shipped Log Changelog';
  const tbody = $('#tblChangelog tbody');
  
  tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:12px;">Loading changes...</td></tr>';
  $('#changelogModal').style.display = 'flex';
  
  try {
    const { data, error } = await supabaseClient.from('changelog')
      .select('*').eq('table_name', table).order('created_at', { ascending: false }).limit(75);
      
    if(error) throw error;
    tbody.innerHTML = '';
    
    if(!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#6b7280; padding:12px;">No changes logged yet.</td></tr>';
      return;
    }
    
    data.forEach(log => {
      tbody.insertAdjacentHTML('beforeend', `
        <tr style="border-bottom: 1px solid #f0f1f3;">
          <td style="color:#6b7280; font-size:12px; white-space:nowrap; padding:8px;">${new Date(log.created_at).toLocaleString()}</td>
          <td style="font-size:13px; padding:8px;"><span style="font-weight:bold; color:#0284c7;">[${log.user_email}]</span> ${log.action}</td>
        </tr>
      `);
    });
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:red; padding:12px;">Error: ${e.message}</td></tr>`;
  }
};

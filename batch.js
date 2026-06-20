window.toggleBatchMode = function() {
  isBatchMode = !isBatchMode; batchSelectedIds.clear();
  document.body.classList.toggle('batch-mode', isBatchMode); window.renderTables();
};

window.toggleBatchSelect = function(id, isChecked) {
  if (isChecked) batchSelectedIds.add(id); else batchSelectedIds.delete(id);
};

window.batchSelectAll = function() {
  const q = $('#q') ? $('#q').value.toLowerCase() : '';
  const fStaging = appData.staging.filter(o => (o.so||'').toLowerCase().includes(q) || (o.customer||'').toLowerCase().includes(q) || (o.location||'').toLowerCase().includes(q));
  fStaging.forEach(o => batchSelectedIds.add(o.id)); window.renderTables();
};

window.batchUnselectAll = function() { batchSelectedIds.clear(); window.renderTables(); };

window.batchDelete = async function() {
  if (batchSelectedIds.size === 0) return alert("Select at least one entry to delete.");
  if (!confirm(`Are you sure you want to PERMANENTLY delete ${batchSelectedIds.size} selected entries?`)) return;
  try {
    for (let id of batchSelectedIds) {
      const target = appData.staging.find(x => x.id === id);
      if (target) window.logAction('staging', `Batch Deleted entry for SO: ${target.so}`);
      await supabaseClient.from('staging').delete().eq('id', id);
    }
    if (typeof window.showNotification === 'function') window.showNotification(`Successfully deleted ${batchSelectedIds.size} entries.`);
    window.batchCancel(); window.loadCloudData();
  } catch(e) { alert("Batch delete error: " + e.message); }
};

window.batchCancel = function() {
  isBatchMode = false; batchSelectedIds.clear(); document.body.classList.remove('batch-mode'); window.renderTables();
};

window.openSameSoModal = function() {
  if(!currentEditId) return; const target = appData.staging.find(x => x.id === currentEditId); if(!target) return;
  if($('#editModal')) $('#editModal').style.display = 'none';
  
  isSameSoMode = true; sameSoSelectedIds.clear();
  const matchingItems = appData.staging.filter(x => x.so === target.so); matchingItems.forEach(o => sameSoSelectedIds.add(o.id));
  
  const tBody = $('#tblSameSo tbody'); tBody.innerHTML = '';
  matchingItems.forEach(o => {
    tBody.insertAdjacentHTML('beforeend', `<tr style="color:#6b7280;">
      <td style="text-align:center;"><input type="checkbox" style="width:16px;height:16px;" onchange="window.toggleSameSoSelect('${o.id}', this.checked)" checked></td>
      <td><b>${o.so}</b></td><td>${o.customer}</td><td>${new Date(o.entry_date).toLocaleString()}</td><td>${o.type}</td><td>${o.location}</td><td><small>${o.coords||'—'}</small></td>
      <td>${o.weight || '—'}</td><td>${o.status}</td><td>${o.staged_by||'—'}</td></tr>`);
  });
  $('#sameSoModal').style.display = 'flex';
};

window.toggleSameSoSelect = function(id, isChecked) { if(isChecked) sameSoSelectedIds.add(id); else sameSoSelectedIds.delete(id); };

window.sameSoSelectAll = function() {
  const target = appData.staging.find(x => x.id === currentEditId);
  appData.staging.filter(x => x.so === target.so).forEach(o => sameSoSelectedIds.add(o.id));
  window.openSameSoModal(); 
};

window.sameSoCancel = function() { isSameSoMode = false; sameSoSelectedIds.clear(); $('#sameSoModal').style.display = 'none'; };

window.openBatchConsolidateModal = function(fromSameSo = false) {
  const selectedSet = fromSameSo ? sameSoSelectedIds : batchSelectedIds;
  if(selectedSet.size === 0) return alert("Select at least one order to consolidate.");
  
  let firstItem = null; let conflict = false; let totalSk = 0, totalBx = 0, totalCr = 0, totalPi = 0, totalOt = 0; let totalWeight = 0; let photoUrls = [];
  selectedSet.forEach(id => {
    const item = appData.staging.find(x => x.id === id); if(!item) return;
    if(!firstItem) firstItem = item; else if(item.so !== firstItem.so || item.customer !== firstItem.customer) conflict = true;
    const counts = window.parseContainerString(item.type);
    totalSk += counts.sk; totalBx += counts.bx; totalCr += counts.cr; totalPi += counts.pi; totalOt += counts.ot;
    totalWeight += parseFloat((item.weight || '0').toString().replace(/[^0-9.]/g, '')) || 0;
    if(item.photo_urls) photoUrls.push(...item.photo_urls);
  });
  
  if(conflict && !confirm("Warning: Selected orders have differing SO or Customer names. Continue?")) return;
  
  $('#bc_so').value = firstItem.so || ''; $('#bc_cust').value = firstItem.customer || '';
  $('#bc_skid').value = totalSk; $('#bc_box').value = totalBx; $('#bc_crate').value = totalCr; $('#bc_pipe').value = totalPi; $('#bc_other').value = totalOt;
  $('#bc_weight').value = totalWeight > 0 ? totalWeight.toLocaleString('en-US') : '';
  $('#bc_loc').value = ''; $('#bc_coords').value = ''; $('#bc_comments').value = ''; $('#bc_status').value = 'Partial';
  $('#bc_staged_by').value = currentUser ? (currentUser.email.split('@')[0]) : '';
  $('#bc_photo_urls').value = JSON.stringify(photoUrls); $('#bc_source').value = fromSameSo ? 'sameso' : 'batch';
  
  if(fromSameSo) $('#sameSoModal').style.display = 'none'; $('#batchConsolidateModal').style.display = 'flex';
};

window.executeBatchConsolidate = async function() {
  const fromSameSo = $('#bc_source').value === 'sameso'; const selectedSet = fromSameSo ? sameSoSelectedIds : batchSelectedIds;
  if(selectedSet.size === 0) return;
  const dynamicType = window.getDynamicType('bc'); const dynamicQty = window.getDynamicQty('bc'); const photoUrls = JSON.parse($('#bc_photo_urls').value || '[]');

  $('#btnConfirmBc').disabled = true; $('#btnConfirmBc').textContent = 'Consolidating...';

  try {
    const { error: insErr } = await supabaseClient.from('staging').insert([{
      so: $('#bc_so').value.trim(), customer: $('#bc_cust').value.trim(), status: $('#bc_status').value, 
      location: $('#bc_loc').value.trim(), coords: $('#bc_coords').value.trim(), weight: $('#bc_weight').value.trim(), comments: $('#bc_comments').value.trim(), 
      staged_by: $('#bc_staged_by').value.trim() + ' (Consolidated)', type: dynamicType, qty: dynamicQty, photo_urls: photoUrls
    }]);
    if(insErr) throw insErr;
    
    for(let id of selectedSet) { await supabaseClient.from('staging').delete().eq('id', id); }
    window.logAction('staging', `Batch Consolidated ${selectedSet.size} entries into new SO: ${$('#bc_so').value.trim()}`);
    if(typeof window.showNotification === 'function') window.showNotification('Batch Consolidation Successful');
    
    $('#batchConsolidateModal').style.display = 'none';
    if(fromSameSo) window.sameSoCancel(); else window.batchCancel();
    window.loadCloudData();
    if(window.activeReportMode) { window.reportRecordAction('Fixed via Consolidation'); }
  } catch(e) { alert("Consolidation error: " + e.message); }
  
  $('#btnConfirmBc').disabled = false; $('#btnConfirmBc').textContent = 'Confirm Consolidation';
};

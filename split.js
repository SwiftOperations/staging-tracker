// --- split.js ---

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
    coords: $('#sp_coords').value.trim(), weight: $('#sp_weight').value.trim(), status: window.getDbStatus($('#sp_status').value.trim()),
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
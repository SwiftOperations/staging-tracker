window.activeReportMode = false;
window.currentReportFilter = 'all'; // Tracks 'all', 'aisle', 'non_aisle', etc.
window.reportQueue = [];
window.reportIndex = 0;
window.reportResults = [];
window.reportPhotoBlobs = [];

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
  window.currentReportFilter = state.filter || 'all'; // <-- Restores the filter tracking
  window.activeReportMode = true;
  if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'none';
  window.renderNextReportItem();
};

window.initStagingReport = function(mode = 'all') {
  if(!mode && window.pendingReportMode) mode = window.pendingReportMode;
  window.currentReportFilter = mode; // <-- Added to track current report type
  const aisleRegex = /^([A-Z])-\d{2}-([A-Z])-(1|2|1\+2)$/i;
// ... rest of the existing code remains the same
  
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
  localStorage.setItem('swift_report_state', JSON.stringify({queue: window.reportQueue, index: window.reportIndex, results: window.reportResults, filter: window.currentReportFilter}));
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

// --- NEW REPORT ADD ENTRY LOGIC ---

window.addReportPhotoBlob = function(inputEl) {
  if(!inputEl.files || inputEl.files.length === 0) return;
  Array.from(inputEl.files).forEach(f => { if(window.reportPhotoBlobs.length < 10) window.reportPhotoBlobs.push(f); });
  window.renderReportPhotoStrip();
};

window.renderReportPhotoStrip = function() {
  const container = $('#ra_photoPreviewStrip'); if(!container) return; container.innerHTML = '';
  window.reportPhotoBlobs.forEach((f, idx) => {
    container.insertAdjacentHTML('beforeend', `<span class="photo-badge">📎 Img-${idx+1} <span onclick="window.reportPhotoBlobs.splice(${idx},1); window.renderReportPhotoStrip()">&times;</span></span>`);
  });
};

window.openReportAddModal = function() {
  $('#ra_so').value=''; $('#ra_cust').value=''; $('#ra_skid').value=0; $('#ra_box').value=0; $('#ra_crate').value=0; $('#ra_pipe').value=0; $('#ra_other').value=0; 
  $('#ra_loc').value=''; $('#ra_coords').value=''; $('#ra_weight').value=''; $('#ra_comments').value=''; 
  $('#ra_staged_by').value = currentUser ? currentUser.email.split('@')[0] : '';
  window.reportPhotoBlobs = []; window.renderReportPhotoStrip();
  $('#reportAddModal').style.display = 'flex';
};

window.submitReportAddEntry = async function() {
  const sk = parseInt($('#ra_skid').value)||0, bx = parseInt($('#ra_box').value)||0, cr = parseInt($('#ra_crate').value)||0, pi = parseInt($('#ra_pipe').value)||0, ot = parseInt($('#ra_other').value)||0;
  if(!$('#ra_so').value || !$('#ra_cust').value || !$('#ra_loc').value) return alert("Fields Missing.");
  
  const totalQty = sk + bx + cr + pi + ot;
  if (totalQty === 0) return alert("Error: You must add at least 1 container.");
  
  const soVal = $('#ra_so').value.trim();
  const locValue = $('#ra_loc').value.trim();

  const proceed = await window.checkSoConflict(soVal, null);
  if(!proceed) return;

  let type = []; 
  if(sk) type.push(window.formatContainer(sk, 'Skid'));
  if(bx) type.push(window.formatContainer(bx, 'Box'));
  if(cr) type.push(window.formatContainer(cr, 'Crate'));
  if(pi) type.push(window.formatContainer(pi, 'Pipe/Rod'));
  if(ot) type.push(window.formatContainer(ot, 'Other'));
  
  $('#ra_submitBtn').disabled = true; $('#ra_submitBtn').textContent = 'Saving...';
  
  try {
    let photoUrls = []; 
    for (let i = 0; i < window.reportPhotoBlobs.length; i++) {
      const file = window.reportPhotoBlobs[i]; 
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '');
      const path = `${soVal}-staging-${Date.now()}-${i}-${cleanFileName}`;
      const { error: uploadError } = await supabaseClient.storage.from('freight-photos').upload(path, file);
      if(!uploadError) photoUrls.push(path);
    }
  
    const newEntry = { so: soVal, customer: $('#ra_cust').value.trim(), status: window.getDbStatus($('#ra_status').value), location: locValue, coords: $('#ra_coords').value.trim(), weight: $('#ra_weight').value.trim(), comments: $('#ra_comments').value.trim(), staged_by: $('#ra_staged_by').value.trim(), type: type.join(', '), qty: totalQty, photo_urls: photoUrls };
    
    // Select the returned data so we can get its ID immediately
    const { data: insertedData, error } = await supabaseClient.from('staging').insert([newEntry]).select();
    
    if (error) { alert("Database Error: " + error.message); $('#ra_submitBtn').disabled = false; $('#ra_submitBtn').textContent = 'Add Entry'; return; }
    
    window.logAction('staging', `Added new entry via Report module for SO: ${soVal}`);
    if(typeof window.showNotification === 'function') window.showNotification('Staging Entry Added');
    
    // Inject the new item directly into our appData and the Report Queue
    appData.staging.push(insertedData[0]); 
    window.injectIntoReportQueue(insertedData[0]);
    
    $('#reportAddModal').style.display = 'none';
    window.loadCloudData();
  } catch(e) { alert("System Error: " + e.message); }
  
  $('#ra_submitBtn').disabled = false; $('#ra_submitBtn').textContent = 'Add Entry';
};

window.injectIntoReportQueue = function(item) {
  if (!window.activeReportMode) return;
  
  const aisleRegex = /^([A-Z])-\d{2}-([A-Z])-(1|2|1\+2)$/i;
  const isAisle = aisleRegex.test(item.location||'');
  
  // Abort if the new entry doesn't match the current report's filter constraints
  if (window.currentReportFilter === 'aisle' && !isAisle) return;
  if (window.currentReportFilter === 'non_aisle' && isAisle) return;
  if (window.currentReportFilter === 'discrepancies') return; 
  
  // Create an array of actual objects, add the new item, and re-sort
  const currentQueueItems = window.reportQueue.map(id => appData.staging.find(x => x.id === id)).filter(Boolean);
  currentQueueItems.push(item);
  
  currentQueueItems.sort((a, b) => {
    const keyA = locSortKey(a.location), keyB = locSortKey(b.location);
    if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
    if (keyA[0] === 1) return (a.location||'').localeCompare(b.location||''); 
    if (keyA[1] !== keyB[1]) return keyA[1].localeCompare(keyB[1]);
    if (keyA[2] !== keyB[2]) return keyA[2] - keyB[2];
    if (keyA[3] !== keyB[3]) return keyA[3].localeCompare(keyB[3]);
    return keyA[4] - keyB[4];
  });
  
  const newQueue = currentQueueItems.map(x => x.id);
  const newIndexOfItem = newQueue.indexOf(item.id);
  
  // If the new item sorts BEFORE the item we are currently looking at, shift the index forward by 1 so the user stays on their current screen
  if (newIndexOfItem <= window.reportIndex) {
    window.reportIndex++; 
  }
  
  window.reportQueue = newQueue;
  window.saveReportState();
  if($('#rep_progress')) $('#rep_progress').textContent = `${window.reportIndex + 1} of ${window.reportQueue.length}`;
};

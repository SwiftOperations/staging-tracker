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
  return [0, match[1], parseInt(match[2]), match[3], suffixWeight];
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
  window.reportQueue = state.queue; window.reportIndex = state.index; window.reportResults = state.results || [];
  window.activeReportMode = true;
  if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'none';
  window.renderNextReportItem();
};

window.initStagingReport = function(mode = 'all') {
  if(!mode && window.pendingReportMode) mode = window.pendingReportMode;
  const aisleRegex = /^([A-Z])-(\d{2})-([A-Z])-(1|2|1\+2)$/i;
  
  let sourceData = appData.staging;
  if (mode === 'aisle') sourceData = sourceData.filter(x => aisleRegex.test(x.location||''));
  else if (mode === 'non_aisle') sourceData = sourceData.filter(x => !aisleRegex.test(x.location||''));
  else if (mode === 'discrepancies') sourceData = sourceData.filter(x => window.discrepancyList && window.discrepancyList.includes(x.id));

  let sorted = [...sourceData].sort((a, b) => {
    const keyA = locSortKey(a.location), keyB = locSortKey(b.location);
    if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
    if (keyA[0] === 1) return (a.location||'').localeCompare(b.location||''); 
    if (keyA[1] !== keyB[1]) return keyA[1].localeCompare(keyB[1]);
    if (keyA[2] !== keyB[2]) return keyA[2] - keyB[2];
    if (keyA[3] !== keyB[3]) return keyA[3].localeCompare(keyB[3]);
    return keyA[4] - keyB[4];
  });
  
  window.reportQueue = sorted.map(x => x.id); window.reportIndex = 0; window.reportResults = [];
  window.activeReportMode = true; window.saveReportState();
  if($('#reportResumeModal')) $('#reportResumeModal').style.display = 'none';
  window.renderNextReportItem();
};

window.saveReportState = function() {
  localStorage.setItem('swift_report_state', JSON.stringify({queue: window.reportQueue, index: window.reportIndex, results: window.reportResults}));
};

window.downloadCSV = function(data, filename) {
  const headers = ['SO', 'Customer', 'Location', 'Entry Date', 'Result'];
  let csv = headers.join(',') + '\n';
  data.forEach(r => { csv += `"${r.so}","${r.customer}","${r.location}","${r.date}","${r.result}"\n`; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
};

window.renderNextReportItem = function() {
  if(!window.activeReportMode) return;
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); 
  
  if (window.reportIndex >= window.reportQueue.length) {
    alert("Staging Verification Report Complete!");
    window.activeReportMode = false; localStorage.removeItem('swift_report_state');
    if(window.reportResults.length > 0) {
      window.downloadCSV(window.reportResults, 'Verification_Results.csv');
      const discrepancies = window.reportResults.filter(r => r.result !== 'Verified');
      if(discrepancies.length > 0) window.downloadCSV(discrepancies, 'Verification_Discrepancies.csv');
    }
    return;
  }

  const itemId = window.reportQueue[window.reportIndex];
  const item = appData.staging.find(x => x.id === itemId);
  if (!item) { window.reportIndex++; window.saveReportState(); return window.renderNextReportItem(); }

  if($('#rep_loc')) $('#rep_loc').textContent = item.location || 'No Location';
  if($('#rep_so')) $('#rep_so').textContent = item.so;
  if($('#rep_cust')) $('#rep_cust').textContent = item.customer;
  if($('#rep_date')) $('#rep_date').textContent = new Date(item.entry_date).toLocaleString();
  if($('#rep_qty')) $('#rep_qty').textContent = item.type;
  if($('#rep_status')) $('#rep_status').textContent = item.status;
  if($('#rep_by')) $('#rep_by').textContent = item.staged_by || '—';
  
  if($('#rep_comment_box')) {
    if(item.comments && item.comments.trim() !== '') {
      $('#rep_comment_box').style.display = 'block'; $('#rep_comments_text').value = item.comments;
    } else { $('#rep_comment_box').style.display = 'none'; }
  }
  
  if($('#rep_progress')) $('#rep_progress').textContent = `${window.reportIndex + 1} of ${window.reportQueue.length}`;
  if($('#reportMainModal')) $('#reportMainModal').style.display = 'flex';
};

window.reportRecordAction = function(resultStr) {
  const item = appData.staging.find(x => x.id === window.reportQueue[window.reportIndex]);
  if(item) {
    window.reportResults.push({ so: item.so, customer: item.customer, location: item.location, date: new Date(item.entry_date).toLocaleString(), result: resultStr });
    window.discrepancyList = window.discrepancyList.filter(id => id !== item.id);
    if(resultStr.includes('Unresolved')) window.discrepancyList.push(item.id);
    localStorage.setItem('swift_discrepancies', JSON.stringify(window.discrepancyList));
  }
  window.reportIndex++; window.saveReportState(); setTimeout(window.renderNextReportItem, 600);
};

window.reportHandleYes = function() { window.reportRecordAction('Verified'); };

window.reportHandleNo = function() {
  if($('#reportMainModal')) $('#reportMainModal').style.display = 'none';
  if($('#reportNoModal')) $('#reportNoModal').style.display = 'flex';
};

window.reportHandleBack = function() {
  if (window.reportIndex > 0) {
    window.reportResults.pop(); window.reportIndex--; window.saveReportState(); window.renderNextReportItem();
  } else { alert("You are at the beginning of the report."); }
};

window.reportAction = function(action) {
  const itemId = window.reportQueue[window.reportIndex];
  if($('#reportNoModal')) $('#reportNoModal').style.display = 'none';
  
  if(action === 'settle') { window.reportRecordAction('Discrepancy - Unresolved'); } 
  else if (action === 'change') {
    if($('#report_new_loc')) $('#report_new_loc').value = '';
    if($('#reportChangeLocModal')) $('#reportChangeLocModal').style.display = 'flex';
  } 
  else if (action === 'split') { window.openSplitPrompt(); }
  else if (action === 'ship') { window.triggerShipModal(itemId); }
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
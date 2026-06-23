window.adjustCount = function(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); };
window.adjustEditCount = function(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); };

window.formatWeight = function(input) {
  let value = input.value.replace(/[^0-9.]/g, ''); let parts = value.split('.');
  if (parts[0]) parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
  input.value = parts.slice(0, 2).join('.');
};

window.formatContainer = function(count, type) {
  if(!count || count === 0) return '';
  if(count === 1) return `1 ${type}`;
  if(type === 'Box') return `${count} Boxes`;
  if(type === 'Pipe/Rod' || type === 'Other') return `${count} ${type}`;
  return `${count} ${type}s`;
};

window.parseContainerString = function(typeStr) {
  let sk = 0, bx = 0, cr = 0, pi = 0, ot = 0; if(!typeStr) return { sk, bx, cr, pi, ot };
  const matchSk = typeStr.match(/(\d+)\s*Skid/); if(matchSk) sk = parseInt(matchSk[1]);
  const matchBx = typeStr.match(/(\d+)\s*Box/);  if(matchBx) bx = parseInt(matchBx[1]);
  const matchCr = typeStr.match(/(\d+)\s*Crate/);if(matchCr) cr = parseInt(matchCr[1]);
  const matchPi = typeStr.match(/(\d+)\s*Pipe\/Rod/);if(matchPi) pi = parseInt(matchPi[1]);
  const matchOt = typeStr.match(/(\d+)\s*Other/);if(matchOt) ot = parseInt(matchOt[1]);
  return { sk, bx, cr, pi, ot };
};

window.getDynamicType = function(prefix) {
  const sk = parseInt($(`#${prefix}_skid`) ? $(`#${prefix}_skid`).value : 0)||0;
  const bx = parseInt($(`#${prefix}_box`) ? $(`#${prefix}_box`).value : 0)||0;
  const cr = parseInt($(`#${prefix}_crate`) ? $(`#${prefix}_crate`).value : 0)||0;
  const pi = parseInt($(`#${prefix}_pipe`) ? $(`#${prefix}_pipe`).value : 0)||0;
  const ot = parseInt($(`#${prefix}_other`) ? $(`#${prefix}_other`).value : 0)||0;
  let typeParts = []; 
  if(sk) typeParts.push(window.formatContainer(sk, 'Skid'));
  if(bx) typeParts.push(window.formatContainer(bx, 'Box'));
  if(cr) typeParts.push(window.formatContainer(cr, 'Crate'));
  if(pi) typeParts.push(window.formatContainer(pi, 'Pipe/Rod'));
  if(ot) typeParts.push(window.formatContainer(ot, 'Other'));
  return typeParts.join(', ') || '1 Skid';
};

window.getDynamicQty = function(prefix) {
  const sk = parseInt($(`#${prefix}_skid`) ? $(`#${prefix}_skid`).value : 0)||0;
  const bx = parseInt($(`#${prefix}_box`) ? $(`#${prefix}_box`).value : 0)||0;
  const cr = parseInt($(`#${prefix}_crate`) ? $(`#${prefix}_crate`).value : 0)||0;
  const pi = parseInt($(`#${prefix}_pipe`) ? $(`#${prefix}_pipe`).value : 0)||0;
  const ot = parseInt($(`#${prefix}_other`) ? $(`#${prefix}_other`).value : 0)||0;
  return sk+bx+cr+pi+ot;
};

window.renderTables = function() {
  const q = $('#q') ? $('#q').value.toLowerCase() : ''; const canEdit = !!currentUser;
  const fStaging = appData.staging.filter(o => (o.so||'').toLowerCase().includes(q) || (o.customer||'').toLowerCase().includes(q) || (o.location||'').toLowerCase().includes(q));
  const fShipped = appData.shipped.filter(o => (o.so||'').toLowerCase().includes(q) || (o.customer||'').toLowerCase().includes(q) || (o.location||'').toLowerCase().includes(q));

  if($('#tblStaging')) {
    const sBody = $('#tblStaging').querySelector('tbody'); 
    if(sBody) {
      sBody.innerHTML = ''; const limitStaging = $('#stageLimitNotice') ? 20 : 999999;
      fStaging.slice(0, limitStaging).forEach(o => {
        const geoLink = o.coords ? `<a class="coord-link" href="geo:0,0?q=${encodeURIComponent(o.coords)}" target="_blank">${o.coords}</a>` : '—';
        const picBtn = (o.photo_urls && o.photo_urls.length > 0) ? `<button class="btn" style="padding:4px 8px; font-size:12px; margin-right:4px; height:auto;" onclick="window.openPhotoViewer('${o.id}')">View</button>` : '';
        const editBtn = canEdit ? `<button class="btn-edit" onclick="window.openUniversalEditor('staging', '${o.id}')">Edit</button>` : `<span style="color:#94a3b8; font-size:11px;">Read-Only</span>`;
        const chkBox = canEdit ? `<input type="checkbox" onchange="if(this.checked){ window.triggerShipModal('${o.id}'); this.checked=false; }">` : `<span style="color:#9ca3af;">—</span>`;
        const commentBtn = o.comments ? `<button class="btn" style="padding:4px 8px; font-size:12px; background:#8b5cf6; color:#fff; height:auto;" onclick="window.openCommentModal('staging', '${o.id}')">See</button>` : (canEdit ? `<button class="btn" style="padding:4px 8px; font-size:12px; background:#e2e8f0; color:#475569; height:auto;" onclick="window.openCommentModal('staging', '${o.id}')">Add</button>` : `<span style="color:#9ca3af;">—</span>`);
        const batchChk = `<input type="checkbox" style="width:18px;height:18px;" onchange="window.toggleBatchSelect('${o.id}', this.checked)" ${batchSelectedIds.has(o.id) ? 'checked' : ''}>`;

        sBody.insertAdjacentHTML('beforeend', `<tr>
          <td class="show-in-batch" style="text-align:center;">${batchChk}</td>
          <td class="hide-in-batch">${editBtn}</td><td class="hide-in-batch">${picBtn}</td><td><a class="so-link" onclick="event.stopPropagation(); window.openOrderHistory('${o.so}')">${o.so}</a></td><td>${o.customer}</td><td>${new Date(o.entry_date).toLocaleString()}</td><td>${o.type}</td><td><b>${o.location}</b></td><td><small>${geoLink}</small></td>
          <td>${o.weight || '—'}</td><td class="hide-in-batch">${commentBtn}</td><td style="color:#0ea5e9; font-weight:bold;">${window.getFormattedStatus(o.status)}</td><td>${o.staged_by||'—'}</td>
          <td class="hide-in-batch" style="position:sticky;right:0;text-align:center; background:#f8fafc; border-left:1px solid #e2e8f0;">${chkBox}</td></tr>`);
      });
    }
  }

  if($('#tblShipped')) {
    const shBody = $('#tblShipped').querySelector('tbody'); 
    if(shBody) {
      shBody.innerHTML = ''; const limitShipped = $('#shippedLimitNotice') ? 20 : 999999;
      fShipped.slice(0, limitShipped).forEach(o => {
        const geoLink = o.coords ? `<a class="coord-link" href="geo:0,0?q=${encodeURIComponent(o.coords)}" target="_blank">${o.coords}</a>` : '—';
        const isRet = (o.carrier === 'RETURNED TO STOCK' || o.carrier === 'CONSOLIDATED'); const rowClass = isRet ? 'class="grey-strike"' : '';
        const picBtn = (o.photo_urls && o.photo_urls.length > 0) ? `<button class="btn" style="padding:4px 8px; font-size:12px; margin-right:4px; height:auto;" onclick="window.openPhotoViewer('${o.id}')">View</button>` : '';
        const editBtn = canEdit ? `<button class="btn-edit" onclick="window.openUniversalEditor('shipped', '${o.id}')">Edit</button>` : `<span style="color:#94a3b8; font-size:11px;">Read-Only</span>`;
        const commentBtn = o.comments ? `<button class="btn" style="padding:4px 8px; font-size:12px; background:#8b5cf6; color:#fff; height:auto;" onclick="window.openCommentModal('shipped', '${o.id}')">See</button>` : (canEdit ? `<button class="btn" style="padding:4px 8px; font-size:12px; background:#e2e8f0; color:#475569; height:auto;" onclick="window.openCommentModal('shipped', '${o.id}')">Add</button>` : `<span style="color:#9ca3af;">—</span>`);

                shBody.insertAdjacentHTML('beforeend', `<tr ${rowClass}>
          <td>${editBtn}</td><td>${picBtn}</td><td><a class="so-link" onclick="event.stopPropagation(); window.openOrderHistory('${o.so}')">${o.so}</a></td><td>${o.customer}</td><td>${o.type}</td><td><b>${o.carrier || '—'}</b></td><td>${o.location}</td><td><small>${geoLink}</small></td>
          <td>${o.weight || '—'}</td><td>${commentBtn}</td><td>${new Date(o.shipped_at).toLocaleString()}</td><td>${o.shipped_by || '—'}</td><td>${o.pmd_email ? o.pmd_email+(isRet?'':'<span class="green-check"> ✓</span>') : '—'}</td></tr>`);
      });
    }
  }

  const sumByType = t => appData.staging.reduce((acc, c) => c.type?.includes(t) ? acc + (parseInt(c.type.match(new RegExp(`(\\d+)\\s*${t}`))) || 0) : acc, 0);
  const uniqueSOs = new Set(appData.staging.map(o => o.so).filter(x => x !== null && x !== ''));
  
  if($('#kOrders')) $('#kOrders').textContent = uniqueSOs.size; 
  if($('#kContainers')) $('#kContainers').textContent = appData.staging.reduce((acc, c) => acc + (parseInt(c.qty) || 0), 0);
  if($('#kSkids')) $('#kSkids').textContent = sumByType('Skid'); 
  if($('#kBoxes')) $('#kBoxes').textContent = sumByType('Box'); 
  if($('#kCrates')) $('#kCrates').textContent = sumByType('Crate'); 
  if($('#kPipe')) $('#kPipe').textContent = sumByType('Pipe/Rod'); 
  if($('#kOther')) $('#kOther').textContent = sumByType('Other');
  if($('#kShipped')) $('#kShipped').textContent = appData.shipped.filter(x => x.carrier !== 'RETURNED TO STOCK' && x.carrier !== 'CONSOLIDATED').length;
};

window.openUniversalEditor = function(table, id) {
  const o = appData[table].find(x => x.id === id); if (!o) return;
  currentEditId = o.id; editTargetRecord = { table: table, id: o.id, so: o.so, photo_urls: o.photo_urls || [] };
  const isRet = (table === 'shipped' && (o.carrier === 'RETURNED TO STOCK' || o.carrier === 'CONSOLIDATED'));
  
  if($('#e_so')) $('#e_so').value = o.so; if($('#e_cust')) $('#e_cust').value = o.customer; if($('#e_loc')) $('#e_loc').value = o.location || ''; 
  if($('#e_coords')) $('#e_coords').value = o.coords || ''; if($('#e_weight')) $('#e_weight').value = o.weight || ''; if($('#e_comments')) $('#e_comments').value = o.comments || '';
  
  const counts = window.parseContainerString(o.type);
  if($('#e_skid')) $('#e_skid').value = counts.sk; if($('#e_box')) $('#e_box').value = counts.bx; if($('#e_crate')) $('#e_crate').value = counts.cr;
  if($('#e_pipe')) $('#e_pipe').value = counts.pi; if($('#e_other')) $('#e_other').value = counts.ot;
  
  const inputsToLock = ['e_so','e_cust','e_loc','e_weight','e_comments','e_status','e_staged_by','e_carrier','e_shipped_by','e_pm'];
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
    if($('#editSplitBtn')) $('#editSplitBtn').style.display = 'block';
    if($('#editSaveBtn')) $('#editSaveBtn').style.display = 'block';
    if($('#e_status')) {
      const formatted = window.getFormattedStatus(o.status);
      if (!Array.from($('#e_status').options).some(opt => opt.value === formatted)) {
        $('#e_status').insertAdjacentHTML('beforeend', `<option value="${formatted}">${formatted}</option>`);
      }
      $('#e_status').value = formatted;
    }
    if($('#e_staged_by')) $('#e_staged_by').value = o.staged_by || '';
  } else {
    if($('#editModalTitle')) $('#editModalTitle').textContent = isRet ? 'View Locked Record' : 'Edit Shipped Entry Logs'; 
    if($('#editStagingFields')) $('#editStagingFields').style.display = 'none'; 
    if($('#editShippedFields')) $('#editShippedFields').style.display = 'block'; 
    if($('#editUndoBtn')) $('#editUndoBtn').style.display = 'block'; 
    if($('#editReturnBtn')) $('#editReturnBtn').style.display = 'none'; 
    if($('#editConsolidateBtn')) $('#editConsolidateBtn').style.display = 'none';
    if($('#editSplitBtn')) $('#editSplitBtn').style.display = 'none';
    if($('#editSaveBtn')) $('#editSaveBtn').style.display = isRet ? 'none' : 'block';
    if($('#e_carrier')) $('#e_carrier').value = o.carrier || ''; 
    if($('#e_shipped_by')) $('#e_shipped_by').value = o.shipped_by || ''; 
    if($('#e_pm')) $('#e_pm').value = o.pmd_email || '';
  }
  
  window.renderEditPhotoStrip();
  if($('#editModal')) $('#editModal').style.display = 'flex';
};

window.triggerReturnModal = function() {
  if($('#returnModal')) $('#returnModal').style.display = 'flex'; if($('#editModal')) $('#editModal').style.display = 'none';
  if($('#r_picked_by')) $('#r_picked_by').value = ''; if($('#r_returned_by')) $('#r_returned_by').value = ''; if($('#r_reason')) $('#r_reason').value = ''; 
  if($('#r_pm_chk')) $('#r_pm_chk').checked = false; window.togglePMEmail(false, 'r_pm_email', 'r_pm_email_btn'); if($('#r_pm_email')) $('#r_pm_email').value = ''; 
};

window.openCommentModal = function(table, id) {
  const o = appData[table].find(x => x.id === id); if(!o) return; currentCommentTarget = { table: table, id: id };
  if($('#quick_comments')) { $('#quick_comments').value = o.comments || ''; $('#quick_comments').disabled = !currentUser; }
  if($('#saveCommentBtn')) $('#saveCommentBtn').style.display = currentUser ? 'block' : 'none';
  if($('#commentModal')) $('#commentModal').style.display = 'flex';
};

window.togglePMEmail = function(isChecked, inputId, btnId) {
  if($('#'+inputId)) $('#'+inputId).disabled = !isChecked; if($('#'+btnId)) $('#'+btnId).disabled = !isChecked;
};

window.triggerShipModal = function(id) {
  const item = appData.staging.find(x => x.id === id); if (!item) return; activeShipTargetItem = item; 
  if($('#photoPreviewStrip')) $('#photoPreviewStrip').innerHTML = ''; selectedPhotoBlobs = [];
  if($('#m_so')) $('#m_so').value = item.so; if($('#m_cust')) $('#m_cust').value = item.customer; if($('#m_qty')) $('#m_qty').value = item.type;
  if($('#m_carrier')) $('#m_carrier').value = ''; if($('#m_loc')) $('#m_loc').value = item.location; if($('#m_weight')) $('#m_weight').value = item.weight || '—'; if($('#m_by')) $('#m_by').value = '';
  if($('#m_pm_chk')) $('#m_pm_chk').checked = false; window.togglePMEmail(false, 'm_pm_email', 'm_pm_email_btn');
  if($('#shipModal')) $('#shipModal').style.display = 'flex';
  window.renderPhotoStrip('#photoPreviewStrip', selectedPhotoBlobs);
};

window.closeShipModal = function() { if($('#shipModal')) $('#shipModal').style.display = 'none'; window.loadCloudData(); };

window.openOrdersModal = function() {
  if(!$('#ordersModal')) return; const tbody = $('#tblOrders tbody'); if(!tbody) return; tbody.innerHTML = '';
  if($('#searchOrdersModal')) $('#searchOrdersModal').value = '';
  
  const groups = {};
  appData.staging.forEach(o => { const key = o.so || 'Unknown SO'; if(!groups[key]) groups[key] = []; groups[key].push(o); });
  
  Object.keys(groups).forEach(so => {
    groups[so].sort((a,b) => new Date(b.entry_date) - new Date(a.entry_date));
    const safeId = so.replace(/[^a-zA-Z0-9]/g, '_'); const allCustomers = groups[so].map(x => x.customer).join(' ');
    
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="group-header-row" data-so="${so}" data-cust="${allCustomers}" data-safeid="${safeId}" style="cursor:pointer; background:#f8fafc;" onclick="window.toggleOrderGroup('${safeId}')">
        <td style="padding: 12px; border-bottom:1px solid #e2e8f0;"><span id="icon_so_${safeId}" style="display:inline-block; width:16px; font-weight:900; color:#64748b;">+</span> <a class="so-link" onclick="event.stopPropagation(); window.openOrderHistory('${so}')">${so}</a></td>
        <td colspan="3" style="text-align:right; font-size:12px; color:#64748b; padding: 12px; border-bottom:1px solid #e2e8f0;">${groups[so].length} Staging Entry(s)</td>
      </tr>
    `);
    
    groups[so].forEach(o => {
      tbody.insertAdjacentHTML('beforeend', `
        <tr class="sub_so_${safeId}" style="display:none; font-size:12px; background:#fff;">
          <td style="padding: 10px 12px 10px 24px; color:#475569; border-bottom:1px solid #f1f5f9;">↳ ${o.customer}</td>
          <td style="padding: 10px 12px; border-bottom:1px solid #f1f5f9; white-space: nowrap;">${o.type}</td>
          <td style="padding: 10px 12px; border-bottom:1px solid #f1f5f9; white-space: nowrap;"><b>${o.location}</b></td>
          <td style="padding: 10px 12px; border-bottom:1px solid #f1f5f9; color:#64748b; text-align:right; white-space:nowrap;">${new Date(o.entry_date).toLocaleString()}</td>
        </tr>
      `);
    });
  });
  $('#ordersModal').style.display = 'flex';
};

window.filterOrdersModal = function() {
  const q = $('#searchOrdersModal').value.toLowerCase();
  document.querySelectorAll('.group-header-row').forEach(tr => {
    const match = tr.getAttribute('data-so').toLowerCase().includes(q) || tr.getAttribute('data-cust').toLowerCase().includes(q);
    tr.style.display = match ? 'table-row' : 'none';
    const safeId = tr.getAttribute('data-safeid');
    if(!match) {
      document.querySelectorAll('.sub_so_' + safeId).forEach(r => r.style.display = 'none');
      const icon = document.getElementById('icon_so_' + safeId); if(icon) icon.textContent = '+';
    }
  });
};

window.toggleOrderGroup = function(safeId) {
   const rows = document.querySelectorAll('.sub_so_' + safeId);
   const icon = document.getElementById('icon_so_' + safeId);
   let isHidden = false; if(rows.length > 0) isHidden = rows[0].style.display === 'none';
   rows.forEach(r => r.style.display = isHidden ? 'table-row' : 'none');
   if(icon) icon.textContent = isHidden ? '-' : '+';
};

window.showNotification = function(message) {
  let container = $('#toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div'); toast.className = 'toast-msg'; toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
};

window.toggleMenu = function(e) {
  e.stopPropagation(); const content = e.currentTarget.nextElementSibling; content.classList.toggle('show-menu');
};

document.addEventListener('click', function(e) {
  if (!e.target.matches('.hamburger-btn')) { document.querySelectorAll('.dropdown-content.show-menu').forEach(menu => { menu.classList.remove('show-menu'); }); }
});

// --- STATUS AUTO-SHIFT & MODAL LOGIC ---
window.getFormattedStatus = function(dbStatus) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dbStatus)) {
    const todayStr = new Date().toLocaleDateString('en-CA'); 
    const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = tmrw.toLocaleDateString('en-CA');
    
    if (dbStatus <= todayStr) return "Ship Today";
    if (dbStatus === tmrwStr) return "Ship Tomorrow";
  }
  return dbStatus;
};

window.getDbStatus = function(uiStatus) {
   const todayStr = new Date().toLocaleDateString('en-CA');
   const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
   const tmrwStr = tmrw.toLocaleDateString('en-CA');

   if (uiStatus === 'Ship Today') return todayStr;
   if (uiStatus === 'Ship Tomorrow') return tmrwStr;
   return uiStatus; 
};

window.activeStatusDropdownId = null;
document.addEventListener('change', function(e) {
  if (e.target.tagName === 'SELECT' && e.target.id.includes('status') && e.target.value === 'Ship On Future Date') {
    window.activeStatusDropdownId = e.target.id;
    const todayStr = new Date().toLocaleDateString('en-CA');
    if($('#fd_datePicker')) {
      $('#fd_datePicker').min = todayStr; $('#fd_datePicker').value = todayStr;
      $('#fd_datePicker').disabled = false; $('#fd_tbd').checked = false;
    }
    if($('#futureDateModal')) $('#futureDateModal').style.display = 'flex';
  }
});

window.cancelDateModal = function() {
  if($('#futureDateModal')) $('#futureDateModal').style.display = 'none';
  if(window.activeStatusDropdownId && $('#' + window.activeStatusDropdownId)) $('#' + window.activeStatusDropdownId).value = 'Partial';
};

window.confirmDateModal = function() {
  const isTbd = $('#fd_tbd').checked; const dateVal = $('#fd_datePicker').value;
  if(!isTbd && !dateVal) return alert("Please select a date or check TBD.");
  const finalVal = isTbd ? 'TBD' : dateVal;
  const sel = $('#' + window.activeStatusDropdownId);
  if (!Array.from(sel.options).some(opt => opt.value === finalVal)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${finalVal}">${finalVal}</option>`);
  }
  sel.value = finalVal;
  if($('#futureDateModal')) $('#futureDateModal').style.display = 'none';
};

window.openOrderHistory = async function(so) {
  if(!$('#orderHistoryModal')) return;
  $('#history_so_title').textContent = so;
  $('#history_content').innerHTML = '<div style="text-align:center; padding:30px; color:#64748b; font-weight:700;">Loading history...</div>';
  $('#orderHistoryModal').style.display = 'flex';

  try {
    const activeEntries = appData.staging.filter(x => x.so === so);
    const shippedEntries = appData.shipped.filter(x => x.so === so);
    let html = `<div class="history-section" style="background:#fff;">`;

    html += `<h4 style="margin:0 0 10px 0; color:#0ea5e9; border-bottom:2px solid #e0f2fe; padding-bottom:6px; font-size:14px; text-transform:uppercase;">Current Active Staging</h4>`;
    if(activeEntries.length === 0) html += `<p style="font-size:13px; color:#64748b; margin-bottom:16px;">No active staging entries found.</p>`;
    else {
      html += `<ul style="margin:0 0 16px 0; padding-left:20px; font-size:13px; color:#1e293b;">`;
      activeEntries.forEach(e => {
        html += `<li style="margin-bottom:6px;"><b>${e.type}</b> @ <b>${e.location}</b> <br><span style="font-size:11.5px; color:#64748b;">(Staged by ${e.staged_by || 'Unknown'} on ${new Date(e.entry_date).toLocaleString()})</span></li>`;
      });
      html += `</ul>`;
    }

    html += `<h4 style="margin:0 0 10px 0; color:#10b981; border-bottom:2px solid #d1fae5; padding-bottom:6px; font-size:14px; text-transform:uppercase;">Past Shipments</h4>`;
    if(shippedEntries.length === 0) html += `<p style="font-size:13px; color:#64748b; margin-bottom:16px;">No past shipments found.</p>`;
    else {
      html += `<ul style="margin:0 0 16px 0; padding-left:20px; font-size:13px; color:#1e293b;">`;
      shippedEntries.forEach(e => {
        const action = e.carrier === 'RETURNED TO STOCK' ? 'Returned to Stock' : (e.carrier === 'CONSOLIDATED' ? 'Consolidated' : `Shipped via ${e.carrier}`);
        html += `<li style="margin-bottom:6px;"><b>${e.type}</b> - ${action} from <b>${e.location}</b> <br><span style="font-size:11.5px; color:#64748b;">(By ${e.shipped_by || 'Unknown'} on ${new Date(e.shipped_at).toLocaleString()})</span></li>`;
      });
      html += `</ul>`;
    }

    html += `<h4 style="margin:0 0 10px 0; color:#8b5cf6; border-bottom:2px solid #ede9fe; padding-bottom:6px; font-size:14px; text-transform:uppercase;">Changelog History</h4>`;
    const { data, error } = await supabaseClient.from('changelog').select('*').ilike('action', `%${so}%`).order('created_at', { ascending: false });
    if(error) throw error;
    if(!data || data.length === 0) {
      html += `<p style="font-size:13px; color:#64748b;">No log history.</p>`;
    } else {
      html += `<ul style="margin:0; padding-left:20px; font-size:12.5px; color:#475569; max-height:220px; overflow-y:auto;">`;
      data.forEach(log => { html += `<li style="margin-bottom:8px;"><b>${new Date(log.created_at).toLocaleString()}</b> <span style="color:#0ea5e9; font-weight:700;">[${log.user_email}]</span><br/>${log.action}</li>`; });
      html += `</ul>`;
    }

    html += `</div>`;
    $('#history_content').innerHTML = html;
  } catch (e) { $('#history_content').innerHTML = `<span style="color:red; font-weight:bold;">Error: ${e.message}</span>`; }
};

window.checkSoConflict = function(so, currentId = null) {
  return new Promise(resolve => {
    const exists = appData.staging.some(x => x.so === so && x.id !== currentId);
    if (!exists) return resolve(true);

    $('#conflict_so_title').textContent = so;
    $('#conflict_content').innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-weight:700;">Loading history...</div>';
    $('#soConflictModal').style.display = 'flex';

    supabaseClient.from('changelog').select('*').ilike('action', `%${so}%`).order('created_at', { ascending: false }).then(({data, error}) => {
      if(error || !data || data.length === 0) {
        $('#conflict_content').innerHTML = '<span style="color:#64748b; padding:10px; font-size:13px;">No previous history found.</span>';
      } else {
        let html = '<ul style="text-align:left; padding-left:20px; margin:0; font-size:13px; color:#475569; max-height:200px; overflow-y:auto;">';
        data.forEach(log => { html += `<li style="margin-bottom:8px;"><b>${new Date(log.created_at).toLocaleString()}</b> <span style="color:#0ea5e9; font-weight:700;">[${log.user_email}]</span><br/>${log.action}</li>`; });
        html += '</ul>';
        $('#conflict_content').innerHTML = html;
      }
    });

    $('#conflictCancelBtn').onclick = () => { $('#soConflictModal').style.display = 'none'; resolve(false); };
    $('#conflictProceedBtn').onclick = () => { $('#soConflictModal').style.display = 'none'; resolve(true); };
  });
};

window.logAction = async function(table, actionDesc) {
  const userEmail = currentUser ? currentUser.email.split('@')[0] : 'Guest';
  try { await supabaseClient.from('changelog').insert([{ table_name: table, action: actionDesc, user_email: userEmail }]); } catch(e) { console.error(e); }
};

window.openChangelogModal = async function(table) {
  if(!$('#changelogModal')) return;
  $('#changelogTitle').textContent = table === 'staging' ? 'Staging Entries Changelog' : 'Shipped Log Changelog';
  const tbody = $('#tblChangelog tbody');
  tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:24px; color:#64748b; font-weight:700;">Loading changes...</td></tr>';
  $('#changelogModal').style.display = 'flex';
  
  try {
    const { data, error } = await supabaseClient.from('changelog').select('*').eq('table_name', table).order('created_at', { ascending: false }).limit(75);
    if(error) throw error;
    tbody.innerHTML = '';
    if(!data || data.length === 0) return tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#64748b; padding:24px; font-weight:700;">No changes logged.</td></tr>';
    data.forEach(log => {
      tbody.insertAdjacentHTML('beforeend', `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="color:#64748b; font-size:12px; white-space:nowrap; padding:12px 8px;">${new Date(log.created_at).toLocaleString()}</td><td style="font-size:13px; padding:12px 8px;"><span style="font-weight:800; color:#0ea5e9;">[${log.user_email}]</span> ${log.action}</td></tr>`);
    });
  } catch(e) { tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:red; font-weight:700; padding:24px;">Error: ${e.message}</td></tr>`; }
};
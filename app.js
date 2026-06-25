window.bootstrapStandalonePWA = function() {
  const pwaData = {
    "short_name": "StagingTracker", "name": "Swift Staging Tracker Hub",
    "icons": [{"src": "https://cdn-icons-png.flaticon.com/512/3014/3014166.png", "type": "image/png", "sizes": "512x512"}],
    "start_url": ".", "background_color": "#f1f5f9", "theme_color": "#dd4d25", "display": "standalone", "orientation": "portrait"
  };
  if($('#pwa-manifest')) $('#pwa-manifest').setAttribute('href', 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pwaData)));
};

// NEW FUNCTION: Builds the Employee Email Dropdown
window.initEmployeeEmailDropdown = function() {
  if (typeof rawContactsData === 'undefined') return;
  
  // Filter out contacts that don't have a valid email
  const validContacts = rawContactsData.filter(c => c.email && c.email.toLowerCase() !== 'n/a');
  
  // Create a hidden datalist in the background
  let dl = document.getElementById('dl_employeeEmails');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'dl_employeeEmails';
    document.body.appendChild(dl);
  }
  
  // Populate it with emails (The user will see the Name & Branch, but it will output the Email)
  dl.innerHTML = validContacts.map(c => `<option value="${c.email}">${c.name} (${c.branch})</option>`).join('');
  
  // Find all PM Email input fields across the app and attach this new list to them
  const targetIds = ['m_pm_email', 'r_pm_email', 'e_pm'];
  targetIds.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.setAttribute('list', 'dl_employeeEmails');
      if (!input.placeholder) input.placeholder = "Type name or email...";
    }
  });
};

function initApp() {
  window.bootstrapStandalonePWA(); 
  window.initOpenStreetMapEngine(); 
  window.initAuth();
  
  if (isBatchMode) document.body.classList.add('batch-mode');
  
  // Trigger the new dropdown setup on boot
  window.initEmployeeEmailDropdown(); 
  
  window.loadCloudData(); 
  setInterval(window.loadCloudData, 5000); 
  
  if($('#add')) $('#add').addEventListener('click', window.submitStagingEntry);
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }

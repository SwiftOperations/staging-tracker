window.bootstrapStandalonePWA = function() {
  const pwaData = {
    "short_name": "StagingTracker", "name": "Swift Staging Tracker Hub",
    "icons": [{"src": "https://cdn-icons-png.flaticon.com/512/3014/3014166.png", "type": "image/png", "sizes": "512x512"}],
    "start_url": ".", "background_color": "#f1f5f9", "theme_color": "#dd4d25", "display": "standalone", "orientation": "portrait"
  };
  if($('#pwa-manifest')) $('#pwa-manifest').setAttribute('href', 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pwaData)));
};

function initApp() {
  window.bootstrapStandalonePWA(); 
  window.initOpenStreetMapEngine(); 
  window.initAuth();
  if (isBatchMode) document.body.classList.add('batch-mode');
  window.loadCloudData(); 
  setInterval(window.loadCloudData, 5000); 
  if($('#add')) $('#add').addEventListener('click', window.submitStagingEntry);
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }

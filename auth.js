window.initAuth = async function() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  window.updateAuthUI();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    window.updateAuthUI(); window.renderTables();
  });
};

window.updateAuthUI = function() {
  if (currentUser) {
    const shortEmail = currentUser.email.length > 15 ? currentUser.email.split('@')[0] : currentUser.email;
    if($('#authStatus')) $('#authStatus').innerHTML = `<span style="font-size:13px; color:#475569; margin-right:8px; font-weight:700;">${shortEmail}</span> <button class="btn" style="padding:0 12px; font-size:12px; background:#64748b; height:34px;" onclick="window.signOut()">Sign Out</button>`;
    if($('#entryFormCard')) $('#entryFormCard').style.display = 'block'; 
  } else {
    if($('#authStatus')) $('#authStatus').innerHTML = `<button class="btn" style="padding:0 12px; font-size:12px; margin-right:4px; height:34px; background:#fff; color:#475569; border:1px solid #cbd5e1; box-shadow:none;" onclick="document.querySelector('#loginModal').style.display='flex'">Sign In</button> <button class="btn" style="padding:0 12px; font-size:12px; background:#0ea5e9; height:34px;" onclick="window.requestAccess()">Sign Up</button>`;
    if($('#entryFormCard')) $('#entryFormCard').style.display = 'none'; 
  }
};

window.requestAccess = function() {
  const subject = encodeURIComponent("Access Request: Swift Staging Tracker");
  const body = encodeURIComponent("Hello,\n\nI am requesting user access to create and edit entries on the Swift Staging Tracker.\n\nPlease set up an account for me and let me know my login credentials.\n\nThank you.");
  window.location.href = `mailto:warehouse2@swiftsupply.ca?subject=${subject}&body=${body}`;
};

window.submitLogin = async function() {
  const email = $('#login_email').value.trim(); const password = $('#login_password').value;
  if(!email || !password) return alert("Enter email and password.");
  $('#loginBtn').disabled = true; $('#loginBtn').textContent = 'Signing in...';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  $('#loginBtn').disabled = false; $('#loginBtn').textContent = 'Sign In';
  if(error) alert("Login Failed: " + error.message); else $('#loginModal').style.display = 'none';
};

window.signOut = async function() { await supabaseClient.auth.signOut(); window.location.reload(); };

window.initAuth = async function() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  window.updateAuthUI();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    window.updateAuthUI();
    window.renderTables();
  });
};

window.updateAuthUI = function() {
  if (currentUser) {
    if($('#authStatus')) $('#authStatus').innerHTML = `<span style="font-size:12px; color:#4b5563; margin-right:8px;">User: <b>${currentUser.email}</b></span> <button class="btn" style="padding:6px 12px; font-size:12px; background:#4b5563;" onclick="window.signOut()">Sign Out</button>`;
    if($('#entryFormCard')) $('#entryFormCard').style.display = 'block'; 
  } else {
    if($('#authStatus')) $('#authStatus').innerHTML = `<button class="btn" style="padding:6px 12px; font-size:12px; margin-right:4px;" onclick="document.querySelector('#loginModal').style.display='flex'">Sign In</button> <button class="btn" style="padding:6px 12px; font-size:12px; background:#0284c7;" onclick="window.requestAccess()">Sign Up</button>`;
    if($('#entryFormCard')) $('#entryFormCard').style.display = 'none'; 
  }
};

window.requestAccess = function() {
  const subject = encodeURIComponent("Access Request: Swift Staging Tracker");
  const body = encodeURIComponent("Hello,\n\nI am requesting user access to create and edit entries on the Swift Staging Tracker.\n\nPlease set up an account for me and let me know my login credentials.\n\nThank you.");
  window.location.href = `mailto:warehouse2@swiftsupply.ca?subject=${subject}&body=${body}`;
};

window.submitLogin = async function() {
  const email = $('#login_email').value.trim();
  const password = $('#login_password').value;
  if(!email || !password) return alert("Enter email and password.");
  
  $('#loginBtn').disabled = true;
  $('#loginBtn').textContent = 'Signing in...';
  
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  
  $('#loginBtn').disabled = false;
  $('#loginBtn').textContent = 'Sign In';
  
  if(error) { alert("Login Failed: " + error.message); } 
  else { $('#loginModal').style.display = 'none'; }
};

window.signOut = async function() { await supabaseClient.auth.signOut(); window.location.reload(); };

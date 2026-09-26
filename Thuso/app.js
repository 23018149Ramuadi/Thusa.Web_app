'use strict';
let active=null,contacts=[],map=null;
const $=id=>document.getElementById(id);
function toast(m){$('toast').textContent=m;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3500)}
async function api(url,opt={}){if(location.protocol==='file:')throw new Error('SafeHer must be opened through the Node server. Run npm start, then open http://localhost:3000.');const r=await fetch(url,{...opt,credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(r.status===401){location.href='/login.html';throw new Error('Please log in.')}if(!r.ok)throw new Error(d.error||'Request failed.');return d}
function switchTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.id===id));setTimeout(()=>map?.invalidateSize(),100)}
function showMap(lat,lng){if(typeof L==='undefined')return;if(!map){map=L.map('mapUser').setView([lat,lng],16);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);L.marker([lat,lng]).addTo(map).bindPopup('Your shared emergency location').openPopup()}else map.setView([lat,lng],16);setTimeout(()=>map.invalidateSize(),100)}
function renderActive(){const a=active;$('activeBox').classList.toggle('hidden',!a);$('userStatus').textContent=a?`ACTIVE — ${a.id}`:'No active emergency';$('locationText').textContent=a?`${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}`:'Not shared';$('gpsStatus').textContent=a?'GPS location shared':'GPS not requested';$('gpsStatus').className=`status-pill ${a?'active':'neutral'}`;if(a){$('emergencyId').textContent=a.id;$('emergencyTime').textContent=new Date(a.createdAt).toLocaleString('en-ZA');$('accuracy').textContent=`${Math.round(a.accuracy||0)} m`;showMap(a.lat,a.lng)}}
function renderContacts(){ $('contactSummary').innerHTML=contacts.length?contacts.map(c=>`<b>${esc(c.name)}</b>`).join('<br>'):'No trusted contacts added. SOS will still share and display your location.';$('contactsList').innerHTML=contacts.length?contacts.map(c=>`<div class="history-row" style="display:flex;justify-content:space-between;gap:15px;padding:14px 0;border-bottom:1px solid #eee"><span><b>${esc(c.name)}</b><br><small>${esc(c.phone||'')} ${esc(c.email||'')}</small></span><button class="secondary" onclick="removeContact('${c.id}')">Remove</button></div>`).join(''):'<p>No trusted contacts yet.</p>';}
function renderHistory(items){$('history').innerHTML=items.length?items.map(i=>`<div class="history-row" style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee"><span><b>${esc(i.id)}</b><br><small>${new Date(i.createdAt).toLocaleString('en-ZA')}</small></span><b>${esc(i.status)}</b></div>`).join(''):'<p>No previous emergencies.</p>'}
async function load(){const [me,c,a,h]=await Promise.all([api('/api/me'),api('/api/contacts'),api('/api/incidents/active'),api('/api/incidents')]);$('welcome').textContent=me.user.fullName;contacts=c.contacts;active=a.incident;renderContacts();renderActive();renderHistory(h.incidents)}
async function activate(){if(active)return toast('An SOS is already active.');const recipientText=contacts.length?` and notify ${contacts.length} trusted contact${contacts.length===1?'':'s'}`:'';if(!confirm(`Activate SOS, capture your current GPS location${recipientText}?`))return;if(!navigator.geolocation)return toast('This device/browser does not provide GPS location.');$('sosBtn').disabled=true;$('gpsStatus').textContent='Requesting GPS…';navigator.geolocation.getCurrentPosition(async p=>{try{const d=await api('/api/incidents',{method:'POST',body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy})});active=d.incident;renderActive();const links=d.notifications||[];$('notificationLinks').innerHTML=links.length?links.map(n=>`${esc(n.name)}: ${n.emailed?'email sent':'secure link created'}${n.emailed?'':` — <a href="${n.url}" target="_blank" rel="noopener">open link</a>`}`).join('<br>'):'SOS location saved. No trusted contacts are currently added, so no contact notifications were sent.';toast('SOS activated and location displayed.');await refreshHistory()}catch(e){toast(e.message)}finally{$('sosBtn').disabled=false}},e=>{$('sosBtn').disabled=false;$('gpsStatus').textContent='GPS unavailable';toast('Location permission is required to activate SafeHer SOS.')},{enableHighAccuracy:true,timeout:15000,maximumAge:0})}
async function cancel(){if(!active)return toast('There is no active SOS to deactivate.');if(!confirm('Deactivate the active SOS? Your emergency will be marked as ended.'))return;const btn=$('cancelBtn');btn.disabled=true;btn.textContent='DEACTIVATING…';try{await api(`/api/incidents/${encodeURIComponent(active.id)}/cancel`,{method:'POST'});active=null;renderActive();$('notificationLinks').innerHTML='';toast('SOS deactivated successfully.');await refreshHistory()}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='DEACTIVATE SOS'}}
async function refreshHistory(){const d=await api('/api/incidents');renderHistory(d.incidents)}
async function removeContact(id){if(!confirm('Remove this trusted contact?'))return;try{await api('/api/contacts/'+encodeURIComponent(id),{method:'DELETE'});contacts=(await api('/api/contacts')).contacts;renderContacts()}catch(e){toast(e.message)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
window.removeContact=removeContact;
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));$('sosBtn').addEventListener('click',activate);$('cancelBtn').addEventListener('click',cancel);$('refreshBtn').addEventListener('click',refreshHistory);$('logoutBtn').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/login.html'});$('contactForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const button=form.querySelector('button[type=\"submit\"]');
  const name=$('contactName').value.trim();
  const phone=$('contactPhone').value.trim();
  const email=$('contactEmail').value.trim();
  if(!name)return toast('Enter the trusted contact name.');
  if(!phone&&!email)return toast('Enter a phone number or email address.');
  button.disabled=true; button.textContent='Saving…';
  try{
    const saved=await api('/api/contacts',{method:'POST',body:JSON.stringify({name,phone,email})});
    // Display the server-confirmed record immediately, then re-read the database.
    if(saved.contact&&!contacts.some(c=>c.id===saved.contact.id)){contacts.push(saved.contact);renderContacts();}
    const latest=await api('/api/contacts');
    contacts=Array.isArray(latest.contacts)?latest.contacts:[];
    renderContacts();
    form.reset();
    switchTab('contacts');
    toast(`${saved.contact?.name||'Trusted contact'} saved and displayed.`);
  }catch(err){toast(err.message||'Could not save trusted contact.');}
  finally{button.disabled=false;button.textContent='Add Contact';}
});
load().catch(e=>toast(e.message));

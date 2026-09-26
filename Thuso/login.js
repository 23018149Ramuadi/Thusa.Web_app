"use strict";
const form=document.getElementById("loginForm"),msg=document.getElementById("message"),pass=document.getElementById("password");
function show(text,type){msg.textContent=text;msg.className="message "+type;}
document.getElementById("togglePassword").addEventListener("click",()=>pass.type=pass.type==="password"?"text":"password");
document.getElementById("forgot").addEventListener("click",e=>{e.preventDefault();show("Password reset is not enabled yet. Contact the SafeHer administrator.","error");});
form.addEventListener("submit",async e=>{e.preventDefault();show("Signing in…","");try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value.trim(),password:pass.value,remember:document.getElementById('remember').checked})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Login failed.');show('Login successful. Opening dashboard…','success');setTimeout(()=>location.href='/portal.html',400);}catch(err){show(err.message,'error');}});

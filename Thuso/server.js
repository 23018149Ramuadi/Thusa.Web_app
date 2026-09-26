require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db, id } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(express.static(__dirname, { extensions: ['html'] }));

function auth(req, res, next) {
  try {
    const token = req.cookies.safeher_session;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}
function publicUser(row) { return { id: row.id, fullName: row.full_name, phone: row.phone, email: row.email }; }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')); }
function transporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}

app.post('/api/auth/register', async (req, res) => {
  const { fullName, phone, email, password } = req.body || {};
  if (!fullName || !phone || !validEmail(email) || !password || password.length < 8) return res.status(400).json({ error: 'Provide a name, phone, valid email and password of at least 8 characters.' });
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(normalized)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const userId = id('USR');
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(userId, fullName.trim(), phone.trim(), normalized, hash, new Date().toISOString());
  res.status(201).json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: req.body?.remember ? '30d' : '12h' });
  res.cookie('safeher_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: req.body?.remember ? 30*86400000 : 12*3600000 });
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/logout', (req, res) => { res.clearCookie('safeher_session'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
});

app.get('/api/contacts', auth, (req, res) => res.json({ contacts: db.prepare('SELECT id,name,phone,email,created_at createdAt FROM trusted_contacts WHERE user_id=? ORDER BY created_at').all(req.user.id) }));
app.post('/api/contacts', auth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) n FROM trusted_contacts WHERE user_id=?').get(req.user.id).n;
  if (count >= 2) return res.status(400).json({ error: 'SafeHer currently supports a maximum of two trusted contacts.' });
  const { name, phone, email } = req.body || {};
  if (!name || (!phone && !validEmail(email))) return res.status(400).json({ error: 'Provide a contact name and at least a phone number or valid email.' });
  const contact = { id: id('CON'), name: name.trim(), phone: String(phone || '').trim(), email: String(email || '').trim().toLowerCase(), createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO trusted_contacts VALUES (?, ?, ?, ?, ?, ?)').run(contact.id, req.user.id, contact.name, contact.phone, contact.email, contact.createdAt);
  res.status(201).json({ contact });
});
app.delete('/api/contacts/:id', auth, (req, res) => { db.prepare('DELETE FROM trusted_contacts WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });

app.get('/api/incidents', auth, (req, res) => {
  const incidents = db.prepare('SELECT id,latitude lat,longitude lng,accuracy,status,created_at createdAt,ended_at endedAt FROM incidents WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  res.json({ incidents });
});
app.get('/api/incidents/active', auth, (req, res) => {
  const incident = db.prepare("SELECT id,latitude lat,longitude lng,accuracy,status,created_at createdAt FROM incidents WHERE user_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  res.json({ incident: incident || null });
});
app.post('/api/incidents', auth, async (req, res) => {
  const { lat, lng, accuracy } = req.body || {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'A valid GPS location is required.' });
  if (db.prepare("SELECT id FROM incidents WHERE user_id=? AND status='ACTIVE'").get(req.user.id)) return res.status(409).json({ error: 'You already have an active SOS.' });
  const contacts = db.prepare('SELECT * FROM trusted_contacts WHERE user_id=?').all(req.user.id);
  const incidentId = `SH-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(incidentId, req.user.id, Number(lat), Number(lng), Number(accuracy)||null, 'ACTIVE', now, null);
  db.prepare('INSERT INTO incident_events(incident_id,status,actor,created_at) VALUES (?,?,?,?)').run(incidentId,'ACTIVE','USER',now);
  const mail = transporter();
  const links = [];
  for (const c of contacts) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now()+24*3600000).toISOString();
    db.prepare('INSERT INTO share_tokens VALUES (?,?,?,?)').run(token, incidentId, c.id, expires);
    const url = `${BASE_URL}/share.html?token=${token}`;
    links.push({ contactId: c.id, name: c.name, url, emailed: false });
    if (mail && c.email) {
      try { await mail.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: c.email, subject: 'SafeHer emergency alert', text: `${c.name}, a SafeHer user who selected you as a trusted contact activated SOS. View the emergency location using this private link: ${url}\n\nIf there is immediate danger, contact the appropriate emergency service. Do not forward this link.` }); links[links.length-1].emailed = true; } catch (e) { console.error('Email notification failed:', e.message); }
    }
  }
  res.status(201).json({ incident: { id: incidentId, lat:Number(lat), lng:Number(lng), accuracy:Number(accuracy)||null, status:'ACTIVE', createdAt:now }, notifications: links });
});
app.post('/api/incidents/:id/cancel', auth, (req, res) => {
  const incident = db.prepare("SELECT * FROM incidents WHERE id=? AND user_id=? AND status='ACTIVE'").get(req.params.id, req.user.id);
  if (!incident) return res.status(404).json({ error: 'Active incident not found.' });
  const now = new Date().toISOString();
  db.prepare("UPDATE incidents SET status='CANCELLED', ended_at=? WHERE id=?").run(now, incident.id);
  db.prepare('INSERT INTO incident_events(incident_id,status,actor,created_at) VALUES (?,?,?,?)').run(incident.id,'CANCELLED','USER',now);
  res.json({ ok: true });
});

app.get('/api/share/:token', (req, res) => {
  const row = db.prepare(`SELECT i.id,i.latitude lat,i.longitude lng,i.accuracy,i.status,i.created_at createdAt,i.ended_at endedAt,u.full_name userName,u.phone userPhone,c.name contactName,s.expires_at expiresAt FROM share_tokens s JOIN incidents i ON i.id=s.incident_id JOIN users u ON u.id=i.user_id JOIN trusted_contacts c ON c.id=s.contact_id WHERE s.token=?`).get(req.params.token);
  if (!row || new Date(row.expiresAt) < new Date()) return res.status(404).json({ error: 'This emergency link is invalid or has expired.' });
  res.json({ incident: row });
});

app.get('/portal.html', (req,res,next) => {
  try { jwt.verify(req.cookies.safeher_session || '', JWT_SECRET); next(); } catch { res.redirect('/login.html'); }
});
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(PORT, () => console.log(`SafeHer running at ${BASE_URL}`));

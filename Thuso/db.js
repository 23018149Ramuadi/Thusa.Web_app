const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'safeher.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trusted_contacts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT,
 created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS incidents (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
 accuracy REAL, status TEXT NOT NULL, created_at TEXT NOT NULL, ended_at TEXT,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS incident_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT NOT NULL, status TEXT NOT NULL,
 actor TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS share_tokens (
 token TEXT PRIMARY KEY, incident_id TEXT NOT NULL, contact_id TEXT NOT NULL, expires_at TEXT NOT NULL,
 FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
 FOREIGN KEY(contact_id) REFERENCES trusted_contacts(id) ON DELETE CASCADE
);
`);

const id = prefix => `${prefix}-${crypto.randomUUID()}`;
module.exports = { db, id };

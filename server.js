const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const PARTICIPANTS = ['Victor', 'Sune', 'Reber', 'Asger', 'Emilie', 'Carl', 'Johan', 'Mads', 'Oliver'];

const BIN_ID  = process.env.JSONBIN_BIN_ID;
const BIN_KEY = process.env.JSONBIN_KEY;

let cache = null;

// ── Merge: add missing participants without wiping data ──────
function mergeParticipants(state) {
  if (!state.participants) state.participants = [];
  if (!state.log) state.log = [];
  if (!('celebration' in state)) state.celebration = null;
  const existing = new Set(state.participants.map(p => p.name));
  PARTICIPANTS.forEach(name => {
    if (!existing.has(name)) {
      state.participants.push({ name, points: 0, drinks: 0, wins: 0 });
    }
  });
  return state;
}

function freshState() {
  return {
    participants: PARTICIPANTS.map(name => ({ name, points: 0, drinks: 0, wins: 0 })),
    log: [],
    celebration: null
  };
}

// ── Disk (local cache, non-persistent on Render) ─────────────
function readDisk() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; }
}
function writeDisk(state) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch { /* silent */ }
}

// ── JSONBin (persistent across redeploys) ────────────────────
async function readRemote() {
  if (!BIN_ID || !BIN_KEY) return null;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': BIN_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record;
  } catch { return null; }
}

async function writeRemote(state) {
  if (!BIN_ID || !BIN_KEY) return;
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
      body: JSON.stringify(state)
    });
  } catch { /* silent */ }
}

// ── State accessors ──────────────────────────────────────────
function getState() { return cache; }

function setState(state) {
  cache = state;
  writeDisk(state);
  writeRemote(state); // fire-and-forget
}

// ── Routes ───────────────────────────────────────────────────
app.get('/api/state', (req, res) => res.json(getState()));

app.post('/api/drink', (req, res) => {
  const { name, drinkType = 'drik', units = 1 } = req.body;
  const state = getState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.drinks += Number(units);
  state.log.unshift({ name, type: 'drink', drinkType, units: Number(units), time: new Date().toISOString() });
  state.log = state.log.slice(0, 50);
  setState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/points', (req, res) => {
  const { name, points } = req.body;
  const state = getState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.points = Math.max(0, p.points + Number(points));
  state.log.unshift({ name, type: 'points', amount: Number(points), time: new Date().toISOString() });
  state.log = state.log.slice(0, 50);
  setState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/wins', (req, res) => {
  const { name, delta } = req.body;
  const state = getState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.wins = Math.min(6, Math.max(0, (p.wins || 0) + Number(delta)));
  setState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/celebrate', (req, res) => {
  const { category } = req.body;
  const state = getState();
  if (!category) {
    state.celebration = null;
  } else {
    const sorted = [...state.participants].sort((a, b) => (b[category] || 0) - (a[category] || 0));
    state.celebration = { category, winner: sorted[0].name, score: sorted[0][category] || 0 };
  }
  setState(state);
  res.json({ success: true, celebration: state.celebration });
});

app.post('/api/reset', (req, res) => {
  setState(freshState());
  res.json({ success: true });
});

// ── Boot: load remote → disk → fresh ────────────────────────
async function boot() {
  let state = await readRemote();
  if (!state) state = readDisk();
  if (!state) state = freshState();
  cache = mergeParticipants(state);
  writeDisk(cache);
  if (BIN_ID && BIN_KEY) writeRemote(cache);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Specialefest korer pa port ${PORT}${BIN_ID ? ' (JSONBin aktiv)' : ' (ingen ekstern storage)'}`));
}

boot();

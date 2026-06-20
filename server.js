const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const PARTICIPANTS = ['Victor', 'Sune', 'Reber', 'Asger', 'Emilie', 'Carl', 'Johan', 'Mads', 'Oliver'];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return initState();
  }
}

function initState() {
  const state = {
    participants: PARTICIPANTS.map(name => ({ name, points: 0, drinks: 0, wins: 0 })),
    log: [],
    celebration: null
  };
  saveState(state);
  return state;
}

function saveState(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

app.get('/api/state', (req, res) => res.json(loadState()));

app.post('/api/drink', (req, res) => {
  const { name, drinkType = 'drik', units = 1 } = req.body;
  const state = loadState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.drinks += Number(units);
  state.log.unshift({ name, type: 'drink', drinkType, units: Number(units), time: new Date().toISOString() });
  state.log = state.log.slice(0, 50);
  saveState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/points', (req, res) => {
  const { name, points } = req.body;
  const state = loadState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.points = Math.max(0, p.points + Number(points));
  state.log.unshift({ name, type: 'points', amount: Number(points), time: new Date().toISOString() });
  state.log = state.log.slice(0, 50);
  saveState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/wins', (req, res) => {
  const { name, delta } = req.body;
  const state = loadState();
  const p = state.participants.find(p => p.name === name);
  if (!p) return res.status(404).json({ error: 'Deltager ikke fundet' });
  p.wins = Math.min(6, Math.max(0, (p.wins || 0) + Number(delta)));
  saveState(state);
  res.json({ success: true, participant: p });
});

app.post('/api/celebrate', (req, res) => {
  const { category } = req.body;
  const state = loadState();
  if (!category) {
    state.celebration = null;
  } else {
    const sorted = [...state.participants].sort((a, b) => (b[category] || 0) - (a[category] || 0));
    state.celebration = { category, winner: sorted[0].name, score: sorted[0][category] || 0 };
  }
  saveState(state);
  res.json({ success: true, celebration: state.celebration });
});

app.post('/api/reset', (req, res) => {
  initState();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Specialefest korer pa port ${PORT}`));

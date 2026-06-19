const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Отдаём файлы из папки client
app.use(express.static(path.join(__dirname, '..', 'client')));

mongoose.connect('mongodb://127.0.0.1:27017/arena_drift')
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => { console.error('❌ MongoDB ошибка:', err.message); process.exit(1); });

const JWT_SECRET = 'arena_drift_secret_2024';

const players = new Map();
let arenaObjects = [];
const ARENA_SIZE = 100;

function generateObjects() {
  const objs = [];
  for (let i = 0; i < 50; i++) {
    objs.push({ id: `coin_${Date.now()}_${i}`, type: 'coin', position: { x: (Math.random()-0.5)*ARENA_SIZE*1.8, z: (Math.random()-0.5)*ARENA_SIZE*1.8 }, collected: false, value: 10 });
  }
  for (let i = 0; i < 10; i++) {
    objs.push({ id: `nitro_${Date.now()}_${i}`, type: 'nitro', position: { x: (Math.random()-0.5)*ARENA_SIZE*1.8, z: (Math.random()-0.5)*ARENA_SIZE*1.8 }, collected: false, value: 50 });
  }
  return objs;
}
arenaObjects = generateObjects();

setInterval(() => {
  arenaObjects.forEach(o => {
    if (o.collected && Math.random() < 0.3) {
      o.collected = false;
      o.position = { x: (Math.random()-0.5)*ARENA_SIZE*1.8, z: (Math.random()-0.5)*ARENA_SIZE*1.8 };
      broadcast({ type: 'objectRespawned', object: o });
    }
  });
}, 5000);

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполни все поля' });
    if (await User.findOne({ username })) return res.status(400).json({ error: 'Пользователь существует' });
    const user = new User({ username, password });
    await user.save();
    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { username, score: 0, coins: 0 } });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ error: 'Неверные данные' });
    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { username, score: user.score, coins: user.coins } });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await User.find().sort({ score: -1 }).limit(10).select('username score coins');
    res.json(top);
  } catch (e) { res.json([]); }
});

wss.on('connection', (ws) => {
  console.log('🟢 Игрок подключился');
  const colors = ['#FF4136','#FF851B','#2ECC40','#0074D9','#B10DC9','#01FF70'];
  let p = {
    id: 'p_'+Math.random().toString(36).substr(2,9), username: 'Гость',
    position: { x: (Math.random()-0.5)*20, y: 0.5, z: (Math.random()-0.5)*20 },
    rotation: 0, velocity: { x:0, z:0 }, score: 0, coins: 0,
    authenticated: false, color: colors[Math.floor(Math.random()*6)],
    nitroActive: false, lastUpdate: Date.now()
  };
  players.set(ws, p);

  ws.send(JSON.stringify({
    type: 'init', playerId: p.id, arenaObjects,
    players: Array.from(players.values()).map(x => ({
      id: x.id, username: x.username, position: x.position,
      rotation: x.rotation, color: x.color, score: x.score, nitroActive: x.nitroActive
    }))
  }));

  broadcast({ type: 'playerJoined', player: { id: p.id, username: p.username, position: p.position, rotation: p.rotation, color: p.color, score: p.score }}, ws);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      const pl = players.get(ws);
      if (!pl) return;

      if (msg.type === 'auth') {
        try {
          const d = jwt.verify(msg.token, JWT_SECRET);
          const u = await User.findById(d.userId);
          if (u) {
            pl.username = u.username; pl.authenticated = true; pl.score = u.score; pl.coins = u.coins; pl.userId = u._id;
            ws.send(JSON.stringify({ type: 'authSuccess', user: { username: u.username, score: u.score, coins: u.coins }}));
            broadcast({ type: 'playerUpdated', player: { id: pl.id, username: pl.username, position: pl.position, rotation: pl.rotation, color: pl.color, score: pl.score }});
          }
        } catch (e) {}
      }

      if (msg.type === 'move') {
        if (Math.abs(msg.position.x) < ARENA_SIZE && Math.abs(msg.position.z) < ARENA_SIZE) {
          pl.position = msg.position; pl.rotation = msg.rotation; pl.velocity = msg.velocity;
          pl.nitroActive = msg.nitroActive || false; pl.lastUpdate = Date.now();
        }
        broadcast({ type: 'playerMoved', playerId: pl.id, position: pl.position, rotation: pl.rotation, velocity: pl.velocity, nitroActive: pl.nitroActive }, ws);
      }

      if (msg.type === 'collectObject') {
        const obj = arenaObjects.find(o => o.id === msg.objectId);
        if (obj && !obj.collected) {
          const d = Math.sqrt((pl.position.x-obj.position.x)**2 + (pl.position.z-obj.position.z)**2);
          if (d < 4) {
            obj.collected = true;
            const bonus = obj.type === 'nitro' ? 40 : 0;
            pl.score += obj.value + bonus; pl.coins += obj.value;
            ws.send(JSON.stringify({ type: 'objectCollected', objectId: obj.id, score: pl.score, coins: pl.coins, value: obj.value+bonus }));
            if (pl.authenticated) await User.findByIdAndUpdate(pl.userId, { $inc: { score: obj.value+bonus, coins: obj.value } });
            broadcast({ type: 'objectCollectedBy', objectId: obj.id, playerId: pl.id, playerName: pl.username });
          }
        }
      }

      if (msg.type === 'collision') broadcast({ type: 'playerCollision', player1: msg.player1, player2: msg.player2, impactPoint: msg.impactPoint, force: msg.force }, ws);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log('🔴 Игрок отключился');
    const pl = players.get(ws);
    if (pl) {
      broadcast({ type: 'playerLeft', playerId: pl.id });
      if (pl.authenticated) User.findByIdAndUpdate(pl.userId, { $inc: { gamesPlayed: 1 } }).catch(()=>{});
    }
    players.delete(ws);
  });
});

function broadcast(data, exclude = null) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c !== exclude && c.readyState === 1) c.send(msg); });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏎️  Сервер: http://localhost:${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`🗄️  MongoDB: arena_drift\n`);
});

process.on('SIGINT', async () => {
  for (const [ws, pl] of players) {
    if (pl.authenticated) await User.findByIdAndUpdate(pl.userId, { score: pl.score, coins: pl.coins, $inc: { gamesPlayed: 1 } }).catch(()=>{});
  }
  await mongoose.connection.close();
  process.exit(0);
});
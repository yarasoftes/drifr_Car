import * as THREE from 'three';

const canvas = document.getElementById('game-canvas');
const loginScreen = document.getElementById('login-screen');
const hud = document.getElementById('hud');
const leaderboard = document.getElementById('leaderboard');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const authForm = document.getElementById('auth-form');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const playGuestBtn = document.getElementById('play-guest');
const tabButtons = document.querySelectorAll('.tab');
let authMode = 'login';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05051a);
scene.fog = new THREE.Fog(0x05051a, 60, 200);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 300);
camera.position.set(0, 15, 20);

scene.add(new THREE.AmbientLight(0x222244, 1.5));

const light1 = new THREE.PointLight(0xff00ff, 80, 120);
light1.position.set(0, 25, 0);
scene.add(light1);

const light2 = new THREE.PointLight(0x00ffff, 60, 100);
light2.position.set(25, 8, 25);
scene.add(light2);

const light3 = new THREE.PointLight(0xff6600, 40, 80);
light3.position.set(-25, 5, -25);
scene.add(light3);

const ARENA_SIZE = 100;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2),
  new THREE.MeshStandardMaterial({ color: 0x0a0a2e, roughness: 0.35, metalness: 0.7 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.PolarGridHelper(ARENA_SIZE, 64, 32, 64, 0x003366, 0x002244));

function createWall(length, pos, rotY = 0) {
  const geom = new THREE.BoxGeometry(length, 3, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0044ff, roughness: 0.3, metalness: 0.9, emissive: 0x0022aa, emissiveIntensity: 1.5 });
  const wall = new THREE.Mesh(geom, mat);
  wall.position.copy(pos);
  wall.rotation.y = rotY;
  wall.receiveShadow = true;
  wall.castShadow = true;
  return wall;
}

scene.add(createWall(ARENA_SIZE * 2, new THREE.Vector3(0, 1.5, -ARENA_SIZE)));
scene.add(createWall(ARENA_SIZE * 2, new THREE.Vector3(0, 1.5, ARENA_SIZE)));
scene.add(createWall(ARENA_SIZE * 2, new THREE.Vector3(-ARENA_SIZE, 1.5, 0), Math.PI / 2));
scene.add(createWall(ARENA_SIZE * 2, new THREE.Vector3(ARENA_SIZE, 1.5, 0), Math.PI / 2));

function createCar(color = '#FF4136') {
  const group = new THREE.Group();
  const bodyGeom = new THREE.BoxGeometry(2, 0.6, 4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.9, emissive: new THREE.Color(color), emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.8;
  body.castShadow = true;
  group.add(body);

  const cabinGeom = new THREE.BoxGeometry(1.4, 0.5, 1.8);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111133, roughness: 0.1, metalness: 0.5, emissive: 0x002244, emissiveIntensity: 0.5 });
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  cabin.position.set(0, 1.15, -0.3);
  group.add(cabin);

  const wheelGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
  [[-1.1, 1.2], [1.1, 1.2], [-1.1, -1.2], [1.1, -1.2]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.4, z);
    wheel.castShadow = true;
    group.add(wheel);
  });

  const spoilerGeom = new THREE.BoxGeometry(2.2, 0.15, 0.4);
  const spoiler = new THREE.Mesh(spoilerGeom, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 }));
  spoiler.position.set(0, 1.1, -1.8);
  group.add(spoiler);

  const lGeom = new THREE.SphereGeometry(0.15, 8, 8);
  const lMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 2 });
  [-0.6, 0.6].forEach(x => { const l = new THREE.Mesh(lGeom, lMat); l.position.set(x, 0.7, 1.9); group.add(l); });

  const flameGeom = new THREE.ConeGeometry(0.3, 1.5, 8);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0 });
  const flame = new THREE.Mesh(flameGeom, flameMat);
  flame.rotation.x = Math.PI;
  flame.position.set(0, 0.5, -2.2);
  flame.name = 'nitroFlame';
  group.add(flame);

  return group;
}

const playerCar = createCar('#FF4136');
playerCar.position.set(0, 0.5, 0);
scene.add(playerCar);

const otherPlayers = new Map();
const arenaObjectMeshes = new Map();

function createCoin() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.2, metalness: 0.9, emissive: 0xffaa00, emissiveIntensity: 2 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.3 })));
  return g;
}

function createNitro() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 8), new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.2, metalness: 0.8, emissive: 0x0088ff, emissiveIntensity: 2 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 })));
  return g;
}

const particles = [];
const pGeom = new THREE.SphereGeometry(0.08, 4, 4);

function spawnNitroParticles(pos) {
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 1, 0.6), transparent: true, opacity: 1 });
    const p = new THREE.Mesh(pGeom, mat);
    p.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    p.velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 5, (Math.random() - 0.5) * 2);
    p.life = 0.5 + Math.random() * 0.5;
    scene.add(p);
    particles.push(p);
  }
}

function collectionEffect(pos) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 16), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1 }));
  ring.position.copy(pos);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  const t0 = performance.now();
  function anim(time) {
    const e = (time - t0) / 1000;
    ring.scale.setScalar(1 + e * 10);
    ring.material.opacity = Math.max(0, 1 - e);
    if (e < 1) requestAnimationFrame(anim);
    else { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }
  }
  requestAnimationFrame(anim);
}

let playerId = null, playerScore = 0, playerCoins = 0, nitroFuel = 100, nitroActive = false;
let gameStarted = false;
const keys = {};
let lastTime = performance.now();
let playerCount = 1, pingValue = 0;

const carState = { position: new THREE.Vector3(0, 0.5, 0), rotation: 0, velocity: new THREE.Vector3(0, 0, 0), speed: 0 };

function updateCarPhysics(dt) {
  const maxSpeed = nitroActive && nitroFuel > 0 ? 100 : 60;
  if (nitroActive) {
    nitroFuel = Math.max(0, nitroFuel - 50 * dt);
    if (nitroFuel <= 0) nitroActive = false;
    if (Math.random() < 0.7) spawnNitroParticles(carState.position.clone());
  } else {
    nitroFuel = Math.min(100, nitroFuel + 15 * dt);
  }
  if (keys['w'] || keys['arrowup']) carState.speed += 70 * dt;
  if (keys['s'] || keys['arrowdown']) carState.speed -= 49 * dt;
  carState.speed = THREE.MathUtils.clamp(carState.speed, -maxSpeed * 0.5, maxSpeed);
  if (keys['a'] || keys['arrowleft']) carState.rotation += 4.5 * dt * (Math.abs(carState.speed) / maxSpeed);
  if (keys['d'] || keys['arrowright']) carState.rotation -= 4.5 * dt * (Math.abs(carState.speed) / maxSpeed);
  carState.speed *= 0.92;
  const fwd = new THREE.Vector3(Math.sin(carState.rotation), 0, Math.cos(carState.rotation));
  const right = new THREE.Vector3(Math.cos(carState.rotation), 0, -Math.sin(carState.rotation));
  const lat = right.multiplyScalar(right.dot(new THREE.Vector3(carState.velocity.x, 0, carState.velocity.z)));
  carState.velocity.x = fwd.x * carState.speed + lat.x * 0.94;
  carState.velocity.z = fwd.z * carState.speed + lat.z * 0.94;
  carState.position.x += carState.velocity.x * dt;
  carState.position.z += carState.velocity.z * dt;
  const b = ARENA_SIZE - 2;
  if (Math.abs(carState.position.x) > b) { carState.position.x = Math.sign(carState.position.x) * b; carState.speed *= -0.5; }
  if (Math.abs(carState.position.z) > b) { carState.position.z = Math.sign(carState.position.z) * b; carState.speed *= -0.5; }
  playerCar.position.copy(carState.position);
  playerCar.rotation.y = carState.rotation;
  const flame = playerCar.getObjectByName('nitroFlame');
  if (flame) flame.material.opacity = nitroActive ? 0.9 : 0;
}

function updateCamera() {
  const off = new THREE.Vector3(-Math.sin(carState.rotation) * 12, 8, -Math.cos(carState.rotation) * 12);
  camera.position.lerp(carState.position.clone().add(off), 0.1);
  camera.lookAt(carState.position.x, carState.position.y + 1, carState.position.z);
}

let ws = null, wsConnected = false;

function connectWebSocket(token = null) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.hostname;
  const port = location.protocol === 'https:' ? '' : ':3000';
  const wsUrl = `${proto}//${host}${port}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsConnected = true;
    if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    sendPing();
  };

  ws.onmessage = (e) => {
    try { handleServerMessage(JSON.parse(e.data)); } catch (err) {}
  };

  ws.onclose = () => {
    wsConnected = false;
    setTimeout(() => connectWebSocket(token), 3000);
  };
}

function sendPing() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
}

function handleServerMessage(msg) {
  if (msg.type === 'init') {
    playerId = msg.playerId;
    msg.arenaObjects.forEach(o => { if (!o.collected) spawnObj(o); });
    msg.players.forEach(p => { if (p.id !== playerId) spawnPlayer(p); });
    updateCount();
  }
  if (msg.type === 'playerJoined' && msg.player.id !== playerId) { spawnPlayer(msg.player); updateCount(); }
  if (msg.type === 'playerLeft') { removePlayer(msg.playerId); updateCount(); }
  if (msg.type === 'playerMoved') updateOther(msg);
  if (msg.type === 'objectRespawned' && !msg.object.collected) spawnObj(msg.object);
  if (msg.type === 'objectCollectedBy') { const m = arenaObjectMeshes.get(msg.objectId); if (m) collectionEffect(m.position.clone()); removeObj(msg.objectId); }
  if (msg.type === 'objectCollected') { playerScore = msg.score; playerCoins = msg.coins; updateHUD(); }
  if (msg.type === 'authSuccess') { playerScore = msg.user.score; playerCoins = msg.user.coins; updateHUD(); }
  if (msg.type === 'pong') { pingValue = Date.now() - msg.time; updateHUD(); setTimeout(sendPing, 2000); }
}

function spawnObj(obj) {
  const mesh = obj.type === 'coin' ? createCoin() : createNitro();
  mesh.position.set(obj.position.x, 1.5, obj.position.z);
  mesh.name = obj.id;
  scene.add(mesh);
  arenaObjectMeshes.set(obj.id, mesh);
}

function removeObj(id) {
  const m = arenaObjectMeshes.get(id);
  if (m) { scene.remove(m); arenaObjectMeshes.delete(id); }
}

function spawnPlayer(data) {
  if (otherPlayers.has(data.id)) return;
  const car = createCar(data.color || '#fff');
  car.position.set(data.position.x, data.position.y, data.position.z);
  car.rotation.y = data.rotation || 0;
  const c2 = document.createElement('canvas');
  c2.width = 256; c2.height = 64;
  const ctx2 = c2.getContext('2d');
  ctx2.fillStyle = '#fff'; ctx2.font = 'bold 24px Arial'; ctx2.textAlign = 'center';
  ctx2.fillText(data.username || 'Player', 128, 40);
  const tex = new THREE.CanvasTexture(c2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(5, 1.25, 1);
  sprite.position.y = 4;
  car.add(sprite);
  scene.add(car);
  otherPlayers.set(data.id, { mesh: car });
}

function removePlayer(id) {
  const p = otherPlayers.get(id);
  if (p) { scene.remove(p.mesh); otherPlayers.delete(id); }
}

function updateOther(msg) {
  const p = otherPlayers.get(msg.playerId);
  if (!p) return;
  p.mesh.position.set(msg.position.x, msg.position.y, msg.position.z);
  p.mesh.rotation.y = msg.rotation;
  const flame = p.mesh.getObjectByName('nitroFlame');
  if (flame) flame.material.opacity = msg.nitroActive ? 0.9 : 0;
  if (msg.nitroActive && Math.random() < 0.3) spawnNitroParticles(p.mesh.position.clone());
}

function updateCount() { playerCount = otherPlayers.size + 1; updateHUD(); }

function updateHUD() {
  document.getElementById('score').textContent = Math.floor(playerScore);
  document.getElementById('coins').textContent = Math.floor(playerCoins);
  document.getElementById('nitro-bar').style.width = nitroFuel + '%';
  document.getElementById('player-count').textContent = '👥 Игроков: ' + playerCount;
  document.getElementById('ping').textContent = '📶 Пинг: ' + pingValue + 'ms';
}

function updateMinimap() {
  if (!gameStarted) return;
  minimapCtx.clearRect(0, 0, 150, 150);
  minimapCtx.fillStyle = 'rgba(0,0,0,0.8)';
  minimapCtx.fillRect(0, 0, 150, 150);
  minimapCtx.strokeStyle = 'rgba(0,100,255,0.5)';
  minimapCtx.strokeRect(10, 10, 130, 130);
  arenaObjectMeshes.forEach(m => {
    const x = 75 + (m.position.x / ARENA_SIZE) * 65;
    const y = 75 + (m.position.z / ARENA_SIZE) * 65;
    minimapCtx.fillStyle = m.name.includes('nitro') ? '#0ff' : '#fd0';
    minimapCtx.beginPath(); minimapCtx.arc(x, y, 2, 0, Math.PI * 2); minimapCtx.fill();
  });
  otherPlayers.forEach(p => {
    const x = 75 + (p.mesh.position.x / ARENA_SIZE) * 65;
    const y = 75 + (p.mesh.position.z / ARENA_SIZE) * 65;
    minimapCtx.fillStyle = '#f44';
    minimapCtx.beginPath(); minimapCtx.arc(x, y, 3, 0, Math.PI * 2); minimapCtx.fill();
  });
  const px = 75 + (carState.position.x / ARENA_SIZE) * 65;
  const py = 75 + (carState.position.z / ARENA_SIZE) * 65;
  minimapCtx.fillStyle = '#fff';
  minimapCtx.beginPath(); minimapCtx.arc(px, py, 4, 0, Math.PI * 2); minimapCtx.fill();
}

function checkCollections() {
  arenaObjectMeshes.forEach((mesh, id) => {
    if (carState.position.distanceTo(mesh.position) < 3) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'collectObject', objectId: id }));
      collectionEffect(mesh.position.clone());
      removeObj(id);
    }
  });
}

let lastSend = 0;

function sendPos() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'move',
    position: { x: carState.position.x, y: carState.position.y, z: carState.position.z },
    rotation: carState.rotation,
    velocity: { x: carState.velocity.x, z: carState.velocity.z },
    nitroActive
  }));
}

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (gameStarted) {
    updateCarPhysics(dt);
    updateCamera();
    checkCollections();
    updateMinimap();
    if (time - lastSend > 50) { sendPos(); lastSend = time; }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.material.opacity = Math.max(0, p.life * 2);
      p.position.add(p.velocity.clone().multiplyScalar(dt));
      p.velocity.y += 9.8 * dt;
      if (p.life <= 0) { scene.remove(p); p.material.dispose(); particles.splice(i, 1); }
    }
    arenaObjectMeshes.forEach(m => { m.rotation.y += dt * 2; m.position.y = 1.5 + Math.sin(time * 0.003 + m.position.x) * 0.5; });
    updateHUD();
  }
  renderer.render(scene, camera);
}

document.addEventListener('keydown', (e) => {
  if (!e || !e.key) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'n' && nitroFuel >= 30) nitroActive = true;
});

document.addEventListener('keyup', (e) => {
  if (!e || !e.key) return;
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === 'n') nitroActive = false;
});

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    authMode = btn.dataset.tab;
    authSubmit.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
    authError.textContent = '';
  });
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { authError.textContent = 'Заполни все поля'; return; }
  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await resp.json();
    if (resp.ok) { localStorage.setItem('arenaDriftToken', data.token); startGame(data.token); }
    else authError.textContent = data.error || 'Ошибка';
  } catch (err) { authError.textContent = 'Нет соединения с сервером'; }
});

playGuestBtn.addEventListener('click', () => startGame(null));

function startGame(token = null) {
  gameStarted = true;
  loginScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  leaderboard.classList.remove('hidden');
  document.getElementById('minimap-container').classList.remove('hidden');
  connectWebSocket(token);
  loadLeaderboard();
}

async function loadLeaderboard() {
  try {
    const resp = await fetch('/api/leaderboard');
    const data = await resp.json();
    document.getElementById('leaderboard-list').innerHTML = data.map((p, i) => `<div><span>${i + 1}. ${p.username}</span><span>${p.score}</span></div>`).join('');
  } catch (e) {}
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (localStorage.getItem('arenaDriftToken')) startGame(localStorage.getItem('arenaDriftToken'));
else loginScreen.classList.remove('hidden');

requestAnimationFrame(gameLoop);
console.log('🏎️ Arena Drift загружена!');
/**
 * APP.JS  — QDC-515 v2
 *
 * Controls:
 *   WASD        → move drone on radar (user-controlled)
 *   Arrow keys  → rotate camera (yaw left/right, pitch up/down)
 *   SPACEBAR    → SEND MESSAGE: encrypt buffer, lock with session key
 *
 * The drone does NOT auto-move; the player flies it.
 */

// ── DOM References ────────────────────────────────────────────────────────────

const keyEls = {
  w: document.getElementById('key-w'),
  a: document.getElementById('key-a'),
  s: document.getElementById('key-s'),
  d: document.getElementById('key-d'),
  up:    document.getElementById('key-up'),
  left:  document.getElementById('key-left'),
  down:  document.getElementById('key-down'),
  right: document.getElementById('key-right'),
  space: document.getElementById('key-space'),
};

const streamLog        = document.getElementById('stream-log');
const wordList         = document.getElementById('word-list');
const decryptBtn       = document.getElementById('btn-decrypt');
const wordSelect       = document.getElementById('word-select');
const decryptOutput    = document.getElementById('decrypt-output');
const decryptKeyInput  = document.getElementById('decrypt-key-input');
const currentWordEl    = document.getElementById('current-word-display');
const statusBadge      = document.getElementById('status-badge');
const cameraYawEl      = document.getElementById('cam-yaw');
const cameraPitchEl    = document.getElementById('cam-pitch');
const cameraNeedleEl   = document.getElementById('cam-needle');

// ── Key Mapping ───────────────────────────────────────────────────────────────

const KEY_MAP = {
  'KeyW': 'w', 'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd',
  'ArrowUp': 'up', 'ArrowLeft': 'left', 'ArrowDown': 'down', 'ArrowRight': 'right',
  'Space': 'space',
};

// WASD → drone movement delta (normalized units per keydown)
const MOVE_DELTA = 0.045;
const MOVE_MAP = { w: [0,-1], s: [0,1], a: [-1,0], d: [1,0] };

// Arrow → camera rotation delta (degrees per keydown)
const CAM_YAW_MAP   = { left: -15, right: 15 };
const CAM_PITCH_MAP = { up: -10, down: 10 };

let cameraYaw   = 0;    // degrees, 0 = North, wraps 0-360
let cameraPitch = 0;    // degrees, -90 = straight up, +90 = straight down, 0 = level

// ── State ─────────────────────────────────────────────────────────────────────

let droneX = 0.5;
let droneY = 0.5;
const activeKeys = new Set();

// Buffer of {type, symbol} pressed since last SPACE
let inputBuffer = [];   // { type:'move'|'cam', symbol:'W'|'LEFT'|... }

// ── Key Press Handling ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const keyId = KEY_MAP[e.code];
  if (!keyId) return;
  e.preventDefault();

  // Spacebar is a one-shot trigger (no repeat)
  if (keyId === 'space') {
    flashKey('space');
    sendMessage();
    return;
  }

  if (activeKeys.has(keyId)) return;
  activeKeys.add(keyId);
  const el = keyEls[keyId];
  if (el) el.classList.add('pressed');

  if (MOVE_MAP[keyId]) {
    // WASD — move drone
    const [dx, dy] = MOVE_MAP[keyId];
    droneX = Math.max(0.05, Math.min(0.95, droneX + dx * MOVE_DELTA));
    droneY = Math.max(0.05, Math.min(0.95, droneY + dy * MOVE_DELTA));

    const sym = keyId.toUpperCase();
    inputBuffer.push({ type: 'move', symbol: sym });

    const result = QuantumSession.processKey(sym);
    if (result) logStream(result, 'move');
    updateCurrentWordDisplay();
    updateStatus(`DRONE MOVE [${sym}]`, 'active');

  } else {
    // Arrow keys — camera rotation
    const sym = keyId.toUpperCase();  // UP / DOWN / LEFT / RIGHT

    if (CAM_YAW_MAP[keyId] !== undefined) {
      cameraYaw = ((cameraYaw + CAM_YAW_MAP[keyId]) % 360 + 360) % 360;
    }
    if (CAM_PITCH_MAP[keyId] !== undefined) {
      cameraPitch = Math.max(-85, Math.min(85, cameraPitch + CAM_PITCH_MAP[keyId]));
    }

    inputBuffer.push({ type: 'cam', symbol: sym });

    const result = QuantumSession.processKey(sym);
    if (result) logStream(result, 'cam');
    updateCurrentWordDisplay();
    updateCameraDisplay();
    updateStatus(`CAM ROTATE [${sym}]`, 'cam');
  }
});

document.addEventListener('keyup', (e) => {
  const keyId = KEY_MAP[e.code];
  if (!keyId || keyId === 'space') return;
  activeKeys.delete(keyId);
  const el = keyEls[keyId];
  if (el) el.classList.remove('pressed');

  if (activeKeys.size === 0) {
    updateStatus('STANDBY — PRESS SPACE TO TRANSMIT', 'standby');
  }
});

// ── Camera Display ────────────────────────────────────────────────────────────

function updateCameraDisplay() {
  if (cameraYawEl)   cameraYawEl.textContent   = cameraYaw.toFixed(0) + '°';
  if (cameraPitchEl) cameraPitchEl.textContent = (cameraPitch >= 0 ? '+' : '') + cameraPitch.toFixed(0) + '°';

  // Rotate the compass needle
  if (cameraNeedleEl) {
    cameraNeedleEl.style.transform = `rotate(${cameraYaw}deg)`;
  }
}

// ── Current Word Display ──────────────────────────────────────────────────────

function updateCurrentWordDisplay() {
  if (!inputBuffer.length) { currentWordEl.textContent = '—'; return; }
  currentWordEl.textContent = inputBuffer.map(e =>
    (e.type === 'move' ? '🚁' : '📷') + e.symbol
  ).join(' ');
}

// ── Send Message (SPACEBAR) ───────────────────────────────────────────────────

function sendMessage() {
  const word = QuantumSession.commitWord();
  if (!word) {
    flashStatus('BUFFER EMPTY — ENTER COMMANDS FIRST', 'alert');
    return;
  }

  const sessionKey = word.symbols.map(e => e.sessionKey).join('-');
  const keyHash = btoa(sessionKey).slice(0, 12).toUpperCase();  // Shareable key ID

  // Build display option
  const opt = document.createElement('option');
  opt.value = word.id;
  opt.textContent = `MSG-${QuantumSession.encodedWords.length} [${word.symbols.map(e => e.symbol).join('-')}]`;
  wordSelect.appendChild(opt);

  // Build word list entry
  const li = document.createElement('li');
  li.className = 'word-item';
  li.dataset.id = word.id;
  li.innerHTML =
    `<span class="wi-id">MSG-${QuantumSession.encodedWords.length}</span>` +
    `<span class="wi-syms">${word.symbols.map(e => e.symbol).join(' ')}</span>` +
    `<span class="wi-bits locked">🔒 ${word.encryptedBits}</span>`;
  wordList.prepend(li);

  // Remove "no words" placeholder
  const placeholder = wordList.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  // Log it
  const flash = document.createElement('div');
  flash.className = 'log-entry committed';
  flash.innerHTML =
    `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ` +
    `🚀 MSG TRANSMITTED · KEY-ID: <span style="color:#ffcc44;">${keyHash}</span> · PQP: ${word.encryptedBits}`;
  streamLog.prepend(flash);

  // Show the key to the user
  decryptOutput.textContent =
    `✉  MESSAGE SENT & LOCKED\n` +
    `KEY-ID: ${keyHash}\n` +
    `ENCRYPTED: ${word.encryptedBits}\n\n` +
    `Share KEY-ID with authorized receiver to decrypt.`;

  inputBuffer = [];
  updateCurrentWordDisplay();
  updateStatus(`MSG TRANSMITTED · 🔒 ENCRYPTED`, 'active');
  setTimeout(() => updateStatus('STANDBY — PRESS SPACE TO TRANSMIT', 'standby'), 2500);
}

// ── Decryption ────────────────────────────────────────────────────────────────

decryptBtn.addEventListener('click', () => {
  const id = parseInt(wordSelect.value);
  if (!id) { decryptOutput.textContent = '⚠ SELECT A MESSAGE FIRST'; return; }

  const enteredKey = decryptKeyInput.value.trim().toUpperCase();
  if (!enteredKey) { decryptOutput.textContent = '⚠ ENTER DECRYPTION KEY-ID'; return; }

  const word = QuantumSession.encodedWords.find(w => w.id === id);
  if (!word) { decryptOutput.textContent = '⚠ MESSAGE NOT FOUND'; return; }

  // Reconstruct expected key hash
  const sessionKey  = word.symbols.map(e => e.sessionKey).join('-');
  const expectedKey = btoa(sessionKey).slice(0, 12).toUpperCase();

  if (enteredKey !== expectedKey) {
    decryptOutput.textContent =
      `⛔ DECRYPTION FAILED\nINVALID KEY-ID: ${enteredKey}\nACCESS DENIED — QUANTUM VERIFICATION FAILED`;
    decryptOutput.style.color = '#ff4444';
    return;
  }

  decryptOutput.style.color = '';
  const result = QuantumSession.decryptWord(id);
  decryptOutput.textContent =
    `✅ DECRYPTION SUCCESS\n` +
    `KEY VERIFIED ✓\n` +
    `DECODED BITS: ${result}\n` +
    `COMMANDS: ${word.symbols.map(e => e.symbol).join(' → ')}\n` +
    `STATUS: QUANTUM INTEGRITY CONFIRMED`;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function flashKey(keyId) {
  const el = keyEls[keyId];
  if (!el) return;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 200);
}

function logStream(entry, type) {
  const time = new Date().toLocaleTimeString();
  const icon = type === 'move' ? '🚁' : '📷';
  const line = document.createElement('div');
  line.className = 'log-entry';
  line.innerHTML =
    `<span class="log-time">[${time}]</span> ` +
    `<span style="font-size:0.75rem">${icon}</span> ` +
    `<span class="log-sym">SYM:${entry.symbol}</span> ` +
    `<span class="log-bits">BITS:${entry.bits}</span> ` +
    `<span class="log-basis">BASIS:${entry.basis}</span> ` +
    `<span class="log-enc">PQP:${entry.pqpEncrypted}</span>`;
  streamLog.prepend(line);
  while (streamLog.children.length > 40) streamLog.removeChild(streamLog.lastChild);
}

function updateStatus(text, mode) {
  statusBadge.textContent = text;
  statusBadge.className = 'status-badge ' + mode;
}

function flashStatus(text, mode) {
  updateStatus(text, mode);
  setTimeout(() => updateStatus('STANDBY — PRESS SPACE TO TRANSMIT', 'standby'), 2000);
}

// ── Radar ─────────────────────────────────────────────────────────────────────

const radarCanvas = document.getElementById('radar-canvas');
const ctx         = radarCanvas.getContext('2d');
const gpsEl       = document.getElementById('gps-coords');
const altEl       = document.getElementById('altitude');
const freqEl      = document.getElementById('rf-freq');

const W  = radarCanvas.width;
const H  = radarCanvas.height;
const CX = W / 2;
const CY = H / 2;
const R  = Math.min(W, H) / 2 - 8;

let radarAngle = 0;
let blips      = [];

function drawRadar() {
  ctx.clearRect(0, 0, W, H);

  // BG
  ctx.fillStyle = '#060d08';
  ctx.fillRect(0, 0, W, H);

  // Grid rings
  [0.25, 0.5, 0.75, 1.0].forEach(f => {
    ctx.beginPath();
    ctx.arc(CX, CY, R * f, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74,166,64,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Cross-hairs
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(74,166,64,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, CY - R); ctx.lineTo(CX, CY + R); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX - R, CY); ctx.lineTo(CX + R, CY); ctx.stroke();
  ctx.setLineDash([]);

  // Sweep beam
  const beamLen = (Math.PI * 2) / 6;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(radarAngle);
  const sweepGrad = ctx.createLinearGradient(0, 0, R, 0);
  sweepGrad.addColorStop(0, 'rgba(74,166,64,0.45)');
  sweepGrad.addColorStop(1, 'rgba(74,166,64,0)');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, 0, beamLen);
  ctx.closePath();
  ctx.fillStyle = sweepGrad;
  ctx.fill();
  ctx.restore();

  // Drone position on radar
  const dpx = CX + (droneX - 0.5) * 2 * R;
  const dpy = CY + (droneY - 0.5) * 2 * R;

  // Check if sweep hits drone → add blip
  const droneAngle = Math.atan2(dpy - CY, dpx - CX);
  const sweepNorm  = ((radarAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const droneNorm  = ((droneAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (Math.abs(sweepNorm - droneNorm) < 0.15) {
    blips.push({ x: dpx, y: dpy, alpha: 1.0 });
  }

  // Fade blips
  blips = blips.filter(b => b.alpha > 0);
  blips.forEach(b => {
    b.alpha -= 0.01;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(128,255,64,${b.alpha})`;
    ctx.fill();
  });

  // Draw drone (triangle pointing in camera yaw direction)
  const yawRad = (cameraYaw - 90) * Math.PI / 180;
  ctx.save();
  ctx.translate(dpx, dpy);
  ctx.rotate(yawRad);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 6);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
  ctx.fillStyle = `rgba(64,255,64,${0.6 + pulse * 0.4})`;
  ctx.fill();
  ctx.strokeStyle = '#b0ffb0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.fillStyle = 'rgba(128,255,64,0.85)';
  ctx.font = 'bold 9px "Share Tech Mono", monospace';
  ctx.fillText('DRONE-01', dpx + 9, dpy - 7);

  // Camera direction line
  const camLen = 28;
  ctx.beginPath();
  ctx.moveTo(dpx, dpy);
  ctx.lineTo(
    dpx + camLen * Math.cos(yawRad + Math.PI / 2),
    dpy + camLen * Math.sin(yawRad + Math.PI / 2)
  );
  ctx.strokeStyle = 'rgba(255,180,50,0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  radarAngle += 0.022;
  if (radarAngle > Math.PI * 2) radarAngle -= Math.PI * 2;

  updateGPS();
  requestAnimationFrame(drawRadar);
}

function updateGPS() {
  const lat = (18.45 + (droneY - 0.5) * 0.1).toFixed(5);
  const lon = (73.85 + (droneX - 0.5) * 0.1).toFixed(5);
  gpsEl.textContent  = `${lat}°N  ${lon}°E`;
  altEl.textContent  = (120 + Math.sin(Date.now() / 2000) * 15).toFixed(1) + ' m';
  freqEl.textContent = (2.4 + Math.random() * 0.001).toFixed(4) + ' GHz';
}

drawRadar();

// ── Init ──────────────────────────────────────────────────────────────────────

updateStatus('STANDBY — PRESS SPACE TO TRANSMIT', 'standby');
updateCameraDisplay();

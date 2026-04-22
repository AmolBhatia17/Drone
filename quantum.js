/**
 * QUANTUM.JS
 * Simulates BB84 Quantum Key Distribution and PQP (Post-Quantum Protocol)
 * encoding for RF drone communication signals.
 *
 * Key mapping: W/UP=00, A/LEFT=01, S/DOWN=10, D/RIGHT=11
 */

// ── BB84 Simulation ──────────────────────────────────────────────────────────

const BASES = ['+', 'x']; // Rectilinear (+) and Diagonal (x)
const SYMBOL_TO_BITS = {
  'W': '00', 'UP': '00',
  'A': '01', 'LEFT': '01',
  'S': '10', 'DOWN': '10',
  'D': '11', 'RIGHT': '11',
};

/**
 * Generates a random basis string for BB84.
 * @param {number} length
 * @returns {string[]}
 */
function generateBases(length) {
  return Array.from({ length }, () => BASES[Math.floor(Math.random() * 2)]);
}

/**
 * Encodes a raw bit string in a given basis.
 * @param {string} bits
 * @param {string[]} bases
 * @returns {string[]} photon states
 */
function bb84Encode(bits, bases) {
  return bits.split('').map((bit, i) => {
    if (bases[i] === '+') return bit === '0' ? '|0⟩' : '|1⟩';
    else return bit === '0' ? '|+⟩' : '|-⟩';
  });
}

/**
 * Bob's measurement – randomly picks bases and measures photons.
 * Returns the sifted key after basis reconciliation.
 */
function bb84Reconcile(photons, aliceBases) {
  const bobBases = generateBases(photons.length);
  const siftedKey = [];

  photons.forEach((photon, i) => {
    if (bobBases[i] === aliceBases[i]) {
      // Bases match → bit is preserved
      const bit = photon.includes('0') || photon === '|+⟩' ? '0' : '1';
      siftedKey.push(bit);
    }
    // If bases don't match, discard (simulate quantum key sifting)
  });

  return siftedKey.join('');
}

// ── PQP (Post-Quantum Protocol) ──────────────────────────────────────────────

/**
 * PQP uses a simple lattice-based XOR cipher simulation.
 * In a real implementation, this would use CRYSTALS-Kyber/Dilithium.
 */
function pqpEncrypt(bitString, sessionKey) {
  return bitString.split('').map((bit, i) => {
    const keyBit = sessionKey[i % sessionKey.length];
    return (parseInt(bit) ^ parseInt(keyBit)).toString();
  }).join('');
}

function pqpDecrypt(encryptedBits, sessionKey) {
  // XOR is its own inverse
  return pqpEncrypt(encryptedBits, sessionKey);
}

// ── Session Storage ──────────────────────────────────────────────────────────

const QuantumSession = {
  encodedWords: [],         // Array of { raw, bits, bb84Photons, pqpEncrypted, sessionKey }
  generatedKeys: [],        // Stored BB84 session keys
  currentWord: [],          // Buffer for the current word being typed

  /**
   * Processes a key press and adds it to the current word buffer.
   */
  processKey(symbol) {
    const bits = SYMBOL_TO_BITS[symbol.toUpperCase()];
    if (!bits) return null;

    const aliceBases = generateBases(bits.length);
    const photons = bb84Encode(bits, aliceBases);
    const siftedKey = bb84Reconcile(photons, aliceBases).padEnd(bits.length, '0');
    const pqpKey = siftedKey || '10'; // fallback
    const encrypted = pqpEncrypt(bits, pqpKey);

    const entry = {
      symbol,
      bits,
      basis: aliceBases.join(''),
      photons: photons.join(' '),
      sessionKey: pqpKey,
      pqpEncrypted: encrypted,
    };

    this.currentWord.push(entry);
    return entry;
  },

  /**
   * Commits the current word to storage and returns it.
   */
  commitWord() {
    if (this.currentWord.length === 0) return null;
    const word = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      symbols: [...this.currentWord],
      rawBits: this.currentWord.map(e => e.bits).join(''),
      encryptedBits: this.currentWord.map(e => e.pqpEncrypted).join(''),
    };
    this.encodedWords.push(word);
    this.generatedKeys.push(word.symbols.map(e => e.sessionKey).join('-'));
    this.currentWord = [];
    return word;
  },

  /**
   * Decrypts a stored word using per-symbol session keys.
   */
  decryptWord(wordId) {
    const word = this.encodedWords.find(w => w.id === wordId);
    if (!word) return null;
    return word.symbols.map(e =>
      pqpDecrypt(e.pqpEncrypted, e.sessionKey)
    ).join('');
  },

  clearCurrent() {
    this.currentWord = [];
  }
};

// Export for use in app.js
window.QuantumSession = QuantumSession;
window.SYMBOL_TO_BITS = SYMBOL_TO_BITS;

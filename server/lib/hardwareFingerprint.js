const crypto = require('crypto');

/**
 * Normalizes text for resilient comparison
 */
function normalizeString(str) {
  return String(str || '').toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

/**
 * Check if two GPU renderers match (handles minor driver or ANGLE wrapper variations)
 */
function compareGpu(incomingGpu = {}, storedGpu = {}) {
  const inRend = normalizeString(incomingGpu.renderer);
  const stRend = normalizeString(storedGpu.renderer);
  const inVend = normalizeString(incomingGpu.vendor);
  const stVend = normalizeString(storedGpu.vendor);

  if (!inRend && !stRend) return 15; // Both empty (no WebGL available)
  if (!inRend || !stRend) return 0;

  if (inRend === stRend) return 30;

  // Check substring / model match (e.g. "mali-g57" in "mali-g57 mc2" or "apple gpu" in "apple gpu 5-core")
  if (inRend.includes(stRend) || stRend.includes(inRend)) return 26;

  // Extract key chipset tokens (e.g. "adreno 618", "geforce rtx 3060", "apple").
  // Split on any non-alphanumeric char so ANGLE wrapper strings like
  // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11...)" tokenize cleanly
  // against Firefox-style renderers like "NVIDIA GeForce RTX 3060/PCIe/SSE2".
  const inTokens = normalizeString(inRend).split(/[^a-z0-9]+/).filter(t => t.length > 2);
  const stTokens = normalizeString(stRend).split(/[^a-z0-9]+/).filter(t => t.length > 2);
  const overlap = inTokens.filter(t => stTokens.includes(t));
  if (overlap.length >= 2) return 22;

  let vendorScore = 0;
  if (inVend && stVend && (inVend === stVend || inVend.includes(stVend) || stVend.includes(inVend))) {
    vendorScore = 5;
  }

  return vendorScore;
}

/**
 * Compare screen dimensions (handles device rotation width <-> height)
 */
function compareScreen(incomingScreen = {}, storedScreen = {}) {
  const inW = parseInt(incomingScreen.w, 10) || 0;
  const inH = parseInt(incomingScreen.h, 10) || 0;
  const stW = parseInt(storedScreen.w, 10) || 0;
  const stH = parseInt(storedScreen.h, 10) || 0;

  if (!inW || !stW) return 0;

  let score = 0;
  // Exact match or rotated match (portrait vs landscape)
  if ((inW === stW && inH === stH) || (inW === stH && inH === stW)) {
    score += 15;
  } else if (Math.abs(inW - stW) <= 2 && Math.abs(inH - stH) <= 2) {
    score += 12;
  }

  // Device pixel ratio comparison
  const inDpr = parseFloat(incomingScreen.dpr) || 1;
  const stDpr = parseFloat(storedScreen.dpr) || 1;
  if (Math.abs(inDpr - stDpr) < 0.05) {
    score += 10;
  } else if (Math.abs(inDpr - stDpr) <= 0.5) {
    score += 5;
  }

  return score;
}

/**
 * Compare CPU cores, RAM, and touch points
 */
function compareSystem(incomingSys = {}, storedSys = {}) {
  let score = 0;

  // CPU cores
  const inCores = parseInt(incomingSys.cores, 10) || 0;
  const stCores = parseInt(storedSys.cores, 10) || 0;
  if (inCores && stCores && inCores === stCores) {
    score += 10;
  }

  // Max touch points (e.g. 5 on phone, 0 on desktop)
  const inTouch = parseInt(incomingSys.maxTouchPoints, 10);
  const stTouch = parseInt(storedSys.maxTouchPoints, 10);
  if (!isNaN(inTouch) && !isNaN(stTouch) && inTouch === stTouch) {
    score += 5;
  }

  // Device memory class
  const inMem = parseFloat(incomingSys.memory) || 0;
  const stMem = parseFloat(storedSys.memory) || 0;
  if (inMem && stMem && inMem === stMem) {
    score += 5;
  }

  return score;
}

/**
 * Compare audio engine curve & platform
 */
function compareAudioAndPlatform(incomingProfile = {}, storedProfile = {}) {
  let score = 0;

  const inPlat = normalizeString(incomingProfile.system?.platform);
  const stPlat = normalizeString(storedProfile.system?.platform);
  if (inPlat && stPlat && (inPlat === stPlat || inPlat.includes(stPlat) || stPlat.includes(inPlat))) {
    score += 5;
  }

  const inAudio = String(incomingProfile.audio || '').trim();
  const stAudio = String(storedProfile.audio || '').trim();
  if (inAudio && stAudio && inAudio === stAudio) {
    score += 5;
  } else if (inAudio && stAudio && Math.abs(parseFloat(inAudio) - parseFloat(stAudio)) < 0.001) {
    score += 4;
  }

  return score;
}

/**
 * Compare IP proximity (exact, /24 subnet, or /16 subnet)
 */
function compareIp(incomingIp = '', storedIp = '') {
  if (!incomingIp || !storedIp) return 0;
  if (incomingIp === storedIp) return 10;

  const inParts = incomingIp.split('.');
  const stParts = storedIp.split('.');

  if (inParts.length === 4 && stParts.length === 4) {
    if (inParts[0] === stParts[0] && inParts[1] === stParts[1] && inParts[2] === stParts[2]) {
      return 7; // Same /24 subnet (same WiFi / local router pool)
    }
    if (inParts[0] === stParts[0] && inParts[1] === stParts[1]) {
      return 4; // Same /16 subnet (same ISP / cellular area)
    }
  }

  return 0;
}

/**
 * Computes a similarity score (0 to 100) between an incoming hardware profile
 * and a stored registered device profile.
 */
function computeSimilarityScore(incomingProfile = {}, storedProfile = {}, incomingIp = '', storedIp = '') {
  if (!incomingProfile || !storedProfile) return 0;

  const gpuScore    = compareGpu(incomingProfile.gpu, storedProfile.gpu);         // Max 30
  const screenScore = compareScreen(incomingProfile.screen, storedProfile.screen); // Max 25
  const sysScore    = compareSystem(incomingProfile.system, storedProfile.system); // Max 20
  const audioScore  = compareAudioAndPlatform(incomingProfile, storedProfile);     // Max 10
  const ipScore     = compareIp(incomingIp, storedIp);                             // Max 10

  const total = gpuScore + screenScore + sysScore + audioScore + ipScore;
  return Math.min(100, Math.max(0, total));
}

/**
 * Deterministic hardware hash generator
 */
function computeHardwareHash(profile = {}) {
  if (!profile) return '';
  const components = [
    profile.gpu?.renderer || '',
    profile.gpu?.vendor || '',
    profile.screen?.w || 0,
    profile.screen?.h || 0,
    profile.screen?.dpr || 1,
    profile.system?.cores || 0,
    profile.system?.maxTouchPoints || 0,
    profile.system?.platform || '',
    profile.audio || ''
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex').slice(0, 32);
}

module.exports = {
  computeSimilarityScore,
  computeHardwareHash,
  // 65% strongly indicates the same physical machine. The old 80% threshold was
  // unreachable for cross-browser logins on the SAME computer (GPU renderer
  // strings, deviceMemory availability and audio fingerprints all differ across
  // browser engines), which caused false "new device" alerts. A genuinely
  // different device on the same WiFi still scores ~25-50, well below this.
  MATCH_THRESHOLD: 65,
};

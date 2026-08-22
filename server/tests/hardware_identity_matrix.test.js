const { computeSimilarityScore, computeHardwareHash, MATCH_THRESHOLD } = require('../lib/hardwareFingerprint');

let passed = 0;
let failed = 0;

function assert(label, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label} ${details}`);
  }
}

async function runTests() {
  console.log('\n--- 1. Testing Hardware Similarity Scoring ---');

  // Exact same device (e.g. Safari and PWA on iPhone 15 Pro)
  const iphoneSafari = {
    gpu: { vendor: 'Apple', renderer: 'Apple GPU' },
    screen: { w: 393, h: 852, dpr: 3, colorDepth: 30 },
    system: { cores: 6, maxTouchPoints: 5, memory: 0, platform: 'iPhone' },
    audio: '124.551200'
  };

  const iphonePwa = {
    gpu: { vendor: 'Apple', renderer: 'Apple GPU' },
    screen: { w: 393, h: 852, dpr: 3, colorDepth: 30 },
    system: { cores: 6, maxTouchPoints: 5, memory: 0, platform: 'iPhone' },
    audio: '124.551200'
  };

  const sameIp = '156.217.247.102';
  const sameSubnetIp = '156.217.247.115';

  const scorePwa = computeSimilarityScore(iphonePwa, iphoneSafari, sameSubnetIp, sameIp);
  assert('iPhone Safari vs iPhone PWA score >= 85%', scorePwa >= 85, `got ${scorePwa}%`);
  assert('Score qualifies for Self-Healing (>= MATCH_THRESHOLD)', scorePwa >= MATCH_THRESHOLD);

  // Samsung Galaxy A15 (Chrome vs Samsung Internet)
  const galaxyChrome = {
    gpu: { vendor: 'ARM', renderer: 'Mali-G57 MC2' },
    screen: { w: 412, h: 915, dpr: 2.625, colorDepth: 24 },
    system: { cores: 8, maxTouchPoints: 5, memory: 6, platform: 'Linux armv8l' },
    audio: '98.120500'
  };

  const galaxySamsungBrowser = {
    gpu: { vendor: 'ARM', renderer: 'Mali-G57 MC2' },
    screen: { w: 412, h: 915, dpr: 2.625, colorDepth: 24 },
    system: { cores: 8, maxTouchPoints: 5, memory: 6, platform: 'Linux aarch64' },
    audio: '98.120500'
  };

  const scoreGalaxy = computeSimilarityScore(galaxySamsungBrowser, galaxyChrome, sameIp, sameIp);
  assert('Samsung Galaxy Chrome vs Samsung Internet score >= 90%', scoreGalaxy >= 90, `got ${scoreGalaxy}%`);

  // Foreign device comparison (iPhone vs Windows PC)
  const windowsDesktop = {
    gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)' },
    screen: { w: 1920, h: 1080, dpr: 1, colorDepth: 24 },
    system: { cores: 16, maxTouchPoints: 0, memory: 8, platform: 'Win32' },
    audio: '44.890100'
  };

  const scoreForeign = computeSimilarityScore(windowsDesktop, iphoneSafari, '41.34.12.9', sameIp);
  assert('iPhone vs Windows Desktop foreign device score < 50%', scoreForeign < 50, `got ${scoreForeign}%`);
  assert('Foreign device fails MATCH_THRESHOLD (< 80%)', scoreForeign < MATCH_THRESHOLD);

  // Another foreign mobile device (iPhone vs Samsung A15)
  const scoreMobileForeign = computeSimilarityScore(galaxyChrome, iphoneSafari, '197.63.225.23', sameIp);
  assert('iPhone vs Samsung A15 foreign device score < 50%', scoreMobileForeign < 50, `got ${scoreMobileForeign}%`);

  console.log('\n--- 2. Testing Hardware Hash Determinism ---');
  const hash1 = computeHardwareHash(iphoneSafari);
  const hash2 = computeHardwareHash(iphonePwa);
  assert('Deterministic hardware hash matches for identical hardware', hash1 === hash2 && hash1.length > 10, `hash1=${hash1}, hash2=${hash2}`);

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();

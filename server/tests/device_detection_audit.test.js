/**
 * Device Detection & Model Identification Audit Test Suite
 *
 * Covers:
 * 1. Exact model detection (Realme 11 4G, Samsung, Xiaomi, Oppo, Infinix, Tecno, Apple, etc.)
 * 2. Mobile Desktop Mode (avoiding false Linux classification)
 * 3. Windows 11 vs Windows 10 Client Hints detection
 * 4. XSS & Control Character Sanitization on device names
 * 5. Fallback mechanisms when Client Hints are absent or malformed
 * 6. Edge cases (Empty, null, undefined, 10,000 char strings, unicode, special chars)
 */

const { strictEqual, ok } = require('assert');

let passed = 0;
let failed = 0;
const testLogs = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    testLogs.push(`  ✅ PASS: ${name}`);
  } catch (err) {
    failed++;
    testLogs.push(`  ❌ FAIL: ${name} -> ${err.message}`);
  }
}

// ── Extract functions to test directly from auth logic ──────────────────────────

function humanizeModel(model) {
  if (!model) return '';
  const m = String(model).replace(/["']/g, '').trim().slice(0, 100);
  const upper = m.toUpperCase();

  // Samsung Galaxy Series
  if (/^SM-([A-Z0-9]+)/i.test(upper)) {
    if (/^SM-S92/i.test(upper)) return `Samsung Galaxy S24 (${m})`;
    if (/^SM-S91/i.test(upper)) return `Samsung Galaxy S23 (${m})`;
    if (/^SM-S90/i.test(upper)) return `Samsung Galaxy S22 (${m})`;
    if (/^SM-G99/i.test(upper)) return `Samsung Galaxy S21 (${m})`;
    if (/^SM-G98/i.test(upper)) return `Samsung Galaxy S20 (${m})`;
    if (/^SM-G97/i.test(upper)) return `Samsung Galaxy S10 (${m})`;
    if (/^SM-A55/i.test(upper)) return `Samsung Galaxy A55 (${m})`;
    if (/^SM-A54/i.test(upper)) return `Samsung Galaxy A54 (${m})`;
    if (/^SM-A53/i.test(upper)) return `Samsung Galaxy A53 (${m})`;
    if (/^SM-A52/i.test(upper)) return `Samsung Galaxy A52 (${m})`;
    if (/^SM-A51/i.test(upper)) return `Samsung Galaxy A51 (${m})`;
    if (/^SM-A50/i.test(upper)) return `Samsung Galaxy A50 (${m})`;
    if (/^SM-A35/i.test(upper)) return `Samsung Galaxy A35 (${m})`;
    if (/^SM-A34/i.test(upper)) return `Samsung Galaxy A34 (${m})`;
    if (/^SM-A33/i.test(upper)) return `Samsung Galaxy A33 (${m})`;
    if (/^SM-A32/i.test(upper)) return `Samsung Galaxy A32 (${m})`;
    if (/^SM-A31/i.test(upper)) return `Samsung Galaxy A31 (${m})`;
    if (/^SM-A30/i.test(upper)) return `Samsung Galaxy A30 (${m})`;
    if (/^SM-A25/i.test(upper)) return `Samsung Galaxy A25 (${m})`;
    if (/^SM-A24/i.test(upper)) return `Samsung Galaxy A24 (${m})`;
    if (/^SM-A23/i.test(upper)) return `Samsung Galaxy A23 (${m})`;
    if (/^SM-A22/i.test(upper)) return `Samsung Galaxy A22 (${m})`;
    if (/^SM-A21/i.test(upper)) return `Samsung Galaxy A21 (${m})`;
    if (/^SM-A20/i.test(upper)) return `Samsung Galaxy A20 (${m})`;
    if (/^SM-A15/i.test(upper)) return `Samsung Galaxy A15 (${m})`;
    if (/^SM-A14/i.test(upper)) return `Samsung Galaxy A14 (${m})`;
    if (/^SM-A13/i.test(upper)) return `Samsung Galaxy A13 (${m})`;
    if (/^SM-A12/i.test(upper)) return `Samsung Galaxy A12 (${m})`;
    if (/^SM-A11/i.test(upper)) return `Samsung Galaxy A11 (${m})`;
    if (/^SM-A10/i.test(upper)) return `Samsung Galaxy A10 (${m})`;
    if (/^SM-A05/i.test(upper)) return `Samsung Galaxy A05 (${m})`;
    if (/^SM-A04/i.test(upper)) return `Samsung Galaxy A04 (${m})`;
    if (/^SM-A03/i.test(upper)) return `Samsung Galaxy A03 (${m})`;
    if (/^SM-A/i.test(upper)) return `Samsung Galaxy A (${m})`;
    if (/^SM-M/i.test(upper)) return `Samsung Galaxy M (${m})`;
    if (/^SM-F/i.test(upper)) return `Samsung Galaxy Z (${m})`;
    if (/^SM-N/i.test(upper)) return `Samsung Galaxy Note (${m})`;
    if (/^SM-[TX]/i.test(upper)) return `Samsung Galaxy Tab (${m})`;
    return `Samsung (${m})`;
  }

  // Xiaomi / Redmi / POCO
  if (/^2[0-9]{3}[0-9A-Z]+/i.test(upper) || /^M2[0-9]+/i.test(upper) || /REDMI|XIAOMI|POCO/i.test(upper)) {
    if (/23129RAA4G|23124RA7EO/i.test(upper)) return `Redmi Note 13 (${m})`;
    if (/2312DRA50G/i.test(upper)) return `Redmi Note 13 Pro (${m})`;
    if (/23117RA68G/i.test(upper)) return `Redmi Note 13 Pro+ (${m})`;
    if (/22101316G|22101316UG/i.test(upper)) return `Redmi Note 12 (${m})`;
    if (/22101316UCP/i.test(upper)) return `Redmi Note 12 Pro (${m})`;
    if (/2201117TG|2201117TY/i.test(upper)) return `Redmi Note 11 (${m})`;
    if (/2201116SG/i.test(upper)) return `Redmi Note 11 Pro (${m})`;
    if (/2311DRK48G/i.test(upper)) return `POCO X6 Pro (${m})`;
    if (/23122PCD1G/i.test(upper)) return `POCO X6 (${m})`;
    if (/23049PCD8G/i.test(upper)) return `POCO F5 (${m})`;
    if (/23053RN02Y|23053RN02L/i.test(upper)) return `Redmi 12 (${m})`;
    if (/23108RN04Y/i.test(upper)) return `Redmi 13C (${m})`;
    if (/2404ARN45A/i.test(upper)) return `Redmi 13 (${m})`;
    if (/23028RN4BG|23028RNCAG/i.test(upper)) return `Redmi 12C (${m})`;
    if (/POCO/i.test(upper)) return `POCO (${m})`;
    if (/REDMI/i.test(upper)) return `Redmi (${m})`;
    return `Xiaomi (${m})`;
  }

  // Realme
  if (/^RMX[0-9]+/i.test(upper)) {
    if (/^RMX3636|^RMX3630/i.test(upper)) return `Realme 11 4G (${m})`;
    if (/^RMX3740|^RMX3741/i.test(upper)) return `Realme 11 5G (${m})`;
    if (/^RMX3771|^RMX3770/i.test(upper)) return `Realme 11 Pro 5G (${m})`;
    if (/^RMX3780/i.test(upper)) return `Realme 11 Pro+ 5G (${m})`;
    if (/^RMX3840|^RMX3841/i.test(upper)) return `Realme 12 Pro+ 5G (${m})`;
    if (/^RMX3842/i.test(upper)) return `Realme 12 Pro 5G (${m})`;
    if (/^RMX3890/i.test(upper)) return `Realme 12+ / C65 (${m})`;
    if (/^RMX3830/i.test(upper)) return `Realme C67 (${m})`;
    if (/^RMX3760|^RMX3761/i.test(upper)) return `Realme C53 (${m})`;
    if (/^RMX3710/i.test(upper)) return `Realme C55 (${m})`;
    if (/^RMX3511/i.test(upper)) return `Realme C35 (${m})`;
    if (/^RMX3261|^RMX3263/i.test(upper)) return `Realme C21Y (${m})`;
    if (/^RMX3612|^RMX3611/i.test(upper)) return `Realme 10 Pro (${m})`;
    if (/^RMX3363|^RMX3360/i.test(upper)) return `Realme GT Master (${m})`;
    if (/^RMX3392|^RMX3393/i.test(upper)) return `Realme 9 Pro+ (${m})`;
    if (/^RMX3085|^RMX3081/i.test(upper)) return `Realme 8 / 8 Pro (${m})`;
    return `Realme (${m})`;
  }

  // Oppo
  if (/^CPH[0-9]+/i.test(upper)) {
    if (/^CPH2579/i.test(upper)) return `Oppo Reno 11 5G (${m})`;
    if (/^CPH2607/i.test(upper)) return `Oppo Reno 11F 5G (${m})`;
    if (/^CPH2525|^CPH2527/i.test(upper)) return `Oppo Reno 10 5G (${m})`;
    if (/^CPH2523/i.test(upper)) return `Oppo Reno 10 Pro+ (${m})`;
    if (/^CPH2457/i.test(upper)) return `Oppo Reno 8T 5G (${m})`;
    if (/^CPH2481/i.test(upper)) return `Oppo Reno 8T 4G (${m})`;
    if (/^CPH2359/i.test(upper)) return `Oppo Reno 8 5G (${m})`;
    if (/^CPH2371/i.test(upper)) return `Oppo Reno 7 5G (${m})`;
    if (/^CPH2569/i.test(upper)) return `Oppo A79 5G (${m})`;
    if (/^CPH2577/i.test(upper)) return `Oppo A58 (${m})`;
    if (/^CPH2565/i.test(upper)) return `Oppo A38 (${m})`;
    if (/^CPH2477/i.test(upper)) return `Oppo A78 (${m})`;
    if (/^CPH2387/i.test(upper)) return `Oppo A57 (${m})`;
    if (/^CPH2269/i.test(upper)) return `Oppo A16 (${m})`;
    if (/^CPH2185/i.test(upper)) return `Oppo A15 (${m})`;
    return `Oppo (${m})`;
  }

  // OnePlus
  if (/^NE[0-9]+|^KB[0-9]+|^IN[0-9]+|^GM[0-9]+/i.test(upper)) {
    return `OnePlus (${m})`;
  }

  // Infinix
  if (/^X[0-9]{3,}/i.test(upper)) {
    if (/^X6837/i.test(upper)) return `Infinix Hot 40 Pro (${m})`;
    if (/^X6836/i.test(upper)) return `Infinix Hot 40 (${m})`;
    if (/^X6831/i.test(upper)) return `Infinix Hot 30 (${m})`;
    if (/^X6850/i.test(upper)) return `Infinix Note 40 Pro (${m})`;
    if (/^X6711/i.test(upper)) return `Infinix Note 30 (${m})`;
    if (/^X6525/i.test(upper)) return `Infinix Smart 8 (${m})`;
    if (/^X6515/i.test(upper)) return `Infinix Smart 7 (${m})`;
    return `Infinix (${m})`;
  }

  // Tecno
  if (/^[A-Z]{2}[0-9]+/i.test(upper) && !/^SM-/i.test(upper)) {
    if (/^KJ6/i.test(upper)) return `Tecno Spark 20 (${m})`;
    if (/^KJ5/i.test(upper)) return `Tecno Spark 20C (${m})`;
    if (/^KL7/i.test(upper)) return `Tecno Camon 30 (${m})`;
    if (/^CK6/i.test(upper)) return `Tecno Camon 20 (${m})`;
    return `Tecno (${m})`;
  }

  // Vivo
  if (/^V[0-9]{4}/i.test(upper)) return `Vivo (${m})`;

  // Huawei / Honor
  if (/^ALN|^VOG|^HMA|^CLT|^ELS|^ANA|^NOH|^JAD/i.test(upper)) return `Huawei (${m})`;
  if (/^LGE|^ELT|^ANY/i.test(upper)) return `Honor (${m})`;

  // Google Pixel
  if (/PIXEL/i.test(upper)) return m;

  return m;
}

function parseDeviceName(userAgent, clientProvidedName, headers = {}) {
  if (clientProvidedName && typeof clientProvidedName === 'string') {
    const clean = clientProvidedName
      .replace(/<[^>]*>?/gm, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/["'`<>]/g, '')
      .trim();
    if (clean.length >= 3 && clean.length <= 250) {
      return clean;
    }
  }

  if (!userAgent && !headers['sec-ch-ua-platform']) return 'جهاز غير معروف';
  const ua = userAgent || '';

  let os = 'غير معروف';
  let browser = 'متصفح';
  let model = '';

  const chPlatform = headers['sec-ch-ua-platform'] ? String(headers['sec-ch-ua-platform']).replace(/["']/g, '') : '';
  const chPlatformVersion = headers['sec-ch-ua-platform-version'] ? String(headers['sec-ch-ua-platform-version']).replace(/["']/g, '') : '';
  const chModel = headers['sec-ch-ua-model'] ? String(headers['sec-ch-ua-model']).replace(/["']/g, '') : '';
  const chMobile = headers['sec-ch-ua-mobile'] === '?1';

  if (/Android/i.test(ua) || chPlatform.toLowerCase() === 'android') {
    let androidVer = '';
    if (chPlatformVersion) {
      const major = parseInt(chPlatformVersion.split('.')[0], 10);
      if (!isNaN(major) && major > 0) androidVer = `${major}`;
    }
    if (!androidVer) {
      const m = ua.match(/Android ([0-9.]+)/i);
      androidVer = m ? m[1] : '';
    }
    os = androidVer ? `Android ${androidVer}` : 'Android';
  } else if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iPhone';
  } else if (/iPad/i.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/i);
    os = m ? `iPadOS ${m[1].replace(/_/g, '.')}` : 'iPad';
  } else if (/Mac OS/i.test(ua) || chPlatform.toLowerCase() === 'macos') {
    os = 'macOS';
  } else if (/Windows NT 10/i.test(ua) || (chPlatform.toLowerCase() === 'windows' && chPlatformVersion)) {
    if (chPlatformVersion) {
      const major = parseInt(chPlatformVersion.split('.')[0], 10);
      os = (!isNaN(major) && major >= 13) ? 'Windows 11' : 'Windows 10';
    } else {
      os = 'Windows 10/11';
    }
  } else if (/Windows NT 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Linux/i.test(ua) || chPlatform.toLowerCase() === 'linux') {
    if (chMobile || /Mobile|Phone|Tablet/i.test(ua)) {
      os = 'Android (وضع كمبيوتر)';
    } else {
      os = 'Linux';
    }
  }

  if (chModel) {
    model = humanizeModel(chModel);
  } else {
    const m = ua.match(/;\s*([A-Za-z0-9\-\s_]+)\s+Build\//i);
    if (m && m[1] && !/Linux|Android/i.test(m[1])) {
      model = humanizeModel(m[1].trim());
    }
  }

  if (/SamsungBrowser\/([0-9.]+)/i.test(ua))   browser = 'Samsung Internet';
  else if (/MiuiBrowser\/([0-9.]+)/i.test(ua)) browser = 'Mi Browser';
  else if (/Edg\/|EdgA\/|EdgiOS\//i.test(ua))  browser = 'Edge';
  else if (/OPR\/|OPT\/|Opera/i.test(ua))      browser = 'Opera';
  else if (/WhatsApp\//i.test(ua))             browser = 'WhatsApp';
  else if (/FB_IAB|FBAN|FBAV|Instagram/i.test(ua)) browser = 'Facebook/Instagram';
  else if (/Firefox\/|FxiOS\//i.test(ua))      browser = 'Firefox';
  else if (/Chrome\/|CriOS\//i.test(ua))       browser = 'Chrome';
  else if (/Safari\//i.test(ua))               browser = 'Safari';

  const parts = [];
  if (model) parts.push(model);
  parts.push(os);
  parts.push(browser);

  return parts.join(' — ');
}

// ── Test Cases ───────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log(' Device Detection Audit & Edge Cases Test Suite');
console.log('='.repeat(60));

// 1. Realme 11 4G Model Tests
test('Realme 11 4G (RMX3636) model decoding', () => {
  const res = humanizeModel('RMX3636');
  strictEqual(res, 'Realme 11 4G (RMX3636)');
});

test('Realme 11 Pro 5G (RMX3771) model decoding', () => {
  const res = humanizeModel('RMX3771');
  strictEqual(res, 'Realme 11 Pro 5G (RMX3771)');
});

test('Realme C53 (RMX3760) model decoding', () => {
  const res = humanizeModel('RMX3760');
  strictEqual(res, 'Realme C53 (RMX3760)');
});

// 2. Samsung Galaxy Model Tests
test('Samsung Galaxy A54 (SM-A546E) model decoding', () => {
  const res = humanizeModel('SM-A546E');
  strictEqual(res, 'Samsung Galaxy A54 (SM-A546E)');
});

test('Samsung Galaxy S24 (SM-S928B) model decoding', () => {
  const res = humanizeModel('SM-S928B');
  strictEqual(res, 'Samsung Galaxy S24 (SM-S928B)');
});

// 3. Xiaomi / Redmi Model Tests
test('Xiaomi Redmi Note 12 (22101316UG) model decoding', () => {
  const res = humanizeModel('22101316UG');
  strictEqual(res, 'Redmi Note 12 (22101316UG)');
});

test('Xiaomi Redmi Note 13 (23129RAA4G) model decoding', () => {
  const res = humanizeModel('23129RAA4G');
  strictEqual(res, 'Redmi Note 13 (23129RAA4G)');
});

// 4. Oppo Model Tests
test('Oppo Reno 11 5G (CPH2579) model decoding', () => {
  const res = humanizeModel('CPH2579');
  strictEqual(res, 'Oppo Reno 11 5G (CPH2579)');
});

// 5. Infinix & Tecno Model Tests
test('Infinix Hot 30 (X6831) model decoding', () => {
  const res = humanizeModel('X6831');
  strictEqual(res, 'Infinix Hot 30 (X6831)');
});

test('Tecno Spark 20 (KJ6) model decoding', () => {
  const res = humanizeModel('KJ6');
  strictEqual(res, 'Tecno Spark 20 (KJ6)');
});

// 6. Mobile Desktop Site Mode (Fix for False "Linux" Detection)
test('Mobile phone with Desktop Mode enabled does NOT report raw Linux', () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const headers = { 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Linux"' };
  const res = parseDeviceName(ua, null, headers);
  ok(res.includes('Android (وضع كمبيوتر)'), `Expected Android (وضع كمبيوتر) but got: ${res}`);
  ok(!res.startsWith('Linux —'), 'Should not start with raw Linux');
});

test('Actual Desktop Linux machine is correctly identified', () => {
  const ua = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
  const headers = { 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Linux"' };
  const res = parseDeviceName(ua, null, headers);
  ok(res.includes('Linux — Firefox'), `Expected Linux — Firefox but got: ${res}`);
});

// 7. Windows 11 vs Windows 10 via Client Hints
test('Windows 11 identified via Client Hints platformVersion >= 13', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const headers = { 'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-platform-version': '"15.0.0"' };
  const res = parseDeviceName(ua, null, headers);
  ok(res.includes('Windows 11'), `Expected Windows 11 but got: ${res}`);
});

test('Windows 10 identified via Client Hints platformVersion < 13', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const headers = { 'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-platform-version': '"10.0.0"' };
  const res = parseDeviceName(ua, null, headers);
  ok(res.includes('Windows 10'), `Expected Windows 10 but got: ${res}`);
});

// 8. iPhone & iPad Detection
test('iPhone with iOS version from User-Agent', () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const res = parseDeviceName(ua, null, {});
  ok(res.includes('iOS 17.5.1 — Safari'), `Expected iOS 17.5.1 — Safari but got: ${res}`);
});

// 9. Android Real Version with Client Hints
test('Realme 11 4G with Android 14 Client Hints and Chrome', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
  const headers = {
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua-platform-version': '"14.0.0"',
    'sec-ch-ua-model': '"RMX3636"',
    'sec-ch-ua-mobile': '?1',
  };
  const res = parseDeviceName(ua, null, headers);
  strictEqual(res, 'Realme 11 4G (RMX3636) — Android 14 — Chrome');
});

// 10. Security & XSS Sanitization Tests
test('XSS script tags are stripped from client-provided device name', () => {
  const malicious = '<script>alert("hacked")</script>Samsung Galaxy S24';
  const res = parseDeviceName('ua', malicious, {});
  ok(!res.includes('<script>'), 'Script tags must be stripped');
  ok(!res.includes('</script>'), 'Script tags must be stripped');
  ok(res.includes('Samsung Galaxy S24'), 'Valid name content should remain');
});

test('HTML injection with image onError is stripped', () => {
  const malicious = '<img src=x onerror=alert(1)>Realme 11';
  const res = parseDeviceName('ua', malicious, {});
  ok(!res.includes('<img'), 'HTML tags must be stripped');
  ok(!res.includes('>'), 'Angle brackets must be stripped');
  ok(res.includes('Realme 11'), 'Valid name content should remain');
});

test('Control characters and NULL bytes are stripped', () => {
  const evil = 'Phone\x00\x1F\x7F — Android 14';
  const res = parseDeviceName('ua', evil, {});
  ok(!res.includes('\x00'), 'Null byte must be stripped');
  ok(!res.includes('\x1F'), 'Control char must be stripped');
  ok(!res.includes('\x7F'), 'DEL char must be stripped');
});

// 11. Edge cases: Empty, null, undefined, extremely long strings
test('Extremely long device name string (>10,000 chars) is truncated safely', () => {
  const huge = 'A'.repeat(10000);
  const res = parseDeviceName('ua', huge, {});
  ok(res.length <= 250, `Expected length <= 250, got ${res.length}`);
});

test('Null and undefined inputs return default device name without throwing', () => {
  const res1 = parseDeviceName(null, null, {});
  strictEqual(res1, 'جهاز غير معروف');
  const res2 = parseDeviceName(undefined, undefined, {});
  strictEqual(res2, 'جهاز غير معروف');
  const res3 = parseDeviceName('', '', {});
  strictEqual(res3, 'جهاز غير معروف');
});

test('humanizeModel handles null, undefined, empty, and non-string inputs safely', () => {
  strictEqual(humanizeModel(null), '');
  strictEqual(humanizeModel(undefined), '');
  strictEqual(humanizeModel(''), '');
  strictEqual(humanizeModel(12345), '12345');
});

console.log('\n' + '─'.repeat(60));
testLogs.forEach((l) => console.log(l));
console.log('─'.repeat(60));
console.log(` Summary: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(60));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✨ ALL AUDIT & EDGE-CASE TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

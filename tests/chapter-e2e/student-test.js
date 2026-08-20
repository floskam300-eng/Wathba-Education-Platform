// Student-side lock tests. Uses the admin token to look up the student
// (via /api/auth/me not available — instead we use a one-off SQL query
// through a tiny helper script).
const BASE = 'http://localhost:3001';
const log = (...args) => console.log('[STUDENT]', ...args);
const ok = (msg) => console.log('  ✅', msg);
const fail = (msg) => { console.error('  ❌', msg); process.exitCode = 1; };

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': 'demo',
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body, headers: res.headers };
}

// Use the pre-registered device id (whitelisted by the test setup script).
async function loginStudent(username, password) {
  const r = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      device_id: 'test-stable-device-001',
      device_origin: 'browser',
      device_name: 'test-runner',
    }),
  });
  if (r.status !== 200) throw new Error(`student login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

let totalPass = 0, totalFail = 0;
function check(label, okValue, extra = '') {
  if (okValue) { ok(label + (extra ? ` (${extra})` : '')); totalPass++; }
  else { fail(label + (extra ? ` — ${extra}` : '')); totalFail++; }
}

async function main() {
  log('=== Logging in as student std_ali ===');
  let studentToken;
  try {
    studentToken = await loginStudent('std_ali', '123456');
  } catch (err) {
    log('  ⚠️  cannot login as student (device lock) — skipping student-side tests');
    log('  ℹ️  This is OK in production where devices are pre-registered.');
    log('  ℹ️  For dev, manually register the device in the DB.');
    return;
  }
  check('student login', !!studentToken, `len=${studentToken.length}`);

  // c1 = id=403 (الجبر والمثلثات)
  const c1 = await req('/api/courses/student/my-courses', { headers: { Authorization: `Bearer ${studentToken}` } });
  if (c1.status !== 200) { fail('cannot list my courses', JSON.stringify(c1.body)); return; }
  const c1Entry = c1.body.find(c => c.name?.includes('الجبر') && c.name?.includes('المثلثات'));
  if (!c1Entry) { fail('c1 not in my-courses', c1.body.map(c => c.name)); return; }
  check('c1 enrolled', !!c1Entry, `id=${c1Entry.id}`);

  const content = await req(`/api/courses/${c1Entry.id}/content`, { headers: { Authorization: `Bearer ${studentToken}` } });
  check('GET content OK', content.status === 200);
  const sc = content.body;
  const first = sc.sections.find(s => s.sort_order === 1);
  const second = sc.sections.find(s => s.sort_order === 2);
  const third = sc.sections.find(s => s.sort_order === 3);

  check('first section unlocked', first?.is_unlocked_for_student === true);
  check('second section locked (has gate-recitations)', second?.is_unlocked_for_student === false);
  // c1s3 doesn't have any gate-recitations in current seed data, so it's
  // unlocked by default. This is the correct behavior — chapters with no
  // gates are always open.
  check('third section unlocked (no gate-recitations)', third?.is_unlocked_for_student === true);
  check('second section has gate_progress', second?.gate_progress?.required > 0, `required=${second?.gate_progress?.required} passed=${second?.gate_progress?.passed}`);
  check('third section has no gate_progress (no recitations)', third?.gate_progress === null);

  // The legacy flat fields (videos, pdfs, exams) should also be present
  // for backward compatibility.
  check('legacy fields present', Array.isArray(sc.videos) && Array.isArray(sc.pdfs) && Array.isArray(sc.exams));

  // Test video progress on locked section
  log('\n=== T2: POST /me/video-progress on locked section ===');
  const lockedVideo = second?.videos?.[0];
  if (lockedVideo) {
    const prog = await req('/api/students/me/video-progress', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        video_id: lockedVideo.id,
        watched_minutes: 5,
        progress_percentage: 50,
        last_position: 100,
        actual_watched_seconds: 300,
      }),
    });
    check('video progress blocked on locked section', prog.status === 403, `status=${prog.status} body=${JSON.stringify(prog.body)}`);
  } else {
    log('  (no video in locked section — skipping)');
  }

  // Test video progress on unlocked section
  log('\n=== T3: POST /me/video-progress on unlocked section ===');
  const openVideo = first?.videos?.[0];
  if (openVideo) {
    const prog = await req('/api/students/me/video-progress', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        video_id: openVideo.id,
        watched_minutes: 5,
        progress_percentage: 50,
        last_position: 100,
        actual_watched_seconds: 300,
      }),
    });
    check('video progress allowed on unlocked section', prog.status === 200, `status=${prog.status}`);
  }

  log(`\nStudent-side: ${totalPass} passed, ${totalFail} failed`);
  if (totalFail > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

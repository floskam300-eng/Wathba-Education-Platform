const test = require('node:test');
const assert = require('node:assert');

test('Expired exam session elapsed calculation accurately identifies expired sessions', () => {
  const durationMinutes = 30;
  const maxDurationMs = (durationMinutes * 60 + 90) * 1000;
  
  // 1. Session started 10 minutes ago -> Active
  const started10MinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const elapsed10MinMs = Date.now() - started10MinAgo.getTime();
  assert.strictEqual(elapsed10MinMs <= maxDurationMs, true);
  const remainingSecs = Math.max(0, Math.floor(((durationMinutes * 60 * 1000) - elapsed10MinMs) / 1000));
  assert.strictEqual(remainingSecs > 0, true);
  assert.strictEqual(Math.round(remainingSecs / 60), 20);

  // 2. Session started 45 minutes ago -> Expired
  const started45MinAgo = new Date(Date.now() - 45 * 60 * 1000);
  const elapsed45MinMs = Date.now() - started45MinAgo.getTime();
  assert.strictEqual(elapsed45MinMs > maxDurationMs, true);

  // 3. Remaining seconds clamp to 0 on expired
  const clampedRemaining = Math.max(0, Math.floor(((durationMinutes * 60 * 1000) - elapsed45MinMs) / 1000));
  assert.strictEqual(clampedRemaining, 0);
});

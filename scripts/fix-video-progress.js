/**
 * scripts/fix-video-progress.js
 *
 * One-time repair of historical video_progress rows.
 *
 * Why: before the server-authoritative anti-tamper rewrite,
 *   • the HTML5 player reported CUMULATIVE watch-seconds every 10s while the
 *     server ACCUMULATED each report — quadratic inflation (~180× for an
 *     hour-long video watched straight through),
 *   • client-reported `watched_minutes` meant "furthest position reached"
 *     (skip-to-end ⇒ full duration),
 *   • a single forged API request could grant up to 100% instantly.
 *
 * The platform now defines, for videos with a known duration:
 *   progress_percentage = actual_watched_seconds / (duration×60), capped 100
 *   watched_minutes     = floor(actual_watched_seconds / 60), capped by duration
 *
 * This script recomputes EVERY row whose video has a known duration to match
 * that definition (clamping inflated seconds first). Rows whose video has NO
 * known duration are left untouched (unverifiable).
 *
 * Safe & idempotent: re-running produces no further changes.
 *
 * Usage:
 *   node scripts/fix-video-progress.js            # dry run (report only)
 *   node scripts/fix-video-progress.js --apply    # write fixes
 * Or on VPS:
 *   sudo docker compose exec app node scripts/fix-video-progress.js --apply
 */

require('dotenv').config();
const pool = require('../server/db/connection');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log('====================================================');
  console.log('  Wathba Video Progress Repair');
  console.log(`  Mode: ${APPLY ? 'APPLY (writes fixes)' : 'DRY RUN (no writes)'}`);
  console.log('====================================================\n');

  // Recompute every known-duration row to the server-authoritative formula.
  const { rows } = await pool.query(`
    SELECT vp.id,
           vp.actual_watched_seconds,
           vp.progress_percentage,
           vp.watched_minutes,
           LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60)::int)                    AS fixed_actual,
           ROUND(LEAST(100,
             LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60))::numeric * 100.0
             / (v.duration_minutes * 60)), 2)::float8                                                           AS fixed_pct,
           LEAST(CEIL(v.duration_minutes),
             FLOOR(LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60)) / 60.0))::int   AS fixed_mins
      FROM video_progress vp
      JOIN videos v ON v.id = vp.video_id
     WHERE v.duration_minutes > 0
       AND ( COALESCE(vp.actual_watched_seconds, 0)        <> LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60)::int)
          OR ROUND(vp.progress_percentage::numeric, 2)     <> ROUND(LEAST(100,
                                                                LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60))::numeric * 100.0
                                                                / (v.duration_minutes * 60)), 2)
          OR COALESCE(vp.watched_minutes, 0)               <> LEAST(CEIL(v.duration_minutes),
                                                                FLOOR(LEAST(COALESCE(vp.actual_watched_seconds, 0), CEIL(v.duration_minutes * 60)) / 60.0))::int )
  `);

  const totalRes = await pool.query('SELECT COUNT(*)::int AS n FROM video_progress');
  console.log(`Total video_progress rows: ${totalRes.rows[0].n}`);
  console.log(`Rows needing recalculation: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log('Nothing to fix. ✅');
    await pool.end();
    return;
  }

  let n = 0;
  if (APPLY) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        await client.query(
          `UPDATE video_progress
              SET actual_watched_seconds = $2,
                  progress_percentage    = $3,
                  watched_minutes        = $4
            WHERE id = $1`,
          [r.id, r.fixed_actual, r.fixed_pct, r.fixed_mins]
        );
        n++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(APPLY ? `Recalculated ${n} rows. ✅` : 'Dry run only — re-run with --apply to write fixes.');
  console.log('\nSample (up to 15):');
  for (const r of rows.slice(0, 15)) {
    console.log(
      `  row#${r.id}: actual ${r.actual_watched_seconds || 0}s→${r.fixed_actual}s | ` +
      `mins ${r.watched_minutes ?? 0}→${r.fixed_mins} | pct ${Number(r.progress_percentage)}→${Number(r.fixed_pct)}`
    );
  }

  await pool.end();
}

main().catch(err => {
  console.error('Repair failed:', err.message);
  process.exit(1);
});

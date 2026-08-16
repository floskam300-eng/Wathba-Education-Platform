-- 0005_migrate_all_timestamps_to_timestamptz.sql
-- Ensure all session, exam, recitation, live stream, activity, and streak timestamp columns
-- use TIMESTAMPTZ for global timezone alignment across VPS in Germany and Egypt.

DO $$
BEGIN
  ALTER TABLE exam_sessions ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC';
  ALTER TABLE recitation_sessions ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE exam_results ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'UTC';
  ALTER TABLE exam_results ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE 'UTC';
  ALTER TABLE exam_results ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
  ALTER TABLE recitation_results ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'UTC';
  ALTER TABLE recitation_results ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE 'UTC';
  ALTER TABLE recitation_results ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE live_streams ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC';
  ALTER TABLE live_streams ALTER COLUMN ended_at TYPE TIMESTAMPTZ USING ended_at AT TIME ZONE 'UTC';
  ALTER TABLE live_stream_viewers ALTER COLUMN joined_at TYPE TIMESTAMPTZ USING joined_at AT TIME ZONE 'UTC';
  ALTER TABLE live_stream_viewers ALTER COLUMN left_at TYPE TIMESTAMPTZ USING left_at AT TIME ZONE 'UTC';
  ALTER TABLE event_plays ALTER COLUMN played_at TYPE TIMESTAMPTZ USING played_at AT TIME ZONE 'UTC';
  ALTER TABLE video_progress ALTER COLUMN last_watched_at TYPE TIMESTAMPTZ USING last_watched_at AT TIME ZONE 'UTC';
  ALTER TABLE game_session_tokens ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
  ALTER TABLE game_session_tokens ALTER COLUMN used_at TYPE TIMESTAMPTZ USING used_at AT TIME ZONE 'UTC';
  ALTER TABLE recitation_streaks ALTER COLUMN last_completed_at TYPE TIMESTAMPTZ USING last_completed_at AT TIME ZONE 'UTC';
  ALTER TABLE recitation_streaks ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

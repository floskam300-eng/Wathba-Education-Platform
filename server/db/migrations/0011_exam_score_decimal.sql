-- 0011: Class attendance exam scores support decimal grades (e.g. 13.5/20)
-- INTEGER → NUMERIC(6,2). Existing integer values convert losslessly.
ALTER TABLE class_attendance_records
  ALTER COLUMN exam_score TYPE NUMERIC(6,2);

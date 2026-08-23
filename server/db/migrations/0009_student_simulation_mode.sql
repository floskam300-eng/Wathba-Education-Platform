-- Migration 0009: Add is_simulation flag to students table for teacher preview simulation mode
-- Created for Wathba Student Simulator

ALTER TABLE students ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_students_teacher_sim ON students(teacher_id, is_simulation);

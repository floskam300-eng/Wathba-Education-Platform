/**
 * Academic Stages Verification Test Suite
 */
'use strict';
require('dotenv').config();
const assert = require('assert');

// 1. Check validation middleware
const validateModule = require('../server/middleware/validate');
const express = require('express');

console.log('Testing Academic Stages...');

// Let's verify VALID_STAGES includes all primary stages
const expectedStages = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي عام',
  'الصف الأول الثانوي بكالوريا',
  'الصف الثاني الثانوي عام',
  'الصف الثاني الثانوي بكالوريا',
  'الصف الثالث الثانوي',
];

// Test validateStudent allows each primary stage
const { validateStudent } = validateModule;

for (const stage of expectedStages) {
  let failed = false;
  const req = {
    body: {
      name: 'طالب تجريبي',
      phone: '01012345678',
      parent_phone: '01087654321',
      academic_stage: stage,
      gender: 'ذكر'
    }
  };
  const res = {
    status: (code) => ({
      json: (data) => {
        failed = true;
        console.error(`Validation failed for stage: ${stage}`, data);
      }
    })
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  validateStudent(req, res, next);
  assert.strictEqual(nextCalled, true, `validateStudent should call next for stage: ${stage}`);
  assert.strictEqual(failed, false, `validateStudent should not fail for stage: ${stage}`);
  console.log(`  ✅ Stage valid: ${stage}`);
}

// Test rejection of invalid stage
let invalidFailed = false;
const invalidReq = {
  body: {
    name: 'طالب خاطئ',
    academic_stage: 'مرحلة غير موجودة',
    gender: 'ذكر'
  }
};
const invalidRes = {
  status: (code) => {
    assert.strictEqual(code, 400);
    return {
      json: (data) => {
        invalidFailed = true;
      }
    };
  }
};
let invalidNextCalled = false;
validateStudent(invalidReq, invalidRes, () => { invalidNextCalled = true; });
assert.strictEqual(invalidFailed, true, 'Invalid stage should return 400');
assert.strictEqual(invalidNextCalled, false, 'Invalid stage should not call next()');
console.log('  ✅ Invalid stage properly rejected with 400');

console.log('\nAll academic stages tests PASSED successfully!');

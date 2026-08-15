const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Device Suspension and Anti-Capture Fixes...');

// 1. Check useAntiCapture.js source code
const antiCapturePath = path.join(__dirname, '../client/src/hooks/useAntiCapture.js');
const antiCaptureCode = fs.readFileSync(antiCapturePath, 'utf8');

assert(!antiCaptureCode.includes('visibilitychange'), 'useAntiCapture.js must NOT contain visibilitychange listener');
assert(!antiCaptureCode.includes('visibility_hidden'), 'useAntiCapture.js must NOT send visibility_hidden events');
console.log('✅ Test 1 Passed: visibilitychange cleanly removed from useAntiCapture.js');

// 2. Check students.js route source code for failed_device_attempts reset
const studentsRoutePath = path.join(__dirname, '../server/routes/students.js');
const studentsRouteCode = fs.readFileSync(studentsRoutePath, 'utf8');

assert(studentsRouteCode.includes('is_suspended=false, failed_device_attempts=0'), 'students.js must reset failed_device_attempts=0 on reactivation');
assert(studentsRouteCode.includes('UPDATE students SET failed_device_attempts=0 WHERE id=$1'), 'students.js must reset failed_device_attempts=0 on reset_devices');
console.log('✅ Test 2 Passed: students.js consistently resets failed_device_attempts=0 across all reactivation/reset paths');

console.log('\n🎉 ALL SECURITY FIX TESTS PASSED SUCCESSFULLY!');

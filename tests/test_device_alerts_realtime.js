const assert = require('assert');
const { broadcastToTeacherAndAssistants, addClient, removeClient, sendEvent } = require('../server/sse');

async function runTest() {
  console.log('Testing Real-time Device Alerts SSE Mechanism...');

  // Mock SSE response object
  let receivedEvents = [];
  const mockTeacherRes = {
    write: (data) => {
      receivedEvents.push({ role: 'teacher', data });
    }
  };

  const mockAssistantRes = {
    write: (data) => {
      receivedEvents.push({ role: 'assistant', data });
    }
  };

  // Connect mock teacher (id=101) and mock assistant (id=202)
  addClient('teacher_101', mockTeacherRes);
  addClient('assistant_202', mockAssistantRes);

  // Mock pool
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('FROM assistants WHERE teacher_id')) {
        return { rows: [{ id: 202 }] };
      }
      return { rows: [] };
    }
  };

  // Test 1: Broadcast device_alert
  await broadcastToTeacherAndAssistants(mockPool, 101, 'device_alert', {
    student_id: 50,
    student_name: 'أحمد محمود',
    device_name: 'Samsung Galaxy A52',
    ip_address: '192.168.1.10',
    alert_type: 'device_limit_exceeded',
    created_at: new Date().toISOString()
  });

  assert.strictEqual(receivedEvents.length, 2, 'Both teacher and assistant should receive the device_alert');
  assert(receivedEvents[0].data.includes('event: device_alert'), 'Teacher received device_alert event');
  assert(receivedEvents[0].data.includes('Samsung Galaxy A52'), 'Teacher received device details');
  assert(receivedEvents[1].data.includes('event: device_alert'), 'Assistant received device_alert event');

  console.log('✅ Test 1 Passed: broadcastToTeacherAndAssistants broadcasts device_alert to teacher and assistant in real-time');

  // Test 2: Broadcast device_alert_resolved
  receivedEvents = [];
  await broadcastToTeacherAndAssistants(mockPool, 101, 'device_alert_resolved', {
    alert_id: 1,
    student_id: 50,
    action: 'switch_to_new_device'
  });

  assert.strictEqual(receivedEvents.length, 2, 'Both teacher and assistant should receive device_alert_resolved');
  assert(receivedEvents[0].data.includes('event: device_alert_resolved'), 'Teacher received resolved event');
  assert(receivedEvents[1].data.includes('event: device_alert_resolved'), 'Assistant received resolved event');

  console.log('✅ Test 2 Passed: device_alert_resolved broadcast works in real-time');

  // Cleanup
  removeClient('teacher_101', mockTeacherRes);
  removeClient('assistant_202', mockAssistantRes);

  console.log('\n🎉 ALL REAL-TIME DEVICE ALERT TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

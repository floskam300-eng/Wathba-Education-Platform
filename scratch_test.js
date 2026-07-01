require('dotenv').config();
const pool = require('./server/db/connection');
pool.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_enrollment_req_status'")
  .then(r => {
    console.log(r.rows);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

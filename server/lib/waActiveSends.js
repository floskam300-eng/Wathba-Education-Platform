/**
 * Shared active-send guard used by both routes/whatsapp.js and scheduler.js.
 * Prevents concurrent bulk sends for the same teacher from colliding
 * (e.g. a scheduled send starting while a manual send is still running).
 */
const activeSends = new Set();

module.exports = { activeSends };

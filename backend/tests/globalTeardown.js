const fs = require('fs');
const path = require('path');

module.exports = async () => {
  if (global.__REPLSET__) await global.__REPLSET__.stop();
  const f = path.join(__dirname, '.uri');
  if (fs.existsSync(f)) fs.unlinkSync(f);
};

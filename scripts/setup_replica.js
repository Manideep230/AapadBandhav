const fs = require('fs');
const path = 'C:\\Program Files\\MongoDB\\Server\\5.0\\bin\\mongod.cfg';
try {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace('#replication:', 'replication:\n  replSetName: rs0');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully updated mongod.cfg');
} catch (err) {
  console.error('Error updating config:', err);
}

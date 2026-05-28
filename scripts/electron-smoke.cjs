const electron = require('electron');
console.log('typeof electron =', typeof electron);
console.log('process.type =', process.type);
console.log('process.versions.electron =', process.versions.electron);
if (typeof electron === 'object' && electron.app) {
  electron.app.whenReady().then(() => {
    console.log('OK app is ready');
    electron.app.quit();
  });
} else {
  console.log('Got:', electron);
  process.exit(1);
}

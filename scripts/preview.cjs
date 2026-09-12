// Separate local profile for reviewing this branch without changing normal notes.
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, NOTIP_DATA_PATH: path.join(root, 'scratch', 'preview-data') };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

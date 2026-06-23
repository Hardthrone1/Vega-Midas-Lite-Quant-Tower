const { spawn } = require('child_process');

console.log("🚀 Starting MIDAS Dashboard + Proxy...");

const proxy = spawn('node', ['secure_proxy.js'], { stdio: 'inherit' });
const dashboard = spawn('python', ['-m', 'http.server', '8000'], { stdio: 'inherit' });

console.log("📊 Dashboard → http://localhost:8000");
console.log("🔌 Proxy     → http://localhost:8001");
console.log("\nPress Ctrl+C to stop both servers\n");

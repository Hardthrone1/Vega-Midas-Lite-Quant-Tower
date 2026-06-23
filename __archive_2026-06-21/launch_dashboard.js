/**
 * MIDAS Dashboard Launcher
 * Starts both the Python frontend (port 8000) and Node proxy (port 8001) with a single command
 *
 * Run: node launch_dashboard.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('🚀 MIDAS Dashboard Launcher');
console.log('═══════════════════════════════════════════════════');
console.log('');

// Get the current directory
const dashboardDir = __dirname;

// Start Python Frontend on 8000
console.log('📡 Starting Frontend Server on http://localhost:8000...');
const frontend = spawn('python', ['-m', 'http.server', '8000'], {
  cwd: dashboardDir,
  stdio: 'pipe'
});

// Start Node Proxy on 8001
console.log('🛡️  Starting Secure API Proxy on http://localhost:8001...');
const proxy = spawn('node', ['secure_proxy.js'], {
  cwd: dashboardDir,
  stdio: 'pipe'
});

// Capture frontend output
frontend.stdout.on('data', (data) => {
  const message = data.toString().trim();
  if (message) console.log(`[Frontend] ${message}`);
});

frontend.stderr.on('data', (data) => {
  const message = data.toString().trim();
  if (message) console.log(`[Frontend] ⚠️  ${message}`);
});

// Capture proxy output
proxy.stdout.on('data', (data) => {
  const message = data.toString().trim();
  if (message) console.log(`[Proxy] ${message}`);
});

proxy.stderr.on('data', (data) => {
  const message = data.toString().trim();
  if (message) console.log(`[Proxy] ⚠️  ${message}`);
});

// Handle errors
frontend.on('error', (err) => {
  console.error('❌ Frontend failed to start:', err.message);
  process.exit(1);
});

proxy.on('error', (err) => {
  console.error('❌ Proxy failed to start:', err.message);
  process.exit(1);
});

// Handle exits
frontend.on('exit', (code) => {
  if (code !== null) console.log(`[Frontend] Exited with code ${code}`);
});

proxy.on('exit', (code) => {
  if (code !== null) console.log(`[Proxy] Exited with code ${code}`);
});

console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('✅ Both servers are launching...');
console.log('');
console.log('📊 Dashboard: http://localhost:8000');
console.log('🔌 API Proxy: http://localhost:8001');
console.log('');
console.log('Press Ctrl+C to stop both servers');
console.log('═══════════════════════════════════════════════════');
console.log('');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down servers...');
  frontend.kill();
  proxy.kill();
  setTimeout(() => {
    console.log('Goodbye! 👋');
    process.exit(0);
  }, 1000);
});

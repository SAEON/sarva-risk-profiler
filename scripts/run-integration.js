// Run only integration tests, enforcing DB-backed execution by setting RUN_INTEGRATION=true
const { spawnSync } = require('child_process');
process.env.RUN_INTEGRATION = 'true';
// Delegate to the existing npm script 'test' (which runs jest), passing a path filter
const r = spawnSync('npm', ['run', 'test', '--', 'tests/integration', '--verbose', '--', '--forceExit'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status || 0);

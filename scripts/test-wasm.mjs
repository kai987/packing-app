import { spawnSync } from 'node:child_process'
const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test',
  'tests/packing.test.ts', 'tests/wasm-parity.test.ts', 'tests/worker.test.ts'], {
  stdio: 'inherit', env: { ...process.env, PACKING_TEST_ENGINE: 'rust' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)

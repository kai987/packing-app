import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const cwd = fileURLToPath(new URL('..', import.meta.url))
function run(command, args) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const version = spawnSync('wasm-bindgen', ['--version'], { encoding: 'utf8' })
if (version.stdout?.trim() !== 'wasm-bindgen 0.2.114') {
  throw new Error('Install the matching CLI: cargo install wasm-bindgen-cli --version 0.2.114 --locked')
}
mkdirSync(`${cwd}/public/packing-engine`, { recursive: true })
run('cargo', ['build', '--manifest-path', 'packing-core/Cargo.toml', '--locked', '--release', '--target', 'wasm32-unknown-unknown'])
run('wasm-bindgen', ['packing-core/target/wasm32-unknown-unknown/release/packing_core.wasm', '--target', 'web', '--out-dir', 'public/packing-engine', '--out-name', 'packing_core'])
await build({
  absWorkingDir: cwd, entryPoints: ['src/engine/packing.worker.ts'],
  outfile: 'public/packing-engine/packing.worker.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: true,
})

import { spawnSync } from 'node:child_process'
import path from 'node:path'

const tasks = process.argv.slice(2)

if (tasks.length === 0) {
  console.error('Usage: node ./scripts/run-android-gradle.mjs <gradle task> [more tasks]')
  process.exit(1)
}

const androidDir = path.join(process.cwd(), 'android')
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(gradleCommand, tasks, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)

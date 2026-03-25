import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectRoot = process.cwd()
const androidDir = path.join(projectRoot, 'android')
const localPropertiesPath = path.join(androidDir, 'local.properties')
const sdkCandidates = [
  process.env.ANDROID_SDK_ROOT?.trim(),
  process.env.ANDROID_HOME?.trim(),
  process.env.SDK_DIR?.trim(),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  '/opt/android-sdk',
  '/usr/local/share/android-sdk',
].filter(Boolean)
const sdkPath = sdkCandidates.find((candidate) => fs.existsSync(candidate))

if (!sdkPath) {
  if (fs.existsSync(localPropertiesPath)) {
    console.log(`Using existing ${localPropertiesPath}`)
    process.exit(0)
  }

  console.error(
    'Android SDK path was not found. Set ANDROID_SDK_ROOT or ANDROID_HOME before building Android in CI.',
  )
  process.exit(1)
}

const resolvedSdkPath = path.resolve(sdkPath).replace(/\\/g, '/')
const fileContents = `sdk.dir=${resolvedSdkPath}\n`

fs.mkdirSync(androidDir, { recursive: true })
fs.writeFileSync(localPropertiesPath, fileContents, 'utf8')

console.log(`Wrote ${localPropertiesPath}`)

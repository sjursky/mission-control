import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from '@/lib/config'

export interface ShutdownTarget {
  pid: number
  source: 'pid_file' | 'process'
}

export interface ShutdownRequestResult {
  helperPid: number
  target: ShutdownTarget
}

function parsePid(raw: string): number | null {
  const value = Number.parseInt(raw.trim(), 10)
  return Number.isInteger(value) && value > 0 ? value : null
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readPidFile(pidFilePath: string): number | null {
  try {
    const raw = fs.readFileSync(pidFilePath, 'utf-8')
    return parsePid(raw)
  } catch {
    return null
  }
}

export function resolveShutdownTarget(
  pidFilePath = config.serverPidFile,
  currentPid = process.pid
): ShutdownTarget | null {
  const filePid = readPidFile(pidFilePath)
  if (filePid === currentPid && isPidAlive(filePid)) {
    return { pid: filePid, source: 'pid_file' }
  }

  if (isPidAlive(currentPid)) {
    return { pid: currentPid, source: 'process' }
  }

  return null
}

export function launchShutdownHelper(
  target: ShutdownTarget,
  options: {
    responseDelayMs?: number
    gracefulTimeoutMs?: number
  } = {}
): ShutdownRequestResult {
  const responseDelayMs = options.responseDelayMs ?? 200
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? 10_000

  const helperScript = `
const pid = Number(process.env.MC_SHUTDOWN_PID || '0')
const responseDelayMs = Number(process.env.MC_SHUTDOWN_RESPONSE_DELAY_MS || '200')
const gracefulTimeoutMs = Number(process.env.MC_SHUTDOWN_GRACEFUL_TIMEOUT_MS || '10000')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAlive(targetPid) {
  try {
    process.kill(targetPid, 0)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!Number.isInteger(pid) || pid <= 0) process.exit(1)

  await sleep(responseDelayMs)

  try {
    process.kill(pid, 'SIGTERM')
  } catch {}

  const deadline = Date.now() + gracefulTimeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) process.exit(0)
    await sleep(250)
  }

  if (isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1))
`

  const child = spawn(process.execPath, ['-e', helperScript], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MC_SHUTDOWN_PID: String(target.pid),
      MC_SHUTDOWN_RESPONSE_DELAY_MS: String(responseDelayMs),
      MC_SHUTDOWN_GRACEFUL_TIMEOUT_MS: String(gracefulTimeoutMs),
    },
  })
  child.unref()

  if (!child.pid) {
    throw new Error('Failed to start shutdown helper')
  }

  return {
    helperPid: child.pid,
    target,
  }
}

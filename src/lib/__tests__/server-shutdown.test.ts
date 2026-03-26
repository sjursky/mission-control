import { afterEach, describe, expect, it, vi } from 'vitest'

const readFileSync = vi.fn()
const spawn = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    readFileSync,
  },
  readFileSync,
}))

vi.mock('node:child_process', () => ({
  default: {
    spawn,
  },
  spawn,
}))

vi.mock('@/lib/config', () => ({
  config: {
    serverPidFile: '/tmp/mission-control.pid',
  },
}))

describe('server shutdown helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the pid file only when it matches the current process', async () => {
    readFileSync.mockReturnValue('4242\n')
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === 4242 && signal === 0) return true as any
      throw new Error('unexpected pid check')
    }) as typeof process.kill)

    const { resolveShutdownTarget } = await import('@/lib/server-shutdown')
    expect(resolveShutdownTarget('/tmp/mission-control.pid', 4242)).toEqual({ pid: 4242, source: 'pid_file' })

    killSpy.mockRestore()
  })

  it('falls back to the current process when the pid file is missing, stale, or mismatched', async () => {
    readFileSync.mockReturnValue('4242\n')
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === 4242 && signal === 0) return true as any
      if (pid === 7777 && signal === 0) return true as any
      throw new Error('unexpected pid check')
    }) as typeof process.kill)

    const { resolveShutdownTarget } = await import('@/lib/server-shutdown')
    expect(resolveShutdownTarget('/tmp/mission-control.pid', 7777)).toEqual({ pid: 7777, source: 'process' })

    killSpy.mockRestore()
  })

  it('spawns a detached helper process with shutdown env', async () => {
    const unref = vi.fn()
    spawn.mockReturnValue({ pid: 9876, unref })

    const { launchShutdownHelper } = await import('@/lib/server-shutdown')
    const result = launchShutdownHelper({ pid: 4321, source: 'process' }, { responseDelayMs: 250, gracefulTimeoutMs: 9000 })

    expect(spawn).toHaveBeenCalledTimes(1)
    const [, , options] = spawn.mock.calls[0]
    expect(options.detached).toBe(true)
    expect(options.stdio).toBe('ignore')
    expect(options.env.MC_SHUTDOWN_PID).toBe('4321')
    expect(options.env.MC_SHUTDOWN_RESPONSE_DELAY_MS).toBe('250')
    expect(options.env.MC_SHUTDOWN_GRACEFUL_TIMEOUT_MS).toBe('9000')
    expect(unref).toHaveBeenCalled()
    expect(result).toEqual({
      helperPid: 9876,
      target: { pid: 4321, source: 'process' },
    })
  })
})

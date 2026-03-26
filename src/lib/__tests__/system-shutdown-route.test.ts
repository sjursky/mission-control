import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireRole = vi.fn()
const mutationLimiter = vi.fn()
const resolveShutdownTarget = vi.fn()
const launchShutdownHelper = vi.fn()
const logActivity = vi.fn()
const logAuditEvent = vi.fn()
const warn = vi.fn()
const error = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireRole,
}))

vi.mock('@/lib/rate-limit', () => ({
  mutationLimiter,
}))

vi.mock('@/lib/server-shutdown', () => ({
  resolveShutdownTarget,
  launchShutdownHelper,
}))

vi.mock('@/lib/db', () => ({
  db_helpers: {
    logActivity,
  },
  logAuditEvent,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    warn,
    error,
  },
}))

describe('POST /api/system/shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
    requireRole.mockReturnValue({ user: { id: 1, username: 'admin', role: 'admin', workspace_id: 9 } })
    mutationLimiter.mockReturnValue(null)
    resolveShutdownTarget.mockReturnValue({ pid: 4242, source: 'pid_file' })
    launchShutdownHelper.mockReturnValue({ helperPid: 5151, target: { pid: 4242, source: 'pid_file' } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initiates shutdown for admins and returns 202', async () => {
    const { POST } = await import('@/app/api/system/shutdown/route')
    const request = new NextRequest('http://localhost/api/system/shutdown', { method: 'POST' })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(resolveShutdownTarget).toHaveBeenCalled()
    expect(launchShutdownHelper).toHaveBeenCalledWith(
      { pid: 4242, source: 'pid_file' },
      { responseDelayMs: 200, gracefulTimeoutMs: 10_000 }
    )
    expect(logActivity).toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    expect(body).toMatchObject({ ok: true, status: 'shutdown_initiated', pid: 4242, source: 'pid_file' })
  })

  it('rejects non-admin access', async () => {
    requireRole.mockReturnValue({ error: 'Forbidden', status: 403 })

    const { POST } = await import('@/app/api/system/shutdown/route')
    const request = new NextRequest('http://localhost/api/system/shutdown', { method: 'POST' })

    const response = await POST(request)
    expect(response.status).toBe(403)
    expect(launchShutdownHelper).not.toHaveBeenCalled()
  })

  it('returns 409 when no shutdown target can be resolved', async () => {
    resolveShutdownTarget.mockReturnValue(null)

    const { POST } = await import('@/app/api/system/shutdown/route')
    const request = new NextRequest('http://localhost/api/system/shutdown', { method: 'POST' })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('No running Mission Control process')
    expect(launchShutdownHelper).not.toHaveBeenCalled()
  })
})

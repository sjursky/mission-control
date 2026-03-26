import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { db_helpers, logAuditEvent } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { launchShutdownHelper, resolveShutdownTarget } from '@/lib/server-shutdown'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const target = resolveShutdownTarget()
  if (!target) {
    return NextResponse.json(
      { error: 'No running Mission Control process could be resolved for shutdown' },
      { status: 409 }
    )
  }

  try {
    const initiated = launchShutdownHelper(target, {
      responseDelayMs: 200,
      gracefulTimeoutMs: 10_000,
    })

    db_helpers.logActivity(
      'system_shutdown',
      'system',
      0,
      auth.user.username,
      `Shutdown initiated for Mission Control (pid ${target.pid})`,
      {
        pid: target.pid,
        source: target.source,
        helper_pid: initiated.helperPid,
        mode: 'graceful_then_force',
      },
      auth.user.workspace_id
    )

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    logAuditEvent({
      action: 'system_shutdown',
      actor: auth.user.username,
      actor_id: auth.user.id,
      detail: {
        pid: target.pid,
        source: target.source,
        helper_pid: initiated.helperPid,
        mode: 'graceful_then_force',
      },
      ip_address: ipAddress,
    })

    logger.warn(
      {
        actor: auth.user.username,
        actorId: auth.user.id,
        pid: target.pid,
        source: target.source,
        helperPid: initiated.helperPid,
        mode: 'graceful_then_force',
      },
      'Mission Control shutdown initiated'
    )

    return NextResponse.json(
      {
        ok: true,
        status: 'shutdown_initiated',
        pid: target.pid,
        source: target.source,
      },
      { status: 202 }
    )
  } catch (error: any) {
    logger.error({ err: error }, 'Mission Control shutdown request failed')
    return NextResponse.json(
      { error: error?.message || 'Failed to initiate shutdown' },
      { status: 500 }
    )
  }
}

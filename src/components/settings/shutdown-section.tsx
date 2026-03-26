'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ShutdownSection({ showFeedback }: { showFeedback: (ok: boolean, text: string) => void }) {
  const [shuttingDown, setShuttingDown] = useState(false)

  const handleShutdown = async () => {
    const confirmed = window.confirm(
      'Shut down Mission Control now? This will stop the app and disconnect everyone using this dashboard.'
    )
    if (!confirmed) return

    setShuttingDown(true)
    try {
      const res = await fetch('/api/system/shutdown', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showFeedback(true, 'Mission Control shutdown initiated. This page will disconnect shortly.')
      } else {
        showFeedback(false, data.error || 'Failed to initiate shutdown')
      }
    } catch {
      showFeedback(false, 'Network error')
    } finally {
      setShuttingDown(false)
    }
  }

  return (
    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-medium text-destructive">Danger Zone</p>
          <p className="text-2xs text-muted-foreground">
            Gracefully shuts down the current Mission Control app process. If it does not exit within 10 seconds, the server will be force-stopped.
          </p>
        </div>
        <Button
          variant="destructive"
          size="xs"
          disabled={shuttingDown}
          onClick={handleShutdown}
        >
          {shuttingDown ? 'Shutting down...' : 'Shut Down Mission Control'}
        </Button>
      </div>
    </div>
  )
}

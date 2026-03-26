import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShutdownSection } from '@/components/settings/shutdown-section'

describe('ShutdownSection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires confirmation before calling the shutdown endpoint', async () => {
    const showFeedback = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<ShutdownSection showFeedback={showFeedback} />)
    fireEvent.click(screen.getByRole('button', { name: 'Shut Down Mission Control' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(showFeedback).not.toHaveBeenCalled()
  })

  it('submits shutdown and surfaces success feedback', async () => {
    const showFeedback = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response)

    render(<ShutdownSection showFeedback={showFeedback} />)
    fireEvent.click(screen.getByRole('button', { name: 'Shut Down Mission Control' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/system/shutdown', { method: 'POST' })
      expect(showFeedback).toHaveBeenCalledWith(true, 'Mission Control shutdown initiated. This page will disconnect shortly.')
    })
  })
})

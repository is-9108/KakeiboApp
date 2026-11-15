import { useEffect, useRef, useState } from 'react'
import { AccessTokenRefreshError, ApiError, fetchReceiptAnalysis, type ApiReceiptAnalysis } from '../api/client'
import { RECEIPT_POLL_INTERVAL_MS, RECEIPT_STATUSES, RECEIPT_TIMEOUT_MS } from '../domain/receipts'

type Phase = 'idle' | 'polling' | 'completed' | 'failed' | 'timeout'
interface AnalysisState { jobId: string | null; phase: Phase; analysis: ApiReceiptAnalysis | null }

/** 応答後に次の取得を予約し、中断・期限切れ後の応答は反映しない。 */
export function useReceiptAnalysis(jobId: string | null, onSessionExpired: () => void | Promise<void>) {
  const [state, setState] = useState<AnalysisState>({ jobId: null, phase: 'idle', analysis: null })
  const generation = useRef(0)
  const expired = useRef(onSessionExpired)
  useEffect(() => { expired.current = onSessionExpired }, [onSessionExpired])

  useEffect(() => {
    const current = ++generation.current
    if (jobId === null) return
    const id = jobId
    let stopped = false
    let next: ReturnType<typeof setTimeout> | undefined
    const valid = () => !stopped && generation.current === current
    const stop = () => { stopped = true; clearTimeout(next); clearTimeout(deadline) }
    const finish = (phase: Phase, analysis: ApiReceiptAnalysis | null = null) => {
      if (!valid()) return
      stop()
      setState({ jobId, phase, analysis })
    }
    // 独立した期限タイマーで、応答が返らない場合も60秒で停止する。
    const deadline = setTimeout(() => finish('timeout'), RECEIPT_TIMEOUT_MS)
    async function poll() {
      try {
        const analysis = await fetchReceiptAnalysis(id)
        if (!valid()) return
        if (analysis.status === RECEIPT_STATUSES.completed) { finish('completed', analysis); return }
        if (analysis.status === RECEIPT_STATUSES.failed) { finish('failed'); return }
      } catch (error) {
        if (!valid()) return
        if (error instanceof AccessTokenRefreshError) {
          finish('failed')
          void expired.current()
          return
        }
        if (error instanceof ApiError && error.status < 500) { finish('failed'); return }
      }
      if (valid()) {
        setState({ jobId, phase: 'polling', analysis: null })
        next = setTimeout(() => void poll(), RECEIPT_POLL_INTERVAL_MS)
      }
    }
    void poll()
    return stop
  }, [jobId])

  if (jobId === null) return { phase: 'idle' as const, analysis: null }
  return state.jobId === jobId ? state : { phase: 'polling' as const, analysis: null }
}

import { addMonths, currentMonth, formatMonth } from './month'

/** JST換算の検証はUTC看成りの Adate で判定できるため、実行環境のタイムゾーンに依存しない */
describe('currentMonth (T3)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['2026-10-31T14:59:59Z', '2026-10'],
    ['2026-10-31T15:00:00Z', '2026-11'],
    ['2026-01-01T00:00:00Z', '2026-01'],
    ['2026-12-31T20:00:00Z', '2027-01'],
  ])('%s のJST日付は %s 月になる', (iso, expected) => {
    vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] })
    expect(currentMonth()).toBe(expected)
  })
})

describe('addMonths (T2)', () => {
  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', 0, '2026-10'],
    ['2026-10', -1, '2026-09'],
    ['2026-10', 1, '2026-11'],
    ['2025-02', 12, '2026-02'],
  ])('%s %+d => %s', (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected)
  })

  it('YYYY-MM以外はエラー', () => {
    expect(() => addMonths('2026-13', 1)).toThrow()
    expect(() => addMonths('2026/10', 1)).toThrow()
  })
})

describe('formatMonth (T1)', () => {
  it('YYYY-MMを日本語表記にする', () => {
    expect(formatMonth('2026-10')).toBe('2026年10月')
    expect(formatMonth('2025-12')).toBe('2025年12月')
  })
})

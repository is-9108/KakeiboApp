import {
  MAX_MONTH,
  MIN_MONTH,
  canShiftMonth,
  currentDateJst,
  currentMonthJst,
  formatDateLabel,
  formatMonthLabel,
  formatPercent,
  formatYen,
  initialEntryDate,
  shiftMonth,
} from './month'

describe('currentMonthJst', () => {
  it('uses JST even when UTC is still the previous day（T02）', () => {
    // 2026-09-30T15:30:00Z = 2026-10-01 00:30 JST
    expect(currentMonthJst(new Date('2026-09-30T15:30:00Z'))).toBe('2026-10')
    // 2026-09-30T14:30:00Z = 2026-09-30 23:30 JST
    expect(currentMonthJst(new Date('2026-09-30T14:30:00Z'))).toBe('2026-09')
  })

  it('handles the year boundary in JST（T02）', () => {
    // 2026-12-31T15:00:00Z = 2027-01-01 00:00 JST
    expect(currentMonthJst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01')
  })

  it('formats single-digit months with a leading zero', () => {
    expect(currentMonthJst(new Date('2026-01-05T00:00:00+09:00'))).toBe('2026-01')
  })
})

describe('currentDateJst', () => {
  it('returns the JST date without timezone drift（T02）', () => {
    expect(currentDateJst(new Date('2026-10-28T14:59:59Z'))).toBe('2026-10-28')
    expect(currentDateJst(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-29')
  })
})

describe('initialEntryDate', () => {
  const now = new Date('2026-10-28T00:00:00Z')

  it('uses today when the displayed month is the current JST month', () => {
    expect(initialEntryDate('2026-10', now)).toBe('2026-10-28')
  })

  it('uses the first day for other months', () => {
    expect(initialEntryDate('2026-11', now)).toBe('2026-11-01')
    expect(initialEntryDate('2026-09', now)).toBe('2026-09-01')
  })
})

describe('shiftMonth', () => {
  it('moves across a year boundary（T02）', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('moves by multiple months', () => {
    expect(shiftMonth('2026-10', 12)).toBe('2027-10')
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
    expect(shiftMonth('2026-10', 3)).toBe('2027-01')
  })

  it('does not leave the supported year range（T02）', () => {
    expect(shiftMonth(MIN_MONTH, -1)).toBe(MIN_MONTH)
    expect(shiftMonth(MAX_MONTH, 1)).toBe(MAX_MONTH)
    expect(canShiftMonth(MIN_MONTH, -1)).toBe(false)
    expect(canShiftMonth(MIN_MONTH, 1)).toBe(true)
    expect(canShiftMonth(MAX_MONTH, 1)).toBe(false)
    expect(canShiftMonth(MAX_MONTH, -1)).toBe(true)
  })
})

describe('display formatters', () => {
  it('formats the month heading（T05）', () => {
    expect(formatMonthLabel('2026-10')).toBe('2026年10月')
  })

  it('formats a date without converting it to a datetime（T04）', () => {
    expect(formatDateLabel('2026-10-28')).toBe('2026年10月28日')
    expect(formatDateLabel('2026-01-01')).toBe('2026年1月1日')
  })

  it('formats yen with digit separators and keeps negative signs（T05）', () => {
    expect(formatYen(1700)).toBe('1,700円')
    expect(formatYen(0)).toBe('0円')
    expect(formatYen(-300)).toBe('-300円')
    expect(formatYen(2147483647)).toBe('2,147,483,647円')
  })

  it('formats percentages with one decimal place（T05）', () => {
    expect(formatPercent(70.6)).toBe('70.6%')
    expect(formatPercent(29.4)).toBe('29.4%')
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(100)).toBe('100.0%')
  })
})

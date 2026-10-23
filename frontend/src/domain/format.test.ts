import { formatYen } from './format'

describe('formatYen', () => {
  it('桁区切りと円記号を表示する', () => {
    expect(formatYen(0)).toBe('0円')
    expect(formatYen(1500)).toBe('1,500円')
    expect(formatYen(-1000)).toBe('-1,000円')
  })
})

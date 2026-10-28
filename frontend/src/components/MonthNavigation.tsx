import { canShiftMonth, formatMonthLabel } from '../domain/month'

export interface MonthNavigationProps {
  month: string
  disabled?: boolean
  onPrevious: () => void
  onNext: () => void
}

/** 表示月と前月／次月の切り替え。 */
export default function MonthNavigation({
  month,
  disabled = false,
  onPrevious,
  onNext,
}: MonthNavigationProps) {
  return (
    <nav className="month-navigation" aria-label="月の切り替え">
      <button
        type="button"
        className="month-navigation__button"
        onClick={onPrevious}
        disabled={disabled || !canShiftMonth(month, -1)}
      >
        前月
      </button>
      <h2 className="month-navigation__label" aria-live="polite">
        {formatMonthLabel(month)}
      </h2>
      <button
        type="button"
        className="month-navigation__button"
        onClick={onNext}
        disabled={disabled || !canShiftMonth(month, 1)}
      >
        次月
      </button>
    </nav>
  )
}

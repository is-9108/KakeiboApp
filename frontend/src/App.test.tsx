import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('家計簿の見出しを表示する', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '家計簿' })).toBeInTheDocument()
  })
})

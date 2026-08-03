import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CandidateSessionGuard, CapturePage } from './components'

describe('candidate private routes', () => {
  it('redirects anonymous users to sign-in without rendering candidate data', () => {
    render(
      <MemoryRouter initialEntries={['/capture']}>
        <Routes>
          <Route
            path="/capture"
            element={
              <CandidateSessionGuard>
                <CapturePage />
              </CandidateSessionGuard>
            }
          />
          <Route path="/auth/sign-in" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Save a candidate' })).not.toBeInTheDocument()
  })

  it('renders capture only for an authenticated owner', () => {
    render(
      <MemoryRouter>
        <CandidateSessionGuard userId="user-1">
          <CapturePage />
        </CandidateSessionGuard>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Save a candidate' })).toBeInTheDocument()
  })
})

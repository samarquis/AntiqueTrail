import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OperationalStatusPage } from './OperationalStatusPage'

afterEach(cleanup)

describe('OperationalStatusPage', () => {
  it('explains public availability without exposing internal release gates', () => {
    render(<OperationalStatusPage config={{ supportUrl: 'https://support.example.test' }} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Browsing fictional store listings is available',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Live service updates and support contacts are not published',
    )
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
    expect(screen.queryByText(/S-01|gate|monitoring/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument()
  })

  it('publishes the bounded contact paths and commitment when complete', () => {
    render(
      <OperationalStatusPage
        config={{
          supportUrl: 'https://support.example.test/help',
          securityUrl: 'mailto:security@example.test',
          statusUrl: 'https://status.example.test',
          responseCommitment: 'We acknowledge urgent reports within one business day.',
        }}
      />,
    )
    expect(screen.getByText(/one business day/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Current service status' })).toHaveAttribute(
      'href',
      'https://status.example.test/',
    )
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      'https://support.example.test/help',
    )
    expect(screen.getByRole('link', { name: 'Report a security concern' })).toHaveAttribute(
      'href',
      'mailto:security@example.test',
    )
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
  })

  it.each([
    'http://status.example.test',
    'https://user:secret@status.example.test',
    'javascript:alert(1)',
  ])('rejects unsafe status URL %s', (statusUrl) => {
    render(
      <OperationalStatusPage
        config={{
          supportUrl: 'https://support.example.test',
          securityUrl: 'mailto:security@example.test',
          statusUrl,
          responseCommitment: 'We respond promptly.',
        }}
      />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
    expect(
      screen.queryByRole('link', {
        name: /current service status|contact support|security concern/i,
      }),
    ).not.toBeInTheDocument()
  })
})

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OWNER_ACQUISITION_PROHIBITED_COPY,
  OWNER_ACQUISITION_SECTION_ORDER,
  OwnerAcquisitionContent,
  assertOwnerAcquisitionCopy,
} from './ownerAcquisitionContent'

afterEach(cleanup)

describe('owner acquisition content contract', () => {
  it('renders the controlling Free-only content in order', () => {
    const { container } = render(
      <OwnerAcquisitionContent
        action={<button>Start</button>}
        canonicalSiteUrl="https://canonical.example"
      />,
    )
    expect(
      [...container.querySelectorAll('[data-owner-section]')].map((node) =>
        node.getAttribute('data-owner-section'),
      ),
    ).toEqual(OWNER_ACQUISITION_SECTION_ORDER)
    expect(screen.getByText(/Free plan available/)).toBeInTheDocument()
    expect(screen.getByText(/Approval comes before publication/)).toBeInTheDocument()
  })

  it('contains none of the prohibited claims', () => {
    const { container } = render(
      <OwnerAcquisitionContent action={null} canonicalSiteUrl="https://canonical.example" />,
    )
    const copy = container.textContent?.toLocaleLowerCase() ?? ''
    expect(() => assertOwnerAcquisitionCopy(copy)).not.toThrow()
    const mutations = [
      '$19 monthly plan',
      'Join the waitlist',
      'Trusted by 100 stores',
      'Boost ranking',
      'Increase sales',
      'Limited time',
      'Review within 2 days',
    ]
    expect(mutations).toHaveLength(OWNER_ACQUISITION_PROHIBITED_COPY.length)
    for (const mutation of mutations)
      expect(() => assertOwnerAcquisitionCopy(`${copy} ${mutation}`)).toThrow()
    expect(container.querySelector('form')).not.toBeInTheDocument()
  })

  it('uses canonical absolute support, security, privacy, terms, and status destinations', () => {
    render(<OwnerAcquisitionContent action={null} canonicalSiteUrl="https://canonical.example" />)
    for (const [name, path] of [
      ['support', '/help'],
      ['security', '/security'],
      ['privacy', '/privacy'],
      ['terms', '/terms'],
      ['status', '/status'],
    ])
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        `https://canonical.example${path}`,
      )
  })
})

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OWNER_ACQUISITION_PROHIBITED_COPY,
  OWNER_ACQUISITION_SECTION_ORDER,
  OwnerAcquisitionContent,
} from './ownerAcquisitionContent'

afterEach(cleanup)

describe('owner acquisition content contract', () => {
  it('renders the controlling Free-only content in order', () => {
    const { container } = render(<OwnerAcquisitionContent action={<button>Start</button>} />)
    expect(
      [...container.querySelectorAll('[data-owner-section]')].map((node) =>
        node.getAttribute('data-owner-section'),
      ),
    ).toEqual(OWNER_ACQUISITION_SECTION_ORDER)
    expect(screen.getByText(/Free plan available/)).toBeInTheDocument()
    expect(screen.getByText(/Approval comes before publication/)).toBeInTheDocument()
  })

  it('contains none of the prohibited claims', () => {
    const { container } = render(<OwnerAcquisitionContent action={null} />)
    const copy = container.textContent?.toLocaleLowerCase() ?? ''
    for (const phrase of OWNER_ACQUISITION_PROHIBITED_COPY) expect(copy).not.toContain(phrase)
  })
})

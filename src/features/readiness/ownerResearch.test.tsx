import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OwnerIntakeClient, OwnerIntakeSnapshot } from '../partners'
import {
  GENERIC_OWNER_RESEARCH_DENIAL,
  OwnerResearchPage,
  createOwnerResearchClient,
} from './ownerResearch'

afterEach(cleanup)

const ready: OwnerIntakeSnapshot = {
  runId: 'run-1',
  audience: 'synthetic',
  kind: null,
  state: 'ready',
  draft: null,
  updatedAt: null,
}

describe('owner research boundary', () => {
  it('binds every request to the exact artifact and cohort', async () => {
    const rpc = vi.fn(async () => ({ data: ready, error: null }))
    const client = createOwnerResearchClient(
      { rpc },
      { artifactDigest: `sha256:${'a'.repeat(64)}`, cohortKey: 'topeka-owner-10a' },
    )
    await client.resume()
    expect(rpc).toHaveBeenCalledWith('owner_research_command', {
      p_operation: 'resume',
      p_artifact_digest: `sha256:${'a'.repeat(64)}`,
      p_cohort_key: 'topeka-owner-10a',
      p_payload: {},
    })
  })

  it('uses one generic denial for malformed bindings and server failures', async () => {
    expect(() =>
      createOwnerResearchClient(
        { rpc: vi.fn() },
        { artifactDigest: 'not-a-digest', cohortKey: 'topeka-owner-10a' },
      ),
    ).toThrow(GENERIC_OWNER_RESEARCH_DENIAL)
    const client = createOwnerResearchClient(
      { rpc: vi.fn(async () => ({ data: null, error: { secret: 'hidden' } })) },
      { artifactDigest: `sha256:${'b'.repeat(64)}`, cohortKey: 'topeka-owner-10a' },
    )
    await expect(client.resume()).rejects.toThrow(GENERIC_OWNER_RESEARCH_DENIAL)
  })

  it('does not reveal content before admission succeeds', async () => {
    const client: OwnerIntakeClient = {
      start: vi.fn(),
      save: vi.fn(),
      resume: vi.fn(async () => {
        throw new Error('wrong account')
      }),
      submit: vi.fn(),
      status: vi.fn(),
    }
    render(<OwnerResearchPage client={client} />)
    expect(screen.queryByRole('heading', { name: /Help antique shoppers/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_OWNER_RESEARCH_DENIAL)
    expect(screen.queryByRole('heading', { name: /Help antique shoppers/ })).not.toBeInTheDocument()
  })

  it('can establish an in-memory session before retrying exact grant admission', async () => {
    const resume = vi
      .fn<() => Promise<OwnerIntakeSnapshot>>()
      .mockRejectedValueOnce(new Error('no session'))
      .mockResolvedValueOnce(ready)
    const authenticate = vi.fn(async () => undefined)
    render(
      <OwnerResearchPage
        client={{ start: vi.fn(), save: vi.fn(), resume, submit: vi.fn(), status: vi.fn() }}
        authenticate={authenticate}
      />,
    )
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Account email'), {
      target: { value: 'participant@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify invitation' }))
    await screen.findByRole('heading', { name: /Help antique shoppers/ })
    expect(authenticate).toHaveBeenCalledWith('participant@example.test', 'test-password')
    expect(resume).toHaveBeenCalledTimes(2)
  })

  it('supports both Synthetic start paths after admission', async () => {
    const start = vi.fn(async (kind: 'existing_claim' | 'add_store') => ({
      ...ready,
      kind,
      state: 'draft' as const,
      draft: {
        fixture:
          kind === 'existing_claim' ? ('existing-store-a' as const) : ('new-store-a' as const),
        relationship: 'owner' as const,
        ownerFactsConfirmed: false,
        reviewedFactsUnderstood: false,
      },
    }))
    const client: OwnerIntakeClient = {
      start,
      save: vi.fn(),
      resume: vi.fn(async () => ready),
      submit: vi.fn(),
      status: vi.fn(),
    }
    render(<OwnerResearchPage client={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Add or claim my store/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue with this Synthetic scenario/ }))
    await waitFor(() => expect(start).toHaveBeenCalledWith('existing_claim'))
    expect(await screen.findByText(/existing store claim/)).toBeInTheDocument()
  })
})

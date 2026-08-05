export type RegionalReleaseOperation =
  | {
      operation: 'promote'
      commandId: string
      releaseId: string
      receiptIds: string[]
    }
  | {
      operation: 'rollback'
      commandId: string
      releaseId: string
      reason: string
    }

export interface RegionalReleaseCommandTransport {
  execute(command: RegionalReleaseOperation): Promise<{ state: 'active' | 'rolled_back' }>
}

export interface RegionalReleaseClient {
  promote(input: {
    commandId: string
    releaseId: string
    receiptIds: string[]
  }): Promise<{ state: 'active' }>
  rollback(input: {
    commandId: string
    releaseId: string
    reason: string
  }): Promise<{ state: 'rolled_back' }>
}

export const GENERIC_RELEASE_COMMAND_ERROR =
  'Regional release command was not completed. Existing capabilities remain authoritative.'

export function createRegionalReleaseClient(
  transport: RegionalReleaseCommandTransport,
): RegionalReleaseClient {
  async function execute<T extends 'active' | 'rolled_back'>(
    command: RegionalReleaseOperation,
    expected: T,
  ): Promise<{ state: T }> {
    try {
      const result = await transport.execute(command)
      if (result.state !== expected) throw new Error(GENERIC_RELEASE_COMMAND_ERROR)
      return { state: expected }
    } catch {
      throw new Error(GENERIC_RELEASE_COMMAND_ERROR)
    }
  }
  return {
    promote: (input) => execute({ operation: 'promote', ...input }, 'active'),
    rollback: (input) =>
      execute(
        {
          operation: 'rollback',
          commandId: input.commandId,
          releaseId: input.releaseId,
          reason: input.reason.normalize('NFKC').trim(),
        },
        'rolled_back',
      ),
  }
}

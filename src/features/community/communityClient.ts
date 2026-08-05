import type { CommunityDeploymentCommand } from '../../../supabase/functions/_shared/community-deployment-command'

export interface CommunityDeploymentTransport {
  rpc(
    name: 'community_deployment_command',
    args: Readonly<{ p_operation: string; p_payload: Readonly<object> }>,
  ): Promise<{ data: unknown; error: unknown }>
}

export const GENERIC_COMMUNITY_COMMAND_ERROR =
  'Community deployment is unavailable. No community visibility has changed.'

export class CommunityCommandError extends Error {
  constructor() {
    super(GENERIC_COMMUNITY_COMMAND_ERROR)
    this.name = 'CommunityCommandError'
  }
}

export interface CommunityDeploymentClient {
  execute(command: CommunityDeploymentCommand): Promise<unknown>
}

export function createCommunityDeploymentClient(
  transport: CommunityDeploymentTransport,
): CommunityDeploymentClient {
  return {
    async execute(command) {
      try {
        const result = await transport.rpc('community_deployment_command', {
          p_operation: command.operation,
          p_payload: command.payload,
        })
        if (result.error || result.data === null || result.data === undefined)
          throw new CommunityCommandError()
        return result.data
      } catch (error) {
        if (error instanceof CommunityCommandError) throw error
        throw new CommunityCommandError()
      }
    },
  }
}

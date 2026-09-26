export interface LocalServiceRun {
  id: string
  projectId: string
  directory: string
  endpoint?: string
  origin?: string
  sourceSha?: string
  sourceDirty?: boolean
  anonKey?: string
  serviceRoleKey?: string
}

export interface LocalService {
  run: LocalServiceRun
  start(): Promise<LocalServiceRun>
  cleanup(): Promise<'removed'>
  sql(input: string): Promise<string>
  request<T = unknown>(
    route: string,
    options?: {
      key?: string
      token?: string
      body?: unknown
      method?: string
      schema?: string
      origin?: string
      signal?: AbortSignal
    },
  ): Promise<T>
}

export function createLocalService(options?: {
  signal?: AbortSignal
  resumeDirectory?: string
  browserOrigin?: string
  disableStorage?: boolean
  includeServiceRoleKey?: boolean
}): LocalService

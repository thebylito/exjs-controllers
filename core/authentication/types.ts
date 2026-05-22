import type { Request, Response } from 'express'

export type PrincipalKind = 'user' | 'api-key'

export type Action = {
  request: Request
  response: Response
}

// OpenAPI 3.1 SecuritySchemeObject (forma estrutural; a tipagem completa
// é responsabilidade do consumidor que monta o objeto).
export type OpenAPISecurityScheme = Record<string, unknown>

export type ScalarSecurityConfig = Record<string, unknown>

export type ResolvedPrincipal<TPrincipal = unknown> = {
  principal: TPrincipal
  kind: PrincipalKind
}

export type OpenApiSecuritySchemeEntry = {
  scheme: OpenAPISecurityScheme
  /**
   * Quais kinds este scheme documenta. Usado para derivar o `security` por
   * rota filtrando schemes compatíveis com os kinds aceitos pela rota.
   * Se omitido, o scheme cobre todos os kinds.
   */
  kinds?: PrincipalKind[]
}

export type AuthenticationConfig<TPrincipal = unknown> = {
  currentUserChecker: (
    action: Action,
  ) =>
    | Promise<ResolvedPrincipal<TPrincipal> | null | undefined>
    | ResolvedPrincipal<TPrincipal>
    | null
    | undefined

  authorizationChecker: (
    action: Action,
    principal: TPrincipal,
    kind: PrincipalKind,
    requiredPermissions: string[],
  ) => Promise<boolean> | boolean

  openApiSecuritySchemes: Record<string, OpenApiSecuritySchemeEntry>
  scalarSecurityConfig?: ScalarSecurityConfig
}

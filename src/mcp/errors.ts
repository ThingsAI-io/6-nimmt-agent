/**
 * Domain error types for the MCP server.
 * Every tool returns either a success payload or a DomainError.
 */

export interface DomainError {
  ok: false;
  code: string;
  recoverable: boolean;
  suggestedAction: 'retry_with_version' | 'resync_session' | 'start_fresh' | 'none';
  message: string;
  details?: Record<string, unknown>;
}

export function domainError(
  code: string,
  message: string,
  opts: { recoverable: boolean; suggestedAction: DomainError['suggestedAction']; details?: Record<string, unknown> },
): DomainError {
  return { ok: false, code, message, ...opts };
}

export function unknownSession(sessionId: string): DomainError {
  return domainError('UNKNOWN_SESSION', `Session '${sessionId}' not found.`, {
    recoverable: true,
    suggestedAction: 'start_fresh',
    details: { sessionId },
  });
}

export function invalidPhase(current: string, expected: string): DomainError {
  return domainError('INVALID_PHASE', `Expected phase '${expected}', but current phase is '${current}'.`, {
    recoverable: true,
    suggestedAction: 'resync_session',
    details: { current, expected },
  });
}

export function versionMismatch(expected: number, current: number): DomainError {
  return domainError('VERSION_MISMATCH', `Expected version ${expected}, but current version is ${current}.`, {
    recoverable: true,
    suggestedAction: 'retry_with_version',
    details: { expected, current },
  });
}

export function invalidStrategy(name: string, valid: string[]): DomainError {
  return domainError('INVALID_STRATEGY', `Unknown strategy '${name}'. Valid strategies: ${valid.join(', ')}`, {
    recoverable: false,
    suggestedAction: 'none',
    details: { name, valid },
  });
}

export function invalidPlayerCount(count: number): DomainError {
  return domainError('INVALID_PLAYER_COUNT', `Player count must be 2–10, got ${count}.`, {
    recoverable: false,
    suggestedAction: 'none',
    details: { count, min: 2, max: 10 },
  });
}

export function maxSessionsReached(max: number): DomainError {
  return domainError('MAX_SESSIONS_REACHED', `Maximum concurrent sessions (${max}) reached.`, {
    recoverable: true,
    suggestedAction: 'none',
    details: { max },
  });
}

export function stateMismatch(details: string): DomainError {
  return domainError('STATE_MISMATCH', `State mismatch: ${details}`, {
    recoverable: true,
    suggestedAction: 'resync_session',
  });
}

export function invalidState(message: string, details?: Record<string, unknown>): DomainError {
  return domainError('INVALID_STATE', message, {
    recoverable: false,
    suggestedAction: 'none',
    details,
  });
}

export function engineError(message: string): DomainError {
  return domainError('ENGINE_ERROR', message, {
    recoverable: false,
    suggestedAction: 'none',
  });
}

export function notImplemented(toolName: string): DomainError {
  return domainError('NOT_IMPLEMENTED', `Tool '${toolName}' is not yet implemented.`, {
    recoverable: false,
    suggestedAction: 'none',
    details: { tool: toolName },
  });
}

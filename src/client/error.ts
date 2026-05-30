import { t } from '../i18n';
import {
  MAX_DIAGNOSTIC_FIELD_LENGTH,
  NETWORK_ERROR_CATEGORY_BY_CODE,
} from './consts';
import type {
  MiMoRequestErrorKind,
  ErrorActionLink,
  ErrorActionUrls,
  NetworkErrorCategory,
} from './types';
export type { MiMoRequestErrorKind, ErrorActionUrls } from './types';

const errorActionUrlStore = (() => {
  let current: ErrorActionUrls = {};

  return {
    get: () => current,
    set: (key: keyof ErrorActionUrls, url: string) => {
      current = { ...current, [key]: url };
    },
  };
})();

export function setErrorActionUrl(key: keyof ErrorActionUrls, url: string): void {
  errorActionUrlStore.set(key, url);
}

export class MiMoRequestError extends Error {
  readonly kind: MiMoRequestErrorKind;
  readonly userSummary: string;
  readonly diagnosticMessage: string;
  readonly baseUrl?: string;
  readonly status?: number;
  readonly code?: string;

  constructor(options: {
    message: string;
    userSummary?: string;
    kind: MiMoRequestErrorKind;
    diagnosticMessage?: string;
    baseUrl?: string;
    status?: number;
    code?: string;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'MiMoRequestError';
    this.kind = options.kind;
    this.userSummary = options.userSummary ?? options.message;
    this.diagnosticMessage = options.diagnosticMessage ?? options.message;
    this.baseUrl = options.baseUrl;
    this.status = options.status;
    this.code = options.code;
  }
}

export async function createHttpError(
  response: Response,
  baseUrl: string,
): Promise<MiMoRequestError> {
  const responseText = await response.text();
  const serverMessage = extractServerMessage(responseText);
  const userSummary = getHttpErrorMessage(response.status);
  const diagnosticMessage = joinDiagnosticParts(
    `kind=http`,
    `status=${response.status}`,
    `baseUrl=${truncateSingleLine(baseUrl)}`,
    `statusText=${response.statusText || 'unknown'}`,
    serverMessage ? `serverMessage=${serverMessage}` : undefined,
    responseText && responseText !== serverMessage
      ? `body=${truncateSingleLine(responseText)}`
      : undefined,
  );

  return new MiMoRequestError({
    message: `MiMo API request failed with HTTP ${response.status}`,
    userSummary,
    kind: 'http',
    baseUrl,
    status: response.status,
    code: `HTTP_${response.status}`,
    diagnosticMessage,
  });
}

export function normalizeRequestError(error: unknown): Error {
  if (error instanceof MiMoRequestError) {
    return error;
  }

  if (!(error instanceof Error)) {
    const value = truncateSingleLine(String(error));
    return new MiMoRequestError({
      message: `MiMo request failed with a non-Error value: ${value}`,
      userSummary: t('error.unknown', value),
      kind: 'unknown',
      diagnosticMessage: `kind=unknown error=${value}`,
    });
  }

  const causeInfo = getCauseInfo(error);
  if (!causeInfo) {
    return error;
  }

  const code = causeInfo.code ?? causeInfo.name;
  const userSummary = getNetworkErrorMessage(code);
  const enhanced = new MiMoRequestError({
    message: code
      ? `MiMo request failed due to network error ${code}`
      : 'MiMo request failed due to a network error',
    userSummary,
    kind: 'network',
    code,
    cause: error,
    diagnosticMessage: joinDiagnosticParts(
      `kind=network`,
      code ? `code=${code}` : undefined,
      causeInfo.name ? `name=${causeInfo.name}` : undefined,
      `message=${truncateSingleLine(error.message)}`,
      causeInfo.message ? `cause=${causeInfo.message}` : undefined,
    ),
  });
  enhanced.stack = error.stack;
  return enhanced;
}

export function createUserFacingError(error: Error): Error {
  const message =
    error instanceof MiMoRequestError
      ? formatMarkdownMessage(error.userSummary, getErrorActions(error, errorActionUrlStore.get()))
      : error.message;
  const displayError = new Error(message);
  displayError.stack = undefined;
  return displayError;
}

function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return t('error.http.400', status);
    case 401:
      return t('error.http.401', status);
    case 402:
      return t('error.http.402', status);
    case 422:
      return t('error.http.422', status);
    case 429:
      return t('error.http.429', status);
    case 500:
      return t('error.http.500', status);
    case 503:
      return t('error.http.503', status);
    default:
      return t('error.http.generic', status);
  }
}

function getNetworkErrorMessage(code: string | undefined): string {
  const errorCode = code ?? 'UNKNOWN';

  switch (getNetworkErrorCategory(code)) {
    case 'dns':
      return t('error.network.dns', errorCode);
    case 'unreachable':
      return t('error.network.unreachable', errorCode);
    case 'interrupted':
      return t('error.network.interrupted', errorCode);
    case 'timeout':
      return t('error.network.timeout', errorCode);
    case 'tls':
      return t('error.network.tls', errorCode);
    case 'aborted':
      return t('error.network.aborted', errorCode);
    case 'protocol':
      return t('error.network.protocol', errorCode);
    case 'configuration':
      return t('error.network.configuration', errorCode);
    case 'generic':
      return t('error.network.generic', errorCode);
  }
}

function getNetworkErrorCategory(code: string | undefined): NetworkErrorCategory {
  if (!code) {
    return 'generic';
  }

  if (isKnownNetworkErrorCode(code)) {
    return NETWORK_ERROR_CATEGORY_BY_CODE[code];
  }

  if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_')) {
    return 'tls';
  }

  return code.startsWith('HPE_') ? 'protocol' : 'generic';
}

function isKnownNetworkErrorCode(
  code: string,
): code is keyof typeof NETWORK_ERROR_CATEGORY_BY_CODE {
  return Object.hasOwn(NETWORK_ERROR_CATEGORY_BY_CODE, code);
}

function extractServerMessage(responseText: string): string | undefined {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const error = getObjectProperty(parsed, 'error');
    const message =
      getStringProperty(error, 'message') ??
      getStringProperty(parsed, 'message') ??
      (typeof error === 'string' ? error : undefined);
    return message ? truncateSingleLine(message) : undefined;
  } catch {
    return truncateSingleLine(trimmed);
  }
}

function getCauseInfo(
  error: Error,
): { code?: string; name?: string; message?: string } | undefined {
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return {
      code: getStringProperty(cause, 'code'),
      name: cause.name,
      message:
        cause.message && cause.message !== error.message
          ? truncateSingleLine(cause.message)
          : undefined,
    };
  }

  if (typeof cause === 'object') {
    return {
      code: getStringProperty(cause, 'code'),
      name: getStringProperty(cause, 'name'),
      message: truncateOptional(getStringProperty(cause, 'message')),
    };
  }

  return { message: truncateSingleLine(String(cause)) };
}

function getObjectProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === 'string' && property.length > 0 ? property : undefined;
}

function formatMarkdownMessage(
  summary: string,
  actions: readonly ErrorActionLink[] | undefined = undefined,
): string {
  const formattedSummary = `**${escapeBoldText(summary)}**`;
  const actionLinks = actions?.map(formatActionLink).join(' · ');
  return actionLinks
    ? [formattedSummary + '\\', '\\', `**${actionLinks}**`].join('\n')
    : formattedSummary;
}

function formatActionLink(action: ErrorActionLink): string {
  return `[${t(action.labelKey)}](${action.url})`;
}

function getErrorActions(
  error: MiMoRequestError,
  actionUrls: ErrorActionUrls,
): readonly ErrorActionLink[] {
  if (error.kind === 'http' && error.status === 401) {
    const url = actionUrls.configureApiKey;
    if (url) {
      return [{ labelKey: 'error.action.setApiKey', url }];
    }
  }

  const showLogsUrl = actionUrls.showLogs;
  return showLogsUrl ? [{ labelKey: 'error.action.viewDetails', url: showLogsUrl }] : [];
}

function joinDiagnosticParts(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

function truncateSingleLine(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > MAX_DIAGNOSTIC_FIELD_LENGTH
    ? `${singleLine.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)}...`
    : singleLine;
}

function escapeBoldText(value: string): string {
  return value.replace(/\*/g, '\\*');
}

function truncateOptional(value: string | undefined): string | undefined {
  return value ? truncateSingleLine(value) : undefined;
}

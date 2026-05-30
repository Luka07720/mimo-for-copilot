export interface ErrorActionUrls {
  configureApiKey?: string;
  showLogs?: string;
}

export interface ErrorActionLink {
  labelKey: string;
  url: string;
}

export type MiMoRequestErrorKind = 'http' | 'network' | 'unknown';

export type NetworkErrorCategory =
  | 'dns'
  | 'unreachable'
  | 'interrupted'
  | 'timeout'
  | 'tls'
  | 'aborted'
  | 'protocol'
  | 'configuration'
  | 'generic';

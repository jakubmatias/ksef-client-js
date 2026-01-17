export type KsefEnvironment = 'test' | 'demo' | 'production'

const KSEF_BASE_URLS: Record<KsefEnvironment, string> = {
  test: 'https://api-test.ksef.mf.gov.pl',
  demo: 'https://api-demo.ksef.mf.gov.pl',
  production: 'https://api.ksef.mf.gov.pl',
}

export function getKsefBaseUrl(environment: KsefEnvironment): string {
  return KSEF_BASE_URLS[environment]
}

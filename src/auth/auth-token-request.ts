import { ContextIdentifier, IpAddressPolicy, SubjectIdentifierType } from '@/types/auth'

interface AuthTokenRequestParams {
  challenge: string
  contextIdentifier: ContextIdentifier
  subjectIdentifierType: SubjectIdentifierType
  ipAddressPolicy?: IpAddressPolicy
}

export const AUTH_TOKEN_XML_NAMESPACE = 'http://ksef.mf.gov.pl/auth/token/2.0'

export function buildAuthTokenRequestXml(params: AuthTokenRequestParams): string {
  const contextElement = buildContextIdentifier(params.contextIdentifier)
  const ipPolicy = params.ipAddressPolicy ? buildIpAddressPolicy(params.ipAddressPolicy) : ''

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<AuthTokenRequest xmlns="${AUTH_TOKEN_XML_NAMESPACE}">`,
    `  <Challenge>${escapeXml(params.challenge)}</Challenge>`,
    '  <ContextIdentifier>',
    `    ${contextElement}`,
    '  </ContextIdentifier>',
    `  <SubjectIdentifierType>${params.subjectIdentifierType}</SubjectIdentifierType>`,
    ipPolicy ? `  ${ipPolicy}` : null,
    '</AuthTokenRequest>',
  ].filter(Boolean).join('\n')
}

function buildContextIdentifier(context: ContextIdentifier): string {
  switch (context.type) {
    case 'nip':
      return `<Nip>${escapeXml(context.value)}</Nip>`
    case 'internalId':
      return `<InternalId>${escapeXml(context.value)}</InternalId>`
    case 'nipVatEu':
      return `<NipVatUe>${escapeXml(context.value)}</NipVatUe>`
    default:
      return `<Nip>${escapeXml(context.value)}</Nip>`
  }
}

function buildIpAddressPolicy(policy: IpAddressPolicy): string {
  const allowedIps = policy.allowedIps
  const ipElements: string[] = []

  if (allowedIps?.ipAddress?.length) {
    ipElements.push(...allowedIps.ipAddress.map(ip => `      <IpAddress>${escapeXml(ip)}</IpAddress>`))
  }
  if (allowedIps?.ipRange?.length) {
    ipElements.push(...allowedIps.ipRange.map(range => `      <IpRange>${escapeXml(range)}</IpRange>`))
  }
  if (allowedIps?.ipMask?.length) {
    ipElements.push(...allowedIps.ipMask.map(mask => `      <IpMask>${escapeXml(mask)}</IpMask>`))
  }

  return [
    '<IpAddressPolicy>',
    `  <OnClientIpChange>${policy.onClientIpChange}</OnClientIpChange>`,
    ipElements.length
      ? ['  <AllowedIps>', ...ipElements, '  </AllowedIps>'].join('\n')
      : null,
    '</IpAddressPolicy>',
  ].filter(Boolean).join('\n')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

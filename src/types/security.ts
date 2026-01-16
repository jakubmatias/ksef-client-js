import { z } from 'zod'

export const PublicKeyCertificateUsageSchema = z.enum([
  'KsefTokenEncryption',
  'SymmetricKeyEncryption',
])

export type PublicKeyCertificateUsage = z.infer<typeof PublicKeyCertificateUsageSchema>

export const PublicKeyCertificateSchema = z.object({
  certificate: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  usage: z.array(PublicKeyCertificateUsageSchema),
})

export type PublicKeyCertificate = z.infer<typeof PublicKeyCertificateSchema>

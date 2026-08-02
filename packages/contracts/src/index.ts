import { z } from 'zod';
export const roleSchema = z.enum(['owner', 'admin', 'editor', 'member', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
export const citationSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentName: z.string(),
  pageNumber: z.number().int().nullable(),
  heading: z.string().nullable(),
  excerpt: z.string(),
  score: z.number(),
});
export type Citation = z.infer<typeof citationSchema>;
export interface BillingProvider {
  createCheckout(tenantId: string, planCode: string): Promise<{ checkoutUrl: string }>;
  cancelSubscription(tenantId: string): Promise<void>;
}

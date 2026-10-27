import { z } from "zod";

/** Fields of an info page or blog post, as sent by Admin › Content. */
export const contentSchema = z.object({
  kind: z.enum(["page", "post"]),
  title: z.string().trim().min(2).max(150),
  slug: z.string().trim().toLowerCase(),
  body: z.string().max(100_000),
  excerpt: z.string().trim().max(300).optional().nullable(),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(170).optional().nullable(),
  status: z.enum(["draft", "published"]),
  showInFooter: z.boolean().optional(),
  footerOrder: z.number().int().min(0).max(10_000).optional(),
});

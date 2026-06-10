import { z } from 'zod';
import * as YAML from 'yaml';

const MarginSchema = z.object({
  top: z.string().optional(),
  right: z.string().optional(),
  bottom: z.string().optional(),
  left: z.string().optional(),
});

export const FrontmatterSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    author: z.union([z.string(), z.array(z.string())]).optional(),
    date: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    lang: z.string().optional(),

    theme: z.enum(['github', 'academic', 'minimal', 'dark']).optional(),
    customCssPath: z.string().optional(),

    pageSize: z.enum(['A4', 'Letter', 'Legal', 'A3', 'A5']).optional(),
    margin: MarginSchema.optional(),
    printBackground: z.boolean().optional(),
    headerTemplate: z.string().optional(),
    footerTemplate: z.string().optional(),

    toc: z.boolean().optional(),
    tocDepth: z.number().int().min(1).max(6).optional(),

    shikiTheme: z.string().optional(),
    mermaidTheme: z.enum(['default', 'dark', 'forest', 'neutral']).optional(),
  })
  .passthrough();

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export interface ParsedSource {
  body: string;
  frontmatter: Frontmatter;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(source: string): ParsedSource {
  const m = source.match(FENCE);
  if (!m) return { body: source, frontmatter: {} };
  let raw: unknown;
  try {
    raw = YAML.parse(m[1]);
  } catch {
    return { body: source, frontmatter: {} };
  }
  if (!raw || typeof raw !== 'object') return { body: source.slice(m[0].length), frontmatter: {} };
  const parsed = FrontmatterSchema.safeParse(raw);
  return {
    body: source.slice(m[0].length),
    frontmatter: parsed.success ? parsed.data : {},
  };
}

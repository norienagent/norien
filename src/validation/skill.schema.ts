import { z } from 'zod';

import {
  csvArray,
  descriptionField,
  nameField,
  paginationQuery,
  slugField,
  sortOrderField,
  tagsField,
  versionField,
} from './common.js';

const dataSourceField = z.enum(['none', 'markets', 'portfolio', 'token', 'registry']);

export const listSkillsQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  tag: csvArray(z.string().trim().min(1).max(40)).optional(),
  author: z.string().trim().min(1).max(64).optional(),
  sort: z.enum(['created_at', 'updated_at', 'name', 'slug']).default('created_at'),
  order: sortOrderField,
});

export const skillSlugParamsSchema = z.object({ slug: slugField });

export const publishSkillSchema = z.object({
  slug: slugField,
  name: nameField,
  description: descriptionField,
  version: versionField.optional(),
  category: z.string().trim().min(1).max(64).optional(),
  tags: tagsField.optional(),
  instructions: z.string().trim().min(1).max(8000),
  data_source: dataSourceField.optional(),
  input_hint: z.string().trim().max(200).optional(),
  examples: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
});

export const runSkillSchema = z.object({
  input: z.string().max(4000).default(''),
});

export const skillResponseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  instructions: z.string(),
  data_source: dataSourceField,
  input_hint: z.string().nullable(),
  examples: z.array(z.string()),
  updated_at: z.string(),
});

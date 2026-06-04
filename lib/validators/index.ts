import { z } from 'zod';

// Client Create Schema
export const clientCreateSchema = z.object({
  name: z.string().min(1, 'Client name is required').trim(),
  industry: z.string().trim().optional().nullable(),
});

// Client Update Schema
export const clientUpdateSchema = z.object({
  name: z.string().min(1, 'Client name must be at least 1 character if provided').trim().optional(),
  industry: z.string().trim().optional().nullable(),
});

// Report Generation Schema
export const reportGenerateSchema = z.object({
  client_id: z.string().uuid('Invalid client ID format'),
  period_start: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format (must be YYYY-MM-DD)',
  }),
  period_end: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format (must be YYYY-MM-DD)',
  }),
  platforms: z
    .array(z.enum(['meta_ads', 'google_ads', 'ga4', 'search_console']))
    .min(1, 'Select at least one platform for the report'),
}).refine((data) => new Date(data.period_start) <= new Date(data.period_end), {
  message: 'Start date must be before or equal to end date',
  path: ['period_start'],
});

// Report Delivery Email Schema
export const reportEmailSchema = z.object({
  recipient_email: z.string().email('Invalid email address'),
  recipient_name: z.string().min(1, 'Recipient name is required').trim(),
  custom_message: z.string().trim().optional(),
});

// Report & Section Commentary Update Schema
export const reportUpdateSchema = z.object({
  ai_summary: z.string().trim().optional(),
  platform: z.enum(['meta_ads', 'google_ads', 'ga4', 'search_console']).optional(),
  ai_commentary: z.string().trim().optional(),
}).refine(
  (data) => data.ai_summary !== undefined || (data.platform !== undefined && data.ai_commentary !== undefined),
  {
    message: "You must provide either 'ai_summary' or both 'platform' and 'ai_commentary'",
  }
);

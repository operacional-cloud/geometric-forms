import { z } from 'zod';

// ---- primitivos ------------------------------------------------------------
const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug deve ser kebab-case minúsculo');

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor deve estar em formato hex (#RRGGBB)');

// ---- field schema (recursivo por tipo) -------------------------------------
const fieldOption = z.object({
  label: z.string().min(1).max(200),
  value: z.string().min(1).max(100),
  score: z.number().optional(),
});

const fieldValidation = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    regex: z.string().nullable().optional(),
  })
  .optional();

export const formFieldSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(['text', 'email', 'phone', 'number', 'radio', 'checkbox', 'select', 'textarea']),
    label: z.string().min(1).max(500),
    placeholder: z.string().optional(),
    required: z.boolean().optional().default(false),
    order: z.number().int().nonnegative().optional(),
    options: z.array(fieldOption).optional(),
    validation: fieldValidation,
  })
  .superRefine((field, ctx) => {
    const needsOptions = ['radio', 'checkbox', 'select'].includes(field.type);
    if (needsOptions && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: `Campo do tipo "${field.type}" precisa de options[]`,
      });
    }
  });

// ---- admin: criar tenant + owner -------------------------------------------
export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug,
  logo_url: z.string().url().optional().nullable(),
  primary_color: hexColor.optional(),
  secondary_color: hexColor.optional(),
  plan: z.string().optional(),
  status: z.enum(['active', 'inactive', 'trial']).optional(),
});

export const ownerCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});

export const createTenantPayloadSchema = z.object({
  tenant: tenantCreateSchema,
  owner: ownerCreateSchema,
});

// ---- forms ------------------------------------------------------------------
export const formSaveSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  slug: slug.optional(),
  fields: z.array(formFieldSchema).min(1),
  settings: z.record(z.string(), z.any()).optional(),
  meta_pixel_id: z.string().optional().nullable(),
  meta_access_token: z.string().optional().nullable(),
  meta_dataset_id: z.string().optional().nullable(),
  qualification_threshold: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
  // Tela de início + tela de obrigado (white-label)
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  whatsapp_link: z.string().url().max(2000).optional().nullable(),
  success_button_label: z.string().max(80).optional().nullable(),
});

export const formUpdateSchema = formSaveSchema.partial();

// ---- lead público -----------------------------------------------------------
export const leadSubmitSchema = z.object({
  form_id: z.string().uuid(),
  event_id: z.string().min(1).max(128),
  // is_partial: true = lead salvo após nome+telefone (incompleto)
  // false ou ausente = submissão final (completo)
  is_partial: z.boolean().optional().default(false),
  answers: z.record(z.string(), z.any()),
  tracking: z
    .object({
      fbc: z.string().optional(),
      fbp: z.string().optional(),
      fbclid: z.string().optional(),
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_content: z.string().optional(),
      utm_term: z.string().optional(),
      user_agent: z.string().optional(),
      page_url: z.string().url().optional(),
    })
    .optional()
    .default({}),
});

// ---- evento público --------------------------------------------------------
export const eventTrackSchema = z.object({
  form_id: z.string().uuid(),
  event_type: z.enum(['view', 'start', 'field_complete']),
  session_id: z.string().min(1).max(128),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

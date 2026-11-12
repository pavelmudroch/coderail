import { apply } from './templates/apply.ts';
import { create, get, list, remove } from './templates/catalog.ts';

export type { ApplyOptions, TemplateAction, TemplateReport } from './templates/apply.ts';

export type { TemplateInfo } from './templates/catalog.ts';

export const Templates = { list, get, create, delete: remove, apply };

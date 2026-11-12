import { expect } from '@std/expect';

import { Templates } from '../src/templates.ts';
import { apply } from '../src/templates/apply.ts';
import { create, get, list, remove } from '../src/templates/catalog.ts';
Deno.test('Templates exposes catalog operations', () => {
    expect(Templates).toEqual({ list, get, create, delete: remove, apply });
});

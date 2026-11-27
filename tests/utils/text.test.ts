import { expect } from '@std/expect';

import { slugify } from '../../src/utils/text.ts';

Deno.test('slugify treats slash as a word separator', () => {
    expect(slugify('a/b')).toBe('a-b');
    expect(slugify('/internal//archive-history/')).toBe('internal-archive-history');
    expect(slugify('///')).toBe('');
});

Deno.test('slugify produces lowercase ASCII letters, digits, and hyphens', () => {
    expect(slugify('  Café / V2: new_name!  ')).toBe('cafe-v2-newname');
});

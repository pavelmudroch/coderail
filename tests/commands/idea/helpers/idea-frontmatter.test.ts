import { expect } from '@std/expect';

import { IdeaFrontmatter } from '../../../../src/commands/idea/helpers/idea-frontmatter.ts';

Deno.test('IdeaFrontmatter accepts supported statuses with nonempty titles', () => {
    for (const status of ['open', 'ready', 'split', 'archived']) {
        for (const title of ['Search improvements', ' Another idea ']) {
            expect(IdeaFrontmatter.isIdeaFrontmatter({ title, status, custom: true })).toBe(true);
        }
    }
});

Deno.test('IdeaFrontmatter rejects invalid titles and statuses', () => {
    for (const title of [undefined, 42, true, [], '', '   ', '\n\t']) {
        expect(IdeaFrontmatter.isIdeaFrontmatter({ title, status: 'archived' })).toBe(false);
    }
    for (const status of [undefined, 42, true, [], '', 'unknown', 'ARCHIVED']) {
        expect(IdeaFrontmatter.isIdeaFrontmatter({ title: 'Example', status })).toBe(false);
    }
});

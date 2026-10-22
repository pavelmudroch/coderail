import { expect } from '@std/expect';
import { join } from '@std/path';
import { resolveIdea } from '../../../../src/commands/idea/helpers/resolve-idea.ts';

async function withIdeas(run: (cwd: string, plans: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    const plans = join(cwd, '.coderail', 'plans');
    try {
        const ideas: [string, string][] = [
            ['auth', 'Authentication'],
            ['auth/login', 'Improve login'],
            ['auth/shared', 'Shared title'],
            ['billing', 'Billing'],
            ['billing/shared', 'Shared title'],
            ['billing/auth', 'Nested authentication'],
            ['billing/title-collision', 'login'],
            ['billing/ambiguous-title', 'shared'],
            ['billing/path-title', './missing'],
        ];
        for (const [id, title] of ideas) {
            const directory = join(plans, id);
            await Deno.mkdir(directory, { recursive: true });
            await Deno.writeTextFile(
                join(directory, 'IDEA.md'),
                `---\ntitle: ${JSON.stringify(title)}\nstatus: forging\n---\n`,
            );
        }
        await run(cwd, plans);
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

Deno.test('resolveIdea resolves absolute and explicit relative directory paths', async () => {
    await withIdeas(async (cwd, plans) => {
        for (
            const reference of [
                join(plans, 'auth', 'login'),
                '.coderail/plans/auth/login',
                './.coderail/plans/auth/login',
                './.coderail/plans/auth/../auth/login/',
                `../${cwd.split('/').pop()}/.coderail/plans/auth/login`,
            ]
        ) {
            const idea = await resolveIdea(cwd, reference);
            expect(idea.id).toBe('auth/login');
            expect(idea.path).toBe(join(plans, 'auth', 'login'));
            expect(idea.frontmatter).toEqual({ title: 'Improve login', status: 'forging' });
        }
    });
});

Deno.test('resolveIdea strips a trailing /IDEA.md from paths and IDs', async () => {
    await withIdeas(async (cwd, plans) => {
        for (
            const reference of [
                join(plans, 'auth', 'login', 'IDEA.md'),
                '.coderail/plans/auth/login/IDEA.md',
                './.coderail/plans/auth/login/IDEA.md',
                `../${cwd.split('/').pop()}/.coderail/plans/auth/login/IDEA.md`,
                'auth/login/IDEA.md',
                'login/IDEA.md',
            ]
        ) {
            expect((await resolveIdea(cwd, reference)).id).toBe('auth/login');
        }
        for (const reference of ['auth/login/idea.md', 'auth/login/IDEA.md.backup']) {
            await expect(resolveIdea(cwd, reference)).rejects.toThrow(
                `Idea not found: ${reference}`,
            );
        }
    });
});

Deno.test('resolveIdea matches exact IDs before slugs and slugs before titles', async () => {
    await withIdeas(async (cwd) => {
        for (
            const [reference, id] of [
                ['auth', 'auth'],
                ['auth/login', 'auth/login'],
                ['login', 'auth/login'],
                ['Improve login', 'auth/login'],
                ['Nested authentication', 'billing/auth'],
            ] as [string, string][]
        ) {
            expect((await resolveIdea(cwd, reference)).id).toBe(id);
        }
    });
});

Deno.test('resolveIdea rejects ambiguous slugs and titles and lists matching IDs', async () => {
    await withIdeas(async (cwd) => {
        for (const reference of ['shared', 'Shared title']) {
            await expect(resolveIdea(cwd, reference)).rejects.toThrow(
                `Ambiguous idea reference "${reference}". Use one of these IDs: auth/shared, billing/shared`,
            );
        }
        expect((await resolveIdea(cwd, 'billing/shared')).id).toBe('billing/shared');
    });
});

Deno.test('resolveIdea rejects missing, partial, and case-mismatched references', async () => {
    await withIdeas(async (cwd, plans) => {
        for (
            const reference of [
                '',
                'missing',
                'Improve',
                'improve login',
                'Login',
                './missing',
                '.coderail/plans/missing',
                join(plans, 'missing'),
                '.',
                '..',
                '.coderail/plans',
            ]
        ) {
            await expect(resolveIdea(cwd, reference)).rejects.toThrow(
                `Idea not found: ${reference}`,
            );
        }
    });
});

Deno.test('resolveIdea reports no match for an empty tree and propagates tree errors', async () => {
    const cwd = await Deno.makeTempDir();
    try {
        await expect(resolveIdea('relative', 'missing')).rejects.toThrow('absolute path');
        await expect(resolveIdea(cwd, 'missing')).rejects.toBeInstanceOf(Deno.errors.NotFound);
        await Deno.mkdir(join(cwd, '.coderail', 'plans'), { recursive: true });
        await expect(resolveIdea(cwd, 'missing')).rejects.toThrow('Idea not found: missing');
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});

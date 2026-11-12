import { Log } from '@log';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { formatJson, formatText } from '../../../../src/commands/idea/helpers/format.ts';
import type { IdeaTree } from '../../../../src/commands/idea/helpers/get-idea-tree.ts';

const tree: IdeaTree = [
    {
        path: '/plans/parent',
        id: 'parent',
        slug: 'parent',
        frontmatter: { title: 'Parent idea', status: 'split' },
        files: ['IDEA.md', 'SPEC.md'],
        children: [
            {
                path: '/plans/parent/child',
                id: join('parent', 'child'),
                slug: 'child',
                frontmatter: { title: 'Ticketed idea', status: 'archived' },
                files: ['IDEA.md'],
                children: [],
            },
            {
                path: '/plans/parent/next',
                id: join('parent', 'next'),
                slug: 'next',
                frontmatter: { title: 'Next idea', status: 'ready' },
                files: ['IDEA.md'],
                children: [],
            },
        ],
    },
    {
        path: '/plans/last',
        id: 'last',
        slug: 'last',
        frontmatter: { title: 'New idea', status: 'open' },
        files: ['IDEA.md'],
        children: [],
    },
];

Deno.test('idea formatters handle empty trees', () => {
    expect(formatText([])).toBe('');
    expect(formatJson([])).toBe('[]');
});

Deno.test('formatJson preserves statuses, metadata and hierarchy in a flat list', () => {
    expect(JSON.parse(formatJson(tree))).toEqual([
        {
            path: '/plans/parent',
            id: 'parent',
            title: 'Parent idea',
            status: 'split',
            parent: null,
            files: ['IDEA.md', 'SPEC.md'],
        },
        {
            path: '/plans/parent/child',
            id: join('parent', 'child'),
            title: 'Ticketed idea',
            status: 'archived',
            parent: 'parent',
            files: ['IDEA.md'],
        },
        {
            path: '/plans/parent/next',
            id: join('parent', 'next'),
            title: 'Next idea',
            status: 'ready',
            parent: 'parent',
            files: ['IDEA.md'],
        },
        {
            path: '/plans/last',
            id: 'last',
            title: 'New idea',
            status: 'open',
            parent: null,
            files: ['IDEA.md'],
        },
    ]);
});

Deno.test('formatText renders all statuses and nested branches with optional colors', () => {
    const originalNoColor = Log.noColor;
    try {
        for (const noColor of [true, false]) {
            Log.noColor = noColor;
            expect(formatText(tree)).toBe(
                [
                    `├── ${Log.color.cyan('Parent idea')} ${Log.color.magenta('⮆ split')} ${Log.color.gray('[IDEA.md, SPEC.md]')}`,
                    `│   ${Log.color.gray('/plans/parent')}`,
                    `│   ├── ${Log.color.cyan('Ticketed idea')} ${Log.color.yellow('⏹ archived')} ${Log.color.gray('[IDEA.md]')}`,
                    `│   │   ${Log.color.gray('/plans/parent/child')}`,
                    `│   └── ${Log.color.cyan('Next idea')} ${Log.color.green('▶ ready')} ${Log.color.gray('[IDEA.md]')}`,
                    `│       ${Log.color.gray('/plans/parent/next')}`,
                    `└── ${Log.color.cyan('New idea')} ${Log.color.red('🞅 open')} ${Log.color.gray('[IDEA.md]')}`,
                    `    ${Log.color.gray('/plans/last')}`,
                ].join('\n'),
            );
        }
    } finally {
        Log.noColor = originalNoColor;
    }
});

Deno.test('formatText indents children of the final root without a continuing branch', () => {
    const originalNoColor = Log.noColor;
    Log.noColor = true;
    try {
        expect(formatText(tree.slice(0, 1))).toBe(
            [
                '└── Parent idea ⮆ split [IDEA.md, SPEC.md]',
                '    /plans/parent',
                '    ├── Ticketed idea ⏹ archived [IDEA.md]',
                '    │   /plans/parent/child',
                '    └── Next idea ▶ ready [IDEA.md]',
                '        /plans/parent/next',
            ].join('\n'),
        );
    } finally {
        Log.noColor = originalNoColor;
    }
});

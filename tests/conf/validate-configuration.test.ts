import { expect } from '@std/expect';

import { parse } from '../../src/conf/parse.ts';
import { validateConfiguration } from '../../src/conf/validate-configuration.ts';

Deno.test(
    'Conf::validateConfiguration validates settings without defaults or metadata schema',
    async () => {
        for (const [text, expected] of [
            ['', {}],
            ['no_color = true', { noColor: true }],
            ['[verify]', { verify: {} }],
            ['[loop.codex]\nmodel = "native"', {}],
        ] as const) {
            expect(validateConfiguration(await parse(new Blob([text]).stream()))).toEqual(expected);
        }
        for (const text of ['description = "metadata"', 'no_color = 2', '[[verify.rules]]']) {
            const parsed = await parse(new Blob([text]).stream());
            expect(() => validateConfiguration(parsed)).toThrow('Invalid configuration');
        }
    },
);

Deno.test(
    'Conf::validateConfiguration shares the settings schema and diagnostic locations',
    async () => {
        const valid = `default_harness = "codex"
log_level = "normal"
no_color = false
non_interactive = true
[verify]
pre = [["setup"], []]
post = [["cleanup"]]
[[verify.rules]]
pattern = "*.ts"
commands = [["check"]]
requires = ["input"]
`;
        const parsed = await parse(new Blob([valid]).stream());
        expect(validateConfiguration(parsed)).toEqual(parsed.toObject());
        for (const level of ['quiet', 'verbose']) {
            expect(
                validateConfiguration(await parse(new Blob([`log_level = "${level}"`]).stream())),
            ).toEqual({ logLevel: level });
        }
        for (const text of [
            'default_harness = null',
            'log_level = "bad"',
            'non_interactive = 0',
            'verify = null',
            'verify = []',
            '[verify]\npre = false',
            '[verify]\npost = [1]',
            '[verify]\npre = [[1]]',
            '[verify]\nextra = true',
            '[verify]\nrules = [1]',
            '[verify]\nrules = [null]',
            '[verify]\nrules = [[]]',
            '[[verify.rules]]\npattern = false\ncommands = false\nrequires = [1]\nextra = 1',
            '[[verify.rules]]\npattern = "*"',
            '[[verify.rules]]\ncommands = []',
        ]) {
            const invalid = await parse(new Blob([text]).stream());
            expect(() => validateConfiguration(invalid), text).toThrow('Invalid configuration');
        }
        const invalid = await parse(
            new Blob(['no_color = 1\nunknown = true\n[[verify.rules]]\nrequires = []']).stream(),
        );
        try {
            validateConfiguration(invalid);
            throw new Error('Expected rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(((error as Error).cause as Error[]).map((cause) => cause.message)).toEqual([
                'no_color: Expected a boolean at line 1, column 12',
                'unknown: Unknown property at line 2, column 1',
                'verify.rules.0.pattern: Missing required property "pattern"',
                'verify.rules.0.commands: Missing required property "commands"',
            ]);
        }
    },
);

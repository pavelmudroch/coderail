import { expect } from '@std/expect';
import { isWithin } from '../../src/path/is-within.ts';

Deno.test({ name: 'Path::isWithin' }, async (test) => {
    await test.step('Basic paths', () => {
        {
            const path = '/home/user/project/file.txt';
            const root = '/home/user/project';
            expect(isWithin(path, root), 'Two absolute paths within').toBe(true);
        }

        {
            const path = '/home/user/project/file.txt';
            const root = '/';
            expect(isWithin(path, root), 'Absolute path within root /').toBe(true);
        }

        {
            const path = './home/user/project/file.txt';
            const root = './home/user/project';
            expect(isWithin(path, root), 'Two relative paths within').toBe(true);
        }

        {
            const path = 'home/user/project/file.txt';
            const root = './';
            expect(isWithin(path, root), 'Relative path without ./').toBe(true);
        }

        {
            const path = './home/user';
            const root = `${Deno.cwd()}/home`;
            expect(isWithin(path, root), 'Relative path within absolute root').toBe(true);
        }
    });

    await test.step('Trailing slashes', () => {
        {
            const path = '/home/user/project/src';
            const root = '/home/user/project';
            expect(isWithin(path, root), 'No trailing path + root').toBe(true);
            expect(isWithin(`${path}/`, root), 'Trailing path, no trailing root').toBe(true);
            expect(isWithin(path, `${root}/`), 'No trailing path, trailing root').toBe(true);
            expect(isWithin(`${path}/`, `${root}/`), 'Trailing path + trailing root')
                .toBe(true);
        }

        {
            const path = '/home/user';
            const root = '/home/user';
            expect(isWithin(path, root), 'Same without trailing').toBe(false);
            expect(isWithin(`${path}/`, root), 'Same, trailing path').toBe(true);
            expect(isWithin(path, `${root}/`), 'Same, trailing root').toBe(false);
            expect(isWithin(`${path}/`, `${root}/`), 'Same, trailing path + root').toBe(true);
        }
    });
});

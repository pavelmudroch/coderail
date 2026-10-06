import { expect } from '@std/expect';
import { isWithin } from '../../src/path/is-within.ts';

Deno.test({
    name: 'Path::isWithin',
}, async (test) => {
    await test.step('Simple absolute path examples', () => {
        expect(
            isWithin('/home/user/project/file.txt', '/home/user/project'),
            '#1 absolute paths - parent directory',
        ).toBe(true);

        expect(
            isWithin('/home/user/project/file.txt', '/'),
            '#2 absolute paths - root directory',
        ).toBe(true);

        expect(
            isWithin('/home/user/project/file.txt', '/home/user/project/'),
            '#3 absolute paths - parent directory with trailing slash',
        ).toBe(true);

        expect(
            isWithin('/home/user/project/file.txt', '/home/user/project/file'),
            '#4 absolute paths - edge case with file as parent',
        ).toBe(false);
    });

    await test.step('Relative path examples', () => {
        expect(
            isWithin('project/file.txt', 'project'),
            '#1 relative paths - parent directory',
        ).toBe(true);

        expect(
            isWithin('project/file.txt', '.'),
            '#2 relative paths - current directory',
        ).toBe(true);

        expect(
            isWithin('project/file.txt', './'),
            '#3 relative paths - current directory with trailing slash',
        ).toBe(true);

        expect(
            isWithin('project/file.txt', 'project/'),
            '#4 relative paths - parent directory with trailing slash',
        ).toBe(true);

        expect(
            isWithin('project/file.txt', 'project/file'),
            '#5 relative paths - edge case with file as parent',
        ).toBe(false);

        expect(
            isWithin('./project/file.txt', './project/'),
            '#6 relative paths - paths starting with ./',
        ).toBe(true);

        expect(
            isWithin('project/file.txt', './project/'),
            '#7 relative paths - paths starting with ./ mixed',
        ).toBe(true);

        expect(
            isWithin('./project/file.txt', 'project/'),
            '#8 relative paths - paths starting with ./ mixed',
        ).toBe(true);
    });

    await test.step('Paths with .. and mixed absolute/relative paths', () => {
        expect(
            isWithin('project/file.txt', '../project'),
            '#1 paths with .. - relative parent directory',
        ).toBe(false);

        expect(
            isWithin('../project/file.txt', '../project'),
            '#2 paths with .. - relative parent directory',
        ).toBe(true);

        expect(
            isWithin('/home/user/project/file.txt', '/home/user/../user/project'),
            '#3 paths with .. - absolute paths with ..',
        ).toBe(true);

        expect(
            isWithin('./home/../../private/passwd', './'),
            '#4 paths with .. - out of current directory',
        ).toBe(false);

        expect(
            isWithin('./user/../../private/passwd.txt', './private/'),
            '#5 paths with .. - relative paths with .. and mixed',
        ).toBe(false);
    });

    await test.step('Edge cases', () => {
        expect(
            isWithin('', ''),
            '#1 edge case - empty paths',
        ).toBe(false);

        expect(
            isWithin('file.txt', ''),
            '#2 edge case - empty root',
        ).toBe(false);

        expect(
            isWithin('', 'file.txt'),
            '#3 edge case - empty path',
        ).toBe(false);

        expect(
            isWithin('./dir-a/dir-b/', './dir-a/dir-b/'),
            '#4 edge case - directory within itself',
        ).toBe(false);

        expect(
            isWithin('./dir-a/dir-b', './dir-a/dir-b/'),
            '#5 edge case - directory within itself',
        ).toBe(false);

        expect(
            isWithin('./dir-a/dir-b', './dir-a/dir-b'),
            '#6 edge case - directory within itself',
        ).toBe(false);

        expect(
            isWithin('./dir-a/dir-b/', './dir-a/dir-b'),
            '#7 edge case - directory within itself',
        ).toBe(false);
    });
});

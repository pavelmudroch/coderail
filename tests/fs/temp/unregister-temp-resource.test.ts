import { expect } from '@std/expect';
import { tempContext } from '../../../src/fs/temp/ctx.ts';
import { registerTempResource } from '../../../src/fs/temp/register-temp-resource.ts';
import { unregisterTempResource } from '../../../src/fs/temp/unregister-temp-resource.ts';

Deno.test('Fs::unregisterTempResource removes only the matching registration', () => {
    try {
        registerTempResource('first');
        registerTempResource('second');
        unregisterTempResource('missing');
        expect(tempContext.registeredResourcePaths).toEqual(['first', 'second']);
        unregisterTempResource('first');
        expect(tempContext.registeredResourcePaths).toEqual(['second']);
        unregisterTempResource('second');
        expect(tempContext.registeredResourcePaths).toEqual([]);
        unregisterTempResource('missing');
        expect(tempContext.registeredResourcePaths).toEqual([]);
    } finally {
        tempContext.registeredResourcePaths.length = 0;
    }
});

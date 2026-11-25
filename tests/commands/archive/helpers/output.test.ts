import { expect } from '@std/expect';

import {
    printArchiveListing,
    writeArchiveJson,
} from '../../../../src/commands/archive/helpers/output.ts';
import { captureOutput } from '../../../log/helpers.ts';

Deno.test('archive listing outputs formatted rows, an empty message, or JSON data', () => {
    using captured = captureOutput();
    const items = [{ id: '0001', title: 'Archived ticket' }];
    const unexpectedFormatting = (): string[] => {
        throw new Error('Text formatting was called unexpectedly');
    };
    const noItems = 'No items.';
    const output = (): string => captured.stdout.splice(0).join('').replaceAll('\x1b[0K', '');
    printArchiveListing(items, false, () => ['0001  Archived ticket', '  artifact.md'], noItems);
    expect(output()).toBe('0001  Archived ticket\n  artifact.md\n');
    printArchiveListing([], false, unexpectedFormatting, noItems);
    expect(output()).toBe('No items.\n');
    printArchiveListing(items, true, unexpectedFormatting, noItems);
    expect(output()).toBe('[\n  {\n    "id": "0001",\n    "title": "Archived ticket"\n  }\n]\n');
    printArchiveListing([], true, unexpectedFormatting, noItems);
    expect(output()).toBe('[]\n');
    writeArchiveJson({ status: 'empty' });
    expect(output()).toBe('{\n  "status": "empty"\n}\n');
});

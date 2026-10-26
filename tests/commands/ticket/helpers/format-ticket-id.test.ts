import { expect } from '@std/expect';
import { formatTicketId } from '../../../../src/commands/ticket/helpers/format-ticket-id.ts';

Deno.test('formatTicketId pads IDs to at least four characters without truncating larger IDs', () => {
    for (
        const [id, expected] of [
            [0, '0000'],
            [1, '0001'],
            [12, '0012'],
            [123, '0123'],
            [1234, '1234'],
            [9999, '9999'],
            [10000, '10000'],
            [123456, '123456'],
        ] as const
    ) {
        expect(formatTicketId(id)).toBe(expected);
    }
});

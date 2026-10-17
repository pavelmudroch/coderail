import type { Command, ParsedArguments } from './commands/helpers/command.ts';
import { Cr, type GlobalArguments } from './commands/cr.ts';

export type { Command };
export type { ParsedArguments };
export type { GlobalArguments };

export interface Commands {
    cr(): Cr;
}

export const Commands: Commands = {
    cr: () => new Cr(),
};

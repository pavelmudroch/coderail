import { context } from './init.ts';

export function list(): string[] {
    return [...context.availableConnectors];
}

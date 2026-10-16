import { tempContext } from './ctx.ts';

export function registerTempResource(path: string): void {
    tempContext.registeredResourcePaths.push(path);
}

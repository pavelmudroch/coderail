import { tempContext } from './ctx.ts';

export function unregisterTempResource(path: string): void {
    const index = tempContext.registeredResourcePaths.indexOf(path);
    if (index !== -1) {
        tempContext.registeredResourcePaths.splice(index, 1);
    }
}

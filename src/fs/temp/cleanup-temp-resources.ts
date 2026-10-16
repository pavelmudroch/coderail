import { Log } from '@log';
import { tempContext } from './ctx.ts';

export async function cleanupTempResources(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    for (const resourcePath of tempContext.registeredResourcePaths) {
        cleanupPromises.push(removeResource(resourcePath));
    }
    const settledResults = await Promise.allSettled(cleanupPromises);
    for (const result of settledResults) {
        if (result.status === 'rejected') {
            throw new Error('Failed to cleanup all temporary resources');
        }
    }
}

async function removeResource(resourcePath: string): Promise<void> {
    try {
        await Deno.remove(resourcePath, { recursive: true });
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return;
        }

        Log.notice(`Failed to remove resource at ${resourcePath}`, error);
        throw error;
    }
}

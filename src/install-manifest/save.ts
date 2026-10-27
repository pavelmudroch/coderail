import { Fs } from '@fs';
import type { Manifest } from '../install-manifest.ts';
import { validate } from './validate.ts';

export async function save(path: string, manifest: Manifest): Promise<void> {
    validate(manifest);
    const content = JSON.stringify(manifest);
    await Fs.write(
        path,
        new ReadableStream<string>({
            start(controller): void {
                controller.enqueue(content);
                controller.close();
            },
        }),
    );
}

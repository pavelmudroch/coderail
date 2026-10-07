import { join } from '@std/path';
import { getFileStream } from './get-file-stream.ts';

export async function getLocalConfigurationFile(
    repositoryRoot: string,
): Promise<ReadableStream<Uint8Array> | null> {
    const filePath = join(repositoryRoot, '.coderail', 'coderail.conf');
    return await getFileStream(filePath);
}

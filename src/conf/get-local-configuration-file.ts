import { join } from '@std/path';
import { type ConfFileStream, getFileStream } from './get-file-stream.ts';

export async function getLocalConfigurationFile(
    repositoryRoot: string,
): Promise<ConfFileStream | null> {
    const filePath = join(repositoryRoot, '.coderail', 'coderail.conf');
    return await getFileStream(filePath);
}

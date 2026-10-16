import { join } from '@std/path';
import { type ConfFileStream, getFileStream } from './get-file-stream.ts';

export async function getGlobalConfigurationFile(
    installRoot: string,
): Promise<ConfFileStream | null> {
    // NOTE: Does not resolve hard link - that is correct behavior!
    const filePath = join(installRoot, 'coderail.conf');
    return await getFileStream(filePath);
}

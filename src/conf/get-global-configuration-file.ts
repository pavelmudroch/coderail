import { dirname, join } from '@std/path';
import { type ConfFileStream, getFileStream } from './get-file-stream.ts';

export async function getGlobalConfigurationFile(): Promise<ConfFileStream | null> {
    // NOTE: Does not resolve hard link - that is correct behavior!
    const resolvedSymLinkExecutablePath = await Deno.realPath(Deno.execPath());
    const coderailInstallDir = dirname(resolvedSymLinkExecutablePath);
    const filePath = join(coderailInstallDir, 'coderail.conf');
    return await getFileStream(filePath);
}

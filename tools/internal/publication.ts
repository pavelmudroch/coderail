import { join } from '@std/path';

import { checkPackage } from '../check-package.ts';
import { targets } from './package-options.ts';

export const releaseApi = 'https://api.github.com/repos/pavelmudroch/coderail';

export async function checkPackages(
    version: string,
    commit: string,
    output: string,
): Promise<void> {
    for (const target of targets) {
        await checkPackage({ target, version, commit, output });
    }
}

export function githubRequest(token: string, fetcher: typeof fetch) {
    if (!token) {
        throw new Error('Missing GH_TOKEN');
    }
    return (url: string, method = 'GET', body?: BodyInit, binary = false): Promise<Response> =>
        fetcher(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Cache-Control': 'no-cache',
                ...(body
                    ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }
                    : {}),
            },
            body,
        });
}

export async function uploadPackages(
    request: ReturnType<typeof githubRequest>,
    releaseId: number,
    output: string,
    beforeUpload: (name: string) => Promise<void> | void,
    confirmed: (count: number) => void,
): Promise<void> {
    let uploaded = 0;
    for (const target of targets) {
        for (const name of [`coderail-${target}.zip`, `coderail-${target}.zip.sha256`]) {
            const bytes = await Deno.readFile(join(output, name));
            await beforeUpload(name);
            const response = await request(
                `https://uploads.github.com/repos/pavelmudroch/coderail/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
                'POST',
                bytes,
                true,
            );
            if (response.status !== 201 || (await response.json()).state !== 'uploaded') {
                throw new Error(`GitHub upload failed (HTTP ${response.status})`);
            }
            confirmed(++uploaded);
        }
    }
}

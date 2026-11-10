import { homedir } from 'node:os';

import { Md } from '@md';
import { basename, extname, isAbsolute, join, resolve } from '@std/path';

import { type ConnectorFile, type HarnessConnector, type InstallationTarget } from './connector.ts';
import { type Runner, type RunRequest, startRunner } from './runner/runner.ts';

export class ClaudeConnector implements HarnessConnector {
    readonly name = 'claude';
    readonly home: string;

    constructor(target: InstallationTarget) {
        if (target.scope === 'local') {
            this.home = resolve(target.projectRoot, '.claude');
        } else {
            const override = Deno.env.get('CLAUDE_CONFIG_DIR');
            if (override && !isAbsolute(override)) {
                throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
            }
            this.home = resolve(override || join(homedir(), '.claude'));
        }
    }

    run(request: RunRequest): Promise<Runner> {
        return Promise.resolve().then(() => {
            const args = ['--print', '--output-format', 'stream-json', '--verbose'];
            if (request.model !== undefined) {
                args.push('--model', request.model);
            }
            if (request.effort !== undefined) {
                args.push('--effort', request.effort);
            }
            let answer: string | undefined;
            let failed = false;
            return startRunner(
                'claude',
                args,
                request,
                (event) => {
                    if (event.type === 'result') {
                        if (event.subtype !== 'success' || event.is_error !== false) {
                            failed = true;
                        } else if (typeof event.result === 'string') {
                            answer = event.result;
                        }
                    }
                },
                () => {
                    if (failed || answer === undefined) {
                        throw new Error(
                            'Claude did not complete successfully with a final assistant answer.',
                        );
                    }
                    return answer;
                },
            );
        });
    }

    async translateSkill(name: string, files: ConnectorFile[]): Promise<ConnectorFile[]> {
        const root = files.find((file) => file.path === 'SKILL.md');
        if (!root) {
            throw new Error(`skills/${name}/SKILL.md: missing root SKILL.md.`);
        }
        await validateMetadata({ ...root, path: `skills/${name}/SKILL.md` }, name);
        return files.map((file) => {
            const path = `skills/${name}/${file.path}`;
            return {
                path,
                content: translateText(
                    { ...file, path },
                    extname(file.path).toLowerCase() === '.md',
                ),
            };
        });
    }

    translateGlobalInstructions(file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.resolve().then(() => [
            {
                path: 'rules/coderail.md',
                content: translateText(file, true),
            },
        ]);
    }

    async translateSubagent(file: ConnectorFile): Promise<ConnectorFile[]> {
        await validateMetadata(file, basename(file.path, '.md'));
        return [
            {
                path: `agents/${file.path}`,
                content: translateText(file, true),
            },
        ];
    }

    [Symbol.dispose](): void {}
}

async function validateMetadata(file: ConnectorFile, name: string): Promise<void> {
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(file.content);
        const markdown = await Md.parse(
            new ReadableStream<string>({
                start(controller): void {
                    controller.enqueue(text);
                    controller.close();
                },
            }),
        );
        await markdown.content.cancel();
        for (const property of ['name', 'description']) {
            const value = markdown.frontmatter[property];
            if (typeof value !== 'string' || value.trim() === '') {
                throw new Error(`frontmatter ${property} must be a nonblank string.`);
            }
        }
        if (markdown.frontmatter.name !== name) {
            throw new Error(`frontmatter name must equal "${name}".`);
        }
    } catch (cause) {
        throw new Error(`${file.path}: ${cause instanceof Error ? cause.message : String(cause)}`, {
            cause,
        });
    }
}

function translateText(file: ConnectorFile, markdown: boolean): Uint8Array {
    let text: string;
    try {
        // Keep the BOM in translated output, although metadata parsing ignores it.
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.content);
    } catch (cause) {
        if (markdown) {
            throw new Error(`${file.path}: invalid UTF-8 Markdown.`, { cause });
        }
        return file.content.slice();
    }
    // NUL marks binary supporting assets even when all bytes happen to be valid UTF-8.
    if (!markdown && text.includes('\0')) {
        return file.content.slice();
    }
    return new TextEncoder().encode(text.replaceAll(/<skill>([^<]+)<\/skill>/g, '/$1'));
}

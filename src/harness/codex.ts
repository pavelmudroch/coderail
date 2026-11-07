import { homedir } from 'node:os';

import { Md } from '@md';
import { basename, isAbsolute, join, resolve } from '@std/path';

import type { ConnectorFile, HarnessConnector, InstallationTarget } from './connector.ts';

export class CodexConnector implements HarnessConnector {
    readonly name = 'codex';
    readonly home: string;
    readonly #prefix: string;

    constructor(target: InstallationTarget) {
        this.#prefix = target.scope === 'local' ? '.codex/' : '';
        if (target.scope === 'local') {
            this.home = resolve(target.projectRoot);
        } else {
            const override = Deno.env.get('CODEX_HOME');
            if (override && !isAbsolute(override)) {
                throw new Error('CODEX_HOME must be an absolute path.');
            }
            this.home = resolve(override || join(homedir(), '.codex'));
        }
    }

    async translateSkill(name: string, files: ConnectorFile[]): Promise<ConnectorFile[]> {
        const root = files.find((file) => file.path === 'SKILL.md');
        if (!root) {
            throw new Error(`skills/${name}/SKILL.md: missing root SKILL.md.`);
        }
        const source = { ...root, path: `skills/${name}/SKILL.md` };
        const { text, markdown } = await parseMetadata(source, name);
        const flag = markdown.frontmatter['disable-model-invocation'];
        if (flag !== undefined && typeof flag !== 'boolean') {
            await markdown.content.cancel();
            throw new Error(`${source.path}: disable-model-invocation must be a boolean.`);
        }
        let translated: string;
        if (flag === undefined) {
            await markdown.content.cancel();
            translated = text;
        } else {
            delete markdown.frontmatter['disable-model-invocation'];
            translated = await readText(Md.toStream(markdown));
            // Serialization canonicalizes metadata only; preserve the source BOM.
            if (text.startsWith('\uFEFF')) {
                translated = '\uFEFF' + translated;
            }
        }
        const prefix = `${this.#prefix}skills/${name}/`;
        const outputs = files.map((file) => ({
            path: `${prefix}${file.path}`,
            content: file === root ? encodeTranslated(translated) : file.content.slice(),
        }));
        if (flag !== undefined) {
            outputs.push({
                path: `${prefix}agents/openai.yaml`,
                content: new TextEncoder().encode(
                    `policy:\n  allow_implicit_invocation: ${!flag}\n`,
                ),
            });
        }
        return outputs;
    }

    translateGlobalInstructions(file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.resolve().then(() => [
            { path: 'AGENTS.md', content: encodeTranslated(decode(file)) },
        ]);
    }

    async translateSubagent(file: ConnectorFile): Promise<ConnectorFile[]> {
        const { markdown } = await parseMetadata(file, basename(file.path, '.md'));
        const body = await readText(markdown.content);
        const fields = {
            name: String(markdown.frontmatter.name),
            description: String(markdown.frontmatter.description),
            developer_instructions: body,
        };
        const text = Object.entries(fields)
            .map(([key, value]) => `${key} = ${tomlString(replaceSkills(value))}\n`)
            .join('');
        return [
            {
                path: `${this.#prefix}agents/${basename(file.path, '.md')}.toml`,
                content: new TextEncoder().encode(text),
            },
        ];
    }

    [Symbol.dispose](): void {}
}

function decode(file: ConnectorFile): string {
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.content);
    } catch (cause) {
        throw new Error(`${file.path}: invalid UTF-8 Markdown.`, { cause });
    }
}

async function parseMetadata(
    file: ConnectorFile,
    name: string,
): Promise<{ text: string; markdown: Awaited<ReturnType<typeof Md.parse>> }> {
    const text = decode(file);
    try {
        const markdown = await Md.parse(
            new ReadableStream<string>({
                start(controller): void {
                    // The BOM is preserved in output but is not part of the opening delimiter.
                    controller.enqueue(text.replace(/^\uFEFF/, ''));
                    controller.close();
                },
            }),
        );
        for (const property of ['name', 'description']) {
            const value = markdown.frontmatter[property];
            if (typeof value !== 'string' || value.trim() === '') {
                await markdown.content.cancel();
                throw new Error(`frontmatter ${property} must be a nonblank string.`);
            }
        }
        if (markdown.frontmatter.name !== name) {
            await markdown.content.cancel();
            throw new Error(`frontmatter name must equal "${name}".`);
        }
        return { text, markdown };
    } catch (cause) {
        throw new Error(`${file.path}: ${cause instanceof Error ? cause.message : String(cause)}`, {
            cause,
        });
    }
}

async function readText(stream: ReadableStream<string>): Promise<string> {
    let text = '';
    for await (const chunk of stream) {
        text += chunk;
    }
    return text;
}

function replaceSkills(text: string): string {
    return text.replaceAll(/<skill>([^<]+)<\/skill>/g, '$$$1');
}

function encodeTranslated(text: string): Uint8Array {
    return new TextEncoder().encode(replaceSkills(text));
}

/** TOML basic strings require escaping C0 controls and DEL, while retaining Unicode. */
function tomlString(text: string): string {
    const escapes: Record<string, string> = {
        '"': '\\"',
        '\\': '\\\\',
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
    };
    return (
        '"' +
        text.replaceAll(
            // eslint-disable-next-line no-control-regex -- TOML forbids literal control characters.
            /["\\\u0000-\u001f\u007f]/g,
            (character) =>
                escapes[character] ?? `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
        ) +
        '"'
    );
}

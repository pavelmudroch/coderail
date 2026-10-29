import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Harness, type HarnessConnector } from '@harness';
import { Cli } from '@cli';
import { dirname, join } from '@std/path';
import { Path } from '@path';
import { Log } from '@log';
import { InstallManifest, type Manifest } from '@install-manifest';

type UninstallArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
    self: boolean;
    harnesses: string[];
};

export class Uninstall implements Command<UninstallArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<UninstallArguments> {
        const args: UninstallArguments = {
            help: false,
            force: false,
            yes: false,
            no: false,
            self: false,
            harnesses: [],
        };
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg === '--') {
                args.harnesses.push(...originalArgs.slice(i + 1));
                break;
            }
            if (arg === '-f' || arg === '--force') {
                args.force = true;
                continue;
            }
            if (arg.startsWith('--force=')) {
                Cli.raiseUsageError('Option "--force" does not take a value.', this);
            }
            if (arg === '-y' || arg === '--yes') {
                args.yes = true;
                continue;
            }
            if (arg.startsWith('--yes=')) {
                Cli.raiseUsageError('Option "--yes" does not take a value.', this);
            }
            if (arg === '-n' || arg === '--no') {
                args.no = true;
                continue;
            }
            if (arg.startsWith('--no=')) {
                Cli.raiseUsageError('Option "--no" does not take a value.', this);
            }
            if (arg === '--self') {
                args.self = true;
                continue;
            }
            if (arg.startsWith('--self=')) {
                Cli.raiseUsageError('Option "--self" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.harnesses.push(arg);
        }
        if (args.self && args.harnesses.length > 0) {
            Cli.raiseUsageError('Option "--self" cannot be used with specified harnesses.', this);
        }
        if (args.yes && args.no) {
            Cli.raiseUsageError('Options "--yes" and "--no" cannot be used together.', this);
        }
        if ((args.yes || args.no) && !args.force) {
            Cli.raiseUsageError('Options "--yes" and "--no" require "--force".', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<UninstallArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr uninstall [--help] [--force [--yes | --no]] [--self | <harness> ...]',
            '',
            '  Uninstall custom coderail instructions for specific harness.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -f, --force          Force uninstallation to allow removing modified',
            '                       instructions. Requires confirmation prompt before each',
            '                       action.',
            '  -y, --yes            Automatically answer "yes" to all prompts.',
            '  -n, --no             Automatically answer "no" to all prompts.',
            '      --self           Uninstall coderail tool itself. Cannot be used with',
            '                       specified harness.',
            '',
            'Arguments:',
            '  <harness>            The harness(es) to uninstall instructions from. If no',
            '                       harness is provided, the one set as default in',
            '                       configuration is used.',
            '                       Available harnesses:',
            ...Harness.names.map((name) => `                       - ${name}`),
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<UninstallArguments>): Promise<void> {
        if (context.parsedArguments.args.self) {
            return Promise.reject(new Error('Self-uninstallation is not implemented.'));
        }
        context.signal.throwIfAborted();
        const names = [...new Set(context.parsedArguments.args.harnesses)];
        if (names.length === 0) {
            const name = context.configuration.defaultHarness;
            if (!name) {
                Cli.raiseUsageError('No harness specified and no default harness set.', this);
            }
            names.push(name);
        }
        for (const name of names) {
            if (!Harness.names.includes(name)) {
                Cli.raiseUsageError(`Unknown harness "${name}".`, this);
            }
        }
        const errors: Error[] = [];
        for (const name of names) {
            if (context.signal.aborted) break;
            try {
                using harness = Harness.get(name) ??
                    Cli.raiseUsageError(`Unknown harness "${name}".`, this);
                await performHarnessUninstallation(harness, context);
            } catch (cause) {
                const error = new Error(
                    `Failed to uninstall instructions for ${name}: ${message(cause)}`,
                    { cause },
                );
                Log.error(error);
                errors.push(error);
            }
        }
        if (errors.length) throw new AggregateError(errors, errors.map(message).join('\n'));
        context.signal.throwIfAborted();
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function performHarnessUninstallation(
    harness: HarnessConnector,
    context: RunContext<UninstallArguments>,
): Promise<void> {
    const root = harness.home;
    const path = join(root, Path.INSTALL_MANIFEST_NAME);
    const args = context.parsedArguments.args;
    let manifest: Manifest | null = null;
    const removed = new Set<string>();
    const missing = new Set<string>();
    const skipped = new Set<string>();
    let persistence = 'unchanged';
    const persist = async (baseline: Manifest): Promise<void> => {
        await inspectDestination(root, Path.INSTALL_MANIFEST_NAME);
        const files = baseline.files.filter((file) =>
            !removed.has(file.path) && !missing.has(file.path)
        );
        if (files.length) await InstallManifest.save(path, { ...baseline, files });
        else await removeIfExists(path);
        persistence = 'updated to track remaining files';
    };
    try {
        await inspectDestination(root, Path.INSTALL_MANIFEST_NAME);
        manifest = await InstallManifest.load(path);
        if (!manifest) {
            Log.output(`Nothing to uninstall for ${harness.name}.`);
            return;
        }
        for (const file of manifest.files) {
            if (
                file.path === Path.INSTALL_MANIFEST_NAME ||
                file.path.startsWith(`${Path.INSTALL_MANIFEST_NAME}/`)
            ) {
                throw new Error('Install manifest cannot track itself');
            }
            await inspectDestination(root, file.path);
        }
        const inspections = await InstallManifest.inspect(root, manifest);
        for (const file of inspections) {
            context.signal.throwIfAborted();
            if (file.status !== 'modified') continue;
            if (!args.force) throw new Error(`Modified file "${file.path}" requires --force.`);
            if (
                !args.yes && !args.no &&
                (context.configuration.nonInteractive || !Deno.stdin.isTerminal())
            ) {
                throw new Error('Confirmation requires an interactive terminal');
            }
            if (
                args.no ||
                (!args.yes && !Log.confirm(`Remove modified file "${join(root, file.path)}"?`))
            ) {
                skipped.add(file.path);
            }
        }
        for (const file of inspections) {
            context.signal.throwIfAborted();
            if (skipped.has(file.path)) continue;
            if (
                await inspectDestination(root, file.path) &&
                await removeIfExists(join(root, file.path))
            ) {
                removed.add(file.path);
                let parent = dirname(join(root, file.path));
                while (parent !== root) {
                    await removeIfEmpty(parent);
                    parent = dirname(parent);
                }
            } else missing.add(file.path);
        }
        await persist(manifest);
    } catch (cause) {
        let persistenceError = '';
        if (manifest && (removed.size || missing.size || manifest.files.length === 0)) {
            try {
                await persist(manifest);
            } catch (error) {
                persistence = 'update failed';
                persistenceError = `\nManifest persistence failed: ${message(error)}.`;
            }
        }
        const list = (paths: Iterable<string>): string =>
            [...paths].map((item) => `"${join(root, item)}"`).join(', ') || 'none';
        const pending = manifest?.files.filter((file) =>
            !removed.has(file.path) && !missing.has(file.path) && !skipped.has(file.path)
        ).map((file) => file.path);
        throw new Error(
            `${message(cause)}\nRemoved: ${list(removed)}.\nAlready missing: ${
                list(missing)
            }.\nSkipped (kept): ${list(skipped)}.\nRemaining files: ${
                pending ? list(pending) : 'unknown; inspect the installation manifest'
            }.\nManifest "${path}": ${persistence}.${persistenceError}`,
            { cause },
        );
    }
    Log.output(
        `Uninstalled instructions for ${harness.name}: ${removed.size} removed, ${missing.size} missing, ${skipped.size} skipped.`,
    );
}

async function removeIfExists(path: string): Promise<boolean> {
    try {
        await Deno.remove(path);
        return true;
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
    return false;
}

async function removeIfEmpty(path: string): Promise<void> {
    try {
        const entries = Deno.readDir(path);
        for await (const _entry of entries) {
            return;
        }
        await Deno.remove(path);
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
}

async function inspectDestination(root: string, path: string): Promise<boolean> {
    const parts = ['', ...path.split('/')];
    let current = root;
    // Include the home itself so a symlink cannot redirect the installation.
    for (const [index, part] of parts.entries()) {
        current = join(current, part);
        let info: Deno.FileInfo;
        try {
            info = await Deno.lstat(current);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return false;
            }
            throw error;
        }
        if (info.isSymlink) {
            throw new Error(`Install manifest path contains a symlink: "${current}".`);
        }
        if (index === parts.length - 1 ? !info.isFile : !info.isDirectory) {
            throw new Error(`Invalid installation path "${current}".`);
        }
    }
    return true;
}

import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { type ConnectorFile, Harness, type HarnessConnector } from '@harness';
import { Cli } from '@cli';
import { getInstructionFiles, type InstructionFiles } from './helpers/get-instruction-files.ts';
import { Log } from '@log';
import { dirname, join, resolve } from '@std/path';
import { Path } from '@path';
import {
    type Inspection,
    InstallManifest,
    type Manifest,
    type ManifestFile,
} from '@install-manifest';
import { validatePath } from '../install-manifest/validate.ts';
import { descendantPath } from '../install-manifest/capture.ts';
import { Fs } from '@fs';

type InstallArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
    harnesses: string[];
};

export class Install implements Command<InstallArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<InstallArguments> {
        const args: InstallArguments = {
            help: false,
            force: false,
            yes: false,
            no: false,
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
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.harnesses.push(arg);
        }
        if (args.yes && args.no) {
            Cli.raiseUsageError('Options "--yes" and "--no" cannot be used together.', this);
        }
        if ((args.yes || args.no) && !args.force) {
            Cli.raiseUsageError('Options "--yes" and "--no" require "--force".', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<InstallArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr install [--help] [--force [--yes | --no]] [<harness> ...]',
            '',
            '  Install instructions for specific harness, to allow agents of that harness use',
            '  coderail tool.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -f, --force          Force installation to allow overwriting existing or',
            '                       changed instructions. Requires confirmation prompt before',
            '                       each action.',
            '  -y, --yes            Automatically answer "yes" to all prompts.',
            '  -n, --no             Automatically answer "no" to all prompts.',
            '',
            'Arguments:',
            '  <harness>            The harness(es) to install instructions for. If no',
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

    async run(context: RunContext<InstallArguments>): Promise<void> {
        const harnessNames = context.parsedArguments.args.harnesses;
        const harnesses: HarnessConnector[] = [];
        for (const name of harnessNames) {
            harnesses.push(
                Harness.get(name) ?? Cli.raiseUsageError(`Unknown harness "${name}".`, this),
            );
        }
        if (harnesses.length === 0) {
            const defaultHarness = context.configuration.defaultHarness ??
                Cli.raiseUsageError('No harness specified and no default harness set.', this);
            harnesses.push(
                Harness.get(defaultHarness) ??
                    Cli.raiseUsageError(`Unknown default harness "${defaultHarness}".`, this),
            );
        }
        const instructionFiles = await getInstructionFiles(context.context.installRoot);
        for (const harness of harnesses) {
            try {
                await performHarnessInstallation(
                    harness,
                    instructionFiles,
                    context.parsedArguments.args,
                );
            } catch (error) {
                Log.error(`Failed to install instructions for ${harness.name}`, error);
            }
        }
    }
}

async function performHarnessInstallation(
    harness: HarnessConnector,
    instructionFiles: InstructionFiles,
    args: InstallArguments,
): Promise<void> {
    using spinner = Log.spinner(`Installing instructions for ${harness.name}`);
    spinner.addStep('translating files...');
    const translatedFiles = await translateFiles(harness, instructionFiles);
    spinner.addStep('installing files...');
    const installedCount = await installFiles(translatedFiles, harness.home, args);
    Log.output(
        installedCount > 0
            ? `Successfully installed instructions for ${harness.name}`
            : `No instructions installed for ${harness.name}.`,
    );
}

async function installFiles(
    translatedFiles: ConnectorFile[],
    harnessHome: string,
    args: InstallArguments,
): Promise<number> {
    const root = resolve(harnessHome);
    validateInstallationPaths(root, translatedFiles);
    const installManifestPath = join(root, Path.INSTALL_MANIFEST_NAME);
    await inspectDestination(root, Path.INSTALL_MANIFEST_NAME);
    const manifest = await InstallManifest.load(installManifestPath);
    if (manifest !== null) {
        const paths = new Map<string, { path: string }>(
            manifest.files.map((file) => [file.path, file]),
        );
        for (const file of translatedFiles) {
            paths.set(file.path, file);
        }
        validateInstallationPaths(root, [...paths.values()]);
    }
    const inspections = manifest === null ? [] : await InstallManifest.inspect(root, manifest);
    const filesToInstall = await planInstallation(root, translatedFiles, inspections, args);
    const installedFiles: ManifestFile[] = [];
    const errors: unknown[] = [];
    try {
        await writeFiles(root, filesToInstall, installedFiles);
    } catch (error) {
        errors.push(error);
    }
    try {
        await updateManifest(installManifestPath, manifest, installedFiles);
    } catch (error) {
        errors.push(error);
    }
    if (errors.length > 0) {
        throw new AggregateError(
            errors,
            'Failed to install instructions or update install manifest.',
        );
    }
    return installedFiles.length;
}

function validateInstallationPaths(root: string, files: { path: string }[]): void {
    const paths = new Set<string>();
    for (const file of files) {
        validatePath(file.path);
        descendantPath(root, file.path);
        if (
            file.path === Path.INSTALL_MANIFEST_NAME ||
            file.path.startsWith(`${Path.INSTALL_MANIFEST_NAME}/`)
        ) {
            throw new Error('Instruction file conflicts with install manifest.');
        }
        if (paths.has(file.path)) {
            throw new Error(`Duplicate instruction path "${file.path}".`);
        }
        paths.add(file.path);
    }
    for (const path of paths) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            if (paths.has(parts.slice(0, i).join('/'))) {
                throw new Error(`Instruction path "${path}" has a file as its parent.`);
            }
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
            throw new Error(`Installation path "${current}" contains a symlink.`);
        }
        if (index === parts.length - 1 ? !info.isFile : !info.isDirectory) {
            throw new Error(`Invalid installation path "${current}".`);
        }
    }
    return true;
}

async function planInstallation(
    root: string,
    translatedFiles: ConnectorFile[],
    inspections: Inspection[],
    args: InstallArguments,
): Promise<ConnectorFile[]> {
    const statuses = new Map(inspections.map((inspection) => [inspection.path, inspection.status]));
    const filesToInstall: ConnectorFile[] = [];
    for (const file of translatedFiles) {
        const exists = await inspectDestination(root, file.path);
        if (exists && statuses.get(file.path) !== 'unchanged') {
            if (!args.force) {
                throw new Error(
                    `File "${file.path}" already exists or has been modified. Use --force to install anyway.`,
                );
            }
            if (args.no) {
                continue;
            }
            if (
                !args.yes && !Log.confirm(
                    `File "${file.path}" already exists or has been modified. Do you want to overwrite it?`,
                )
            ) {
                continue;
            }
        }
        filesToInstall.push(file);
    }
    return filesToInstall;
}

async function writeFiles(
    root: string,
    files: ConnectorFile[],
    installedFiles: ManifestFile[],
): Promise<void> {
    for (const file of files) {
        const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new Uint8Array(file.content)),
        );
        const entry: ManifestFile = {
            path: file.path,
            checksum: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
            size: file.content.length,
        };
        const fullpath = descendantPath(root, file.path);
        await inspectDestination(root, file.path);
        await Deno.mkdir(dirname(fullpath), { recursive: true });
        await Fs.write(
            fullpath,
            new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(file.content);
                    controller.close();
                },
            }),
        );
        installedFiles.push(entry);
    }
}

async function updateManifest(
    path: string,
    manifest: Manifest | null,
    installedFiles: ManifestFile[],
): Promise<void> {
    if (installedFiles.length === 0) {
        return;
    }
    const files = new Map((manifest?.files ?? []).map((file) => [file.path, file]));
    for (const file of installedFiles) {
        files.set(file.path, file);
    }
    await InstallManifest.save(path, { version: 1, files: [...files.values()] });
}

async function translateFiles(
    harness: HarnessConnector,
    instructionFiles: InstructionFiles,
): Promise<ConnectorFile[]> {
    const translatedFiles: Promise<ConnectorFile[]>[] = [];
    for (const skill of instructionFiles.skills) {
        const translatedFile = harness.translateSkill(skill.name, skill.files);
        translatedFiles.push(translatedFile);
    }
    for (const subagent of instructionFiles.subagents) {
        const translatedFile = harness.translateSubagent(subagent);
        translatedFiles.push(translatedFile);
    }
    {
        const translatedFile = harness.translateGlobalInstructions(
            instructionFiles.globalInstructionFile,
        );
        translatedFiles.push(translatedFile);
    }
    return (await Promise.all(translatedFiles)).flat();
}

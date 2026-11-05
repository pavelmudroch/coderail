import { basename, join } from '@std/path';

type WindowsPath = {
    read: () => Promise<string>;
    write: (value: string) => Promise<void>;
};

type PathOptions = {
    bin: string;
    home?: string;
    shell?: string;
    path?: string;
    os?: string;
    confirm?: () => boolean | Promise<boolean>;
    report: (message: string) => void;
    windows?: WindowsPath;
};

function quote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function contains(path: string, bin: string, windows: boolean): boolean {
    const normalize = (value: string): string => {
        const trimmed = value.trim().replace(/[\\/]+$/, '');
        return windows ? trimmed.replaceAll('/', '\\').toLowerCase() : trimmed;
    };
    return path.split(windows ? ';' : ':').some((entry) => normalize(entry) === normalize(bin));
}

async function powershell(script: string, value?: string): Promise<string> {
    const result = await new Deno.Command('powershell.exe', {
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        env: value === undefined ? {} : { CODERAIL_USER_PATH: value },
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr).trim() || 'PowerShell failed');
    }
    return new TextDecoder().decode(result.stdout).replace(/\r?\n$/, '');
}

const defaultWindows: WindowsPath = {
    read: () => powershell('[Environment]::GetEnvironmentVariable("Path", "User")'),
    write: async (value) => {
        await powershell(
            '[Environment]::SetEnvironmentVariable("Path", $env:CODERAIL_USER_PATH, "User")',
            value,
        );
    },
};

export async function setupPath(options: PathOptions): Promise<void> {
    const { bin, report } = options;
    const os = options.os ?? Deno.build.os;
    const home = options.home ?? Deno.env.get(os === 'windows' ? 'USERPROFILE' : 'HOME') ?? '';
    const path = options.path ?? Deno.env.get('PATH') ?? '';
    const windows = os === 'windows';
    if (contains(path, bin, windows)) {
        return;
    }
    const shell = basename(options.shell ?? Deno.env.get('SHELL') ?? '');
    const line =
        shell === 'fish'
            ? `fish_add_path -- '${bin.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
            : `export PATH=${quote(bin)}:"$PATH"`;
    const manual = windows
        ? `In PowerShell, run: [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + '${bin.replaceAll("'", "''")}', 'User')\nOpen a new shell.`
        : `Add to your shell configuration: ${line}\nReload the configuration or open a new shell.`;
    const supported = windows || ['bash', 'zsh', 'fish'].includes(shell);
    if (!supported || !options.confirm) {
        report(manual);
        return;
    }
    try {
        if (!(await options.confirm())) {
            report(manual);
            return;
        }
        if (windows) {
            const transport = options.windows ?? defaultWindows;
            const current = await transport.read();
            if (!contains(current, bin, true)) {
                await transport.write(current ? `${current};${bin}` : bin);
            }
        } else {
            if (!home) {
                throw new Error('Home directory is unavailable');
            }
            const file =
                shell === 'fish'
                    ? join(home, '.config', 'fish', 'config.fish')
                    : join(home, shell === 'bash' ? '.bashrc' : '.zshrc');
            await Deno.mkdir(join(file, '..'), { recursive: true });
            const existing = await Deno.readTextFile(file).catch((error: unknown) => {
                if (error instanceof Deno.errors.NotFound) {
                    return '';
                }
                throw error;
            });
            if (!existing.split(/\r?\n/).includes(line)) {
                await Deno.writeTextFile(
                    file,
                    `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${line}\n`,
                );
            }
        }
        report('PATH configured. Reload your configuration or open a new shell.');
    } catch (error) {
        report(`Could not configure PATH: ${String(error)}\n${manual}`);
    }
}

export function terminalConfirm(message: string, os: string = Deno.build.os): boolean {
    let terminal: Deno.FsFile;
    try {
        terminal = Deno.openSync(os === 'windows' ? 'CON' : '/dev/tty', {
            read: true,
            write: true,
        });
    } catch {
        return false;
    }
    try {
        const encoder = new TextEncoder();
        terminal.writeSync(encoder.encode(`${message} [y/N]: `));
        const bytes: number[] = [];
        const byte = new Uint8Array(1);
        while (terminal.readSync(byte) !== null && byte[0] !== 10) {
            bytes.push(...byte);
        }
        return ['y', 'yes'].includes(
            new TextDecoder().decode(new Uint8Array(bytes)).trim().toLowerCase(),
        );
    } finally {
        terminal.close();
    }
}

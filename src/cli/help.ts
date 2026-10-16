import type { GlobalArguments } from './parse.ts';

export function shouldHandleHelp(global: GlobalArguments): boolean {
    return global.help === true;
}

export function shouldHandleVersion(global: GlobalArguments): boolean {
    return global.version === true;
}

export function getUsage(): string {
    const usageLines = [
        'Usage:',
        '  cr [options] <command>',
        '',
        '  Coderail command-line interface for agent based development.',
        '',
        'Options:',
        '  -h, --help           Show this help message and exit.',
        '      --version        Show the version information and exit.',
        '  -v, --verbose        Turn on verbose logging.',
        '  -q, --quiet          Turn off all logging except errors.',
        '      --cwd <path>     Set the current working directory.',
        '      --no-color       Disable colored output.',
        '      --non-interactive',
        '                       Run in non-interactive mode.',
        '',
        'Commands:',
    ];
    return usageLines.join('\n');
}

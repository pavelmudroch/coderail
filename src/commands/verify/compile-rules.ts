import type { Configuration } from '@conf';

export type ExpandedRule = {
    commands: string[][];
    requires: string[];
};

export type CompiledRule = {
    match(path: string): ExpandedRule | undefined;
};

function compileGlob(glob: string, segmentStart = true): string {
    let source = '';
    for (let i = 0; i < glob.length; i++) {
        const character = glob.charAt(i);
        if (glob.startsWith('**', i)) {
            if (
                ((i === 0 && segmentStart) || glob.charAt(i - 1) === '/') &&
                glob.charAt(i + 2) === '/'
            ) {
                source += '(?:[\\s\\S]*/)?';
                i += 2;
            } else {
                source += '[\\s\\S]*';
                i++;
            }
        } else if (character === '*') {
            source += '[^/]*';
        } else if (character === '?') {
            source += '[^/]';
        } else {
            source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return source;
}

export function compileRules(rules: Configuration['verify']): CompiledRule[] {
    return rules.map((rule, index): CompiledRule => {
        const names: string[] = [];
        const pattern = rule.pattern;
        let source = '';
        let position = 0;
        while (position < pattern.length) {
            const start = pattern.indexOf('${', position);
            if (start === -1) {
                source += compileGlob(
                    pattern.slice(position),
                    position === 0 || pattern.charAt(position - 1) === '/',
                );
                break;
            }
            source += compileGlob(
                pattern.slice(position, start),
                position === 0 || pattern.charAt(position - 1) === '/',
            );
            const end = pattern.indexOf('}', start + 2);
            const content = pattern.slice(start + 2, end);
            const colon = content.indexOf(':');
            const name = content.slice(0, colon);
            if (
                end === -1 || colon === -1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
                names.includes(name) || content.includes('${')
            ) {
                throw new Error(`Rule ${index}: invalid pattern ${JSON.stringify(pattern)}`);
            }
            names.push(name);
            const glob = content.slice(colon + 1);
            if (
                glob === '**' && (start === 0 || pattern.charAt(start - 1) === '/') &&
                pattern.charAt(end + 1) === '/'
            ) {
                source += '(?:([\\s\\S]*)/)?';
                position = end + 2;
            } else {
                source += `(${compileGlob(glob)})`;
                position = end + 1;
            }
        }
        // Unlike $, this assertion cannot match before a final newline.
        const expression = new RegExp(`^${source}(?![\\s\\S])`, 'u');
        const commands = rule.commands.filter((command) => command.length > 0);
        const requires = rule.requires ?? [];
        for (const value of [...rule.commands.flat(), ...requires]) {
            for (const reference of value.matchAll(/\$\{([^}]*)\}/g)) {
                if (!names.includes(reference[0].slice(2, -1))) {
                    throw new Error(`Rule ${index}: undefined reference ${reference[0]}`);
                }
            }
        }
        return {
            match(path: string): ExpandedRule | undefined {
                const match = expression.exec(path);
                if (match === null) return undefined;
                const expand = (value: string): string => {
                    return value.replace(
                        /\$\{([^}]*)\}/g,
                        (_reference, name: string): string => match[names.indexOf(name) + 1] ?? '',
                    );
                };
                return {
                    commands: commands.map((command) => command.map(expand)),
                    requires: requires.map(expand),
                };
            },
        };
    });
}

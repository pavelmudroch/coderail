// Models the logger's terminal sequences with output newline translation enabled.
export class Terminal {
    readonly screen: string[];
    row = 0;
    column = 0;

    constructor(readonly columns: number, readonly rows: number) {
        this.screen = Array(rows).fill('');
    }

    write(message: string): void {
        // deno-lint-ignore no-control-regex -- parses terminal escape sequences
        for (const token of message.matchAll(/\x1b\[(\d*)([A-Za-z])|([^\x1b])/gu)) {
            const command = token[2];
            if (command !== undefined) {
                const count = Number(token[1] || 1);
                switch (command) {
                    case 'A':
                    case 'F':
                        this.row = Math.max(0, this.row - count);
                        if (command === 'F') this.column = 0;
                        break;
                    case 'J':
                        if (token[1] !== '0') throw new Error('Unsupported erase mode');
                        this.screen[this.row] = (this.screen[this.row] ?? '').slice(0, this.column);
                        this.screen.fill('', this.row + 1);
                        break;
                    case 'K':
                        if (token[1] !== '0') throw new Error('Unsupported erase mode');
                        this.screen[this.row] = (this.screen[this.row] ?? '').slice(0, this.column);
                        break;
                    case 'm':
                        break;
                    default:
                        throw new Error(`Unsupported terminal command: ${command}`);
                }
                continue;
            }
            const character = token[3] ?? '';
            if (character === '\r') {
                this.column = 0;
            } else if (character === '\n') {
                this.#nextLine();
            } else {
                if (this.column === this.columns) this.#nextLine();
                const line = (this.screen[this.row] ?? '').padEnd(this.column, ' ');
                this.screen[this.row] = line.slice(0, this.column) + character +
                    line.slice(this.column + 1);
                this.column++;
            }
        }
    }

    #nextLine(): void {
        this.column = 0;
        if (this.row === this.rows - 1) {
            this.screen.shift();
            this.screen.push('');
        } else {
            this.row++;
        }
    }
}

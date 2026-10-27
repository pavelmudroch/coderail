/** Small replaceable terminal boundary; policy stays in the operations. */
export const Confirmation = {
    available(): boolean {
        return Deno.stdin.isTerminal() && Deno.stdout.isTerminal();
    },
    ask(path: string, action: 'Overwrite' | 'Remove' = 'Overwrite'): Promise<boolean> {
        const answer = prompt(`${action} ${path}? [y/N]`);
        return Promise.resolve(answer !== null && /^y(es)?$/i.test(answer.trim()));
    },
};

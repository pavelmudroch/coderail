import type { HarnessConnector, RunRequest } from '@harness';
import { Log } from '@log';
import { join } from '@std/path';

import { getReadyTickets } from '../ticket/helpers/get-ready-tickets.ts';
import { resolveTicket, type Ticket } from '../ticket/helpers/resolve-ticket.ts';
import {
    assertCleanProject,
    assertCommittedProject,
    assertNoOutsideStagedChanges,
    getHead,
    hasStagedChanges,
    stageProject,
} from './git.ts';

export const preflightPrompt = 'Do not use tools or read or modify files. Reply with exactly: OK';

type LoopResult = { attempts: number; reason: string; logDirectory: string };
type LoopRequest = {
    projectRoot: string;
    connector: Pick<HarnessConnector, 'run'>;
    settings: Pick<RunRequest, 'model' | 'effort'>;
    reviewSettings?: Pick<RunRequest, 'model' | 'effort'>;
    commitSettings?: Pick<RunRequest, 'model' | 'effort'>;
    signal: AbortSignal;
    limit?: number;
    /** Observes lifecycle lines after production logging, retaining their routing category. */
    report?: (line: string, level: 'notice' | 'info' | 'output') => void;
};

/** The run owns staging; each fresh implementation owns activation, verification, and closure. */
export async function runLoop(request: LoopRequest): Promise<LoopResult> {
    const { projectRoot, connector, settings, reviewSettings, commitSettings, signal, limit } =
        request;
    const report = (line: string, level: 'notice' | 'info' | 'output' = 'notice'): void => {
        Log[level](line);
        request.report?.(line, level);
    };
    let attempts = 0;
    let unfinished: Ticket | undefined;
    let reason = '';
    let failed = false;
    let logDirectory = '';
    const started = performance.now();
    let iterationStart: number | undefined;
    const duration = (start: number): string => {
        const seconds = Math.floor((performance.now() - start) / 1000);
        return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    };
    const failureReason = (error: unknown): string =>
        signal.aborted ? 'cancelled' : error instanceof Error ? error.message : String(error);
    const step = async <T>(name: string, message: string, work: () => Promise<T>): Promise<T> => {
        const start = performance.now();
        try {
            signal.throwIfAborted();
            using _spinner =
                Log.level === 'quiet' || Log.nonInteractive ? undefined : Log.spinner(message);
            const result = await work();
            signal.throwIfAborted();
            report(`  ${name} complete [ ok ] · ${duration(start)}`);
            return result;
        } catch (error) {
            report(`  ${name} complete [ fail ] · ${duration(start)}: ${failureReason(error)}`);
            throw error;
        }
    };
    const execute = async (
        step: string,
        path: string,
        prompt: string,
        stageSettings = settings,
    ): Promise<string> => {
        signal.throwIfAborted();
        // Open before starting the runner, so log creation failure starts no session.
        using file = await Deno.open(path, {
            create: true,
            append: true,
            write: true,
        });
        await using runner = await connector.run({
            cwd: projectRoot,
            prompt,
            ...stageSettings,
            signal,
        });
        const encoder = new TextEncoder();
        for await (const message of runner) {
            signal.throwIfAborted();
            const bytes = encoder.encode(
                JSON.stringify({
                    timestamp: message.timestamp,
                    step,
                    stream: message.stream,
                    output: message.output,
                }) + '\n',
            );
            let offset = 0;
            while (offset < bytes.length) {
                const written = await file.write(bytes.subarray(offset));
                if (written === 0) {
                    throw new Error('Loop log write made no progress.');
                }
                offset += written;
            }
        }
        const result = await runner.result();
        signal.throwIfAborted();
        return result.finalMessage;
    };
    try {
        report('Preflight:');
        const preflightStart = performance.now();
        try {
            signal.throwIfAborted();
            await assertCleanProject(projectRoot);
            if (commitSettings !== undefined) {
                await assertNoOutsideStagedChanges(projectRoot);
            }
            const runId =
                new Date().toISOString().replace(/[-:.]/g, '') +
                '-' +
                crypto.randomUUID().replaceAll('-', '');
            logDirectory = join(projectRoot, '.coderail', 'loop', runId);
            await Deno.mkdir(logDirectory, { recursive: true });
            const probes = new Set<string>();
            for (const [name, stageSettings] of [
                ['implementation', settings],
                ...(reviewSettings === undefined ? [] : ([['review', reviewSettings]] as const)),
                ...(commitSettings === undefined ? [] : ([['commit', commitSettings]] as const)),
            ] as const) {
                const key = JSON.stringify([stageSettings.model, stageSettings.effort]);
                if (probes.has(key)) {
                    continue;
                }
                probes.add(key);
                report(
                    `  Validate ${name} model=${
                        stageSettings.model ?? 'default'
                    } effort=${stageSettings.effort ?? 'default'}`,
                );
                using _spinner =
                    Log.level === 'quiet' || Log.nonInteractive
                        ? undefined
                        : Log.spinner(`Checking ${name} settings...`);
                const answer = await execute(
                    'preflight',
                    join(logDirectory, 'preflight.jsonl'),
                    preflightPrompt,
                    stageSettings,
                );
                if (answer.trim() !== 'OK') {
                    throw new Error('Preflight expected exactly OK.');
                }
                signal.throwIfAborted();
            }
            signal.throwIfAborted();
            report(`Preflight complete [ ok ] · ${duration(preflightStart)}`);
        } catch (error) {
            report(
                `Preflight complete [ fail ] · ${duration(preflightStart)}: ${failureReason(
                    error,
                )}`,
            );
            throw error;
        }
        while (true) {
            signal.throwIfAborted();
            if (limit !== undefined && attempts >= limit) {
                reason = 'limit reached';
                break;
            }
            const ticket = (await getReadyTickets(projectRoot, 1))[0];
            if (!ticket) {
                let queued = false;
                for (const status of ['open', 'active']) {
                    try {
                        for await (const entry of Deno.readDir(
                            join(projectRoot, '.coderail/tickets', status),
                        )) {
                            if (entry.isFile && /^\d{4,}-.+\.md$/.test(entry.name)) {
                                queued = true;
                            }
                        }
                    } catch (error) {
                        if (!(error instanceof Deno.errors.NotFound)) {
                            throw error;
                        }
                    }
                }
                reason = queued ? 'blocked queue' : 'empty queue';
                break;
            }
            unfinished = ticket;
            attempts++;
            iterationStart = performance.now();
            report(`Iteration ${attempts}: ticket ${ticket.id}: ${ticket.title}`);
            await step('Implement', 'Implementing...', async () => {
                await execute(
                    'implement',
                    join(logDirectory, `${ticket.id}.jsonl`),
                    [
                        `Use the implement skill to implement ticket ${JSON.stringify(
                            ticket.path,
                        )}.`,
                        `The initialized project root is ${JSON.stringify(projectRoot)}.`,
                        'Activate the ticket, complete every task, verify changes, and close it with reason done or duplicate.',
                        'Preserve existing staged work and the index baseline. Do not stage, unstage, reset, or commit changes; the loop owns staging.',
                    ].join('\n'),
                );
                const completed = await resolveTicket(projectRoot, ticket.id);
                if (
                    completed.status !== 'closed' ||
                    !['done', 'duplicate'].includes(completed.reason)
                ) {
                    throw new Error(
                        `Ticket ${ticket.id} was not closed with reason done or duplicate.`,
                    );
                }
            });
            if (reviewSettings !== undefined) {
                await step('Review', 'Reviewing...', async () => {
                    const completed = await resolveTicket(projectRoot, ticket.id);
                    await execute(
                        'review',
                        join(logDirectory, `${ticket.id}.jsonl`),
                        [
                            'Use the review skill to review the current implementation attempt.',
                            `The initialized project root is ${JSON.stringify(projectRoot)}.`,
                            `Selected ticket context: ${JSON.stringify(completed)}`,
                            await Deno.readTextFile(completed.path),
                            'Review only current unstaged changes relative to the index (git diff -- .) and new untracked files (git ls-files --others --exclude-standard -- .) inside this initialized subtree.',
                            'Include same-file changes against accumulated staged work. Prior staged work is context, not the review target.',
                            'Preserve existing staged work and the index baseline. Do not stage, unstage, reset, or commit changes; the loop owns staging.',
                            'Choose findings handling by urgency, not scope alone: add actionable tasks and reopen the original ticket for urgent fixes; create new follow-up tickets for deferred fixes.',
                            'Do not implement fixes. Leave the original ticket open when reopened, or closed with reason done or duplicate when completion stands. Do not leave it active.',
                            'Record findings in tickets; no separate machine-readable findings response is required. The loop stages the result and reselects ready work normally.',
                        ].join('\n'),
                        reviewSettings,
                    );
                    const reviewed = await resolveTicket(projectRoot, ticket.id);
                    if (
                        (reviewed.status !== 'open' &&
                            !(
                                reviewed.status === 'closed' &&
                                ['done', 'duplicate'].includes(reviewed.reason)
                            )) ||
                        reviewed.path !==
                            join(
                                projectRoot,
                                '.coderail/tickets',
                                reviewed.status,
                                `${reviewed.id}-${reviewed.slug}.md`,
                            )
                    ) {
                        throw new Error(`Ticket ${ticket.id} has invalid state after review.`);
                    }
                    // Validate recorded open follow-ups before staging, without selecting a fix here.
                    await getReadyTickets(projectRoot);
                });
            }
            await step('Stage', 'Staging...', () => stageProject(projectRoot));
            if (commitSettings !== undefined) {
                await step('Commit', 'Committing...', async () => {
                    if (!(await hasStagedChanges(projectRoot))) {
                        report('  Commit skipped: no staged changes.');
                        return;
                    }
                    const before = await getHead(projectRoot);
                    await execute(
                        'commit',
                        join(logDirectory, `${ticket.id}.jsonl`),
                        [
                            'Use the commit skill to commit the currently staged changes.',
                            `The initialized project root and staged scope is ${JSON.stringify(
                                projectRoot,
                            )}.`,
                            'Treat the initial staged diff as the complete and immutable commit scope; create one or more coherent commits.',
                            'Preserve all initially unstaged and untracked changes, including outside this initialized subtree.',
                            'Do not amend existing commits or push. On failure, stop and preserve the resulting work, index, and commits without retry or recovery.',
                        ].join('\n'),
                        commitSettings,
                    );
                    await assertCommittedProject(projectRoot, before);
                });
            }
            unfinished =
                (await resolveTicket(projectRoot, ticket.id)).status === 'open'
                    ? ticket
                    : undefined;
            report(
                `Iteration ${attempts}: ticket ${ticket.id} complete [ ok ] · ${duration(
                    iterationStart,
                )}`,
                'info',
            );
            iterationStart = undefined;
        }
        return { attempts, reason, logDirectory };
    } catch (error) {
        failed = true;
        reason = failureReason(error);
        if (iterationStart !== undefined && unfinished) {
            report(
                `Iteration ${attempts}: ticket ${unfinished.id} complete [ fail ] · ${duration(
                    iterationStart,
                )}: ${reason}`,
                'info',
            );
        }
        throw error;
    } finally {
        report(
            `Loop complete [ ${
                failed ? 'fail' : 'ok'
            } ]: ${attempts} attempt(s); ${reason}; ${duration(started)}${
                unfinished ? `; unfinished ticket ${unfinished.id} ${unfinished.title}` : ''
            }`,
            'output',
        );
    }
}

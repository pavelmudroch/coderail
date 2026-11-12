import type { Frontmatter } from '@md';

export type IdeaStatus = 'open' | 'ready' | 'split' | 'archived';

export const IDEA_STATUS = {
    OPEN: 'open',
    READY: 'ready',
    SPLIT: 'split',
    ARCHIVED: 'archived',
} satisfies Record<string, IdeaStatus>;

export type IdeaFrontmatter = {
    title: string;
    status: IdeaStatus;
};

export const IdeaFrontmatter = {
    isIdeaFrontmatter(fm: Frontmatter): fm is IdeaFrontmatter {
        if (typeof fm.title !== 'string' || fm.title.trim() === '') {
            return false;
        }

        if (
            fm.status !== 'open' &&
            fm.status !== 'ready' &&
            fm.status !== 'split' &&
            fm.status !== 'archived'
        ) {
            return false;
        }
        return true;
    },
};

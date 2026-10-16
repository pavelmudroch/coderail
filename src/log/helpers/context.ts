export interface LiveUI extends Disposable {
    redraw(): void;
}

type LogLevel = 'quiet' | 'normal' | 'verbose';

export const context = {
    logLevel: 'normal' as LogLevel,
    noColor: false,
    nonInteractive: false,
    currentLiveUiItem: null as LiveUI | null,
};

export function registerLiveUiItem(item: LiveUI): void {
    if (context.currentLiveUiItem !== null) {
        unregisterLiveUiItem(context.currentLiveUiItem);
    }
    context.currentLiveUiItem = item;
}

export function unregisterLiveUiItem(item: LiveUI): void {
    if (context.currentLiveUiItem === item) {
        const uiItem = context.currentLiveUiItem;
        context.currentLiveUiItem = null;
        uiItem[Symbol.dispose]();
    }
}

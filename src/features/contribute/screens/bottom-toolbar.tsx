import type { ReactNode, Ref } from 'react';

import { cn } from '@/shared/utils/cn';

import { useSlidingPill } from './use-sliding-pill';

import './start-icons.css';

/** The screen the toolbar is shown on: its tab is the marked one. */
export type ToolbarTab = 'record' | 'history' | 'account';

interface ToolbarCommonProps {
  /** Record, from History or Account: back to Start. */
  onOpenRecord?: () => void;
  /** Account. Left out in a build with no accounts, which has no Account tab, and on Account. */
  onOpenAccount?: () => void;
  /** The History tab, so focus can come back to it when History closes. */
  historyRef?: Ref<HTMLButtonElement>;
  /** The Account tab, so focus can come back to it when Account closes. */
  accountRef?: Ref<HTMLButtonElement>;
}

/** On History, its tab is the marked one: there is nothing for it to open. */
interface OnHistoryProps extends ToolbarCommonProps {
  current: 'history';
  onOpenHistory?: never;
}

/** Anywhere else, the History tab opens History. */
interface ElsewhereProps extends ToolbarCommonProps {
  current?: Exclude<ToolbarTab, 'history'>;
  onOpenHistory: () => void;
}

type BottomToolbarProps = OnHistoryProps | ElsewhereProps;

const TAB = 'relative flex min-w-18 flex-col items-center rounded-full py-1 text-xs/4 font-medium';

/**
 * Figma's BottomToolbar (4496:10482): Record, History and Account, the screen showing marked. A
 * pill over the map, centred under Start tracking, and at the foot of History and Account.
 */
export function BottomToolbar({
  current = 'record',
  onOpenRecord,
  onOpenHistory,
  onOpenAccount,
  historyRef,
  accountRef,
}: BottomToolbarProps) {
  const { barRef, pillRef } = useSlidingPill(current);
  return (
    <nav aria-label="Screens" className="flex justify-center">
      <div
        ref={barRef}
        className="tab-toolbar relative flex items-center rounded-full bg-surface p-1 font-sn-pro shadow-large"
      >
        {/* The pill under the screen showing: placed, and slid, by useSlidingPill. */}
        <span
          ref={pillRef}
          aria-hidden
          className="absolute inset-y-1 left-0 rounded-full bg-surface-tertiary"
        />
        <Tab name="record" isCurrent={current === 'record'} onClick={onOpenRecord}>
          <span aria-hidden className="start-icon start-icon-record size-6" />
          Record
        </Tab>
        <Tab
          name="history"
          isCurrent={current === 'history'}
          onClick={onOpenHistory}
          ref={historyRef}
        >
          <span aria-hidden className="start-icon start-icon-history-tab size-6" />
          History
        </Tab>
        {(onOpenAccount || current === 'account') && (
          <Tab
            name="account"
            isCurrent={current === 'account'}
            onClick={onOpenAccount}
            ref={accountRef}
          >
            <span aria-hidden className="start-icon start-icon-account-tab size-6" />
            Account
          </Tab>
        )}
      </div>
    </nav>
  );
}

interface TabProps {
  name: ToolbarTab;
  isCurrent: boolean;
  onClick: (() => void) | undefined;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/** The screen showing is marked, not a button, since there is nowhere for it to go. */
function Tab({ name, isCurrent, onClick, ref, children }: TabProps) {
  if (isCurrent) {
    return (
      <span data-tab={name} aria-current="page" className={cn(TAB, 'text-content-primary')}>
        {children}
      </span>
    );
  }
  return (
    <button
      ref={ref}
      data-tab={name}
      type="button"
      onClick={onClick}
      className={cn(TAB, 'text-content-quaternary')}
    >
      {children}
    </button>
  );
}

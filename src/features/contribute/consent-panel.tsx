import { Button } from '@/design-system/primitives/button';

import { useFocusHeading } from './use-focus-heading';
import { useStackRoom } from './use-stack-room';

interface ConsentPanelProps {
  onAgree: () => void;
  onDecline: () => void;
}

/** What the person agrees to, one short line each. Changing a word here means bumping CONSENT_VERSION. */
interface ConsentLine {
  id: string;
  label: string;
  text: string;
  /** A way to reach someone, after the text. */
  link?: { href: string; label: string };
}

const OWNER_PAGE = 'https://www.facebook.com/share/19sSyeiLFk/';

const CONSENT_LINES: readonly ConsentLine[] = [
  {
    id: 'recorded',
    label: 'What is recorded',
    text: "Your name, email and number when you sign up. While you record: your phone's location about once a second, the times, the gaps, and what you type.",
  },
  {
    id: 'purpose',
    label: 'What for',
    text: 'Drawing and checking routes and hintuans, studying how people ride, and machine learning.',
  },
  {
    id: 'who',
    label: 'Who sees it',
    text: "ParaPo's editors see your rides and your name, in the studio. Only the owner sees your email and number, to contact you. Never the public.",
  },
  {
    id: 'how-long',
    label: 'How long',
    text: 'The exact points for 24 months. After that, only the cleaned line, the times and the hintos, cut short at each end and no longer tied to you. Your account stays until you ask the owner to delete it. Backups are kept 60 days.',
  },
  {
    id: 'where',
    label: 'Where',
    text: "Supabase's servers in Singapore, and a private, encrypted backup at Cloudflare.",
  },
  {
    id: 'deleting',
    label: 'Deleting',
    text: "Remove an upload in History on any phone you're signed in on, or ask the owner to delete your account.",
  },
  {
    id: 'responsible',
    label: 'Who is responsible',
    text: 'The owner of ParaPo.',
    link: { href: OWNER_PAGE, label: 'Message the owner on Facebook' },
  },
];

/** The first visit: what the page records and where it goes, before anything is asked of the phone. */
export function ConsentPanel({ onAgree, onDecline }: ConsentPanelProps) {
  const headingRef = useFocusHeading();
  const stackRef = useStackRoom();
  return (
    <section
      ref={stackRef}
      aria-labelledby="consent-heading"
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-dvh flex-col gap-4 overflow-y-auto bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-sn-pro text-content-primary shadow-bottom-sheet-top-shadow"
    >
      <h1
        id="consent-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl/7 font-extrabold focus:outline-none"
      >
        Before you record
      </h1>
      <p className="text-base/6">
        This page records your route from your phone&apos;s location while it is open. When you save
        a recording, it is sent to ParaPo.
      </p>
      <dl className="flex flex-col gap-2 text-sm/5">
        {CONSENT_LINES.map(({ id, label, text, link }) => (
          <div key={id}>
            <dt className="font-bold">{label}</dt>
            <dd className="text-content-quaternary">
              {text}
              {link && (
                <>
                  {' '}
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-content-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-primary"
                  >
                    {link.label}
                  </a>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <Button variant="primary" label="Okay, I understand" onClick={onAgree} />
        <Button variant="secondary" label="Not now" onClick={onDecline} />
      </div>
    </section>
  );
}

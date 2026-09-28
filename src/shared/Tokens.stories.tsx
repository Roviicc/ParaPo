import type { Meta, StoryObj } from '@storybook/react-vite'

/**
 * The design tokens (src/shared/tokens.css), shown as they are named in the
 * Figma file's Primitive and Semantics collections. What this page shows is
 * the CSS actually shipped: each swatch wears the utility class printed
 * under it, so if Figma and code drift apart, this page is where it shows.
 */

function Swatch({ box, token, cls }: { box: string; token: string; cls: string }) {
  return (
    <div className="w-36">
      {/* Bordered swatches bring their own colour; only fills get the outline. */}
      <div className={'h-14 rounded-lg ' + (box.includes('border-') ? box : 'border border-border-primary ' + box)} />
      <p className="mt-1.5 text-xs font-medium text-content-primary">{token}</p>
      <p className="font-mono text-[11px] text-content-quaternary">{cls}</p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold text-content-primary">{title}</h2>
      <div className="flex flex-wrap gap-4">{children}</div>
    </section>
  )
}

/** A colour ramp of small squares, for the primitive families. */
function Ramp({ name, boxes }: { name: string; boxes: { step: string; cls: string }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-content-primary">{name}</p>
      <div className="flex">
        {boxes.map((b) => (
          <div key={b.step} className="w-10">
            <div className={'h-10 ' + b.cls} />
            <p className="mt-0.5 text-center text-[10px] text-content-quaternary">{b.step}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TokensPage() {
  return (
    <div className="max-w-4xl bg-surface p-8">
      <h1 className="mb-1 text-lg font-semibold text-content-primary">Tokens</h1>
      <p className="mb-8 text-sm text-content-tertiary">
        Mirrored from the Figma variables. Semantics first — designs speak these — then the custom
        primitives; every other primitive is Tailwind&rsquo;s own palette.
      </p>

      <Group title="Content — what is written">
        <div className="w-full rounded-lg border border-border-primary bg-surface p-4">
          <p className="text-content-primary">Content/primary · text-content-primary</p>
          <p className="text-content-secondary">Content/secondary · text-content-secondary</p>
          <p className="text-content-tertiary">Content/tertiary · text-content-tertiary</p>
          <p className="text-content-quaternary">Content/quaternary · text-content-quaternary</p>
          <p className="text-content-disabled">Content/disabled · text-content-disabled</p>
          <p className="text-content-error">Content/error · text-content-error</p>
          <p className="text-content-success">Content/success · text-content-success</p>
        </div>
        <div className="w-full rounded-lg bg-neutral-900 p-4">
          <p className="text-content-inverse">Content/inverse · text-content-inverse</p>
          <p className="text-content-inverse-secondary">
            Content/inverse-secondary · text-content-inverse-secondary
          </p>
        </div>
      </Group>

      <Group title="Border">
        <Swatch box="border-3 border-border-primary bg-surface" token="Border/primary" cls="border-border-primary" />
        <Swatch box="border-3 border-border-secondary bg-surface" token="Border/secondary" cls="border-border-secondary" />
        <Swatch box="border-3 border-border-tertiary bg-surface" token="Border/tertiary" cls="border-border-tertiary" />
        <Swatch box="border-3 border-border-error bg-surface" token="Border/error" cls="border-border-error" />
      </Group>

      <Group title="Background">
        <Swatch box="bg-surface" token="Background/surface" cls="bg-surface" />
        <Swatch box="bg-surface-secondary" token="…/surface-secondary" cls="bg-surface-secondary" />
        <Swatch box="bg-surface-tertiary" token="…/surface-tertiary" cls="bg-surface-tertiary" />
        <Swatch box="bg-surface-quaternary" token="…/surface-quaternary" cls="bg-surface-quaternary" />
        <Swatch box="bg-surface-error" token="…/surface-error" cls="bg-surface-error" />
        <Swatch box="bg-surface-success" token="…/surface-success" cls="bg-surface-success" />
      </Group>

      <Group title="Card — the jeepney liveries">
        <Swatch box="bg-card-red-surface border-3 border-card-red-border-primary" token="Card/red" cls="bg-card-red-surface" />
        <Swatch box="bg-card-red-surface-pale" token="Card/red/surface-pale" cls="bg-card-red-surface-pale" />
        <Swatch box="bg-card-red-timeline-surface" token="Card/red/Timeline" cls="bg-card-red-timeline-surface" />
        <Swatch box="bg-card-orange-surface border-3 border-card-orange-border-primary" token="Card/orange" cls="bg-card-orange-surface" />
        <Swatch box="bg-card-orange-timeline-surface" token="Card/orange/Timeline" cls="bg-card-orange-timeline-surface" />
        <Swatch box="bg-card-mist-surface border-3 border-card-mist-border-primary" token="Card/mist" cls="bg-card-mist-surface" />
        <Swatch box="bg-card-yellow-surface border-3 border-card-yellow-border-primary" token="Card/yellow" cls="bg-card-yellow-surface" />
      </Group>

      <Group title="Brand">
        <Swatch box="bg-brand-surface" token="Brand/surface" cls="bg-brand-surface" />
        <Swatch box="bg-brand-surface-secondary" token="Brand/surface-secondary" cls="bg-brand-surface-secondary" />
        <Swatch box="border-3 border-brand-border bg-surface" token="Brand/border" cls="border-brand-border" />
      </Group>

      <Group title="Custom primitives — the families Tailwind lacks">
        <div className="flex flex-col gap-4">
          {/* Literal class lists: Tailwind only generates classes it can read. */}
          <Ramp name="mauve" boxes={[
            { step: '50', cls: 'bg-mauve-50' }, { step: '100', cls: 'bg-mauve-100' },
            { step: '200', cls: 'bg-mauve-200' }, { step: '300', cls: 'bg-mauve-300' },
            { step: '400', cls: 'bg-mauve-400' }, { step: '500', cls: 'bg-mauve-500' },
            { step: '600', cls: 'bg-mauve-600' }, { step: '700', cls: 'bg-mauve-700' },
            { step: '800', cls: 'bg-mauve-800' }, { step: '900', cls: 'bg-mauve-900' },
            { step: '950', cls: 'bg-mauve-950' },
          ]} />
          <Ramp name="olive" boxes={[
            { step: '50', cls: 'bg-olive-50' }, { step: '100', cls: 'bg-olive-100' },
            { step: '200', cls: 'bg-olive-200' }, { step: '300', cls: 'bg-olive-300' },
            { step: '400', cls: 'bg-olive-400' }, { step: '500', cls: 'bg-olive-500' },
            { step: '600', cls: 'bg-olive-600' }, { step: '700', cls: 'bg-olive-700' },
            { step: '800', cls: 'bg-olive-800' }, { step: '900', cls: 'bg-olive-900' },
            { step: '950', cls: 'bg-olive-950' },
          ]} />
          <Ramp name="mist" boxes={[
            { step: '50', cls: 'bg-mist-50' }, { step: '100', cls: 'bg-mist-100' },
            { step: '200', cls: 'bg-mist-200' }, { step: '300', cls: 'bg-mist-300' },
            { step: '400', cls: 'bg-mist-400' }, { step: '500', cls: 'bg-mist-500' },
            { step: '600', cls: 'bg-mist-600' }, { step: '700', cls: 'bg-mist-700' },
            { step: '800', cls: 'bg-mist-800' }, { step: '900', cls: 'bg-mist-900' },
            { step: '950', cls: 'bg-mist-950' },
          ]} />
          <Ramp name="taupe" boxes={[
            { step: '50', cls: 'bg-taupe-50' }, { step: '100', cls: 'bg-taupe-100' },
            { step: '200', cls: 'bg-taupe-200' }, { step: '300', cls: 'bg-taupe-300' },
            { step: '400', cls: 'bg-taupe-400' }, { step: '500', cls: 'bg-taupe-500' },
            { step: '600', cls: 'bg-taupe-600' }, { step: '700', cls: 'bg-taupe-700' },
            { step: '800', cls: 'bg-taupe-800' }, { step: '900', cls: 'bg-taupe-900' },
            { step: '950', cls: 'bg-taupe-950' },
          ]} />
          <Ramp name="neutral (with the custom 150)" boxes={[
            { step: '100', cls: 'bg-neutral-100' },
            { step: '150', cls: 'bg-neutral-150' },
            { step: '200', cls: 'bg-neutral-200' },
          ]} />
        </div>
      </Group>
    </div>
  )
}

const meta = {
  title: 'Foundations/Tokens',
  component: TokensPage,
} satisfies Meta<typeof TokensPage>

export default meta
type Story = StoryObj<typeof meta>

export const Tokens: Story = {}

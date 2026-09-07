import { MapView } from './components/MapView'

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />

      {/*
        Idle-state chrome: one button, nothing else.
        Wired up in M2 — present now to prove the layering over MapLibre.
      */}
      <button
        type="button"
        disabled
        title="Drawing lands in M2"
        className="absolute bottom-6 right-6 z-10 rounded-full bg-white px-5 py-3
                   text-sm font-medium text-neutral-800 shadow-lg ring-1 ring-black/10
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        + New Route
      </button>
    </div>
  )
}

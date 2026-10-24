import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'maplibre-gl/dist/maplibre-gl.css';
import './contribute.css';

import {
  askForPersistentStorage,
  connectContributions,
  prepareNativeApp,
} from '@/features/contribute';

import { ContributeApp } from './contribute-app.tsx';
import { registerContributeWorker } from './register-worker.ts';

// This page's own Supabase client, under its own auth storage key, so the
// phone's anonymous identity never replaces an editor's studio session. No
// studio code here, which scripts/checks/check-build.mjs proves for this
// page's chunks.
connectContributions();
const root = document.getElementById('root');
if (!root) throw new Error('contribute/index.html has no #root element to mount the page in.');

const mountingPoint = root;

// In the Android app the page waits for Capacitor's script, which tells it whether it is native.
void prepareNativeApp()
  .catch((error: unknown) => console.error('Capacitor could not load.', error))
  .finally(() => {
    createRoot(mountingPoint).render(
      <StrictMode>
        <ContributeApp />
      </StrictMode>,
    );
    // The page's own offline setup, apart from the public map's worker, and a request that the
    // browser keep its recordings. The answer waits in the feature for the Ready screen.
    registerContributeWorker();
    void askForPersistentStorage();
  });

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'maplibre-gl/dist/maplibre-gl.css';
import './contribute.css';

import { ContributeApp } from './contribute-app.tsx';

// No Supabase client and no studio code here: a recording stays on the phone,
// which scripts/checks/check-build.mjs proves for this page's chunks.
const root = document.getElementById('root');
if (!root) throw new Error('contribute/index.html has no #root element to mount the page in.');

createRoot(root).render(
  <StrictMode>
    <ContributeApp />
  </StrictMode>,
);

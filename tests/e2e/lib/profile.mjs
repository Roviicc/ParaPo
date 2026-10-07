// Timing an opening: the main thread's long tasks, counted in the page, and a
// CPU profile of the opening with the functions it spent most time in. Used
// by scale-test and studio-scale-test.

/**
 * In the page, before the app starts (`page.addInitScript(countLongTasks)`):
 * window.__long, the milliseconds spent in long tasks so far. It runs in the
 * page, so it uses nothing from this file.
 */
export function countLongTasks() {
  window.__long = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long += e.duration;
  }).observe({ entryTypes: ['longtask'] });
}

// A CPU profile of the opening, so a failure says where the time went. It
// gives back the CDP session; `cdp.send('Profiler.stop')` ends the profile.
export const startProfile = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  return cdp;
};

// Where the time went: the functions with the most self time.
export const whereItWent = (profile) => {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < profile.samples.length; i++) {
    const f = byId.get(profile.samples[i]).callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/').split('?')[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }
  console.log('\n  where the opening went (self time):');
  for (const [k, us] of [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8))
    console.log(`  ${String(Math.round(us / 1000)).padStart(6)} ms  ${k}`);
};

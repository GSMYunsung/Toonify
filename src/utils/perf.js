const marks = {};
const renderCounts = {};
const timings = {};

export function markStart(label) {
  if (!__DEV__) return;
  marks[label] = performance.now();
}

export function markEnd(label) {
  if (!__DEV__) return 0;
  if (marks[label] == null) return 0;
  const ms = performance.now() - marks[label];
  if (!timings[label]) timings[label] = [];
  timings[label].push(ms);
  console.log(`[PERF] ${label}: ${ms.toFixed(1)}ms`);
  delete marks[label];
  return ms;
}

export function countRender(name) {
  if (!__DEV__) return;
  renderCounts[name] = (renderCounts[name] || 0) + 1;
  console.log(`[RENDER] ${name} #${renderCounts[name]}`);
  return renderCounts[name];
}

export function report() {
  if (!__DEV__) return;
  console.log('\n─── PERF REPORT ───');
  Object.entries(timings).forEach(([label, arr]) => {
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    const max = Math.max(...arr);
    console.log(`  ${label}: avg ${avg.toFixed(1)}ms / max ${max.toFixed(1)}ms / ${arr.length}회`);
  });
  console.log('─── RENDER COUNTS ───');
  Object.entries(renderCounts).forEach(([name, count]) => {
    console.log(`  ${name}: ${count}회`);
  });
  console.log('────────────────────\n');
}

export function reset() {
  if (!__DEV__) return;
  Object.keys(marks).forEach(k => delete marks[k]);
  Object.keys(renderCounts).forEach(k => delete renderCounts[k]);
  Object.keys(timings).forEach(k => delete timings[k]);
}

// Validate executable-line hit counts from kcov's Codecov JSON.
export function parseKcov(source) {
  const report = typeof source === 'string' ? JSON.parse(source) : source;
  const object = (value) =>
    value && typeof value === 'object' && !Array.isArray(value);
  if (!object(report) || !object(report.coverage)) {
    throw new Error('Malformed kcov coverage report');
  }
  let total = 0;
  let covered = 0;
  const files = Object.keys(report.coverage);
  if (!files.length) {
    throw new Error('Empty kcov coverage report');
  }
  for (const path of files) {
    const lines = report.coverage[path];
    if (!path || !object(lines) || !Object.keys(lines).length) {
      throw new Error('Empty kcov source coverage');
    }
    for (const [line, hits] of Object.entries(lines)) {
      if (
        !/^[1-9]\d*$/.test(line) ||
        !Number.isSafeInteger(Number(line)) ||
        !Number.isSafeInteger(hits) ||
        hits < 0
      ) {
        throw new Error('Malformed kcov executable line or hit count');
      }
      total++;
      if (hits > 0) {
        covered++;
      }
    }
  }
  return {
    total,
    covered,
    linePercent: Math.floor((covered / total) * 10_000) / 100,
    files,
  };
}

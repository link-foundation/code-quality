import { resolve } from 'node:path';
import { runProcess } from './process.js';
import { detectLanguage } from './languages.js';
import { safePath, positiveInteger } from './config.js';
import { hash, withSyntax, extractSyntax } from './syntax.js';

async function git(root, args, maxOutputBytes = 4_194_304) {
  const result = await runProcess('git', ['-C', root, ...args], {
    maxOutputBytes,
  });
  if (result.code !== 0) {
    throw new Error(`Git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function commitRef(root, ref) {
  if (
    typeof ref !== 'string' ||
    !ref ||
    ref.startsWith('-') ||
    ref.includes('\0')
  ) {
    throw new Error('Invalid Git revision');
  }
  return (
    await git(root, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${ref}^{commit}`,
    ])
  ).trim();
}

function cacheSnapshot(cache, key, parsed) {
  const metadataBytes = Buffer.byteLength(JSON.stringify(parsed));
  if ((cache.metadataBytes || 0) + metadataBytes > 33_554_432) {
    cache.clear();
    cache.metadataBytes = 0;
  }
  cache.metadataBytes = (cache.metadataBytes || 0) + metadataBytes;
  cache.set(key, parsed);
}

async function snapshot(root, revision, cache, budgets) {
  const entries = (await git(root, ['ls-tree', '-r', '-z', revision]))
    .split('\0')
    .filter(Boolean);
  const files = [];
  let bytes = 0;
  for (const record of entries) {
    const tab = record.indexOf('\t');
    const [mode, type, blob] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    const language = detectLanguage(path);
    if (
      !language ||
      path
        .split('/')
        .some((part) =>
          ['node_modules', 'vendor', 'target', 'dist', '.venv'].includes(part)
        )
    ) {
      continue;
    }
    safePath(path);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) {
      throw new Error(`Unsupported Git entry: ${path}`);
    }
    if (files.length >= budgets.maxFiles) {
      throw new Error('Evolution file count budget exceeded');
    }
    const key = `${language}:${blob}`;
    let parsed = cache.get(key);
    if (!parsed) {
      const size = Number((await git(root, ['cat-file', '-s', blob])).trim());
      if (size > budgets.maxFileBytes) {
        throw new Error(`Evolution file byte budget exceeded: ${path}`);
      }
      const content = await git(
        root,
        ['cat-file', 'blob', blob],
        budgets.maxFileBytes
      );
      if (content.includes('\0')) {
        throw new Error(`Binary source is unsupported: ${path}`);
      }
      parsed = await withSyntax(language, content, (syntax) =>
        extractSyntax(syntax, content)
      );
      if (parsed.errors.length) {
        throw new Error(
          `${revision}:${path}: syntax errors prevent trustworthy abstraction tracking`
        );
      }
      parsed = {
        ...parsed,
        bytes: size,
        lineCount:
          content.split('\n').length - (content.endsWith('\n') ? 1 : 0),
      };
      cacheSnapshot(cache, key, parsed);
    }
    bytes += parsed.bytes;
    if (bytes > budgets.maxTotalBytes) {
      throw new Error('Evolution snapshot byte budget exceeded');
    }
    files.push({
      path,
      language,
      blob,
      lineCount: parsed.lineCount,
      abstractions: parsed.abstractions,
    });
  }
  return files;
}

function uniqueCandidate(items, predicate) {
  const matches = items.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function identities(files) {
  return files.flatMap((file) => [
    {
      path: file.path,
      kind: 'file',
      name: file.path,
      qualifiedName: file.path,
      hash: file.blob,
      shape: hash(
        file.abstractions
          .map((entry) => entry.shape)
          .sort()
          .join(':')
      ),
      language: file.language,
      startLine: 1,
      complexity: file.abstractions.reduce(
        (sum, entry) => sum + entry.complexity,
        0
      ),
    },
    ...file.abstractions.map((entry) => ({
      ...entry,
      path: file.path,
      language: file.language,
    })),
  ]);
}

function matchIdentities(previous, current, commit) {
  const unused = new Set(previous);
  const events = [];
  const mapping = new Map();
  for (const next of current) {
    const same = (entry) =>
      entry.kind === next.kind && entry.language === next.language;
    let before = uniqueCandidate(
      [...unused],
      (entry) =>
        same(entry) &&
        entry.path === next.path &&
        entry.qualifiedName === next.qualifiedName
    );
    let matchedBy = 'qualified-name';
    if (!before) {
      before = uniqueCandidate(
        [...unused],
        (entry) => same(entry) && entry.hash === next.hash
      );
      matchedBy = 'exact-content';
    }
    if (!before && next.kind !== 'file') {
      before = uniqueCandidate(
        [...unused],
        (entry) => same(entry) && entry.shape === next.shape
      );
      matchedBy = 'unique-structure';
    }
    if (before) {
      unused.delete(before);
      next.id = before.id;
      mapping.set(next.id, before);
      const renamed =
        before.path !== next.path ||
        before.qualifiedName !== next.qualifiedName;
      if (before.hash !== next.hash || renamed) {
        events.push({
          commit,
          id: next.id,
          kind: next.kind,
          action: renamed ? 'renamed' : 'modified',
          matchedBy,
          before,
          after: next,
        });
      }
    } else {
      next.id = hash(
        JSON.stringify([
          commit,
          next.path,
          next.kind,
          next.qualifiedName,
          next.startLine,
        ])
      );
      events.push({
        commit,
        id: next.id,
        kind: next.kind,
        action: 'added',
        after: next,
      });
    }
  }
  for (const before of unused) {
    events.push({
      commit,
      id: before.id,
      kind: before.kind,
      action: 'deleted',
      before,
    });
  }
  return { events, mapping };
}

function couplingPairs(commitFiles) {
  const pairs = new Map();
  for (const files of commitFiles.values()) {
    const paths = [...files].sort();
    if (paths.length > 100) {
      continue;
    }
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const key = JSON.stringify([paths[i], paths[j]]);
        if (!pairs.has(key) && pairs.size >= 100_000) {
          throw new Error('Evolution coupling budget exceeded');
        }
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  return pairs;
}

function summarize(events) {
  const changes = new Map();
  const patterns = new Map();
  const commitFiles = new Map();
  for (const event of events) {
    const path = (event.after || event.before).path;
    if (event.kind === 'file') {
      changes.set(path, (changes.get(path) || 0) + 1);
      const files = commitFiles.get(event.commit) || new Set();
      files.add(path);
      commitFiles.set(event.commit, files);
    }
    if (
      event.before &&
      event.after &&
      event.kind !== 'file' &&
      event.before.editHash !== event.after.editHash
    ) {
      const key = `${event.after.language}:${event.kind}:${event.before.editHash}:${event.after.editHash}`;
      const pattern = patterns.get(key) || {
        id: hash(key),
        kind: event.kind,
        beforeShape: event.before.shape,
        afterShape: event.after.shape,
        count: 0,
        evidence: [],
        complexityDelta: 0,
      };
      pattern.count++;
      pattern.complexityDelta +=
        event.after.complexity - event.before.complexity;
      pattern.evidence.push({ commit: event.commit, path, id: event.id });
      patterns.set(key, pattern);
    }
  }
  const pairs = couplingPairs(commitFiles);
  const repeatedPatterns = [...patterns.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    hotspots: [...changes]
      .map(([path, changes]) => ({ path, changes }))
      .sort((a, b) => b.changes - a.changes || a.path.localeCompare(b.path)),
    coupling: [...pairs]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ files: JSON.parse(key), commits: count }))
      .sort(
        (a, b) =>
          b.commits - a.commits || a.files.join().localeCompare(b.files.join())
      ),
    repeatedPatterns,
    suggestions: repeatedPatterns.map((pattern) => ({
      patternId: pattern.id,
      confidence: 'observational',
      message:
        pattern.complexityDelta < 0
          ? 'Repeated edits reduced structural complexity; review the linked transformations for a reusable refactoring'
          : 'Repeated structural edits may indicate a shared abstraction; review the linked transformations before applying a guideline',
      evidence: pattern.evidence,
    })),
  };
}

export async function extractEvolution(
  root,
  {
    from,
    to = 'HEAD',
    maxCommits = 100,
    maxFiles = 1000,
    maxFileBytes = 1_048_576,
    maxTotalBytes = 16_777_216,
  } = {}
) {
  positiveInteger(maxCommits, 'maxCommits', 1000);
  positiveInteger(maxFiles, 'maxFiles', 1000);
  positiveInteger(maxFileBytes, 'maxFileBytes', 1_048_576);
  positiveInteger(maxTotalBytes, 'maxTotalBytes', 16_777_216);
  const absolute = resolve(root);
  const end = await commitRef(absolute, to);
  const start = from ? await commitRef(absolute, from) : null;
  const history = (
    await git(absolute, [
      'rev-list',
      '--first-parent',
      `--max-count=${maxCommits + 1}`,
      end,
    ])
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const startIndex = start ? history.indexOf(start) : -1;
  if (start && !history.slice(0, maxCommits).includes(start)) {
    throw new Error(
      'from must occur on the bounded first-parent history of to'
    );
  }
  const selected = (
    start ? history.slice(0, startIndex + 1) : history.slice(0, maxCommits)
  ).reverse();
  const truncated = !start && history.length > maxCommits;
  const cache = new Map();
  const events = [];
  const commits = [];
  let previous = [];
  for (const revision of selected) {
    const info = await git(absolute, [
      'show',
      '-s',
      '--format=%cI%x00%s',
      revision,
    ]);
    const [date, subject] = info.trimEnd().split('\0');
    commits.push({ sha: revision, date, subject });
    const current = identities(
      await snapshot(absolute, revision, cache, {
        maxFiles,
        maxFileBytes,
        maxTotalBytes,
      })
    );
    const diff = matchIdentities(previous, current, revision);
    events.push(...diff.events);
    if (events.length > 50_000) {
      throw new Error('Evolution event budget exceeded');
    }
    previous = current;
  }
  return {
    schemaVersion: 1,
    algorithm: 'first-parent-structural-v1',
    from: selected[0],
    to: end,
    truncated,
    commits,
    events,
    current: previous,
    ...summarize(events),
    limitations: [
      'First-parent history only; merge side branches are not traversed',
      'Renames use unique names, content or structure; ambiguous matches become deletion/addition',
      'Pattern frequency is evidence, not proof that a change improves behavior',
      'Coupling omits commits changing more than 100 source files',
    ],
  };
}

import { extname, basename } from 'node:path';

export const languages = Object.freeze(
  [
    {
      id: 'javascript',
      extensions: ['.js', '.mjs', '.cjs', '.jsx'],
      grammar: 'javascript',
    },
    {
      id: 'typescript',
      extensions: ['.ts', '.mts', '.cts'],
      grammar: 'typescript',
    },
    { id: 'tsx', extensions: ['.tsx'], grammar: 'tsx' },
    { id: 'rust', extensions: ['.rs'], grammar: 'rust' },
    { id: 'python', extensions: ['.py', '.pyi'], grammar: 'python' },
    { id: 'go', extensions: ['.go'], grammar: 'go' },
    { id: 'csharp', extensions: ['.cs'], grammar: 'c_sharp' },
    { id: 'java', extensions: ['.java'], grammar: 'java' },
    { id: 'c', extensions: ['.c', '.h'], grammar: 'c' },
    {
      id: 'cpp',
      extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
      grammar: 'cpp',
    },
    { id: 'php', extensions: ['.php', '.phtml'], grammar: 'php' },
    { id: 'bash', extensions: ['.sh', '.bash', '.bats'], grammar: 'bash' },
    { id: 'cmake', extensions: ['.cmake'], grammar: null },
  ].map((entry) =>
    Object.freeze({ ...entry, extensions: Object.freeze(entry.extensions) })
  )
);

export function detectLanguage(path, content = '') {
  if (basename(path) === 'CMakeLists.txt') {
    return 'cmake';
  }
  return (
    languages.find((lang) =>
      lang.extensions.includes(extname(path).toLowerCase())
    )?.id || (/^#![^\n]*\b(?:ba)?sh\b/.test(content) ? 'bash' : null)
  );
}

export function getLanguage(id) {
  const language = languages.find((entry) => entry.id === id);
  if (!language) {
    throw new Error(`Unsupported language: ${id}`);
  }
  return language;
}

import { analyzeSource } from '../../src/quality/index.js';
const fixtures = {
  javascript: ['a.js', 'export function f(x) { return x + 1; }\n'],
  typescript: [
    'a.ts',
    'export function f(x: number): number { return x + 1; }\n',
  ],
  tsx: ['a.tsx', 'function Component() { return <div />; }\n'],
  rust: ['a.rs', 'fn f(x: i32) -> i32 { x + 1 }\n'],
  python: ['a.py', 'def f(x):\n    return x + 1\n'],
  go: ['a.go', 'package main\nfunc f(x int) int { return x + 1 }\n'],
  csharp: ['a.cs', 'class Example { int F(int x) { return x + 1; } }\n'],
  java: ['a.java', 'class Example { int f(int x) { return x + 1; } }\n'],
  c: ['a.c', 'int f(int x) { return x + 1; }\n'],
  cpp: ['a.cpp', 'class Example { public: int f(int x) { return x + 1; } };\n'],
  php: ['a.php', '<?php function f($x) { return $x + 1; }\n'],
  bash: ['a.sh', 'f() { echo "$1"; }\n'],
  cmake: [
    'CMakeLists.txt',
    'function(f x)\n  message("${x}")\nendfunction()\n',
  ],
};
for (const [language, [path, content]] of Object.entries(fixtures)) {
  const result = await analyzeSource({ path, content });
  console.log(
    JSON.stringify({
      language,
      abstractions: result.abstractions.map(({ kind, name }) => ({
        kind,
        name,
      })),
      findings: result.findings,
    })
  );
}

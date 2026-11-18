export const qualityFixtures = {
  javascript: {
    path: 'sample.js',
    content: 'export function compute(x) { return x + 1; }\n',
    invalid: 'function broken( {\n',
  },
  typescript: {
    path: 'sample.ts',
    content: 'export function compute(x: number): number { return x + 1; }\n',
    invalid: 'function broken(x: {\n',
  },
  tsx: {
    path: 'sample.tsx',
    content: 'function Component() { return <div />; }\n',
    invalid: 'function broken() { return <div>\n',
  },
  rust: {
    path: 'sample.rs',
    content: 'fn compute(x: i32) -> i32 { x + 1 }\n',
    invalid: 'fn broken( {\n',
  },
  python: {
    path: 'sample.py',
    content: 'def compute(x):\n    return x + 1\n',
    invalid: 'def broken(:\n',
  },
  go: {
    path: 'sample.go',
    content: 'package main\nfunc compute(x int) int { return x + 1 }\n',
    invalid: 'package main\nfunc broken( {\n',
  },
  csharp: {
    path: 'Sample.cs',
    content: 'class Sample { int Compute(int x) { return x + 1; } }\n',
    invalid: 'class Sample { int Broken( {\n',
  },
  java: {
    path: 'Sample.java',
    content: 'class Sample { int compute(int x) { return x + 1; } }\n',
    invalid: 'class Sample { int broken( {\n',
  },
  c: {
    path: 'sample.c',
    content: 'int compute(int x) { return x + 1; }\n',
    invalid: 'int broken( {\n',
  },
  cpp: {
    path: 'sample.cpp',
    content: 'class Sample { public: int compute(int x) { return x + 1; } };\n',
    invalid: 'class Sample { int broken( {\n',
  },
  php: {
    path: 'sample.php',
    content: '<?php function compute($x) { return $x + 1; }\n',
    invalid: '<?php function broken( {\n',
  },
  bash: {
    path: 'sample.sh',
    content: 'compute() { echo "$1"; }\n',
    invalid: 'compute() { if then\n',
  },
  cmake: {
    path: 'CMakeLists.txt',
    content: 'function(compute x)\n  message("${x}")\nendfunction()\n',
    invalid: 'function(compute x)\n  message("${x}")\n',
  },
};

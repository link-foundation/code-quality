import { analyzeFiles, formatReport } from '../../src/quality/index.js';

const report = await analyzeFiles([
  {
    path: 'src/greet.py',
    content: 'def greet(name):\n    return "Hello " + name\n',
  },
  {
    path: 'src/greet.ts',
    content:
      'export function greet(name: string) { return `Hello ${name}`; }\n',
  },
]);
console.log(formatReport(report, 'json'));

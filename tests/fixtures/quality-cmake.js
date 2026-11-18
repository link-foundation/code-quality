// Original examples of public CMake argument syntax, not upstream test cases.
export const cmakeFormalParameters = [
  ['example first second', 'example', 2],
  ['[=[example]=] [=[first second]=]', 'example', 1],
  ['"example" "first;second"', 'example', 1],
  ['example first;second', 'example', 2],
  ['example ;first;;second;', 'example', 2],
  ['example first\\;second', 'example', 1],
  ['example [first;second]', 'example', 1],
  ['example ""', 'example', 1],
  ['example [=[\nfirst;second]=]', 'example', 1],
  ['example $<IF:condition,first,second>', 'example', 1],
];

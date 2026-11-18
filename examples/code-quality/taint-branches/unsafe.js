/* global input, validateCommand, execute */
export function dispatch(flag) {
  let command = input.read();
  if (flag) command = validateCommand(command);
  execute(command);
}

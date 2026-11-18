// The model explicitly trusts validateCommand's returned value.
/* global input, validateCommand, execute */
export function safe() {
  const raw = input.read();
  const command = validateCommand(raw);
  execute(command);
}

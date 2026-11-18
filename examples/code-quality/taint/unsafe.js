// Static-analysis input: modeled calls are never executed by the analyzer.
/* global input, decorate, execute */
export function unsafe() {
  const raw = input.read();
  const command = decorate(`run:${raw}`);
  execute(command);
}

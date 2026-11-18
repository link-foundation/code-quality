export function dispatch(deliver, primary, fallback) {
  deliver(primary, primary);
  deliver(primary, fallback);
}

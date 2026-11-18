export function dispatch(primary, secondary, archive, item) {
  primary(item);
  secondary(item);
  archive(item);
}

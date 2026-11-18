// Browser stand-in for the POSIX `node:path` helpers the analyzer uses.
export function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function extname(path) {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

export default { basename, extname };

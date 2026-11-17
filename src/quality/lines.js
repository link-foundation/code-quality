// Binary searches keep repeated source-offset lookups bounded on large inputs.
export function lineLocator(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return (index) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= index) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return { line: low + 1, column: index - starts[low] + 1 };
  };
}

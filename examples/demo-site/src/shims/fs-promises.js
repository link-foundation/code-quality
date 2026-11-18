// Browser stand-in for `readFile(url)`: bundled assets are fetched.
export async function readFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export default { readFile };

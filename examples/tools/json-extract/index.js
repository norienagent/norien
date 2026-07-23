// JSON Extract tool.
//
// Reads  {input:{data,paths,defaultValue}}  on stdin
// Writes {output:{values,missing}}          on stdout
//
// Pure computation: no network, no filesystem, no credentials. It exists so the
// output of one tool can be reshaped into the input of the next without an
// agent hand-rolling the same traversal every time.

/**
 * Resolves a dot-path against a value.
 *
 * A `*` segment maps the remainder of the path over an array, which is what
 * makes `chains.*.name` work without special-casing arrays at every call site.
 * Returns the MISSING sentinel rather than undefined so that a stored `null`
 * stays distinguishable from a path that does not exist.
 */
const MISSING = Symbol('missing');

function resolve(value, segments) {
  let current = value;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment === '*') {
      if (!Array.isArray(current)) return MISSING;
      const rest = segments.slice(index + 1);
      const mapped = current.map((entry) => resolve(entry, rest));
      // A wildcard yields a value for every element it could resolve; elements
      // that could not are dropped rather than filling the array with holes.
      return mapped.filter((entry) => entry !== MISSING);
    }

    if (current === null || current === undefined) return MISSING;
    if (typeof current !== 'object') return MISSING;

    if (Array.isArray(current)) {
      const position = Number(segment);
      if (!Number.isInteger(position) || position < 0 || position >= current.length) return MISSING;
      current = current[position];
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) return MISSING;
    current = current[segment];
  }

  return current;
}

async function main(input) {
  const paths = Array.isArray(input.paths) ? input.paths : [];
  const fallback = Object.prototype.hasOwnProperty.call(input, 'defaultValue')
    ? input.defaultValue
    : null;

  const values = {};
  const missing = [];

  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) continue;

    const resolved = resolve(input.data, path.split('.'));
    if (resolved === MISSING) {
      values[path] = fallback;
      missing.push(path);
    } else {
      values[path] = resolved;
    }
  }

  return { values, missing };
}

run(main);

function run(fn) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', async () => {
    let payload = {};
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      // An unparseable payload is reported through the error channel below.
    }
    try {
      const output = await fn(payload.input ?? {}, payload.context ?? {});
      process.stdout.write(JSON.stringify({ output }));
    } catch (error) {
      process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
      process.stdout.write(
        JSON.stringify({ error: { message: String((error && error.message) || error) } }),
      );
      process.exitCode = 1;
    }
  });
}

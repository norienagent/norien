// Wallet tool. Reads a balance via eth_getBalance -- a real JSON-RPC call, no
// signing keys involved.
async function main(input) {
  const rpc = input.rpc_url ?? process.env.RPC_URL;
  if (!rpc) throw new Error('provide `rpc_url` or set RPC_URL');
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) throw new Error('invalid EVM address');

  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [input.address, 'latest'] }),
  });
  const json = await response.json();
  if (json.error) throw new Error(`rpc error: ${json.error.message}`);

  const wei = BigInt(json.result);
  const eth = (Number(wei) / 1e18).toFixed(6);
  return { address: input.address, wei: wei.toString(), eth };
}
run(main);

function run(fn) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', async () => {
    let payload = {};
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
    try {
      const output = await fn(payload.input ?? {}, payload.context ?? {});
      process.stdout.write(JSON.stringify({ output }));
    } catch (error) {
      process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
      process.stdout.write(JSON.stringify({ error: { message: String(error && error.message || error) } }));
      process.exitCode = 1;
    }
  });
}

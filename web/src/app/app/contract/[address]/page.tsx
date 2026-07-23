import Link from 'next/link';

import { api } from '@/lib/api';
import { count, dash, shortAddress } from '@/lib/format';
import {
  Badge,
  Card,
  DegradedNotice,
  Empty,
  MissingResource,
  Row,
  SectionHeading,
  SourceList,
  Stat,
} from '@/components/ui';

interface AbiEntry {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { name?: string; type?: string }[];
  outputs?: { name?: string; type?: string }[];
}

/**
 * Contract detail.
 *
 * Explorer data and a direct node read are already merged server-side, so
 * verification status, ABI, and bytecode size agree with each other.
 */
export default async function ContractPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const result = await api.contract(address);
  if (!result) return <MissingResource kind="Contract" identifier={address} />;

  const contract = result.data;
  const abi = (contract.abi ?? []) as AbiEntry[];

  const reads = abi.filter(
    (entry) =>
      entry.type === 'function' && (entry.stateMutability === 'view' || entry.stateMutability === 'pure'),
  );
  const writes = abi.filter(
    (entry) =>
      entry.type === 'function' && entry.stateMutability !== 'view' && entry.stateMutability !== 'pure',
  );
  const events = abi.filter((entry) => entry.type === 'event');

  return (
    <>
      <SectionHeading title={contract.name ?? 'Contract'} />
      <p className="-mt-3 mb-5 font-mono text-sm break-all text-muted">{contract.address}</p>

      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Verification"
          value={
            contract.verified ? (
              <span className="text-up">Verified</span>
            ) : (
              <span className="text-muted">Unverified</span>
            )
          }
          hint={contract.compilerVersion ?? undefined}
        />
        <Stat
          label="Type"
          value={contract.isContract ? 'Contract' : 'Wallet'}
          hint={`${count(contract.bytecodeSize)} bytes`}
        />
        <Stat
          label="ABI entries"
          value={count(abi.length || null)}
          hint={`${reads.length} read · ${writes.length} write`}
        />
        <Stat label="License" value={contract.license ?? dash} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Contract information">
          <dl>
            <Row label="Address">
              <span className="font-mono text-xs break-all">{contract.address}</span>
            </Row>
            <Row label="Chain">
              {contract.chain.name} <span className="text-muted">({contract.chain.id})</span>
            </Row>
            <Row label="Compiler">{contract.compilerVersion ?? dash}</Row>
            <Row label="Optimization">
              {contract.optimizationEnabled === null
                ? dash
                : contract.optimizationEnabled
                  ? 'Enabled'
                  : 'Disabled'}
            </Row>
            <Row label="Creator">
              {contract.creator ? (
                <Link
                  href={`/app/address/${contract.creator.toLowerCase()}`}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {shortAddress(contract.creator, 10)}
                </Link>
              ) : (
                dash
              )}
            </Row>
            <Row label="Creation tx">
              <span className="font-mono text-xs">
                {contract.creationTxHash ? shortAddress(contract.creationTxHash, 10) : dash}
              </span>
            </Row>
          </dl>
        </Card>

        {contract.token ? (
          <Card title="Token">
            <dl>
              <Row label="Name">{contract.token.name ?? dash}</Row>
              <Row label="Symbol">{contract.token.symbol ?? dash}</Row>
              <Row label="Decimals">{contract.token.decimals ?? dash}</Row>
              <Row label="Holders">{count(contract.token.holders)}</Row>
              <Row label="Market">
                <Link
                  href={`/app/token/${contract.address}`}
                  className="text-accent underline underline-offset-2"
                >
                  View token page →
                </Link>
              </Row>
            </dl>
          </Card>
        ) : (
          <Card title="Token">
            <Empty title="Not a token" detail="This contract does not expose ERC-20 metadata." />
          </Card>
        )}
      </div>

      <div className="mt-4">
        <Card title={`Read contract (${reads.length})`}>
          {reads.length === 0 ? (
            <Empty
              title="No read functions"
              detail="The ABI is unavailable or exposes no view functions."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {reads.map((entry, index) => (
                <div key={`${entry.name}:${index}`} className="truncate font-mono text-xs">
                  <span className="text-accent">{entry.name}</span>
                  <span className="text-muted">
                    ({(entry.inputs ?? []).map((input) => input.type).join(', ')})
                  </span>
                  {entry.outputs && entry.outputs.length > 0 ? (
                    <span className="text-muted"> → {entry.outputs.map((o) => o.type).join(', ')}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {events.length > 0 ? (
        <div className="mt-4">
          <Card title={`Events (${events.length})`}>
            <div className="flex flex-wrap gap-2">
              {events.map((entry, index) => (
                <Badge key={`${entry.name}:${index}`}>{entry.name}</Badge>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mt-4">
        <Card title="ABI" padded={false}>
          {contract.abi ? (
            <pre className="scroll-x max-h-96 overflow-y-auto rounded-b-xl bg-sunken p-4 font-mono text-xs leading-relaxed text-ink">
              {JSON.stringify(contract.abi, null, 2)}
            </pre>
          ) : (
            <div className="p-4">
              <Empty title="ABI unavailable" detail="This contract is not verified on the explorer." />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Source code" padded={false}>
          {contract.sourceCode ? (
            <pre className="scroll-x max-h-[32rem] overflow-y-auto rounded-b-xl bg-sunken p-4 font-mono text-xs leading-relaxed text-ink">
              {contract.sourceCode}
            </pre>
          ) : (
            <div className="p-4">
              <Empty
                title="Source not published"
                detail="Only verified contracts expose their source. The bytecode is still on-chain."
              />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}

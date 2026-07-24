'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button, Input } from '@norien-live/web-ui';

/** Address entry for the portfolio lookup. */
export function PortfolioForm() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const address = value.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) router.push(`/portfolio/${address.toLowerCase()}`);
  }

  const valid = /^0x[a-fA-F0-9]{40}$/.test(value.trim());

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a wallet address (0x…)"
        spellCheck={false}
        className="sm:flex-1 font-mono text-sm"
        aria-label="Wallet address"
      />
      <Button type="submit" disabled={!valid}>
        View portfolio
      </Button>
    </form>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';

/**
 * Signs the user out.
 *
 * The @supabase/ssr browser client clears the session cookies, then a full
 * navigation to the home page discards any server-rendered signed-in state.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;

    setPending(true);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <Button tone="secondary" onClick={signOut} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}

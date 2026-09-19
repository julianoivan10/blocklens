import { redirect } from 'next/navigation';
import { Container } from '@/components/ui/section';
import { Block, BlockHead } from '@/components/ui/block';
import { Register, RegisterRow } from '@/components/data/register';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { verifySession } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { DeleteAccountControl } from '@/features/settings/delete-account-control';
import { SessionControl } from '@/features/settings/session-control';

export const metadata = { title: 'Settings' };

/**
 * Settings.
 *
 * Account, sessions, and account deletion — the three things a signed-in
 * person can actually change here.
 *
 * Data-provider status deliberately does not appear. Which upstream API
 * is configured is an operational detail of the deployment, not a user
 * preference, and listing it invited readers to treat infrastructure as
 * something they could act on. Where provenance genuinely matters to a
 * reader it is stated next to the figure itself, on the page showing it.
 *
 * A server component: the profile comes from the session, so nothing is
 * fetched in the browser. Only the two destructive/stateful controls are
 * interactive.
 */
export default async function SettingsPage() {
  const session = await verifySession();
  if (!session) redirect(ROUTES.login);

  const [profile, sessionCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, emailVerified: true, createdAt: true },
    }),
    prisma.session.count({
      where: { userId: session.id, expiresAt: { gt: new Date() } },
    }),
  ]);

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-12 max-w-[36rem]">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Settings</h1>
        <p className="t-body mt-4">Your account and this device&rsquo;s access to it.</p>
      </header>

      <div className="grid grid-cols-1 gap-x-16 gap-y-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Block>
            <BlockHead label="Account" />
            <Register className="mt-1">
              <RegisterRow label="Name" value={profile?.name || 'Not set'} />
              <RegisterRow label="Email" value={profile?.email ?? session.email} />
              <RegisterRow
                label="Email verified"
                value={
                  profile?.emailVerified ? (
                    formatDate(profile.emailVerified)
                  ) : (
                    <Badge tone="caution">Unverified</Badge>
                  )
                }
              />
              <RegisterRow
                label="Member since"
                value={profile?.createdAt ? formatDate(profile.createdAt) : '—'}
              />
            </Register>
          </Block>

          <Block className="mt-14">
            <BlockHead
              label="Danger zone"
              aside={<span className="t-micro-tight text-ink-ghost">Irreversible</span>}
            />
            <div className="mt-6">
              <DeleteAccountControl />
            </div>
          </Block>
        </div>

        <div className="lg:col-span-5">
          <Block>
            <BlockHead
              label="Sessions"
              aside={
                <span className="t-micro-tight text-ink-ghost">
                  {sessionCount} active
                </span>
              }
            />
            <div className="mt-6">
              <SessionControl activeSessions={sessionCount} />
            </div>
          </Block>
        </div>
      </div>
    </Container>
  );
}

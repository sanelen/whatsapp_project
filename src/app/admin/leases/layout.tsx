import { requireUser } from '@/lib/auth/dal';

export const dynamic = 'force-dynamic';

export default async function SecureLeaseLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

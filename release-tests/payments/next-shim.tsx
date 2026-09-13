import type { AnchorHTMLAttributes } from 'react';

export default function Link({ prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  void _prefetch;
  return <a {...props} />;
}

export function useRouter() {
  return {
    push(href: string) { document.documentElement.dataset.navigation = href; },
    refresh() { document.documentElement.dataset.refreshed = 'true'; },
  };
}

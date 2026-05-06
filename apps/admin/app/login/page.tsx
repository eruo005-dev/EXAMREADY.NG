import { Suspense } from 'react';

import { AdminLoginForm } from './login-form';

// useSearchParams() inside the client form requires a Suspense boundary
// for Next 14 to skip static prerender on the client component (otherwise
// the build fails with "useSearchParams() should be wrapped in a suspense
// boundary"). Wrapping at the page level is the canonical fix.
export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { Login } from '@rambleraptor/homestead-core/router/Login';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Login />
    </Suspense>
  );
}

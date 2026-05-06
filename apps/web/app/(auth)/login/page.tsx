import Link from 'next/link';

import { PhoneOtpForm } from '@/components/auth/PhoneOtpForm';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <PhoneOtpForm />
      <p className="text-center text-sm text-muted-foreground">
        New to ExamReady?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

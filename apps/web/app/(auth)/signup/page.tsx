import Link from 'next/link';

import { PhoneOtpForm } from '@/components/auth/PhoneOtpForm';

export const metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <PhoneOtpForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

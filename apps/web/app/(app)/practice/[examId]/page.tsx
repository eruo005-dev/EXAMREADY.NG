import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { exams, users } from '@examready/db/schema';

import { PracticeStarter } from './PracticeStarter';
import { createServerClient } from '@/lib/auth/server';
import { db } from '@/lib/db';

export default async function PracticeExamPage({ params }: { params: { examId: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!profile) redirect('/login');

  const [exam] = await db.select().from(exams).where(eq(exams.id, params.examId));
  if (!exam) {
    return (
      <div className="container py-12 text-center">
        <h2 className="text-xl font-semibold">Exam not found</h2>
        <p className="text-muted-foreground">Pick an exam from the dashboard.</p>
      </div>
    );
  }

  return (
    <PracticeStarter
      examId={exam.id}
      examName={exam.name}
      subscriptionTier={profile.subscriptionTier}
      age={profile.age}
    />
  );
}

'use client';

import { Badge, Card, CardContent, Input } from '@examready/ui';
import { useMemo, useState } from 'react';


/**
 * Hand-curated lookup of common Nigerian undergraduate courses → JAMB
 * UTME subject combinations. English Language is compulsory and omitted
 * from the list (assumed). Source: JAMB e-Brochure 2024-2026.
 *
 * This is a starter set covering the highest-demand courses. The full
 * JAMB e-Brochure has 200+ programmes; we'll expand the list as student
 * search queries surface gaps. See the SEO tracking dashboard.
 */
const COMBINATIONS: Array<{ course: string; combo: string[]; notes?: string }> = [
  { course: 'Medicine and Surgery', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Pharmacy', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Nursing Science', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Dentistry', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Veterinary Medicine', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Medical Laboratory Science', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Optometry', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Physiotherapy', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Anatomy', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Civil Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Mechanical Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Electrical/Electronic Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Computer Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Petroleum Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Chemical Engineering', combo: ['Mathematics', 'Physics', 'Chemistry'] },
  { course: 'Computer Science', combo: ['Mathematics', 'Physics', 'Chemistry or Biology'] },
  { course: 'Software Engineering', combo: ['Mathematics', 'Physics', 'Chemistry or Biology'] },
  { course: 'Architecture', combo: ['Mathematics', 'Physics', 'Chemistry or Geography'] },
  { course: 'Estate Management', combo: ['Mathematics', 'Economics', 'Geography or Physics'] },
  { course: 'Quantity Surveying', combo: ['Mathematics', 'Physics', 'Chemistry or Geography'] },
  { course: 'Law', combo: ['Literature in English', 'Government or History', 'CRK / IRK / any Arts subject'] },
  { course: 'Mass Communication', combo: ['Literature in English', 'Government', 'any Arts/SocSci subject'] },
  { course: 'International Relations', combo: ['Government', 'Economics', 'any Arts subject'] },
  { course: 'Political Science', combo: ['Government', 'Economics', 'any Arts subject'] },
  { course: 'Sociology', combo: ['Government', 'Economics', 'any SocSci/Arts subject'] },
  { course: 'Psychology', combo: ['Mathematics or Biology', 'Government or Economics', 'any 3rd subject'] },
  { course: 'Economics', combo: ['Mathematics', 'Economics', 'Government / Geography / Commerce'] },
  { course: 'Accounting', combo: ['Mathematics', 'Economics', 'Commerce or Government'] },
  { course: 'Banking and Finance', combo: ['Mathematics', 'Economics', 'Commerce or Government'] },
  { course: 'Business Administration', combo: ['Mathematics', 'Economics', 'Commerce or Government'] },
  { course: 'Marketing', combo: ['Mathematics', 'Economics', 'Commerce or Government'] },
  { course: 'English Language', combo: ['Literature in English', 'any 2 Arts subjects'] },
  { course: 'History', combo: ['History', 'Government', 'CRK / IRK / Literature'] },
  { course: 'Theatre Arts', combo: ['Literature in English', 'CRK / IRK / Government', 'any Arts subject'] },
  { course: 'Education (Maths)', combo: ['Mathematics', 'any 2 Sciences'] },
  { course: 'Education (English)', combo: ['Literature in English', 'any 2 Arts subjects'] },
  { course: 'Agricultural Science', combo: ['Chemistry', 'Biology', 'Agriculture or Mathematics'] },
  { course: 'Biochemistry', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Microbiology', combo: ['Physics', 'Chemistry', 'Biology'] },
  { course: 'Geology', combo: ['Mathematics', 'Physics', 'Chemistry or Geography'] },
  { course: 'Statistics', combo: ['Mathematics', 'Physics or Economics', 'any 3rd Science/SocSci'] },
];

export function SubjectCombinationsLookup() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMBINATIONS;
    return COMBINATIONS.filter((c) => c.course.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="mt-8">
      <Input
        placeholder="Search a course (e.g. Medicine, Law, Computer Science)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="mt-6 space-y-3">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No match. Try a related course name or message us if you think this is missing.
          </p>
        ) : (
          results.map((c) => (
            <Card key={c.course}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{c.course}</p>
                  <Badge variant="outline">+ English Language (compulsory)</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.combo.map((subject) => (
                    <Badge key={subject} variant="secondary">
                      {subject}
                    </Badge>
                  ))}
                </div>
                {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

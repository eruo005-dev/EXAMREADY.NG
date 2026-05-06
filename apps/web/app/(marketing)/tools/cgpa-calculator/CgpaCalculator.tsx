'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@examready/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';


type Scale = '5.0' | '4.0';

const GRADE_POINTS: Record<Scale, Record<string, number>> = {
  '5.0': { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 },
  '4.0': { A: 4, B: 3, C: 2, D: 1, F: 0 },
};

const CLASS_THRESHOLDS: Record<Scale, Array<{ name: string; min: number }>> = {
  '5.0': [
    { name: 'First Class', min: 4.5 },
    { name: 'Second Class Upper (2:1)', min: 3.5 },
    { name: 'Second Class Lower (2:2)', min: 2.4 },
    { name: 'Third Class', min: 1.5 },
    { name: 'Pass', min: 1.0 },
  ],
  '4.0': [
    { name: 'First Class', min: 3.5 },
    { name: 'Second Class Upper (2:1)', min: 3.0 },
    { name: 'Second Class Lower (2:2)', min: 2.0 },
    { name: 'Third Class', min: 1.0 },
  ],
};

type Course = { id: number; name: string; grade: string; credits: number };

let nextId = 0;
const newCourse = (): Course => ({ id: nextId++, name: '', grade: 'A', credits: 3 });

export function CgpaCalculator() {
  const [scale, setScale] = useState<Scale>('5.0');
  const [courses, setCourses] = useState<Course[]>(() => [newCourse(), newCourse(), newCourse()]);

  const addCourse = () => setCourses((prev) => [...prev, newCourse()]);
  const removeCourse = (id: number) =>
    setCourses((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  const updateCourse = (id: number, patch: Partial<Course>) =>
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const result = useMemo(() => {
    const grades = GRADE_POINTS[scale];
    let totalPoints = 0;
    let totalCredits = 0;
    for (const c of courses) {
      const points = grades[c.grade.toUpperCase()];
      if (points === undefined || c.credits <= 0) continue;
      totalPoints += points * c.credits;
      totalCredits += c.credits;
    }
    if (totalCredits === 0) return { gpa: 0, totalCredits: 0, classOfDegree: '—' };

    const gpa = totalPoints / totalCredits;
    const classOfDegree =
      CLASS_THRESHOLDS[scale].find((t) => gpa >= t.min)?.name ?? 'Below pass mark';
    return { gpa, totalCredits, classOfDegree };
  }, [scale, courses]);

  const validGrades = Object.keys(GRADE_POINTS[scale]);

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="scale">Grading scale</Label>
        <Select value={scale} onValueChange={(v) => setScale(v as Scale)}>
          <SelectTrigger id="scale" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5.0">5.0</SelectItem>
            <SelectItem value="4.0">4.0</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium uppercase text-muted-foreground">
            <div className="col-span-6">Course (optional)</div>
            <div className="col-span-3">Grade</div>
            <div className="col-span-2">Credits</div>
            <div className="col-span-1" />
          </div>
          {courses.map((c) => (
            <div key={c.id} className="grid grid-cols-12 items-center gap-2">
              <Input
                className="col-span-6"
                placeholder={`Course name`}
                value={c.name}
                onChange={(e) => updateCourse(c.id, { name: e.target.value })}
              />
              <Select
                value={c.grade}
                onValueChange={(v) => updateCourse(c.id, { grade: v })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {validGrades.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="col-span-2"
                type="number"
                min={1}
                max={10}
                value={c.credits}
                onChange={(e) => updateCourse(c.id, { credits: parseInt(e.target.value, 10) || 0 })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="col-span-1"
                aria-label="Remove course"
                onClick={() => removeCourse(c.id)}
                disabled={courses.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addCourse} className="mt-2">
            <Plus className="h-4 w-4" /> Add course
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-sm text-muted-foreground">GPA / CGPA</p>
            <p className="text-3xl font-bold">{result.gpa.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {result.totalCredits} total credit units
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {result.classOfDegree}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Drizzle `relations()` declarations — kept in a separate file from the table
 * definitions so we can avoid circular references between schema modules.
 *
 * These are only used by Drizzle's relational query builder
 * (db.query.users.findFirst({ with: { ... } })). FK constraints themselves
 * are declared via raw SQL in the migration files.
 */
import { relations } from 'drizzle-orm';

import {
  adImpressions,
  attemptAnswers,
  attempts,
  bookmarks,
  exams,
  notificationLog,
  options,
  payments,
  questions,
  readyPointsLog,
  referrals,
  studyGroupMembers,
  studyGroups,
  subjects,
  subscriptions,
  targetExams,
  topics,
  users,
} from './schema';

export const usersRelations = relations(users, ({ one, many }) => ({
  parent: one(users, {
    fields: [users.parentUserId],
    references: [users.id],
    relationName: 'parent_child',
  }),
  children: many(users, { relationName: 'parent_child' }),
  referredBy: one(users, {
    fields: [users.referredByUserId],
    references: [users.id],
    relationName: 'referrer_referred',
  }),
  referredUsers: many(users, { relationName: 'referrer_referred' }),
  targetExams: many(targetExams),
  attempts: many(attempts),
  bookmarks: many(bookmarks),
  subscriptions: many(subscriptions),
  payments: many(payments),
  notifications: many(notificationLog),
  pointsEntries: many(readyPointsLog),
  groupMemberships: many(studyGroupMembers),
  ownedGroups: many(studyGroups),
  adImpressions: many(adImpressions),
}));

export const targetExamsRelations = relations(targetExams, ({ one }) => ({
  user: one(users, { fields: [targetExams.userId], references: [users.id] }),
  exam: one(exams, { fields: [targetExams.examId], references: [exams.id] }),
}));

export const examsRelations = relations(exams, ({ many }) => ({
  subjects: many(subjects),
  questions: many(questions),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  exam: one(exams, { fields: [subjects.examId], references: [exams.id] }),
  topics: many(topics),
  questions: many(questions),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  parent: one(topics, {
    fields: [topics.parentTopicId],
    references: [topics.id],
    relationName: 'topic_subtopic',
  }),
  children: many(topics, { relationName: 'topic_subtopic' }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  exam: one(exams, { fields: [questions.examId], references: [exams.id] }),
  subject: one(subjects, { fields: [questions.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
  options: many(options),
  attemptAnswers: many(attemptAnswers),
  bookmarks: many(bookmarks),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  user: one(users, { fields: [attempts.userId], references: [users.id] }),
  exam: one(exams, { fields: [attempts.examId], references: [exams.id] }),
  subject: one(subjects, { fields: [attempts.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [attempts.topicId], references: [topics.id] }),
  answers: many(attemptAnswers),
}));

export const attemptAnswersRelations = relations(attemptAnswers, ({ one }) => ({
  attempt: one(attempts, { fields: [attemptAnswers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [attemptAnswers.questionId], references: [questions.id] }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  question: one(questions, { fields: [bookmarks.questionId], references: [questions.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const studyGroupsRelations = relations(studyGroups, ({ one, many }) => ({
  owner: one(users, { fields: [studyGroups.ownerUserId], references: [users.id] }),
  exam: one(exams, { fields: [studyGroups.examId], references: [exams.id] }),
  members: many(studyGroupMembers),
}));

export const studyGroupMembersRelations = relations(studyGroupMembers, ({ one }) => ({
  group: one(studyGroups, {
    fields: [studyGroupMembers.groupId],
    references: [studyGroups.id],
  }),
  user: one(users, { fields: [studyGroupMembers.userId], references: [users.id] }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerUserId],
    references: [users.id],
    relationName: 'referrer',
  }),
  referred: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
    relationName: 'referred',
  }),
}));

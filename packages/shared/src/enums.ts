import { z } from 'zod';

// Stringly-typed CRM columns (see backend/prisma/schema.prisma). Phase 3 turns them into database enums.
export const membershipStage = z.enum([
  'visitor',
  'new_member',
  'active_member',
  'core_member',
  'leader',
  'at_risk',
  'inactive',
]);
export const riskLevel = z.enum(['low', 'medium', 'high']);
export const interactionType = z.enum([
  'email_sent',
  'email_opened',
  'sms_sent',
  'sms_replied',
  'call_made',
  'visit_logged',
  'note_added',
]);
export const channel = z.enum(['email', 'sms', 'phone', 'in_person', 'social_media']);
export const priority = z.enum(['low', 'normal', 'high', 'urgent']);
export const interactionCategory = z.enum([
  'welcome',
  'follow_up',
  'pastoral_care',
  'event_invitation',
  'giving_reminder',
  'volunteer_request',
]);
export const milestoneCategory = z.enum([
  'general',
  'spiritual',
  'service',
  'family',
  'personal',
  'ministry',
]);
export const impact = z.enum(['low', 'medium', 'high']);
export const noteType = z.enum([
  'general',
  'pastoral_care',
  'follow_up',
  'prayer_request',
  'concern',
]);

export type MembershipStage = z.infer<typeof membershipStage>;
export type RiskLevel = z.infer<typeof riskLevel>;
export type InteractionType = z.infer<typeof interactionType>;
export type Channel = z.infer<typeof channel>;
export type Priority = z.infer<typeof priority>;
export type InteractionCategory = z.infer<typeof interactionCategory>;
export type MilestoneCategory = z.infer<typeof milestoneCategory>;
export type Impact = z.infer<typeof impact>;
export type NoteType = z.infer<typeof noteType>;

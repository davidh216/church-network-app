import { z } from 'zod';
import {
  channel,
  impact,
  interactionCategory,
  interactionType,
  milestoneCategory,
  milestoneType,
  noteType,
  priority,
} from './enums.js';
import {
  boundedText,
  DATE_MESSAGE,
  MAX_PAGE_SIZE,
  requiredText,
  type WithNumericPaging,
} from './primitives.js';

// POST /api/member-details/:id/interactions (staff)
export const addInteractionInput = z.object({
  interactionType,
  channel,
  subject: boundedText('Subject', 200).optional(),
  content: boundedText('Content', 10_000).optional(),
  category: interactionCategory.optional(),
  priority: priority.default('normal'),
  responseRequired: z.boolean().default(false),
});

// POST /api/member-details/:id/milestones (staff)
export const addMilestoneInput = z.object({
  milestoneType,
  title: requiredText('Title', 200, 'Please enter a title'),
  description: boundedText('Description', 2000).optional(),
  achievedDate: z.coerce.date({ error: DATE_MESSAGE }),
  category: milestoneCategory.default('general'),
  impact: impact.default('medium'),
});

// POST /api/member-details/:id/notes (staff)
export const addNoteInput = z.object({
  title: boundedText('Title', 200).optional(),
  content: requiredText('Note', 10_000, 'Please enter the note'),
  noteType: noteType.default('general'),
  isPrivate: z.boolean().default(false),
  isFollowUp: z.boolean().default(false),
  followUpDate: z.coerce.date({ error: DATE_MESSAGE }).optional(),
});

export type AddInteractionInput = z.input<typeof addInteractionInput>;
export type AddMilestoneInput = z.input<typeof addMilestoneInput>;
export type AddNoteInput = z.input<typeof addNoteInput>;

// GET /api/member-details/:id/timeline (staff): the computed feed of a member's interactions,
// milestones, visible notes and attended services, newest first.
export const TIMELINE_KINDS = ['interaction', 'milestone', 'note', 'attendance'] as const;
export const timelineKind = z.enum(TIMELINE_KINDS);
export const DEFAULT_TIMELINE_PAGE_SIZE = 20;
// The feed is merged from four tables, so deep pages cost more; 100 pages of 100 items covers any
// realistic member history. `total` is not capped, so clients must not page past this (the
// profile's Next button stops here).
export const MAX_TIMELINE_PAGE = 100;

export const timelineQuery = z.object({
  page: z.coerce.number().int().min(1).max(MAX_TIMELINE_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_TIMELINE_PAGE_SIZE),
});

export type TimelineKind = z.infer<typeof timelineKind>;
export type TimelineQuery = z.input<typeof timelineQuery>;
export type ListTimelineParams = WithNumericPaging<TimelineQuery>;

// One entry of the timeline feed. `date` is an ISO timestamp in responses; `id` is the id of the
// source row (unique within its kind). `dateOnly` is true when `date` is a calendar date sent as
// UTC midnight (attendance, and milestones whose achievedDate has no time of day): show its UTC
// day, never the day in the viewer's time zone.
export interface TimelineItem {
  kind: TimelineKind;
  id: string;
  date: string;
  dateOnly: boolean;
  title: string;
  summary: string | null;
}

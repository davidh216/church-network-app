import { z } from 'zod';

// The single source of every enum list (PHASE3_SPECS.md 1.1). Each tuple mirrors a Prisma `enum`
// in backend/prisma/schema.prisma in the same order (a backend test compares them with
// `Prisma.$Enums`). Values are the lowercase snake_case strings the database already stored, so
// existing rows cast without rewriting; Postgres sorts an enum column in declaration order.

export const MEMBERSHIP_STAGES = [
  'visitor',
  'new_member',
  'active_member',
  'core_member',
  'leader',
  'at_risk',
  'inactive',
] as const;
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed', 'separated'] as const;
export const MEMBERSHIP_TYPES = ['member', 'visitor', 'regular_attendee', 'inactive'] as const;
export const MEDIA_TYPES = ['YOUTUBE_VIDEO'] as const;
export const RELATIONSHIP_TYPES = [
  'spouse',
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'other',
] as const;
export const GROUP_TYPES = ['ministry', 'small_group', 'committee', 'service_team'] as const;
export const GROUP_MEMBER_ROLES = ['leader', 'co_leader', 'member'] as const;
export const SERVICE_TYPES = [
  'sunday_service',
  'bible_study',
  'prayer_meeting',
  'special_event',
  'other',
] as const;
export const INTERACTION_TYPES = [
  'email_sent',
  'email_opened',
  'sms_sent',
  'sms_replied',
  'call_made',
  'visit_logged',
  'note_added',
] as const;
export const CHANNELS = ['email', 'sms', 'phone', 'in_person', 'social_media'] as const;
export const INTERACTION_STATUSES = ['scheduled', 'completed', 'failed'] as const;
export const INTERACTION_CATEGORIES = [
  'welcome',
  'follow_up',
  'pastoral_care',
  'event_invitation',
  'giving_reminder',
  'volunteer_request',
] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const MILESTONE_TYPES = [
  'first_visit',
  'baptism',
  'confirmation',
  'wedding',
  'first_volunteer',
  'leadership_role',
  'anniversary',
  'other',
] as const;
export const MILESTONE_CATEGORIES = [
  'spiritual',
  'service',
  'family',
  'personal',
  'ministry',
  'general',
] as const;
export const IMPACTS = ['low', 'medium', 'high'] as const;
export const NOTE_TYPES = [
  'general',
  'pastoral_care',
  'follow_up',
  'prayer_request',
  'concern',
] as const;
export const TAG_CATEGORIES = ['ministry', 'demographic', 'interest', 'status', 'general'] as const;
export const ACTIVITY_TYPES = [
  'service_attendance',
  'event_attendance',
  'donation',
  'volunteer',
  'ministry_participation',
  'communication_open',
  'profile_update',
  'other',
] as const;

export const membershipStage = z.enum(MEMBERSHIP_STAGES);
export const riskLevel = z.enum(RISK_LEVELS);
export const gender = z.enum(GENDERS);
export const maritalStatus = z.enum(MARITAL_STATUSES);
export const membershipType = z.enum(MEMBERSHIP_TYPES);
// Only YouTube videos can be added (decision P3-D5).
export const mediaType = z.enum(MEDIA_TYPES, { error: 'Only YouTube videos can be added' });
export const relationshipType = z.enum(RELATIONSHIP_TYPES);
export const groupType = z.enum(GROUP_TYPES);
export const groupMemberRole = z.enum(GROUP_MEMBER_ROLES);
export const serviceType = z.enum(SERVICE_TYPES);
export const interactionType = z.enum(INTERACTION_TYPES);
export const channel = z.enum(CHANNELS);
export const interactionStatus = z.enum(INTERACTION_STATUSES);
export const interactionCategory = z.enum(INTERACTION_CATEGORIES);
export const priority = z.enum(PRIORITIES);
export const milestoneType = z.enum(MILESTONE_TYPES, { error: 'Choose a milestone type' });
export const milestoneCategory = z.enum(MILESTONE_CATEGORIES);
export const impact = z.enum(IMPACTS);
export const noteType = z.enum(NOTE_TYPES);
export const tagCategory = z.enum(TAG_CATEGORIES);
export const activityType = z.enum(ACTIVITY_TYPES, { error: 'Choose an activity type' });

// Every shared enum by its Prisma enum name (the backend parity test iterates this map).
export const PRISMA_ENUMS = {
  MembershipStage: MEMBERSHIP_STAGES,
  RiskLevel: RISK_LEVELS,
  Gender: GENDERS,
  MaritalStatus: MARITAL_STATUSES,
  MembershipType: MEMBERSHIP_TYPES,
  MediaType: MEDIA_TYPES,
  RelationshipType: RELATIONSHIP_TYPES,
  GroupType: GROUP_TYPES,
  GroupMemberRole: GROUP_MEMBER_ROLES,
  ServiceType: SERVICE_TYPES,
  InteractionType: INTERACTION_TYPES,
  Channel: CHANNELS,
  InteractionStatus: INTERACTION_STATUSES,
  InteractionCategory: INTERACTION_CATEGORIES,
  Priority: PRIORITIES,
  MilestoneType: MILESTONE_TYPES,
  MilestoneCategory: MILESTONE_CATEGORIES,
  Impact: IMPACTS,
  NoteType: NOTE_TYPES,
  TagCategory: TAG_CATEGORIES,
  ActivityType: ACTIVITY_TYPES,
} as const satisfies Record<string, readonly string[]>;

export type MembershipStage = z.infer<typeof membershipStage>;
export type RiskLevel = z.infer<typeof riskLevel>;
export type Gender = z.infer<typeof gender>;
export type MaritalStatus = z.infer<typeof maritalStatus>;
export type MembershipType = z.infer<typeof membershipType>;
export type MediaType = z.infer<typeof mediaType>;
export type RelationshipType = z.infer<typeof relationshipType>;
export type GroupType = z.infer<typeof groupType>;
export type GroupMemberRole = z.infer<typeof groupMemberRole>;
export type ServiceType = z.infer<typeof serviceType>;
export type InteractionType = z.infer<typeof interactionType>;
export type Channel = z.infer<typeof channel>;
export type InteractionStatus = z.infer<typeof interactionStatus>;
export type InteractionCategory = z.infer<typeof interactionCategory>;
export type Priority = z.infer<typeof priority>;
export type MilestoneType = z.infer<typeof milestoneType>;
export type MilestoneCategory = z.infer<typeof milestoneCategory>;
export type Impact = z.infer<typeof impact>;
export type NoteType = z.infer<typeof noteType>;
export type TagCategory = z.infer<typeof tagCategory>;
export type ActivityType = z.infer<typeof activityType>;

// The display label of an enum value: "core_member" -> "Core Member",
// "YOUTUBE_VIDEO" -> "Youtube Video". Frontend selects and badges derive their text from this.
export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

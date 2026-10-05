// Domain types for the frontend. Request bodies are the inferred input types of the
// @embrace/shared schemas the API validates with; response shapes stay local because the
// shared package only describes inputs.

import type {
  Channel,
  Gender,
  Impact,
  InteractionCategory,
  InteractionStatus,
  InteractionType,
  MaritalStatus,
  MediaType,
  MembershipStage,
  MembershipType,
  MilestoneCategory,
  MilestoneType,
  NoteType,
  Priority,
  RelationshipType,
  RiskLevel,
  SearchQuery,
} from '@embrace/shared';

export type {
  CreateMediaInput,
  CreateSavedSearchInput,
  CreateUserInput,
  LoginInput,
  RegisterInput,
  SearchQuery,
  UpdateUserInput,
} from '@embrace/shared';

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions?: string[];
}

interface UserRole {
  role: Role;
}

export interface Engagement {
  engagementScore: number;
  membershipStage: MembershipStage;
  riskLevel: RiskLevel;
  lastActivity?: string | null;
  attendanceScore?: number;
  communityScore?: number;
  communicationScore?: number;
}

/** The authenticated user as returned by /api/auth/login and /api/auth/me. */
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatar?: string | null;
  bio?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  membershipDate?: string | null;
  volunteerSkills?: string[];
  interests?: string[];
  roles: UserRole[];
}

/**
 * A row from /api/users. Plain members receive a reduced directory projection
 * (no email, phone, bio or engagement), so those fields are optional.
 */
export interface Member {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  bio?: string | null;
  avatar?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  membershipDate?: string | null;
  lastLoginAt?: string | null;
  roles: UserRole[];
  engagement?: Engagement | null;
}

export interface MediaItem {
  id: string;
  title: string;
  description?: string | null;
  type: MediaType;
  url: string;
  /** The YouTube video id, or null when the stored URL cannot be embedded. */
  videoId?: string | null;
  thumbnailUrl?: string | null;
  tags: string[];
  createdAt: string;
  /** Null once the uploader's account has been deleted (the media is kept). */
  uploadedBy?: {
    id: string;
    name: string;
  } | null;
}

/**
 * A saved search (GET /api/users/saved-searches). The API validates the stored query again on
 * load: a stale one comes back as stored with `invalid: true` and must not be applied.
 */
interface SavedSearchBase {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  isPublic: boolean;
  usageCount?: number;
  lastUsed?: string | null;
  /** Who saved it (list responses only). */
  createdBy?: { id: string; name: string };
}

export type SavedSearch = SavedSearchBase &
  ({ invalid: false; query: SearchQuery } | { invalid: true; query: unknown });

/** A member as returned by /api/member-details/:id (staff only). */
export interface MemberDetails {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  isActive: boolean;

  // Enhanced member information
  dateOfBirth?: string;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  occupation?: string;
  emergencyContact?: string;
  emergencyPhone?: string;

  // Church-specific information
  membershipDate?: string;
  baptismDate?: string;
  confirmationDate?: string;
  membershipType?: MembershipType;
  previousChurch?: string;
  howHeardAboutUs?: string;

  // Address information
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;

  // Communication preferences
  emailOptIn: boolean;
  smsOptIn: boolean;
  mailOptIn: boolean;

  // Family information
  familyId?: string;
  /** Derived on the server from the family's headOfFamilyId. */
  isHeadOfFamily: boolean;

  // Notes and tracking
  notes?: string;
  /** Date of the latest attended service (UTC midnight), derived on the server. */
  lastAttended?: string | null;
  volunteerSkills?: string[];
  interests?: string[];

  createdAt: string;
  updatedAt: string;
  roles: Array<{
    role: {
      id: string;
      name: string;
      description?: string;
    };
  }>;

  // Phase 3: Enhanced data
  engagement?: {
    engagementScore: number;
    membershipStage: MembershipStage;
    riskLevel: RiskLevel;
    lastActivity?: string;
    attendanceScore: number;
    communityScore: number;
    communicationScore: number;
  };
  familyMembers?: Array<{
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    isActive: boolean;
    relationshipType: RelationshipType;
    isPrimary: boolean;
  }>;
  interactions?: Array<{
    id: string;
    interactionType: InteractionType;
    subject?: string;
    content?: string;
    channel: Channel;
    status: InteractionStatus;
    category?: InteractionCategory;
    priority: Priority;
    responseRequired: boolean;
    responseReceived: boolean;
    createdAt: string;
    completedAt?: string;
    /** The staff member who recorded it, when known. */
    staffMember?: { id: string; name: string } | null;
  }>;
  milestones?: Array<{
    id: string;
    milestoneType: MilestoneType;
    title: string;
    description?: string;
    achievedDate: string;
    category: MilestoneCategory;
    impact: Impact;
    isPublic: boolean;
    celebrated: boolean;
  }>;
  memberNotes?: Array<{
    id: string;
    title?: string;
    content: string;
    noteType: NoteType;
    isPrivate: boolean;
    isFollowUp: boolean;
    followUpDate?: string;
    createdAt: string;
    author?: { id: string; name: string };
  }>;
}

/** Aggregates from /api/analytics/members (staff only). */
export interface MemberAnalytics {
  totalMembers: number;
  activeMembers: number;
  newMembersThisMonth: number;
  /** Active accounts whose riskLevel is 'high' (stage at_risk or inactive); not medium risk. */
  atRiskMembers: number;
  averageEngagementScore: number;
  /** Averages of the stored engagement rows of active accounts. */
  averageScores?: {
    engagementScore: number;
    attendanceScore: number;
    communityScore: number;
    communicationScore: number;
  };
  topEngagedMembers: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
    };
    engagementScore: number;
    membershipStage: MembershipStage;
  }>;
  membershipStageDistribution: Partial<Record<MembershipStage, number>>;
  riskLevelDistribution: Partial<Record<RiskLevel, number>>;
}

/** Success envelope shared by every API response (`{ success: true, ...payload }`). */
export type ApiEnvelope<T> = { success: true } & T;

/** Error body shape returned by the API (contract 1.2). */
export interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: Record<string, string[]>;
  requestId?: string;
}

/** Response of POST /api/auth/register. The account waits for administrator approval. */
export interface RegisterResult {
  pendingApproval: boolean;
  message: string;
}

export function hasRole(user: Pick<User, 'roles'> | null | undefined, ...names: string[]): boolean {
  return !!user?.roles?.some((ur) => names.includes(ur.role.name));
}

export function isStaff(user: Pick<User, 'roles'> | null | undefined): boolean {
  return hasRole(user, 'admin', 'leader');
}

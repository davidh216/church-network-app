// Shared domain types for the frontend. Mirrors the backend API responses.
// Phase 2 moves these into a shared package with zod schemas used by both sides.

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions?: string;
}

export interface UserRole {
  role: Role;
}

export interface Engagement {
  engagementScore: number;
  membershipStage: string;
  riskLevel: string;
  lastActivity?: string | null;
  attendanceScore?: number;
  givingScore?: number;
  volunteerScore?: number;
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
  type: string;
  url: string;
  thumbnailUrl?: string | null;
  /** JSON-encoded string array. */
  tags: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
  };
}

export interface SearchCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic: 'AND' | 'OR';
}

/** Opaque saved-search query payload. The evaluator is not implemented yet (Phase 2). */
export type SearchQuery = Record<string, unknown>;

export interface SavedSearch {
  id: string;
  name: string;
  description: string | null;
  query: SearchQuery;
  createdAt: string;
  isPublic: boolean;
  usageCount?: number;
  lastUsed?: string | null;
}

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
  gender?: string;
  maritalStatus?: string;
  occupation?: string;
  emergencyContact?: string;
  emergencyPhone?: string;

  // Church-specific information
  membershipDate?: string;
  baptismDate?: string;
  confirmationDate?: string;
  membershipType?: string;
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
  isHeadOfFamily: boolean;

  // Notes and tracking
  notes?: string;
  lastAttended?: string;
  volunteerSkills?: string;
  interests?: string;

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
    membershipStage: string;
    riskLevel: string;
    lastActivity?: string;
    attendanceScore: number;
    givingScore: number;
    volunteerScore: number;
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
    relationshipType: string;
    isPrimary: boolean;
  }>;
  interactions?: Array<{
    id: string;
    interactionType: string;
    subject?: string;
    content?: string;
    channel: string;
    status: string;
    category?: string;
    priority: string;
    responseRequired: boolean;
    responseReceived: boolean;
    createdAt: string;
    completedAt?: string;
  }>;
  milestones?: Array<{
    id: string;
    milestoneType: string;
    title: string;
    description?: string;
    achievedDate: string;
    category: string;
    impact: string;
    isPublic: boolean;
    celebrated: boolean;
  }>;
  memberNotes?: Array<{
    id: string;
    title?: string;
    content: string;
    noteType: string;
    isPrivate: boolean;
    isFollowUp: boolean;
    followUpDate?: string;
    createdAt: string;
  }>;
  timelineActivities?: Array<{
    id: string;
    activityDate: string;
    activityType: string;
    title: string;
    description?: string;
    category: string;
    impact: string;
  }>;
}

/** Aggregates from /api/analytics/members (staff only). */
export interface MemberAnalytics {
  totalMembers: number;
  activeMembers: number;
  newMembersThisMonth: number;
  atRiskMembers: number;
  averageEngagementScore: number;
  topEngagedMembers: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
    };
    engagementScore: number;
    membershipStage: string;
  }>;
  membershipStageDistribution: Record<string, number>;
  riskLevelDistribution: Record<string, number>;
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
  user: Pick<User, 'id' | 'email' | 'name' | 'isActive' | 'createdAt'>;
}

/** Body of POST /api/users (staff only). */
export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
  roleIds?: string[];
}

/** Body of PUT /api/users/:id. Omitted fields are left unchanged. */
export interface UpdateUserInput {
  name?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
  roleIds?: string[];
}

/** Body of POST /api/media (staff only). Only YouTube videos are supported. */
export interface CreateMediaInput {
  title: string;
  description?: string;
  type: 'YOUTUBE_VIDEO';
  url: string;
  tags: string[];
}

/** Body of POST /api/users/saved-searches. */
export interface CreateSavedSearchInput {
  name: string;
  description?: string;
  query: SearchQuery;
  isPublic?: boolean;
}

export function hasRole(user: Pick<User, 'roles'> | null | undefined, ...names: string[]): boolean {
  return !!user?.roles?.some((ur) => names.includes(ur.role.name));
}

export function isStaff(user: Pick<User, 'roles'> | null | undefined): boolean {
  return hasRole(user, 'admin', 'leader');
}

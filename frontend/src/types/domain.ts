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

export function hasRole(user: Pick<User, 'roles'> | null | undefined, ...names: string[]): boolean {
  return !!user?.roles?.some((ur) => names.includes(ur.role.name));
}

export function isStaff(user: Pick<User, 'roles'> | null | undefined): boolean {
  return hasRole(user, 'admin', 'leader');
}

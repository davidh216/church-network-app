import { describe, expectTypeOf, it } from 'vitest';
import type {
  ListMediaParams,
  ListMediaQuery,
  ListUsersParams,
  ListUsersQuery,
  MediaType,
  MembershipStage,
  RiskLevel,
  SortOrder,
  UserSortField,
} from '../src';

// Type-level checks (run by `tsc --noEmit`; the runtime assertions are no-ops).
describe('frontend-facing list parameter types', () => {
  it('ListUsersParams has numeric paging and the schema input types elsewhere', () => {
    expectTypeOf<ListUsersParams>().toEqualTypeOf<{
      q?: string | undefined;
      role?: string | undefined;
      status?: 'active' | 'inactive' | undefined;
      stage?: MembershipStage | undefined;
      risk?: RiskLevel | undefined;
      joinedFrom?: string | undefined;
      joinedTo?: string | undefined;
      sort?: UserSortField | undefined;
      order?: SortOrder | undefined;
      page?: number | undefined;
      pageSize?: number | undefined;
    }>();
    expectTypeOf<ListUsersParams['page']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ListUsersParams['pageSize']>().toEqualTypeOf<number | undefined>();
    // The schema's own input type for the coerced paging fields is not a number.
    expectTypeOf<ListUsersQuery['page']>().not.toEqualTypeOf<number | undefined>();
    expectTypeOf<ListUsersParams['q']>().toEqualTypeOf<ListUsersQuery['q']>();
    expectTypeOf<ListUsersParams['sort']>().toEqualTypeOf<ListUsersQuery['sort']>();
    expectTypeOf<{ page: 2; q: 'ann' }>().toExtend<ListUsersParams>();
    expectTypeOf<{ page: '2' }>().not.toExtend<ListUsersParams>();
  });

  it('ListMediaParams has numeric paging and the schema input types elsewhere', () => {
    expectTypeOf<ListMediaParams>().toEqualTypeOf<{
      type?: MediaType | undefined;
      tag?: string | undefined;
      search?: string | undefined;
      page?: number | undefined;
      pageSize?: number | undefined;
    }>();
    expectTypeOf<ListMediaParams['search']>().toEqualTypeOf<ListMediaQuery['search']>();
    expectTypeOf<{ pageSize: 24; tag: 'Worship' }>().toExtend<ListMediaParams>();
    expectTypeOf<{ pageSize: '24' }>().not.toExtend<ListMediaParams>();
  });
});

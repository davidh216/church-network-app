import { useMemo } from 'react';
import { isStaffGroup } from '@embrace/shared';
import { useGroups } from '@/lib/queries/groups';
import { useTags } from '@/lib/queries/tags';
import type { SearchChoices, SearchNames } from './searchNames';

/**
 * Staff only: the tag and group names for the member search, and the choices its inputs offer.
 * Tags include archived ones (their assignments still match, so they stay searchable); groups
 * offer active ones only (only active memberships of active groups match), but every group is
 * named. Disabled for members, who may not list tags or archived groups.
 */
export function useSearchNames(staff: boolean): { names: SearchNames; choices: SearchChoices } {
  const tags = useTags(true, { enabled: staff });
  const groups = useGroups({ status: 'all' }, { enabled: staff });
  return useMemo(() => {
    const tagList = tags.data ?? [];
    const groupList = (groups.data ?? []).filter(isStaffGroup);
    return {
      names: {
        tags: tags.data ? new Map(tagList.map((t) => [t.id, t.name])) : null,
        groups: groups.data ? new Map(groupList.map((g) => [g.id, g.name])) : null,
      },
      choices: {
        tag: tagList.map((t) => [t.id, t.isActive ? t.name : `${t.name} (archived)`]),
        group: groupList.filter((g) => g.isActive).map((g) => [g.id, g.name]),
      },
    };
  }, [tags.data, groups.data]);
}

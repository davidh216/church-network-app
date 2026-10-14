import Link from 'next/link';
import type { AuditEvent } from '@embrace/shared';
import { actionLabel, describeDetails, targetLink, targetText } from '@/lib/audit/display';
import { formatLocalDateTime } from '@/lib/format/date';

interface AuditTableProps {
  events: AuditEvent[];
  /** Narrows the log to one actor or one target (the row's buttons). */
  onActor: (actor: { id: string; name: string }) => void;
  onTarget: (event: AuditEvent) => void;
}

const thClass = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
const tdClass = 'px-4 py-3 text-sm text-gray-900 align-top';
const filterButtonClass =
  'ml-2 text-xs font-medium text-blue-700 hover:text-blue-900 underline focus:outline-hidden focus:ring-2 focus:ring-blue-500 rounded-sm';

/** One page of the audit log: when, who, what and to which object, newest first. */
export default function AuditTable({ events, onActor, onTarget }: AuditTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <caption className="sr-only">Audit events, newest first</caption>
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className={thClass}>
              When
            </th>
            <th scope="col" className={thClass}>
              Who
            </th>
            <th scope="col" className={thClass}>
              Action
            </th>
            <th scope="col" className={thClass}>
              Target
            </th>
            <th scope="col" className={thClass}>
              Details
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {events.map((event) => {
            const href = targetLink(event);
            const name = targetText(event);
            return (
              <tr key={event.id}>
                <td className={`${tdClass} whitespace-nowrap`}>
                  {formatLocalDateTime(event.createdAt)}
                </td>
                <td className={tdClass}>
                  {event.actor ? (
                    <>
                      {event.actor.name}
                      <button
                        type="button"
                        className={filterButtonClass}
                        onClick={() => onActor(event.actor!)}
                        aria-label={`Show only changes by ${event.actor.name}`}
                      >
                        Only
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-500">Deleted account</span>
                  )}
                </td>
                <td className={tdClass}>{actionLabel(event.action)}</td>
                <td className={tdClass}>
                  <span className="text-xs text-gray-500 mr-1">{event.targetType}</span>
                  {href && event.targetName ? (
                    <Link href={href} className="text-blue-700 hover:text-blue-900 underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {event.targetId && (
                    <button
                      type="button"
                      className={filterButtonClass}
                      onClick={() => onTarget(event)}
                      aria-label={`Show only changes to ${name}`}
                    >
                      Only
                    </button>
                  )}
                </td>
                <td className={`${tdClass} text-gray-700`}>{describeDetails(event)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import type { Service } from '@embrace/shared';
import { formatCalendarDate } from '@/lib/format/date';
import { stageLabel } from '@/lib/members/display';
import { serviceName } from '@/lib/services/services';

interface ServiceListProps {
  services: Service[];
  /** True for admins, who may delete services. */
  canDelete: boolean;
  onAttendance: (service: Service) => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
}

const thClass = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
const tdClass = 'px-4 py-3 text-sm text-gray-700';
const actionClass =
  'px-2 py-1 rounded-md text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/** The services of one month, oldest first, with attendance, edit and (admin) delete actions. */
export default function ServiceList({
  services,
  canDelete,
  onAttendance,
  onEdit,
  onDelete,
}: ServiceListProps) {
  const rows = [...services].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              Type
            </th>
            <th scope="col" className={thClass}>
              Title
            </th>
            <th scope="col" className={thClass}>
              Present
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((service) => {
            const name = serviceName(service);
            return (
              <tr key={service.id}>
                <td className={`${tdClass} whitespace-nowrap`}>
                  {formatCalendarDate(service.date, { dateStyle: 'medium' }) ?? service.date}
                </td>
                <td className={tdClass}>{stageLabel(service.type)}</td>
                <td className={tdClass}>
                  {service.title ?? <span className="text-gray-500">No title</span>}
                </td>
                <td className={tdClass}>{service.presentCount}</td>
                <td className={`${tdClass} whitespace-nowrap text-right`}>
                  <button
                    type="button"
                    onClick={() => onAttendance(service)}
                    aria-label={`Attendance for ${name}`}
                    className={`${actionClass} text-blue-700 hover:bg-blue-50`}
                  >
                    Attendance
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(service)}
                    aria-label={`Edit ${name}`}
                    className={`${actionClass} text-gray-700 hover:bg-gray-100`}
                  >
                    Edit
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(service)}
                      aria-label={`Delete ${name}`}
                      className={`${actionClass} text-red-700 hover:bg-red-50`}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import type { MemberDetails } from '../../../types/domain';
import { formatDate, formatDateTime, parseJsonList } from '../../../lib/members/profile';
import { Field, pillClass } from './Field';

function TagList({
  label,
  items,
  colour,
  empty,
}: {
  label: string;
  items: string[];
  colour: string;
  empty: string;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <span
              key={index}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colour}`}
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm text-gray-500">{empty}</p>
        )}
      </div>
    </div>
  );
}

/** The "Activity & Notes" tab: skills, interests, notes, staff notes and account details. */
export default function Notes({ member }: { member: MemberDetails }) {
  const staffNotes = member.memberNotes ?? [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Skills & Interests</h3>
          <TagList
            label="Volunteer Skills"
            items={parseJsonList(member.volunteerSkills)}
            colour="bg-blue-100 text-blue-800"
            empty="No skills listed"
          />
          <TagList
            label="Interests"
            items={parseJsonList(member.interests)}
            colour="bg-green-100 text-green-800"
            empty="No interests listed"
          />
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Notes</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {member.notes || 'No notes available'}
            </p>
          </div>
        </div>
      </div>

      {staffNotes.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Staff Notes</h3>
          <div className="space-y-4">
            {staffNotes.map((note) => (
              <div key={note.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">{note.title || 'Note'}</h4>
                  <span className="text-xs text-gray-500">{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-600">{note.content}</p>
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs text-gray-500 capitalize">{note.noteType}</span>
                  {note.isPrivate && (
                    <span className={`${pillClass} bg-red-100 text-red-800`}>Private</span>
                  )}
                  {note.isFollowUp && (
                    <span className={`${pillClass} bg-yellow-100 text-yellow-800`}>
                      Follow-up needed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Field label="Created" className="text-gray-900">
            {formatDate(member.createdAt)}
          </Field>
          <Field label="Last Updated" className="text-gray-900">
            {formatDate(member.updatedAt)}
          </Field>
          <Field label="Member ID" className="text-gray-900 font-mono text-xs">
            {member.id}
          </Field>
        </div>
      </div>
    </div>
  );
}

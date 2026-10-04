// File: frontend/src/components/members/AddEditMemberModal.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { listRoles } from '../../lib/api/roles';
import { createUser, updateUser } from '../../lib/api/users';
import { getErrorMessage } from '../../lib/errors';
import type { Member, Role } from '../../types/domain';

interface AddEditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  member?: Member | null;
}

export default function AddEditMemberModal({ isOpen, onClose, onSave, member }: AddEditMemberModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    isActive: true,
    password: ''
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!member;

  const fetchRoles = useCallback(async () => {
    try {
      const fetchedRoles = await listRoles();
      setRoles(fetchedRoles);
      // A new member defaults to the member role unless roles were already picked.
      if (!member) {
        const memberRole = fetchedRoles.find((r) => r.name === 'member');
        if (memberRole) {
          setSelectedRoles((prev) => (prev.length ? prev : [memberRole.id]));
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load roles'));
    }
  }, [member]);

  useEffect(() => {
    if (isOpen) {
      fetchRoles();
      if (member) {
        setFormData({
          name: member.name,
          email: member.email ?? '',
          phone: member.phone || '',
          bio: member.bio || '',
          isActive: member.isActive,
          password: ''
        });
        setSelectedRoles(member.roles.map(ur => ur.role.id));
      } else {
        setFormData({
          name: '',
          email: '',
          phone: '',
          bio: '',
          isActive: true,
          password: ''
        });
        setSelectedRoles([]);
      }
      setError('');
    }
  }, [isOpen, member, fetchRoles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEditing && member) {
        // Update existing member. Only send role/status changes when they changed,
        // because those fields need admin (roles) or staff (status) permissions.
        const originalRoleIds = member.roles.map((ur) => ur.role.id).sort();
        const nextRoleIds = [...selectedRoles].sort();
        const rolesChanged = JSON.stringify(originalRoleIds) !== JSON.stringify(nextRoleIds);
        await updateUser(member.id, {
          name: formData.name,
          phone: formData.phone || null,
          bio: formData.bio || null,
          ...(formData.isActive !== member.isActive ? { isActive: formData.isActive } : {}),
          ...(rolesChanged ? { roleIds: selectedRoles } : {}),
        });
      } else {
        // Create new member (staff only). Self-registration uses /api/auth/register instead.
        await createUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || null,
          bio: formData.bio || null,
          isActive: formData.isActive,
          roleIds: selectedRoles,
        });
      }

      onSave();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600/50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isEditing ? 'Edit Member' : 'Add New Member'}
          </h3>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="member-name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                id="member-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="member-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                id="member-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                disabled={isEditing} // Can't change email when editing
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEditing ? 'bg-gray-100' : ''
                }`}
                placeholder="john@example.com"
              />
            </div>

            {!isEditing && (
              <div>
                <label htmlFor="member-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  id="member-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  minLength={12}
                  maxLength={128}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Temporary password (at least 12 characters)"
                />
              </div>
            )}

            <div>
              <label htmlFor="member-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="member-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label htmlFor="member-bio" className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                id="member-bio"
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tell us about this member..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Roles
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.id)}
                      onChange={() => handleRoleChange(role.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 capitalize">
                      {role.name}
                      {role.description && (
                        <span className="text-gray-500"> - {role.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="member-active"
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="member-active" className="ml-2 text-sm text-gray-700">
                Active Member
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Saving...' : (isEditing ? 'Update Member' : 'Add Member')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

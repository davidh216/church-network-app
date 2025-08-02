// File: frontend/src/app/members/page.tsx
'use client';

import { useState } from 'react';
import MemberList from '../../components/members/MemberList';
import AddEditMemberModal from '../../components/members/AddEditMemberModal';

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  isActive: boolean;
  roles: Array<{
    role: {
      id: string;
      name: string;
    }
  }>;
}

export default function MembersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAddMember = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleEditMember = (member: Member) => {
    setEditingMember(member);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleSaveMember = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Member Management</h1>
            <p className="mt-2 text-gray-600">Manage your church members and their information</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <MemberList
            onEditMember={handleEditMember}
            onAddMember={handleAddMember}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </main>

      <AddEditMemberModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveMember}
        member={editingMember}
      />
    </div>
  );
}
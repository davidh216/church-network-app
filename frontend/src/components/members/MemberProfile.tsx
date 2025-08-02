'use client';

import { useState, useEffect } from 'react';
import { authService } from '../../lib/auth';

interface Member {
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
    }
  }>;
}

interface MemberProfileProps {
  memberId: string;
  onClose: () => void;
  onEdit: (member: Member) => void;
}

export default function MemberProfile({ memberId, onClose, onEdit }: MemberProfileProps) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    fetchMember();
  }, [memberId]);

  const fetchMember = async () => {
    try {
      setLoading(true);
      const response = await authService.fetchWithAuth(`http://localhost:5000/api/users/${memberId}`);
      const data = await response.json();
      
      if (data.success) {
        setMember(data.user);
      } else {
        setError('Failed to load member details');
      }
    } catch (err) {
      setError('Failed to load member details');
      console.error('Error fetching member:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const parseSkills = (skillsString?: string): string[] => {
    try {
      return JSON.parse(skillsString || '[]');
    } catch {
      return [];
    }
  };

  const parseInterests = (interestsString?: string): string[] => {
    try {
      return JSON.parse(interestsString || '[]');
    } catch {
      return [];
    }
  };

  const calculateAge = (dateOfBirth?: string): number | null => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const getMembershipDuration = (membershipDate?: string): string => {
    if (!membershipDate) return 'Unknown';
    
    const startDate = new Date(membershipDate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    
    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}`;
    } else {
      return `${months} month${months > 1 ? 's' : ''}`;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border max-w-4xl shadow-lg rounded-md bg-white">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border max-w-4xl shadow-lg rounded-md bg-white">
          <div className="text-center">
            <div className="text-red-600 mb-4">{error || 'Member not found'}</div>
            <button
              onClick={onClose}
              className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: '👤' },
    { id: 'church', label: 'Church Info', icon: '⛪' },
    { id: 'contact', label: 'Contact & Address', icon: '📧' },
    { id: 'family', label: 'Family & Groups', icon: '👨‍👩‍👧‍👦' },
    { id: 'activity', label: 'Activity & Notes', icon: '📊' }
  ];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border max-w-6xl shadow-lg rounded-md bg-white mb-10">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <span className="text-2xl text-gray-600">
                  {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{member.name}</h2>
              <div className="flex items-center space-x-4 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  member.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {member.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="text-sm text-gray-500">Member since {formatDate(member.membershipDate)}</span>
                {member.dateOfBirth && (
                  <span className="text-sm text-gray-500">Age {calculateAge(member.dateOfBirth)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {member.roles.map((userRole) => (
                  <span
                    key={userRole.role.id}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {userRole.role.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onEdit(member)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Edit Member
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none p-1 hover:bg-gray-100 rounded transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          
          {/* Personal Info Tab */}
          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <p className="text-sm text-gray-900">{member.firstName || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <p className="text-sm text-gray-900">{member.lastName || 'Not set'}</p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                  <p className="text-sm text-gray-900">{formatDate(member.dateOfBirth)}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Gender</label>
                    <p className="text-sm text-gray-900 capitalize">{member.gender || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Marital Status</label>
                    <p className="text-sm text-gray-900 capitalize">{member.maritalStatus || 'Not specified'}</p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Occupation</label>
                  <p className="text-sm text-gray-900">{member.occupation || 'Not specified'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Emergency Contact</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Emergency Contact Name</label>
                  <p className="text-sm text-gray-900">{member.emergencyContact || 'Not set'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Emergency Phone</label>
                  <p className="text-sm text-gray-900">{member.emergencyPhone || 'Not set'}</p>
                </div>
                
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900">Bio</h3>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{member.bio || 'No bio available'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Church Info Tab */}
          {activeTab === 'church' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Membership Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Membership Type</label>
                  <p className="text-sm text-gray-900 capitalize">{member.membershipType || 'Not specified'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Membership Date</label>
                  <p className="text-sm text-gray-900">{formatDate(member.membershipDate)}</p>
                  <p className="text-xs text-gray-500">Duration: {getMembershipDuration(member.membershipDate)}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Baptism Date</label>
                  <p className="text-sm text-gray-900">{formatDate(member.baptismDate)}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirmation Date</label>
                  <p className="text-sm text-gray-900">{formatDate(member.confirmationDate)}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Background</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Previous Church</label>
                  <p className="text-sm text-gray-900">{member.previousChurch || 'Not specified'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">How Did You Hear About Us?</label>
                  <p className="text-sm text-gray-900">{member.howHeardAboutUs || 'Not specified'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Attended</label>
                  <p className="text-sm text-gray-900">{formatDate(member.lastAttended)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Contact & Address Tab */}
          {activeTab === 'contact' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Contact Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="text-sm text-gray-900">{member.email}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="text-sm text-gray-900">{member.phone || 'Not provided'}</p>
                </div>
                
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900">Communication Preferences</h3>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${member.emailOptIn ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-gray-700">Email Communications</span>
                    </div>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${member.smsOptIn ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-gray-700">SMS/Text Messages</span>
                    </div>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${member.mailOptIn ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-gray-700">Physical Mail</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Address</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Street Address</label>
                  <p className="text-sm text-gray-900">{member.address || 'Not provided'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <p className="text-sm text-gray-900">{member.city || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <p className="text-sm text-gray-900">{member.state || 'Not provided'}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                    <p className="text-sm text-gray-900">{member.zipCode || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <p className="text-sm text-gray-900">{member.country || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Family & Groups Tab */}
          {activeTab === 'family' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Family Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Family Status</label>
                  <p className="text-sm text-gray-900">
                    {member.isHeadOfFamily ? 'Head of Family' : 'Family Member'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Family ID</label>
                  <p className="text-sm text-gray-900">{member.familyId || 'Not assigned to a family'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Groups & Ministries</h3>
                <p className="text-sm text-gray-500">Group membership information will be displayed here once implemented.</p>
              </div>
            </div>
          )}

          {/* Activity & Notes Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Skills & Interests</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Volunteer Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {parseSkills(member.volunteerSkills).length > 0 ? (
                        parseSkills(member.volunteerSkills).map((skill, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No skills listed</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
                    <div className="flex flex-wrap gap-2">
                      {parseInterests(member.interests).length > 0 ? (
                        parseInterests(member.interests).map((interest, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                          >
                            {interest}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No interests listed</p>
                      )}
                    </div>
                  </div>
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
              
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Created</label>
                    <p className="text-gray-900">{formatDate(member.createdAt)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                    <p className="text-gray-900">{formatDate(member.updatedAt)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Member ID</label>
                    <p className="text-gray-900 font-mono text-xs">{member.id}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
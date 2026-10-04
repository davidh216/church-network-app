'use client';

import { useState, useEffect } from 'react';
import { logout, me } from '../lib/api/auth';
import type { User } from '../types/domain';
import LoginForm from '../components/auth/LoginForm';
import RegisterForm from '../components/auth/RegisterForm';
import MemberList from '../components/members/MemberList';
import AddEditMemberModal from '../components/members/AddEditMemberModal';
import SimpleMediaLibrary from '../components/media/SimpleMediaLibrary';
import VideoPlayer from '../components/media/VideoPlayer';
import MemberAnalyticsDashboard from '../components/analytics/MemberAnalyticsDashboard';
import type { Member, MediaItem } from '../types/domain';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showMedia, setShowMedia] = useState(false);
  const [playingMedia, setPlayingMedia] = useState<MediaItem | null>(null);
  const [mediaPlaylist, setMediaPlaylist] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setUser(await me());
      } catch {
        // No session (401) or API unreachable: show the sign-in form.
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // The session is dropped locally either way; the cookie expires on its own.
    }
    setUser(null);
  };

  const handleAuthSuccess = (user: User) => {
    setUser(user);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div>
          {showRegister ? (
            <RegisterForm onSwitchToLogin={() => setShowRegister(false)} />
          ) : (
            <LoginForm
              onSuccess={handleAuthSuccess}
              onSwitchToRegister={() => setShowRegister(true)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <button
                onClick={() => {
                  setShowMembers(false);
                  setShowMedia(false);
                  setShowAnalytics(false);
                }}
                className="text-left hover:opacity-80 transition-opacity"
              >
                <h1 className="text-3xl font-bold text-gray-900">
                  Embrace
                </h1>
              </button>
              <p className="text-gray-600">Welcome back, {user.name}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                {user.roles && user.roles.length > 0 ? (
                  user.roles.map((userRole) => (
                    <span
                      key={userRole.role.id}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {userRole.role.name}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    member
                  </span>
                )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Dashboard Section */}
        {!showMembers && !showMedia && !showAnalytics && (
          <div className="px-4 py-6 sm:px-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Profile Card */}
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <h3 className="text-lg font-medium text-gray-900">Your Profile</h3>
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Name:</span> {user.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Email:</span> {user.email}
                    </p>
                    {user.phone && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Phone:</span> {user.phone}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Roles:</span>{' '}
                      {user.roles && user.roles.length > 0
                        ? user.roles.map((r) => r.role.name).join(', ')
                        : 'member'}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Member since:</span>{' '}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
              {/* Quick Actions Card */}
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
                  <div className="mt-4 space-y-3">
                    <button
                      onClick={() => setShowMembers(true)}
                      className="w-full text-left px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-md text-sm text-blue-700"
                    >
                      👥 View Members
                    </button>
                    <button className="w-full text-left px-3 py-2 bg-green-50 hover:bg-green-100 rounded-md text-sm text-green-700">
                      📅 Upcoming Events
                    </button>
                    <button 
                      onClick={() => setShowMedia(true)}
                      className="w-full text-left px-3 py-2 bg-purple-50 hover:bg-purple-100 rounded-md text-sm text-purple-700"
                    >
                      🎵 Media Library
                    </button>
                    <button 
                      onClick={() => setShowAnalytics(true)}
                      className="w-full text-left px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-md text-sm text-indigo-700"
                    >
                      📊 Member Analytics
                    </button>
                    <button className="w-full text-left px-3 py-2 bg-yellow-50 hover:bg-yellow-100 rounded-md text-sm text-yellow-700">
                      💬 Slack Workspace
                    </button>
                  </div>
                </div>
              </div>
              {/* Membership Stats Card */}
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <h3 className="text-lg font-medium text-gray-900">Membership Overview</h3>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Members:</span>
                      <span className="text-sm font-medium text-green-600">Active System</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Member Profiles:</span>
                      <span className="text-sm font-medium text-blue-600">Enhanced</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Search & Filter:</span>
                      <span className="text-sm font-medium text-purple-600">Advanced</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">View Modes:</span>
                      <span className="text-sm font-medium text-indigo-600">Table & Cards</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Welcome Section */}
            <div className="mt-8 bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🎉 Welcome to Embrace!
              </h2>
              <p className="text-gray-600 mb-4">
                You&apos;re successfully logged in! This is your church network platform.
              </p>
              <div className="mt-6 p-4 bg-green-50 rounded-md">
                <p className="text-sm text-green-800">
                  <strong>🎉 Latest Updates:</strong> Enhanced membership management system with detailed profiles, 
                  advanced search & filtering, and modern video player are now live! 
                  Ready for member communication tools and family management.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Member Management Section */}
        {showMembers && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Member Management</h2>
              <button
                onClick={() => setShowMembers(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back to Dashboard
              </button>
            </div>
            <MemberList
              onEditMember={(member: Member) => {
                setEditingMember(member);
                setIsModalOpen(true);
              }}
              onAddMember={() => {
                setEditingMember(null);
                setIsModalOpen(true);
              }}
              refreshTrigger={refreshTrigger}
            />
          </div>
        )}

        {/* Analytics Dashboard Section */}
        {showAnalytics && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Member Analytics</h2>
              <button
                onClick={() => setShowAnalytics(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back to Dashboard
              </button>
            </div>
            {/* Analytics dashboard will be rendered as a modal */}
          </div>
        )}

        {/* STEP 5: Media Library Section */}
        {showMedia && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Embrace Media Library</h2>
              <button
                onClick={() => setShowMedia(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back to Dashboard
              </button>
            </div>
            <SimpleMediaLibrary
              onPlayMedia={(media: MediaItem, playlist: MediaItem[] = []) => {
                setPlayingMedia(media);
                setMediaPlaylist(playlist);
                const index = playlist.findIndex(item => item.id === media.id);
                setCurrentMediaIndex(index >= 0 ? index : 0);
              }}
            />
          </div>
        )}
      </main>

      <AddEditMemberModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingMember(null);
        }}
        onSave={() => {
          setRefreshTrigger((prev) => prev + 1);
        }}
        member={editingMember}
      />

      {/* Enhanced Video Player */}
      {playingMedia && (
        <VideoPlayer
          media={playingMedia}
          onClose={() => {
            setPlayingMedia(null);
            setMediaPlaylist([]);
            setCurrentMediaIndex(0);
          }}
          playlist={mediaPlaylist}
          currentIndex={currentMediaIndex}
          onPlayNext={() => {
            if (currentMediaIndex < mediaPlaylist.length - 1) {
              const nextIndex = currentMediaIndex + 1;
              setCurrentMediaIndex(nextIndex);
              setPlayingMedia(mediaPlaylist[nextIndex]);
            }
          }}
          onPlayPrevious={() => {
            if (currentMediaIndex > 0) {
              const prevIndex = currentMediaIndex - 1;
              setCurrentMediaIndex(prevIndex);
              setPlayingMedia(mediaPlaylist[prevIndex]);
            }
          }}
        />
      )}

      {/* Member Analytics Dashboard Modal */}
      {showAnalytics && (
        <MemberAnalyticsDashboard
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
}
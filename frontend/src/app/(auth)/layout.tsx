// Sign-in and registration: a centred card without the app shell.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      {children}
    </div>
  );
}

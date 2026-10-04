# Embrace Church Network App

A comprehensive church management platform built with modern web technologies, designed to help churches manage their community, media, and member relationships effectively.

## 🚀 Features

### **Enhanced Membership Management**
- **Comprehensive Member Profiles**: Track personal info, church history, contact details, family relationships, and ministry involvement
- **Advanced Search & Filtering**: Multi-criteria search with role, status, and membership type filters
- **Dual View Modes**: Professional table view and modern card layout
- **Family Management**: Organize members into family units with head-of-family relationships
- **Groups & Ministries**: Small groups, committees, and service team organization
- **Attendance Tracking**: Monitor service participation and engagement

### **Modern Video Player System**
- **Professional Video Player**: YouTube-optimized with fullscreen support
- **Playlist Functionality**: Navigate through video collections seamlessly
- **Enhanced Controls**: Keyboard shortcuts, custom overlays, and responsive design
- **Media Library**: Organized video content with search, filtering, and categorization
- **Grid & List Views**: Flexible viewing options for media browsing

### **Authentication & Security**
- **Role-Based Access Control**: Admin, Leader, and Member permission levels
- **JWT Authentication**: Secure token-based authentication system
- **User Profile Management**: Complete profile editing and management

### **Responsive Design**
- **Mobile-First**: Optimized for all devices and screen sizes
- **Modern UI/UX**: Clean, professional interface with smooth animations
- **Accessibility**: WCAG compliant with proper ARIA labels and keyboard navigation

## 🛠️ Technology Stack

### **Frontend**
- **Next.js 15**: React framework with App Router
- **React 19**: Latest React with modern hooks and features
- **TypeScript**: Full type safety throughout the application
- **Tailwind CSS 4**: Utility-first CSS framework for rapid styling
- **ESLint**: Code quality and consistency enforcement

### **Backend**
- **Node.js**: JavaScript runtime environment
- **Express.js**: Fast, unopinionated web framework
- **TypeScript**: Type-safe server-side development
- **Prisma**: Next-generation ORM with type safety
- **PostgreSQL 16**: primary datastore (local install or the `db` service in `docker-compose.yml`)

### **Security & Authentication**
- **JWT in an httpOnly cookie** (`embrace_session`): the browser talks to the API through a same-origin Next.js rewrite; `Authorization: Bearer` is also accepted for scripts and tests
- **bcryptjs**: Password hashing and security
- **CORS**: Cross-Origin Resource Sharing configuration
- **Helmet**, zod request validation, pino logging, and three login rate limits (per client IP, per account, per client IP and account); client IPs are read from `X-Forwarded-For` according to `TRUST_PROXY`, so production must run behind a reverse proxy that sets that header and must not expose the web app directly

## 📋 Database Schema

### **Core Models**

#### **User (Members)**
- Personal information (name, DOB, gender, marital status, occupation)
- Church-specific data (membership date, baptism, confirmation, previous church)
- Contact details (email, phone, address, emergency contacts)
- Communication preferences (email, SMS, mail opt-ins)
- Family relationships and ministry involvement
- Skills, interests, and volunteer capabilities

#### **Roles & Permissions**
- Hierarchical role system (Admin, Leader, Member)
- Granular permissions for different system areas
- User-role assignments with multiple roles support

#### **Families**
- Family unit organization
- Head of family designation
- Shared family information and address

#### **Groups & Ministries**
- Small groups, committees, service teams
- Group leadership and member roles
- Meeting schedules and location tracking

#### **Media Management**
- YouTube video integration
- Content categorization and tagging
- Approval workflow for published content

#### **Attendance Tracking**
- Service attendance monitoring
- Multiple service types support
- Historical attendance data

## 🚦 Getting Started

### **Prerequisites**
- Node.js 22 (see `.nvmrc`) and npm 10
- PostgreSQL 16, either installed locally or started with `docker compose up -d db`

### **Installation**

1. **Clone and install** (one npm workspace, one lockfile at the root)
   ```bash
   git clone https://github.com/davidh216/church-network-app.git
   cd church-network-app
   npm ci
   ```

2. **Database and backend configuration**
   ```bash
   docker compose up -d db          # or use your own Postgres; the default credentials are church / church
   cp backend/.env.example backend/.env   # set JWT_SECRET (32+ random chars) and the SEED_ADMIN_* values
   npm run -w backend db:migrate    # applies prisma/migrations
   npm run -w backend db:seed       # creates the roles and, if SEED_ADMIN_* are set, the first admin
   ```

3. **Run both apps**
   ```bash
   npm run dev                      # API on http://localhost:5000, web on http://localhost:3000
   ```
   The web app proxies `/api/*` to the API (`API_URL`, see `frontend/.env.example`), so the session cookie is first-party.

4. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Health Check: http://localhost:5000/health

### **Containers**
`docker compose up --build` starts `db`, `api` (runs `prisma migrate deploy`, the idempotent seed, then the compiled server) and `web` (standalone Next.js build). Ports are published on 127.0.0.1 only. The api service reads `backend/.env` for `JWT_SECRET` and the `SEED_ADMIN_*` values, and runs with `COOKIE_SECURE=false` because the stack is plain http; a real deployment sits behind TLS, leaves `COOKIE_SECURE` unset, and runs behind a reverse proxy that sets `X-Forwarded-For` (see `TRUST_PROXY` in `backend/.env.example`).

### **Accounts and Roles**
- Self-registration creates an **inactive** account. An admin or leader activates it (edit the member and tick Active) before the person can sign in.
- The first admin comes from the seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Passwords must be at least 12 characters and not a common password. Signed-in users change theirs with `POST /api/auth/change-password`; admins reset others with `POST /api/users/:id/reset-password`.
- `admin` and `leader` can see member contact details, CRM notes, analytics and exports and can create members. Only `admin` can grant the `leader` or `admin` role, change roles, or edit another staff account. `member` sees a name-only directory and their own profile.
- Emails are stored lowercase. The Postgres baseline migration starts from an empty database, so data imported from the old SQLite deployment must be lowercased on import.

### **Quality checks**
```bash
npm run typecheck && npm run lint && npm test && npm run build   # both workspaces, from the root
npm run format:check                                             # prettier
npx -w frontend playwright install chromium                     # once; CI does this itself
E2E_WEB_PORT=3111 E2E_API_PORT=5111 npm run -w frontend test:e2e # Playwright smoke; starts both dev servers and needs SEED_ADMIN_* in backend/.env
```
A husky pre-commit hook runs lint-staged (eslint --fix and prettier on staged files). CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, tests against a Postgres service, builds, the compiled seed, a migration drift check and the Playwright smoke on pull requests and on pushes to `main` and `modernize/**`.

## 📁 Project Structure

```
church-network-app/
├── package.json                # npm workspaces: backend, frontend; root scripts
├── tsconfig.base.json          # shared strict compiler options
├── docker-compose.yml          # db, api, web
├── .github/workflows/ci.yml    # typecheck, lint, test, build, migrate diff, e2e
├── backend/                    # Express 5 API
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma       # PostgreSQL schema
│   │   ├── migrations/         # baseline migration
│   │   └── seed.ts             # roles and optional first admin
│   ├── prisma.config.ts
│   ├── src/
│   │   ├── app.ts              # Express app: middleware, modules, 404/error handlers
│   │   ├── server.ts           # listen and graceful shutdown
│   │   ├── config/env.ts       # zod-validated environment
│   │   ├── lib/                # prisma singleton, logger, HttpError, shared zod schemas
│   │   ├── middleware/         # authenticate, requireRole, validate, error handler, not found
│   │   └── modules/            # auth, users, saved-searches, roles, media, analytics, member-details
│   │                           #   each with router.ts, service.ts, schemas.ts
│   ├── test/                   # vitest + supertest, including a route matrix
│   └── .env.example
├── frontend/                   # Next.js App Router
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/                # layout, providers, dashboard, login, register
│   │   ├── middleware.ts       # redirects to /login without a session cookie
│   │   ├── components/         # auth, members, media, analytics (+ tests)
│   │   ├── lib/api/            # apiFetch client and typed endpoint modules
│   │   ├── lib/auth/           # AuthProvider, useAuth, useIsStaff
│   │   └── types/domain.ts     # shared domain types
│   ├── e2e/                    # Playwright smoke
│   └── .env.example
├── docs/
│   ├── MODERNIZATION_GAMEPLAN.md
│   └── PHASE1_SPECS.md
└── README.md
```

## 🔧 API Endpoints

All routes except `/health`, `POST /api/auth/register`, `POST /api/auth/login` and `POST /api/auth/logout` require a session (the `embrace_session` cookie set by login, or a bearer token). Routes marked *staff* require the `admin` or `leader` role.

### **Authentication**
- `POST /api/auth/register` - Register (account stays inactive until approved)
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - Clear the session cookie (refused with 403 `CROSS_SITE` for cross-site requests)
- `POST /api/auth/change-password` - Change own password
- `POST /api/users/:id/reset-password` - Reset a member's password *(admin)*

### **User Management**
- `GET /api/users` - Member directory (full details for staff, name-only for members)
- `POST /api/users` - Create a member *(staff)*
- `GET /api/users/:id` - Get a user (full details for staff or self)
- `PUT /api/users/:id` - Update profile; staff may set `isActive`, admins may set `roleIds`
- `GET /api/users/export` - CSV export *(staff)*
- `GET|POST|DELETE /api/users/saved-searches` - Saved searches
- `GET /api/analytics/...` and `GET /api/member-details/...` - CRM and analytics *(staff)*

### **Media Management**
- `GET /api/media` - Get media library content
- `POST /api/media` - Add new media *(staff)*
- `GET /api/media/:id` - Get specific media item

### **Role Management**
- `GET /api/roles` - Get all available roles

## 🎯 Usage Guide

### **Member Management**
1. **Adding Members**: Use the "Add Member" button to register new church members
2. **Viewing Profiles**: Click "View" on any member to see comprehensive profile information
3. **Search & Filter**: Use the advanced search to find members by name, email, phone, role, or status
4. **View Modes**: Toggle between table and card views for different browsing experiences

### **Media Library**
1. **Adding Videos**: Add YouTube videos with titles, descriptions, and category tags
2. **Video Player**: Enhanced player with playlist support, fullscreen, and keyboard controls
3. **Organization**: Filter and search videos by category, date, or content

### **User Roles**
- **Admin**: Full system access, user management, and configuration
- **Leader**: Member management, content approval, and ministry oversight
- **Member**: Basic access to media library and personal profile management

## 🔮 Roadmap

### **Phase 1: Core Foundation** ✅
- Authentication system
- Basic member management
- Media library with video player
- Enhanced membership profiles

### **Phase 2: Advanced Features** (In Progress)
- [ ] Bulk member import/export
- [ ] Communication tools (email/SMS)
- [ ] Advanced family management
- [ ] Group and ministry management
- [ ] Attendance tracking interface

### **Phase 3: Analytics & Reporting**
- [ ] Membership analytics dashboard
- [ ] Attendance reports and trends
- [ ] Engagement metrics
- [ ] Custom report generation

### **Phase 4: Integration & Expansion**
- [ ] Slack workspace integration
- [ ] Email marketing integration
- [ ] Calendar and event management
- [ ] Online giving integration
- [ ] Mobile app development

## 🤝 Contributing

We welcome contributions to the Embrace Church Network App! Please read our contributing guidelines and submit pull requests for any improvements.

### **Development Setup**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern web technologies for scalability and performance
- Designed specifically for church community management needs
- Inspired by the mission to strengthen church connections and engagement

## 📞 Support

For support, questions, or feature requests, please open an issue on GitHub or contact the development team.

---

**Embrace Church Network App** - Strengthening church communities through technology. 🏛️❤️
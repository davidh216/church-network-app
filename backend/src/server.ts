// File: backend/src/server.ts - REPLACE YOUR CURRENT server.ts
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import mediaRoutes from './routes/simple-media';
import analyticsRoutes from './routes/analytics';

const app = express();
const PORT = 5000;
const prisma = new PrismaClient();
const JWT_SECRET = 'your-super-secret-jwt-key-change-this'; // In real app, use env variable

// Ensure default roles exist
async function ensureDefaultRoles() {
  const defaultRoles = [
    { name: 'admin', description: 'Administrator with full access', permissions: '["*"]' },
    { name: 'leader', description: 'Church leader with moderate access', permissions: '["read", "write", "manage_members"]' },
    { name: 'member', description: 'Regular church member', permissions: '["read"]' }
  ];

  for (const role of defaultRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    });
  }
  console.log('Default roles ensured');
}

// Initialize default roles
ensureDefaultRoles().catch(console.error);

// Middleware
app.use(cors());
app.use(express.json());


// Auth Middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded, looking for user:', decoded.userId);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });
    
    if (!user) {
      console.log('User not found in database:', decoded.userId);
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.isActive) {
      console.log('User is inactive:', user.email);
      return res.status(401).json({ error: 'User account is inactive' });
    }
    
    console.log('User authenticated successfully:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.log('Token verification failed:', error instanceof Error ? error.message : String(error));
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Church app backend is running!',
    timestamp: new Date().toISOString() 
  });
});

// AUTH ROUTES

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone || null,
      }
    });

    // Assign default "member" role
    const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });
    if (memberRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: memberRole.id
        }
      });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Return user (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({
      success: true,
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Return user (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  const { password: _, ...userWithoutPassword } = req.user;
  res.json({
    success: true,
    user: userWithoutPassword
  });
});

// MEDIA ROUTES - ADD THIS LINE AFTER authenticateToken is defined
app.use('/api/media', authenticateToken, mediaRoutes);

// ANALYTICS ROUTES
app.use('/api/analytics', authenticateToken, analyticsRoutes);

// USER MANAGEMENT ROUTES

// Get all users (protected)
app.get('/api/users', authenticateToken, async (req: any, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        bio: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get enhanced users with engagement data (protected)
app.get('/api/users/enhanced', authenticateToken, async (req: any, res) => {
  try {
    console.log('Enhanced users endpoint called by:', req.user.email);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        bio: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        membershipDate: true,
        lastLoginAt: true,
        roles: {
          include: {
            role: true
          }
        },
        engagement: {
          select: {
            engagementScore: true,
            membershipStage: true,
            riskLevel: true,
            lastActivity: true,
            attendanceScore: true,
            givingScore: true,
            volunteerScore: true,
            communityScore: true,
            communicationScore: true
          }
        }
      }
    });

    console.log(`Found ${users.length} users for enhanced query`);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get enhanced users error:', error);
    res.status(500).json({ error: 'Failed to get enhanced users' });
  }
});

// Export users (CSV/Excel)
app.get('/api/users/export', authenticateToken, async (req: any, res) => {
  try {
    const { format = 'csv', members } = req.query;
    
    // Build query based on selected members
    const whereClause = members ? 
      { id: { in: members.split(',') } } : 
      { isActive: true };
    
    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        roles: {
          include: {
            role: true
          }
        },
        engagement: true
      }
    });

    // Transform data for export
    const exportData = users.map(user => {
      const row: Record<string, any> = {
        'Name': user.name,
        'Email': user.email,
        'Phone': user.phone || '',
        'Bio': user.bio || '',
        'Status': user.isActive ? 'Active' : 'Inactive',
        'Roles': user.roles.map(r => r.role.name).join(', '),
        'Engagement Score': user.engagement?.engagementScore || 0,
        'Membership Stage': user.engagement?.membershipStage || 'Unknown',
        'Risk Level': user.engagement?.riskLevel || 'Unknown',
        'Attendance Score': user.engagement?.attendanceScore || 0,
        'Giving Score': user.engagement?.givingScore || 0,
        'Volunteer Score': user.engagement?.volunteerScore || 0,
        'Community Score': user.engagement?.communityScore || 0,
        'Communication Score': user.engagement?.communicationScore || 0,
        'Join Date': user.createdAt.toISOString().split('T')[0],
        'Membership Date': user.membershipDate ? user.membershipDate.toISOString().split('T')[0] : '',
        'Last Activity': user.engagement?.lastActivity ? user.engagement.lastActivity.toISOString().split('T')[0] : '',
        'Last Login': user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : ''
      };
      return row;
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = Object.keys(exportData[0] || {});
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => `"${row[header]?.toString() || ''}"`).join(',')
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=members.csv');
      res.send(csvContent);
    } else {
      // For Excel format, we'd typically use a library like xlsx
      // For now, return JSON that frontend can process
      res.json({ success: true, data: exportData });
    }
    
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

// Saved searches endpoints
app.get('/api/users/saved-searches', authenticateToken, async (req: any, res) => {
  try {
    const searches = await prisma.savedSearch.findMany({
      where: {
        OR: [
          { createdBy: req.user.id },
          { isPublic: true }
        ]
      },
      orderBy: [
        { lastUsed: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    
    const formattedSearches = searches.map(search => ({
      id: search.id,
      name: search.name,
      description: search.description,
      query: JSON.parse(search.query),
      isPublic: search.isPublic,
      createdAt: search.createdAt,
      usageCount: search.usageCount,
      lastUsed: search.lastUsed
    }));
    
    res.json({ success: true, searches: formattedSearches });
  } catch (error) {
    console.error('Get saved searches error:', error);
    res.status(500).json({ error: 'Failed to get saved searches' });
  }
});

app.post('/api/users/saved-searches', authenticateToken, async (req: any, res) => {
  try {
    const { name, description, query, isPublic } = req.body;
    
    if (!name || !query) {
      return res.status(400).json({ error: 'Name and query are required' });
    }
    
    const savedSearch = await prisma.savedSearch.create({
      data: {
        name,
        description: description || null,
        query: JSON.stringify(query),
        isPublic: isPublic || false,
        createdBy: req.user.id
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Search saved successfully',
      search: {
        id: savedSearch.id,
        name: savedSearch.name,
        description: savedSearch.description,
        query: JSON.parse(savedSearch.query),
        isPublic: savedSearch.isPublic,
        createdAt: savedSearch.createdAt
      }
    });
  } catch (error) {
    console.error('Save search error:', error);
    res.status(500).json({ error: 'Failed to save search' });
  }
});

app.delete('/api/users/saved-searches/:id', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    // Only allow deletion if user owns the search or is admin
    const search = await prisma.savedSearch.findUnique({
      where: { id }
    });
    
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }
    
    const currentUserRoles = req.user.roles.map((ur: any) => ur.role.name);
    const isAdmin = currentUserRoles.includes('admin');
    
    if (search.createdBy !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this search' });
    }
    
    await prisma.savedSearch.delete({
      where: { id }
    });
    
    res.json({ success: true, message: 'Search deleted successfully' });
  } catch (error) {
    console.error('Delete search error:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// Update search usage stats
app.post('/api/users/saved-searches/:id/use', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    await prisma.savedSearch.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsed: new Date()
      }
    });
    
    res.json({ success: true, message: 'Usage tracked' });
  } catch (error) {
    console.error('Track usage error:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

// Get user by ID
app.get('/api/users/:id', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        bio: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user profile
app.put('/api/users/:id', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { name, phone, bio } = req.body;

    // Users can only update their own profile (unless admin)
    const currentUserRoles = req.user.roles.map((ur: any) => ur.role.name);
    const isAdmin = currentUserRoles.includes('admin');
    
    if (!isAdmin && req.user.id !== id) {
      return res.status(403).json({ error: 'Can only update your own profile' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        bio: bio || undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        bio: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ROLE ROUTES

// Get all roles
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    res.json({ success: true, roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Test health: http://localhost:${PORT}/health`);
  console.log(`👥 API ready for authentication!`);
  
  // Initialize default roles if they don't exist
  try {
    const adminRole = await prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: {
        name: 'admin',
        description: 'Full access to all features',
        permissions: JSON.stringify({
          manageUsers: true,
          manageMedia: true,
          manageSettings: true,
          deleteContent: true
        })
      }
    });

    const leaderRole = await prisma.role.upsert({
      where: { name: 'leader' },
      update: {},
      create: {
        name: 'leader',
        description: 'Manage members and content',
        permissions: JSON.stringify({
          manageUsers: true,
          manageMedia: true,
          manageSettings: false,
          deleteContent: false
        })
      }
    });

    const memberRole = await prisma.role.upsert({
      where: { name: 'member' },
      update: {},
      create: {
        name: 'member',
        description: 'Basic member access',
        permissions: JSON.stringify({
          manageUsers: false,
          manageMedia: false,
          manageSettings: false,
          deleteContent: false
        })
      }
    });

    console.log('✅ Default roles initialized');
  } catch (error) {
    console.error('Error initializing roles:', error);
  }
});
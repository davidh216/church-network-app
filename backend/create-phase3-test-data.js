const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createPhase3TestData() {
  try {
    console.log('Creating Phase 3 test data...');

    // Get existing users
    const users = await prisma.user.findMany({
      take: 4
    });

    if (users.length === 0) {
      console.log('No users found. Please create users first.');
      return;
    }

    const [user1, user2, user3, user4] = users;

    // Create a family
    const family = await prisma.family.create({
      data: {
        familyName: 'Smith Family',
        headOfFamily: user1.id,
        address: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '90210',
        country: 'USA'
      }
    });

    // Update users to be part of the family
    await prisma.user.update({
      where: { id: user1.id },
      data: { familyId: family.id, isHeadOfFamily: true }
    });

    await prisma.user.update({
      where: { id: user2.id },
      data: { familyId: family.id, isHeadOfFamily: false }
    });

    // Create family relationships
    await prisma.familyRelationship.create({
      data: {
        primaryUserId: user1.id,
        relatedUserId: user2.id,
        relationshipType: 'spouse',
        familyId: family.id
      }
    });

    if (user3) {
      await prisma.user.update({
        where: { id: user3.id },
        data: { familyId: family.id, isHeadOfFamily: false }
      });

      await prisma.familyRelationship.create({
        data: {
          primaryUserId: user1.id,
          relatedUserId: user3.id,
          relationshipType: 'child',
          familyId: family.id
        }
      });
    }

    // Create interactions
    const interactions = [
      {
        userId: user1.id,
        interactionType: 'email_sent',
        subject: 'Welcome to our church!',
        content: 'We\'re so glad you joined us this Sunday. Looking forward to getting to know you better.',
        channel: 'email',
        category: 'welcome',
        priority: 'normal',
        responseRequired: false,
        status: 'completed',
        completedAt: new Date()
      },
      {
        userId: user1.id,
        interactionType: 'call_made',
        subject: 'Follow-up call',
        content: 'Called to check in and see how they\'re doing. They mentioned they\'re interested in joining a small group.',
        channel: 'phone',
        category: 'follow_up',
        priority: 'normal',
        responseRequired: false,
        status: 'completed',
        completedAt: new Date()
      },
      {
        userId: user1.id,
        interactionType: 'visit_logged',
        subject: 'Home visit',
        content: 'Visited their home to welcome them to the church community. Had a great conversation about their spiritual journey.',
        channel: 'in_person',
        category: 'pastoral_care',
        priority: 'high',
        responseRequired: true,
        status: 'completed',
        completedAt: new Date()
      }
    ];

    for (const interaction of interactions) {
      await prisma.memberInteraction.create({
        data: interaction
      });
    }

    // Create milestones
    const milestones = [
      {
        userId: user1.id,
        milestoneType: 'first_visit',
        title: 'First Sunday Service',
        description: 'Attended their first Sunday service at our church.',
        achievedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        category: 'spiritual',
        impact: 'medium'
      },
      {
        userId: user1.id,
        milestoneType: 'baptism',
        title: 'Baptism',
        description: 'Celebrated baptism as a public declaration of faith.',
        achievedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        category: 'spiritual',
        impact: 'high',
        celebrated: true
      },
      {
        userId: user1.id,
        milestoneType: 'first_volunteer',
        title: 'First Volunteer Service',
        description: 'Served as a greeter for the first time.',
        achievedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        category: 'service',
        impact: 'medium'
      }
    ];

    for (const milestone of milestones) {
      await prisma.memberMilestone.create({
        data: milestone
      });
    }

    // Create member notes
    const notes = [
      {
        userId: user1.id,
        authorId: user1.id, // Using user1 as author for demo
        title: 'Initial Welcome Note',
        content: 'Very friendly and engaged during their first visit. Expressed interest in getting involved in the community.',
        noteType: 'general',
        isPrivate: false,
        isFollowUp: false
      },
      {
        userId: user1.id,
        authorId: user1.id,
        title: 'Pastoral Care Note',
        content: 'Had a meaningful conversation about their spiritual journey. They\'re going through a transition period and seeking community support.',
        noteType: 'pastoral_care',
        isPrivate: true,
        isFollowUp: true,
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      }
    ];

    for (const note of notes) {
      await prisma.memberNote.create({
        data: note
      });
    }

    // Create timeline activities
    const timelineActivities = [
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        activityType: 'interaction',
        title: 'First Church Visit',
        description: 'Attended Sunday service for the first time',
        category: 'spiritual',
        impact: 'medium'
      },
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        activityType: 'milestone',
        title: 'Welcome Email Sent',
        description: 'Sent welcome email after first visit',
        category: 'communication',
        impact: 'low'
      },
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        activityType: 'interaction',
        title: 'Follow-up Call',
        description: 'Made follow-up phone call to check in',
        category: 'pastoral_care',
        impact: 'medium'
      },
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        activityType: 'milestone',
        title: 'Baptism Decision',
        description: 'Decided to be baptized',
        category: 'spiritual',
        impact: 'high'
      },
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        activityType: 'interaction',
        title: 'Home Visit',
        description: 'Pastoral home visit conducted',
        category: 'pastoral_care',
        impact: 'high'
      },
      {
        userId: user1.id,
        activityDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        activityType: 'milestone',
        title: 'First Volunteer Service',
        description: 'Served as greeter for the first time',
        category: 'service',
        impact: 'medium'
      }
    ];

    for (const activity of timelineActivities) {
      await prisma.timelineActivity.create({
        data: activity
      });
    }

    // Update family analytics
    await prisma.family.update({
      where: { id: family.id },
      data: {
        totalMembers: user3 ? 3 : 2,
        activeMembers: user3 ? 3 : 2,
        familyEngagementScore: 75.5,
        lastCalculated: new Date()
      }
    });

    console.log('✅ Phase 3 test data created successfully!');
    console.log(`📊 Created:`);
    console.log(`   - 1 family with ${user3 ? 3 : 2} members`);
    console.log(`   - ${interactions.length} interactions`);
    console.log(`   - ${milestones.length} milestones`);
    console.log(`   - ${notes.length} notes`);
    console.log(`   - ${timelineActivities.length} timeline activities`);

  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createPhase3TestData(); 
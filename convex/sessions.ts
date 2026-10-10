import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const DEFAULT_TIERS = [
  { id: 'S', name: 'S', color: '#ef4444' },
  { id: 'A', name: 'A', color: '#f97316' },
  { id: 'B', name: 'B', color: '#eab308' },
  { id: 'C', name: 'C', color: '#22c55e' },
  { id: 'D', name: 'D', color: '#3b82f6' },
  { id: 'F', name: 'F', color: '#8b5cf6' },
];

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    customTiers: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          color: v.string(),
        }),
      ),
    ),
    hostName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const hostId = identity ? identity.subject : `guest-${Math.random().toString(36).slice(2, 8)}`;
    const hostName =
      args.hostName || (identity ? identity.name || identity.email || 'Host' : 'Host');

    let code = generateCode();
    // Ensure unique code
    let existing = await ctx.db
      .query('sessions')
      .withIndex('by_code', (q) => q.eq('code', code))
      .first();
    while (existing) {
      code = generateCode();
      existing = await ctx.db
        .query('sessions')
        .withIndex('by_code', (q) => q.eq('code', code))
        .first();
    }

    const sessionId = await ctx.db.insert('sessions', {
      title: args.title.trim() || 'Taste Test Session',
      code,
      hostId,
      hostName,
      status: 'ranking',
      tiers: args.customTiers && args.customTiers.length > 0 ? args.customTiers : DEFAULT_TIERS,
      createdAt: Date.now(),
    });

    // Auto-register host as participant
    await ctx.db.insert('rankings', {
      sessionId,
      userId: hostId,
      userName: hostName,
      userAvatar: identity?.pictureUrl,
      isReady: false,
      placements: [],
      updatedAt: Date.now(),
    });

    return { sessionId, code };
  },
});

export const get = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sessions')
      .withIndex('by_code', (q) => q.eq('code', args.code.trim().toUpperCase()))
      .first();
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      // Find sessions hosted or participated by user
      const hosted = await ctx.db
        .query('sessions')
        .withIndex('by_host', (q) => q.eq('hostId', identity.subject))
        .order('desc')
        .take(20);
      return hosted;
    }
    // Return latest active public sessions for easy local testing
    return await ctx.db.query('sessions').order('desc').take(10);
  },
});

export const updateStatus = mutation({
  args: {
    sessionId: v.id('sessions'),
    status: v.union(v.literal('ranking'), v.literal('revealed')),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    await ctx.db.patch(args.sessionId, { status: args.status });
  },
});

export const updateTiers = mutation({
  args: {
    sessionId: v.id('sessions'),
    tiers: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    await ctx.db.patch(args.sessionId, { tiers: args.tiers });
  },
});

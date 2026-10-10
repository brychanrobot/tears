import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  sessions: defineTable({
    title: v.string(),
    code: v.string(),
    hostId: v.string(),
    hostName: v.string(),
    status: v.union(v.literal('ranking'), v.literal('revealed')),
    tiers: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.string(),
      }),
    ),
    createdAt: v.number(),
  })
    .index('by_code', ['code'])
    .index('by_host', ['hostId']),

  items: defineTable({
    sessionId: v.id('sessions'),
    name: v.string(),
    imageStorageId: v.id('_storage'),
    notes: v.optional(v.string()),
    order: v.number(),
    addedBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_session_order', ['sessionId', 'order']),

  rankings: defineTable({
    sessionId: v.id('sessions'),
    userId: v.string(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
    isReady: v.boolean(),
    placements: v.array(
      v.object({
        itemId: v.id('items'),
        tierId: v.string(),
        rank: v.number(),
      }),
    ),
    updatedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_session_user', ['sessionId', 'userId']),
});

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const create = mutation({
  args: {
    sessionId: v.id('sessions'),
    name: v.string(),
    imageStorageId: v.id('_storage'),
    notes: v.optional(v.string()),
    addedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const addedBy =
      args.addedByName ||
      (identity ? identity.name || identity.email || 'Participant' : 'Participant');

    const existing = await ctx.db
      .query('items')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    const itemId = await ctx.db.insert('items', {
      sessionId: args.sessionId,
      name: args.name.trim() || `Item #${existing.length + 1}`,
      imageStorageId: args.imageStorageId,
      notes: args.notes?.trim(),
      order: existing.length,
      addedBy,
      createdAt: Date.now(),
    });

    return itemId;
  },
});

export const list = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query('items')
      .withIndex('by_session_order', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    // Enrich each item with a valid signed image URL from Convex storage
    return await Promise.all(
      items.map(async (item) => {
        const imageUrl = await ctx.storage.getUrl(item.imageStorageId);
        return {
          ...item,
          imageUrl: imageUrl ?? '',
        };
      }),
    );
  },
});

export const remove = mutation({
  args: { itemId: v.id('items') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    // Clean up storage
    try {
      await ctx.storage.delete(item.imageStorageId);
    } catch {
      // Storage delete failure shouldn't prevent DB deletion
    }

    // Also remove placements of this item in rankings
    const rankings = await ctx.db
      .query('rankings')
      .withIndex('by_session', (q) => q.eq('sessionId', item.sessionId))
      .collect();

    for (const r of rankings) {
      const updated = r.placements.filter((p) => p.itemId !== args.itemId);
      if (updated.length !== r.placements.length) {
        await ctx.db.patch(r._id, { placements: updated, updatedAt: Date.now() });
      }
    }

    await ctx.db.delete(args.itemId);
  },
});

export const update = mutation({
  args: {
    itemId: v.id('items'),
    name: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      name: args.name.trim(),
      notes: args.notes?.trim(),
    });
  },
});

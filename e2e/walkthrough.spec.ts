import path from 'node:path';
import { expect, test } from '@playwright/test';

const ARTIFACT_DIR =
  '/home/bryant/.gemini/antigravity/brain/5a83f2eb-cb6e-4e91-a634-167ac9bff772/media';

test('complete tasting night walkthrough with private ranking and consensus reveal', async ({
  browser,
}) => {
  test.setTimeout(90000);

  // Configure video recording context for Bryant
  const bryantContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: {
      dir: './test-results/videos',
      size: { width: 1280, height: 900 },
    },
  });
  const bryantPage = await bryantContext.newPage();

  // 1. Visit Home Page
  await bryantPage.goto('/');
  await expect(bryantPage.getByRole('heading', { name: /Tier lists that don't/i })).toBeVisible();
  await bryantPage.waitForTimeout(600);
  await bryantPage.screenshot({
    path: `${ARTIFACT_DIR}/01-home.png`,
    fullPage: true,
  });

  // 2. Create Tasting Session
  const titleInput = bryantPage.locator('#session-title');
  await titleInput.fill("Trader Joe's Snack Showdown");
  await bryantPage.getByRole('button', { name: /Create Tasting Room/i }).click();

  // Wait for navigation to session page
  await bryantPage.waitForURL(/\/session\/[a-zA-Z0-9_-]+/);
  const sessionUrl = bryantPage.url();
  await expect(bryantPage.getByText("Trader Joe's Snack Showdown")).toBeVisible();

  // Set Bryant's display name
  await bryantPage.getByRole('button', { name: /Tasting as:/i }).click();
  await bryantPage.locator('input[placeholder*="Kerianne, Bryant"]').fill('Bryant');
  await bryantPage.getByRole('button', { name: 'Save Name' }).click();
  await expect(bryantPage.getByText('Tasting as: Bryant')).toBeVisible();

  // 3. Add 4 Tasting Items with photos
  const fixturesDir = path.resolve('e2e/fixtures');
  const itemsToAdd = [
    {
      file: path.join(fixturesDir, 'item1.png'),
      name: '🌶️ Chili Onion Crunch Hummus',
      notes: 'Savory, crunchy chili oil with crispy garlic',
    },
    {
      file: path.join(fixturesDir, 'item2.png'),
      name: '🍫 Dark Chocolate PB Cups',
      notes: 'Rich chocolate with decadent creamy center',
    },
    {
      file: path.join(fixturesDir, 'item3.png'),
      name: '🌽 Elote Corn Chip Dippers',
      notes: 'Smoky chipotle & tangy cheese seasoning',
    },
    {
      file: path.join(fixturesDir, 'item4.png'),
      name: '🔥 Ghost Pepper Potato Chips',
      notes: 'Lethal slow creeping heat, dangerously addictive',
    },
  ];

  for (const item of itemsToAdd) {
    await bryantPage.getByRole('button', { name: /Add Item/i }).click();
    await bryantPage.locator('input[type="file"]').setInputFiles(item.file);
    await bryantPage.locator('#item-name').fill(item.name);
    await bryantPage.locator('#item-notes').fill(item.notes);
    await bryantPage.getByRole('button', { name: 'Add to Tasting' }).click();
    // Wait for upload and modal close
    await expect(bryantPage.locator('input[placeholder*="Chunky Garlic Dip"]')).not.toBeVisible({
      timeout: 10000,
    });
    await expect(bryantPage.getByText(item.name)).toBeVisible({
      timeout: 10000,
    });
  }

  await bryantPage.waitForTimeout(600);
  await bryantPage.screenshot({
    path: `${ARTIFACT_DIR}/02-unranked-pool.png`,
    fullPage: true,
  });

  // 4. Bryant Ranks his items using one-tap tier chips
  // Item 2 (Dark Chocolate PB Cups) -> S Tier
  const pbItem = bryantPage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Dark Chocolate PB Cups' });
  await pbItem.getByRole('button', { name: 'S', exact: true }).click();
  await bryantPage.waitForTimeout(400);

  // Item 1 (Chili Onion Crunch Hummus) -> A Tier
  const hummusItem = bryantPage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Chili Onion Crunch Hummus' });
  await hummusItem.getByRole('button', { name: 'A', exact: true }).click();
  await bryantPage.waitForTimeout(400);

  // Item 3 (Elote Corn Chip Dippers) -> B Tier
  const eloteItem = bryantPage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Elote Corn Chip Dippers' });
  await eloteItem.getByRole('button', { name: 'B', exact: true }).click();
  await bryantPage.waitForTimeout(400);

  // Item 4 (Ghost Pepper Potato Chips) -> D Tier
  const ghostItem = bryantPage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Ghost Pepper Potato Chips' });
  await ghostItem.getByRole('button', { name: 'D', exact: true }).click();
  await bryantPage.waitForTimeout(400);

  await expect(bryantPage.getByText('All items ranked! 🎉')).toBeVisible();
  await bryantPage.screenshot({
    path: `${ARTIFACT_DIR}/03-bryant-ranked.png`,
    fullPage: true,
  });

  // Bryant marks as ready
  await bryantPage.getByRole('button', { name: 'Mark as Ready' }).click();
  await expect(bryantPage.getByRole('button', { name: /✓ Ready/i })).toBeVisible();

  // 5. Kerianne joins from her own device / context
  const kerianneContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const keriannePage = await kerianneContext.newPage();
  await keriannePage.goto(sessionUrl);
  await expect(keriannePage.getByText("Trader Joe's Snack Showdown")).toBeVisible();

  // Set Kerianne's name
  await keriannePage.getByRole('button', { name: /Tasting as:/i }).click();
  await keriannePage.locator('input[placeholder*="Kerianne, Bryant"]').fill('Kerianne');
  await keriannePage.getByRole('button', { name: 'Save Name' }).click();
  await expect(keriannePage.getByText('Tasting as: Kerianne')).toBeVisible();

  // Kerianne ranks her items:
  // - Dark Chocolate PB Cups -> S Tier (unanimous agreement!)
  // - Ghost Pepper Potato Chips -> S Tier (spicy debate! Bryant put D)
  // - Elote Corn Chip Dippers -> C Tier
  // - Chili Onion Crunch Hummus -> D Tier
  const kPbItem = keriannePage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Dark Chocolate PB Cups' });
  await kPbItem.getByRole('button', { name: 'S', exact: true }).click();
  await keriannePage.waitForTimeout(300);

  const kGhostItem = keriannePage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Ghost Pepper Potato Chips' });
  await kGhostItem.getByRole('button', { name: 'S', exact: true }).click();
  await keriannePage.waitForTimeout(300);

  const kEloteItem = keriannePage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Elote Corn Chip Dippers' });
  await kEloteItem.getByRole('button', { name: 'C', exact: true }).click();
  await keriannePage.waitForTimeout(300);

  const kHummusItem = keriannePage
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Chili Onion Crunch Hummus' });
  await kHummusItem.getByRole('button', { name: 'D', exact: true }).click();
  await keriannePage.waitForTimeout(300);

  // Kerianne marks as ready
  await keriannePage.getByRole('button', { name: 'Mark as Ready' }).click();
  await expect(keriannePage.getByRole('button', { name: /✓ Ready/i })).toBeVisible();

  // 6. Reveal the Consensus!
  await bryantPage.bringToFront();
  await bryantPage.waitForTimeout(600);
  await bryantPage.getByRole('button', { name: /🎉 Reveal Consensus/i }).click();

  // Verify Revealed Consensus view
  await expect(bryantPage.getByText('Consensus Tier List')).toBeVisible();
  await expect(bryantPage.getByText('Spiciest Debate')).toBeVisible();
  await expect(bryantPage.getByText('Mind Meld')).toBeVisible();

  await bryantPage.waitForTimeout(800);
  await bryantPage.screenshot({
    path: `${ARTIFACT_DIR}/04-consensus-revealed.png`,
    fullPage: true,
  });

  // Targeted screenshot of highlight cards (Spiciest Debate & Mind Meld)
  const highlightGrid = bryantPage.locator('div.grid').filter({ hasText: 'Spiciest Debate' });
  await highlightGrid.screenshot({
    path: `${ARTIFACT_DIR}/05-spiciest-debate.png`,
  });

  // 7. Inspect Compare Tasters Tab
  await bryantPage.getByRole('button', { name: /Compare Tasters/i }).click();
  await expect(bryantPage.getByText("Kerianne's Board")).toBeVisible();
  await bryantPage.waitForTimeout(600);
  await bryantPage.screenshot({
    path: `${ARTIFACT_DIR}/06-compare-tasters.png`,
    fullPage: true,
  });

  // Finish Bryant session & close contexts to write video
  await bryantPage.waitForTimeout(1000);
  await bryantPage.close();
  await keriannePage.close();
  await bryantContext.close();
  await kerianneContext.close();
});

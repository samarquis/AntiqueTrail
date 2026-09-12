import { expect, test } from '@playwright/test'

const stores = [
  {
    slug: 'blue-finch-curios',
    name: 'Blue Finch Curios',
    summary: 'Lamp-lit rooms pair blue-and-white ceramics with small chests and walnut furniture.',
    description:
      'An antique-mall-style collection of ceramic lighting, brass accents, glassware, small chests, and walnut furniture arranged in room-like displays.',
    alt: 'Blue-painted brick storefront with antique lamps, ceramics, and small chests in the windows.',
    caption:
      'Blue-painted brick storefront with lamps, ceramics, and small chests displayed in the windows.',
  },
  {
    slug: 'cedar-brass',
    name: 'Cedar & Brass',
    summary: 'Warm wood furniture and brass candlesticks shape a compact vintage storefront.',
    description:
      'A vintage-focused setting built around a walnut cabinet, brass candlesticks, and the warm cedar-and-brick character shown in the storefront image.',
    alt: 'Cedar-clad storefront displaying a walnut cabinet and brass candlesticks.',
    caption:
      'Cedar-clad storefront with a walnut cabinet and brass candlesticks in the display window.',
  },
  {
    slug: 'elm-street-finds',
    name: 'Elm Street Finds',
    summary: 'Pottery and framed art fill a light storefront shaded by a broad elm tree.',
    description:
      'An antique-mall-style mix of pottery and framed art presented in a cream-brick storefront with a leafy, neighborhood-shop feel.',
    alt: 'Cream brick storefront shaded by an elm tree, with pottery and framed art in the windows.',
    caption:
      'Cream brick storefront beneath an elm tree, with pottery and framed art in the windows.',
  },
  {
    slug: 'juniper-house',
    name: 'Juniper House',
    summary: 'Porch displays give this green bungalow-style vintage shop a relaxed garden setting.',
    description:
      'A vintage browsing setting arranged around a deep green craftsman storefront, porch displays, and native flowers rather than a conventional retail facade.',
    alt: 'Deep green craftsman storefront with porch displays and native flowers.',
    caption:
      'Deep green craftsman storefront with porch displays and native flowers along the walk.',
  },
  {
    slug: 'maple-lantern',
    name: 'Maple Lantern',
    summary: 'A glowing lantern leads into a stone corner display of antique furniture.',
    description:
      'An antique-mall-style furniture display framed by stone walls, maple-red trim, and the warm light of a prominent entry lantern.',
    alt: 'Stone corner storefront with red trim, a glowing lantern, and antique furniture.',
    caption:
      'Stone corner storefront with red trim, a glowing entry lantern, and antique furniture on display.',
  },
  {
    slug: 'north-star-relics',
    name: 'North Star Relics',
    summary:
      'Travel trunks, maps, and wooden chairs give this vintage storefront an explorer theme.',
    description:
      'A vintage collection centered on travel trunks, maps, and wooden seating, presented behind a cream masonry facade with navy trim.',
    alt: 'Navy-trimmed storefront displaying travel trunks, maps, and wooden chairs.',
    caption:
      'Cream masonry storefront with navy trim and window displays of trunks, maps, and wooden chairs.',
  },
  {
    slug: 'prairie-cabinet',
    name: 'Prairie Cabinet',
    summary: 'Oak cabinets and woven rugs anchor broad windows inspired by prairie interiors.',
    description:
      'An antique-mall-style furniture setting where oak cabinetry and woven rugs are the main visual themes behind wide buff-brick storefront windows.',
    alt: 'Buff brick storefront with oak cabinets and woven rugs behind broad windows.',
    caption: 'Buff brick storefront with broad windows displaying oak cabinets and woven rugs.',
  },
  {
    slug: 'redbud-market',
    name: 'Redbud Market',
    summary: 'Colorful quilts brighten a rose-red vintage storefront beneath a flowering redbud.',
    description:
      'A vintage textile setting focused on quilts, with a rose-red brick facade and blooming redbud giving the storefront its distinct identity.',
    alt: 'Rose-red storefront beneath a blooming redbud tree, with quilts in the windows.',
    caption:
      'Rose-red brick storefront beneath a blooming redbud tree, with quilts filling the windows.',
  },
  {
    slug: 'sunflower-salvage',
    name: 'Sunflower Salvage',
    summary: 'Salvaged furniture meets bright sunflower planters in an industrial-style setting.',
    description:
      'An antique-mall-style assortment of salvaged furniture presented against white industrial brick, a mustard-colored door, and sunflower planters.',
    alt: 'White brick storefront with a mustard door, sunflower planters, and salvaged furniture.',
    caption:
      'White industrial-brick storefront with a mustard door, sunflower planters, and salvaged furniture.',
  },
  {
    slug: 'tallgrass-treasures',
    name: 'Tallgrass Treasures',
    summary:
      'Pottery and quilts sit behind tall grasses in a warm, understated vintage storefront.',
    description:
      'A vintage mix of pottery and quilts displayed in a tan-brick setting framed by native-grass planters and soft natural textures.',
    alt: 'Tan brick storefront framed by tall grasses, with pottery and quilts on display.',
    caption:
      'Tan brick storefront framed by tall grasses, with pottery and quilts in the display windows.',
  },
  {
    slug: 'union-station-vintage',
    name: 'Union Station Vintage',
    summary:
      'Railway arches frame travel trunks, clocks, and vintage chairs in a reused station setting.',
    description:
      'An antique-mall-style collection of travel trunks, clocks, and vintage chairs presented beneath brick railway arches and teal doors.',
    alt: 'Arched brick storefront with teal doors, travel trunks, clocks, and vintage chairs.',
    caption:
      'Reused railway storefront with brick arches, teal doors, trunks, clocks, and vintage chairs.',
  },
  {
    slug: 'willow-wren',
    name: 'Willow & Wren',
    summary: 'Baskets, botanical art, and chairs create a gentle vintage display beside the creek.',
    description:
      'A vintage collection of woven baskets, botanical art, and seating shown in a willow-green storefront with a quiet creekside setting.',
    alt: 'Willow-green storefront beside a creek, displaying baskets, botanical art, and chairs.',
    caption: 'Willow-green creekside storefront displaying baskets, botanical art, and chairs.',
  },
] as const

test.describe('Issue 357 synthetic store content comparison', () => {
  test('keeps all twelve Browse and Details identities distinct and media-truthful', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await page.goto('/stores', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.catalog-card')).toHaveCount(stores.length)

    for (const store of stores) {
      const card = page.locator('.catalog-card').filter({ hasText: store.name })
      await expect(card).toContainText(store.summary)
      await expect(card.getByRole('img', { name: store.alt })).toBeVisible()
    }

    for (const store of stores) {
      await page.goto(`/stores/${store.slug}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1, name: store.name })).toBeVisible({
        timeout: 60_000,
      })
      await expect(page.getByText(store.description, { exact: true })).toBeVisible()
      await expect(page.getByRole('img', { name: store.alt }).first()).toBeVisible()
      await expect(page.getByText(store.caption, { exact: true }).first()).toBeVisible()
      await expect(
        page.getByText(/OpenAI-generated fictional image · Internal Alpha only/u).first(),
      ).toBeVisible()
      await expect(
        page.getByText(/Synthetic wall-evaluation fixture · Internal only/u),
      ).toBeVisible()
    }
  })
})

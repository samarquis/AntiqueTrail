export const FIXTURE_SCHEMA_VERSION = 1
export const FIXTURE_SEED = 'antique-trail-synthetic-wall-evaluation-v1'
export const SVG_WIDTH = 1280
export const SVG_HEIGHT = 960
export const EVALUATION_RECORDS_PER_STORE = 50
export const RIGHTS_LABEL =
  'Synthetic wall-evaluation fixture image · Internal only · Generated from stored templates'

export const DESIGNATED_SLUGS = [
  'blue-finch-curios',
  'cedar-and-brass',
  'elm-street-finds',
  'juniper-house',
  'maple-lantern',
  'north-star-relics',
  'prairie-cabinet',
  'redbud-market',
  'sunflower-salvage',
  'tallgrass-treasures',
  'union-station-vintage',
  'willow-and-wren',
]

export const STORE_NAMES = {
  'blue-finch-curios': 'Blue Finch Curios',
  'cedar-and-brass': 'Cedar & Brass',
  'elm-street-finds': 'Elm Street Finds',
  'juniper-house': 'Juniper House',
  'maple-lantern': 'Maple Lantern',
  'north-star-relics': 'North Star Relics',
  'prairie-cabinet': 'Prairie Cabinet',
  'redbud-market': 'Redbud Market',
  'sunflower-salvage': 'Sunflower Salvage',
  'tallgrass-treasures': 'Tallgrass Treasures',
  'union-station-vintage': 'Union Station Vintage',
  'willow-and-wren': 'Willow & Wren',
}

export const COVER_EXTRAS = { 'blue-finch-curios': 3 }

export const BLUE_FINCH_EXTRA_FILES = [
  'blue-finch-curios-gallery-aisle.webp',
  'blue-finch-curios-gallery-vignette.webp',
  'blue-finch-curios-gallery-cabinet.webp',
]

export function galleryRecordCount(slug) {
  return EVALUATION_RECORDS_PER_STORE - 1 - (COVER_EXTRAS[slug] ?? 0)
}

export const TOTAL_GALLERY_RECORDS = DESIGNATED_SLUGS.reduce(
  (total, slug) => total + galleryRecordCount(slug),
  0,
)

export function coverFile(slug) {
  return `${slug}-cover.webp`
}

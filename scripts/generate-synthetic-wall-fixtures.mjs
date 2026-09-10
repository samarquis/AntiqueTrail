import crypto from 'node:crypto'
/* globals console */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BLUE_FINCH_EXTRA_FILES,
  COVER_EXTRAS,
  DESIGNATED_SLUGS,
  EVALUATION_RECORDS_PER_STORE,
  FIXTURE_SCHEMA_VERSION,
  FIXTURE_SEED,
  RIGHTS_LABEL,
  STORE_NAMES,
  SVG_HEIGHT,
  SVG_WIDTH,
  TOTAL_GALLERY_RECORDS,
  coverFile,
  galleryRecordCount,
} from './fixture-wall-constants.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesRoot = path.join(root, 'public', 'images', 'synthetic-fixtures')

function hashString(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRandom(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)]
}

const THEMES = {
  'blue-finch-curios': {
    wall: ['#cfe0e6', '#b3cdd8'],
    wallNames: ['smoke-blue', 'cobalt-tinted'],
    wallSurface: 'brick wall',
    floor: '#e8e0cf',
    accents: ['#25424f', '#d9b95c', '#7a4a2f', '#6d8291'],
    accentNames: ['ink blue', 'brass', 'chestnut', 'slate'],
    wood: 'walnut',
    art: ['#8fb0bb', '#d9b95c'],
    looks: ['timeworn', 'brass-trimmed', 'carved', 'painted', 'towering'],
  },
  'cedar-and-brass': {
    wall: ['#c2b196', '#a8916f'],
    wallNames: ['cedar', 'honey'],
    wallSurface: 'cedar plank wall',
    floor: '#d8cdb8',
    accents: ['#2f2a22', '#a98f4f', '#6e5a3f', '#efe6d2'],
    accentNames: ['dark walnut', 'old brass', 'copper', 'cream'],
    wood: 'cedar',
    art: ['#a98f4f', '#efe6d2'],
    looks: ['oiled', 'brass-trimmed', 'sturdy', 'hand-pegged', 'aged'],
  },
  'elm-street-finds': {
    wall: ['#e6dec9', '#d4c8aa'],
    wallNames: ['cream', 'sand'],
    wallSurface: 'cream brick wall',
    floor: '#cbbf9d',
    accents: ['#4f6b52', '#8a7754', '#cfd2d8', '#b0543f'],
    accentNames: ['forest', 'tobacco', 'porcelain', 'rust'],
    wood: 'elm',
    art: ['#8a7754', '#cfd2d8'],
    looks: ['freshly-oiled', 'compact', 'painted', 'dusty', 'rounded'],
  },
  'juniper-house': {
    wall: ['#bdccb8', '#a3b79e'],
    wallNames: ['juniper', 'moss'],
    wallSurface: 'craftsman plaster wall',
    floor: '#d9cfb4',
    accents: ['#2f4533', '#7d8f74', '#d9c07f', '#4a3f2f'],
    accentNames: ['pine', 'sage', 'butter', 'umber'],
    wood: 'juniper',
    art: ['#7d8f74', '#d9c07f'],
    looks: ['hand-turned', 'carved', 'timeworn', 'compact', 'green-tinted'],
  },
  'maple-lantern': {
    wall: ['#dbbb9d', '#c9a181'],
    wallNames: ['maple', 'clay'],
    wallSurface: 'stone wall',
    floor: '#e0d2b3',
    accents: ['#5a2d1c', '#8a512f', '#e3c67e', '#2f3b45'],
    accentNames: ['sienna', 'caramel', 'beeswax', 'slate blue'],
    wood: 'maple',
    art: ['#8a512f', '#e3c67e'],
    looks: ['carved', 'polished', 'lit', 'hand-turned', 'stout'],
  },
  'north-star-relics': {
    wall: ['#c6cfdc', '#aeb9cb'],
    wallNames: ['navy', 'powder'],
    wallSurface: 'navy-trim plaster wall',
    floor: '#d7cfc0',
    accents: ['#28313f', '#7b8898', '#c4944a', '#3f5a6b'],
    accentNames: ['midnight', 'steel', 'antique gold', 'slate'],
    wood: 'hickory',
    art: ['#7b8898', '#c4944a'],
    looks: ['compass-stamped', 'aged', 'navy-trimmed', 'squared', 'brass-trimmed'],
  },
  'prairie-cabinet': {
    wall: ['#ddccb3', '#ccb798'],
    wallNames: ['buff', 'flax'],
    wallSurface: 'buff brick wall',
    floor: '#dccfae',
    accents: ['#3d3427', '#96845f', '#c9a25a', '#5c6b54'],
    accentNames: ['espresso', 'hazel', 'grain gold', 'olive'],
    wood: 'oak',
    art: ['#96845f', '#c9a25a'],
    looks: ['hand-pegged', 'timeworn', 'oiled', 'broad', 'cupboard'],
  },
  'redbud-market': {
    wall: ['#e6d1c2', '#dbbc9f'],
    wallNames: ['rose', 'peach'],
    wallSurface: 'rose brick wall',
    floor: '#dccbb4',
    accents: ['#6e2f3b', '#a7605e', '#c9b36a', '#4a5568'],
    accentNames: ['wine', 'terra-cotta', 'flax', 'slate'],
    wood: 'cherry',
    art: ['#a7605e', '#c9b36a'],
    looks: ['painted', 'compact', 'petal-toned', 'carved', 'polished'],
  },
  'sunflower-salvage': {
    wall: ['#eee1c3', '#e1cd9e'],
    wallNames: ['sunflower', 'oat'],
    wallSurface: 'white brick wall',
    floor: '#e3d4ac',
    accents: ['#8a6b2f', '#c0942f', '#5f6f45', '#8a5a3b'],
    accentNames: ['mustard', 'sun gold', 'olive', 'bronze'],
    wood: 'teak',
    art: ['#c0942f', '#5f6f45'],
    looks: ['sun-bleached', 'freshly-oiled', 'salvaged', 'bright', 'hand-turned'],
  },
  'tallgrass-treasures': {
    wall: ['#e8dec4', '#d9c9a3'],
    wallNames: ['tan', 'wheat'],
    wallSurface: 'tan brick wall',
    floor: '#dccfae',
    accents: ['#7c4a38', '#a9844f', '#5f7f5a', '#c8a24a'],
    accentNames: ['rust', 'chamois', 'prairie green', 'honey'],
    wood: 'locust',
    art: ['#a9844f', '#c8a24a'],
    looks: ['timeworn', 'grass-tinted', 'carved', 'oiled', 'broad'],
  },
  'union-station-vintage': {
    wall: ['#c5cbd9', '#adb6cb'],
    wallNames: ['station', 'iron'],
    wallSurface: 'arched brick wall',
    floor: '#d0ccc0',
    accents: ['#2e4357', '#8f9886', '#b8a86b', '#6b4f3f'],
    accentNames: ['rail blue', 'silver sage', 'ticket gold', 'chestnut'],
    wood: 'ash',
    art: ['#8f9886', '#b8a86b'],
    looks: ['station-worn', 'brass-trimmed', 'towering', 'squared', 'steam-aged'],
  },
  'willow-and-wren': {
    wall: ['#cfdbc9', '#b5c7b0'],
    wallNames: ['willow', 'fern'],
    wallSurface: 'willow-green plaster wall',
    floor: '#ddcdb0',
    accents: ['#3f5d4f', '#87937a', '#d0b473', '#7a5a43'],
    accentNames: ['river green', 'moss', 'reed gold', 'chestnut'],
    wood: 'basswood',
    art: ['#87937a', '#d0b473'],
    looks: ['nest-woven', 'freshly-oiled', 'compact', 'hand-turned', 'leaf-trimmed'],
  },
}

const FORMS = {
  urn: {
    noun: 'storage urn',
    draw(w, h, colors) {
      const cx = round(w / 2)
      const bodyR = round(w * 0.28)
      const bodyCy = round(-h * 0.42)
      const bodyRy = round(h * 0.32)
      return [
        `<ellipse cx="${cx}" cy="${bodyCy}" rx="${bodyR}" ry="${bodyRy}" fill="${colors.body}"/>`,
        `<path d="M ${round(cx - w * 0.1)} ${round(-h * 0.2)} L ${round(cx - w * 0.1)} ${round(-h * 0.04)} L ${round(cx + w * 0.1)} ${round(-h * 0.04)} L ${round(cx + w * 0.1)} ${round(-h * 0.2)} Z" fill="${colors.trim}"/>`,
        `<rect x="${round(cx - w * 0.16)}" y="${round(-h * 0.78)}" width="${round(w * 0.32)}" height="${round(h * 0.14)}" fill="${colors.trim}"/>`,
        `<ellipse cx="${cx}" cy="${round(-h * 0.78)}" rx="${round(w * 0.12)}" ry="${round(h * 0.07)}" fill="${colors.body}"/>`,
        `<ellipse cx="${cx}" cy="${round(-h * 0.02)}" rx="${round(w * 0.2)}" ry="${round(h * 0.06)}" fill="${colors.trim}"/>`,
      ].join('')
    },
  },
  vase: {
    noun: 'tapered vase',
    draw(w, h, colors) {
      const cx = round(w / 2)
      return [
        `<path d="M ${round(cx - w * 0.14)} 0 L ${round(cx - w * 0.26)} ${round(-h * 0.52)} L ${round(cx + w * 0.26)} ${round(-h * 0.52)} L ${round(cx + w * 0.14)} 0 Z" fill="${colors.body}"/>`,
        `<rect x="${round(cx - w * 0.1)}" y="${round(-h * 0.74)}" width="${round(w * 0.2)}" height="${round(h * 0.24)}" fill="${colors.trim}"/>`,
        `<rect x="${round(cx - w * 0.16)}" y="${round(-h * 0.8)}" width="${round(w * 0.32)}" height="${round(h * 0.08)}" fill="${colors.trim}"/>`,
        `<rect x="${round(cx - w * 0.2)}" y="${round(-h * 0.05)}" width="${round(w * 0.4)}" height="${round(h * 0.05)}" fill="${colors.trim}"/>`,
      ].join('')
    },
  },
  lamp: {
    noun: 'table lamp',
    draw(w, h, colors) {
      const cx = round(w / 2)
      return [
        `<path d="M ${round(cx - w * 0.22)} 0 L ${round(cx - w * 0.1)} ${round(-h * 0.6)} L ${round(cx + w * 0.1)} ${round(-h * 0.6)} L ${round(cx + w * 0.22)} 0 Z" fill="${colors.body}"/>`,
        `<path d="M ${round(cx - w * 0.3)} ${round(-h * 0.6)} L ${round(cx - w * 0.4)} ${round(-h * 0.88)} L ${round(cx + w * 0.4)} ${round(-h * 0.88)} L ${round(cx + w * 0.3)} ${round(-h * 0.6)} Z" fill="${colors.trim}"/>`,
        `<rect x="${round(cx - w * 0.32)}" y="${round(-h * 0.06)}" width="${round(w * 0.64)}" height="${round(h * 0.06)}" fill="${colors.trim}"/>`,
        `<ellipse cx="${cx}" cy="${round(-h * 0.75)}" rx="${round(w * 0.22)}" ry="${round(h * 0.05)}" fill="${colors.glow}"/>`,
      ].join('')
    },
  },
  clock: {
    noun: 'regulator clock',
    draw(w, h, colors) {
      const cx = round(w / 2)
      const cy = round(-h * 0.5)
      const r = round(w * 0.28)
      return [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.face}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${round(r * 0.88)}" fill="${colors.body}"/>`,
        `<rect x="${cx}" y="${round(-h * 0.52)}" width="2" height="${round(r * 0.45)}" fill="${colors.ink}"/>`,
        `<rect x="${cx}" y="${cy}" width="${round(r * 0.4)}" height="2" fill="${colors.ink}"/>`,
        `<rect x="${round(cx - w * 0.16)}" y="${round(-h * 0.66)}" width="${round(w * 0.32)}" height="${round(h * 0.34)}" fill="${colors.body}"/>`,
        `<rect x="${round(cx - w * 0.05)}" 0 width="${round(w * 0.1)}" height="${round(h * 0.12)}" fill="${colors.trim}"/>`,
      ].join('')
    },
  },
  books: {
    noun: 'stack of books',
    draw(w, h, colors) {
      const cx = round(w / 2)
      const tiers = [
        { w: 0.9, h: 0.24, offset: 0 },
        { w: 0.72, h: 0.24, offset: 0.26 },
        { w: 0.54, h: 0.24, offset: 0.52 },
      ]
      return (
        tiers
          .map((tier, index) => {
            const x = round(cx - (tier.w * w) / 2)
            const yTop = round(-h * (tier.offset + tier.h))
            const fill = index % 2 ? colors.body : colors.trim
            return `<rect x="${x}" y="${yTop}" width="${round(tier.w * w)}" height="${round(tier.h * h)}" fill="${fill}"/>`
          })
          .join('') +
        `<rect x="${round(cx - w * 0.27)}" y="${round(-h * 0.8)}" width="${round(w * 0.54)}" height="${round(h * 0.06)}" fill="${colors.ink}"/>`
      )
    },
  },
  basket: {
    noun: 'woven basket',
    draw(w, h, colors) {
      const top = round(-h * 0.62)
      const cx = round(w / 2)
      const seam = [0.24, 0.44, 0.64].map((ratio) => {
        const y = round(-h * ratio)
        const inset = round((w * (1 - Math.abs(0.5 - ratio) * 0.7)) / 2)
        return [
          `<line x1="${round(cx - inset)}" y1="${y}" x2="${round(cx + inset)}" y2="${y}" stroke="${colors.trim}" stroke-width="4"/>`,
        ]
      })
      return [
        `<path d="M ${round(cx - w * 0.3)} 0 L ${round(cx - w * 0.42)} ${top} L ${round(cx + w * 0.42)} ${top} L ${round(cx + w * 0.3)} 0 Z" fill="${colors.body}"/>`,
        ...seam.flat(),
        `<path d="M ${round(cx - w * 0.2)} ${top} Q ${cx} ${round(top - h * 0.22)} ${round(cx + w * 0.2)} ${top}" fill="none" stroke="${colors.trim}" stroke-width="${round(w * 0.06)}" stroke-linecap="round"/>`,
      ].join('')
    },
  },
  cabinet: {
    noun: 'glass-front cabinet',
    draw(w, h, colors) {
      const doorTop = round(-h * 0.88)
      const doorBottom = round(-h * 0.06)
      return [
        `<rect x="0" y="${round(-h * 0.96)}" width="${round(w)}" height="${round(h * 0.14)}" fill="${colors.trim}"/>`,
        `<rect x="${round(w * 0.04)}" y="${doorTop}" width="${round(w * 0.42)}" height="${round(doorBottom - doorTop)}" fill="${colors.body}"/>`,
        `<rect x="${round(w * 0.54)}" y="${doorTop}" width="${round(w * 0.42)}" height="${round(doorBottom - doorTop)}" fill="${colors.trim}"/>`,
        `<line x1="${round(w * 0.25)}" y1="${doorTop}" x2="${round(w * 0.25)}" y2="${doorBottom}" stroke="${colors.glass}" stroke-width="${Math.max(2, round(w * 0.02))}"/>`,
        `<circle cx="${round(w * 0.72)}" cy="${round((doorTop + doorBottom) / 2)}" r="${round(w * 0.045)}" fill="${colors.ink}"/>`,
        `<rect x="${round(w * 0.08)}" y="${round(-h * 0.04)}" width="${round(w * 0.84)}" height="${round(h * 0.04)}" fill="${colors.trim}"/>`,
      ].join('')
    },
  },
  crate: {
    noun: 'salvage crate',
    draw(w, h, colors) {
      const cx = round(w / 2)
      return [
        `<rect x="0" y="${round(-h * 0.94)}" width="${round(w)}" height="${round(h * 0.94)}" fill="${colors.body}"/>`,
        `<rect x="${round(w * 0.08)}" y="${round(-h * 0.78)}" width="${round(w * 0.84)}" height="${round(h * 0.14)}" fill="${colors.trim}"/>`,
        `<rect x="${round(w * 0.08)}" y="${round(-h * 0.42)}" width="${round(w * 0.84)}" height="${round(h * 0.12)}" fill="${colors.trim}"/>`,
        `<rect x="${round(cx - w * 0.04)}" y="${round(-h * 0.94)}" width="${round(w * 0.08)}" height="${round(h * 0.94)}" fill="${colors.trim}"/>`,
        `<line x1="${round(w * 0.14)}" y1="${round(-h * 0.94)}" x2="${round(w * 0.14)}" y2="0" stroke="${colors.ink}" stroke-width="2"/>`,
        `<line x1="${round(w * 0.86)}" y1="${round(-h * 0.94)}" x2="${round(w * 0.86)}" y2="0" stroke="${colors.ink}" stroke-width="2"/>`,
      ].join('')
    },
  },
  plant: {
    noun: 'potted plant',
    draw(w, h, colors) {
      const cx = round(w / 2)
      const potTop = round(-h * 0.3)
      const leaves = [0.14, 0.34, 0.54, 0.72, 0.88].map((ratio) => {
        const x = round(cx + (ratio - 0.5) * w * 1.1)
        const y = round(-h * (0.24 + ratio * 0.78))
        const r = round(w * 0.14)
        return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${round(r * 1.3)}" fill="${colors.leaf}"/>`
      })
      return [
        `<path d="M ${round(cx - w * 0.26)} 0 L ${round(cx - w * 0.32)} ${potTop} L ${round(cx + w * 0.32)} ${potTop} L ${round(cx + w * 0.26)} 0 Z" fill="${colors.body}"/>`,
        `<rect x="${round(cx - w * 0.34)}" y="${potTop}" width="${round(w * 0.68)}" height="${round(h * 0.05)}" fill="${colors.trim}"/>`,
        ...leaves,
      ].join('')
    },
  },
  mirror: {
    noun: 'wall mirror',
    draw(w, h, colors) {
      const frameTop = round(-h * 0.88)
      const frameBottom = round(-h * 0.22)
      return [
        `<rect x="${round(w * 0.06)}" y="${frameTop}" width="${round(w * 0.88)}" height="${round(frameBottom - frameTop)}" rx="12" fill="${colors.trim}"/>`,
        `<rect x="${round(w * 0.16)}" y="${round(frameTop + h * 0.06)}" width="${round(w * 0.68)}" height="${round(frameBottom - frameTop - h * 0.12)}" rx="8" fill="${colors.glass}"/>`,
        `<path d="M ${round(w * 0.24)} ${round(frameBottom - h * 0.04)} L ${round(w * 0.3)} 0 L ${round(w * 0.36)} ${round(frameBottom - h * 0.04)} Z" fill="${colors.body}"/>`,
        `<path d="M ${round(w * 0.66)} ${round(frameBottom - h * 0.04)} L ${round(w * 0.72)} 0 L ${round(w * 0.78)} ${round(frameBottom - h * 0.04)} Z" fill="${colors.body}"/>`,
      ].join('')
    },
  },
  globe: {
    noun: 'standing globe',
    draw(w, h, colors) {
      const cx = round(w / 2)
      const gCy = round(-h * 0.5)
      const r = round(w * 0.28)
      return [
        `<circle cx="${cx}" cy="${gCy}" r="${r}" fill="${colors.body}"/>`,
        `<ellipse cx="${cx}" cy="${gCy}" rx="${round(r * 0.45)}" ry="${round(r * 1.05)}" fill="none" stroke="${colors.trim}" stroke-width="3"/>`,
        `<path d="M ${round(cx - r)} ${gCy} A ${r} ${round(r * 0.35)} 0 0 1 ${round(cx + r)} ${gCy}" fill="none" stroke="${colors.trim}" stroke-width="3"/>`,
        `<rect x="${round(cx - w * 0.06)}" y="${gCy}" width="${round(w * 0.12)}" height="${round(h * 0.46)}" fill="${colors.trim}"/>`,
        `<ellipse cx="${cx}" cy="${round(-h * 0.04)}" rx="${round(w * 0.28)}" ry="${round(h * 0.05)}" fill="${colors.trim}"/>`,
      ].join('')
    },
  },
}

const FORM_KEYS = Object.keys(FORMS)
const WALL_TOP = 430
const SHELF_Y = 648
const FLOOR_Y = 648

function placedObject(kind, x, y, w, h, colors, random) {
  const mirrored = random() < 0.4
  const inner = FORMS[kind].draw(w, h, colors)
  const group = mirrored
    ? `<g transform="translate(${round(x + w)} 0) scale(-1 1)">${inner}</g>`
    : `<g transform="translate(${round(x)} 0)">${inner}</g>`
  const shadow = `<ellipse cx="${round(x + w / 2)}" cy="${round(y - 4)}" rx="${round(w * 0.44)}" ry="${round(w * 0.07)}" fill="#000000" opacity="0.14"/>`
  return { svg: `${group}${shadow}`, noun: FORMS[kind].noun }
}

function drawScene({ slug, name, k }) {
  const theme = THEMES[slug]
  const seedText = `${FIXTURE_SEED}::${slug}::wall::${k}`
  const random = createRandom(hashString(seedText))

  const pool = [...FORM_KEYS]
  const chosen = []
  for (let index = 0; index < 3; index += 1) {
    const slot = Math.floor(random() * pool.length)
    chosen.push(pool.splice(slot, 1)[0])
  }

  const slots = [
    { minX: 70, minW: 170, maxW: 280, minH: 170, maxH: 330 },
    { minX: 540, minW: 180, maxW: 300, minH: 190, maxH: 390 },
    { minX: 990, minW: 170, maxW: 280, minH: 170, maxH: 330 },
  ]
  const placed = chosen.map((kind, index) => {
    const slot = slots[index]
    const w = slot.minW + random() * (slot.maxW - slot.minW)
    const h = slot.minH + random() * (slot.maxH - slot.minH)
    const x = slot.minX
    const colors = {
      body: pick(theme.accents, random),
      trim: pick(theme.accents, random),
      glow: '#f2dc9b',
      glass: '#e7f2f2',
      leaf: pick(theme.accents, random),
      face: pick(theme.accents, random),
      ink: '#241d16',
    }
    return placedObject(kind, x, SHELF_Y, w, h, colors, random)
  })

  const nounPhrases = placed.map((item) => {
    const look = pick(theme.looks, random)
    return `a ${look} ${item.noun}`
  })

  const alt = `Fictional ${name} evaluation wall ${k}: ${nounPhrases.join(' beside ')} on the ${theme.wood} shelf against the ${pick(theme.wallNames, random)} ${theme.wallSurface}.`
  const caption = `Fictional ${name} evaluation fixture ${k} of ${EVALUATION_RECORDS_PER_STORE} · ${placed.map((item) => item.noun).join(', ')} display vignette.`

  const wallTop = theme.wall[0]
  const wallLower = theme.wall[1]
  const archColor = pick(theme.accents, random)
  const archX = 575
  const archWidth = 210
  const artColors = theme.art
  const rugColor = pick(theme.accents, random)
  const rugX = 330 + random() * 180
  const rugY = 812 + random() * 60

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">`,
    `<rect x="0" y="0" width="${SVG_WIDTH}" height="${WALL_TOP}" fill="${wallTop}"/>`,
    `<rect x="0" y="${WALL_TOP}" width="${SVG_WIDTH}" height="${SHELF_Y - WALL_TOP}" fill="${wallLower}"/>`,
    `<rect x="0" y="${WALL_TOP - 6}" width="${SVG_WIDTH}" height="6" fill="#000000" opacity="0.08"/>`,
    `<path d="M ${archX} ${SHELF_Y} L ${archX} ${SHELF_Y - 320} Q ${archX + archWidth / 2} ${SHELF_Y - 470} ${archX + archWidth} ${SHELF_Y - 320} L ${archX + archWidth} ${SHELF_Y} Z" fill="${archColor}" opacity="0.5"/>`,
    `<rect x="${archX + archWidth + 70}" y="180" width="170" height="230" fill="${artColors[0]}"/>`,
    `<rect x="${archX + archWidth + 84}" y="196" width="142" height="158" fill="${artColors[1]}"/>`,
    `<rect x="${archX + archWidth + 96}" y="252" width="110" height="46" fill="${artColors[0]}"/>`,
    `<rect x="0" y="${FLOOR_Y}" width="${SVG_WIDTH}" height="${SVG_HEIGHT - FLOOR_Y}" fill="${theme.floor}"/>`,
    `<line x1="0" y1="${FLOOR_Y + 200}" x2="${SVG_WIDTH}" y2="${FLOOR_Y + 200}" stroke="#000000" stroke-width="2" opacity="0.1"/>`,
    `<line x1="0" y1="${FLOOR_Y + 255}" x2="${SVG_WIDTH}" y2="${FLOOR_Y + 255}" stroke="#000000" stroke-width="2" opacity="0.08"/>`,
    `<ellipse cx="${rugX}" cy="${rugY}" rx="260" ry="70" fill="${rugColor}" opacity="0.55"/>`,
    `<rect x="0" y="${SHELF_Y - 10}" width="${SVG_WIDTH}" height="14" fill="#4a4033"/>`,
    `<rect x="0" y="${SHELF_Y + 4}" width="${SVG_WIDTH}" height="4" fill="#d8cfb8" opacity="0.55"/>`,
    ...placed.map((item) => item.svg),
    `<text x="${SVG_WIDTH - 20}" y="${SVG_HEIGHT - 22}" font-family="sans-serif" font-size="22" text-anchor="end" fill="#4a4033" opacity="0.6">Synthetic evaluation fixture · ${k} of ${EVALUATION_RECORDS_PER_STORE}</text>`,
    `</svg>`,
  ].join('\n')

  return { svg: `${svg}\n`, alt, caption }
}

function buildRecords() {
  const records = []
  for (const slug of DESIGNATED_SLUGS) {
    const name = STORE_NAMES[slug]
    const count = galleryRecordCount(slug)
    for (let index = 0; index < count; index += 1) {
      const file = `${String(index + 1).padStart(3, '0')}-wall.svg`
      const k = index + 2 + (COVER_EXTRAS[slug] ?? 0)
      const scene = drawScene({ slug, name, k })
      records.push({
        slug,
        file,
        k,
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        alt: scene.alt,
        caption: scene.caption,
        rightsLabel: RIGHTS_LABEL,
      })
      fs.mkdirSync(path.join(fixturesRoot, slug), { recursive: true })
      fs.writeFileSync(path.join(fixturesRoot, slug, file), scene.svg, 'utf8')
    }
  }
  return records
}

function buildProvenance(records) {
  const relativeAssets = records
    .map((record) => `images/synthetic-fixtures/${record.slug}/${record.file}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  const fileDigest = crypto.createHash('sha256').update(relativeAssets.join('\n')).digest('hex')
  const perStoreGalleryCount = Object.fromEntries(
    DESIGNATED_SLUGS.map((slug) => [slug, galleryRecordCount(slug)]),
  )
  return {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    seed: FIXTURE_SEED,
    generator: 'scripts/generate-synthetic-wall-fixtures.mjs',
    designatedSlugs: DESIGNATED_SLUGS,
    recordsPerStoreTarget: EVALUATION_RECORDS_PER_STORE,
    perStoreGalleryCount,
    totalGalleryRecords: records.length,
    totalEvaluatedRecordsPerStoreIncludingCoverAndExtras: Object.fromEntries(
      DESIGNATED_SLUGS.map((slug) => [
        slug,
        1 + (COVER_EXTRAS[slug] ?? 0) + galleryRecordCount(slug),
      ]),
    ),
    coverExtras: COVER_EXTRAS,
    blueFinchExtraFiles: BLUE_FINCH_EXTRA_FILES,
    coverFiles: Object.fromEntries(DESIGNATED_SLUGS.map((slug) => [slug, coverFile(slug)])),
    rightsLabel: RIGHTS_LABEL,
    fileInventoryDigest: fileDigest,
    note: 'Locally hosted deterministic SVG wall fixtures for the separately authorized issue #309 evaluation profile. Not a public tier; real media stays gated.',
  }
}

function main() {
  if (fs.existsSync(fixturesRoot)) {
    fs.rmSync(fixturesRoot, { recursive: true, force: true })
  }
  fs.mkdirSync(fixturesRoot, { recursive: true })
  const records = buildRecords()
  const manifest = {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    seed: FIXTURE_SEED,
    generator: 'scripts/generate-synthetic-wall-fixtures.mjs',
    rightsLabel: RIGHTS_LABEL,
    records,
  }
  const catalogPath = path.join(root, 'src', 'features', 'catalog', 'fixtureMedia.json')
  fs.writeFileSync(catalogPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const provenance = buildProvenance(records)
  const provenancePath = path.join(root, 'docs', 'evidence', 'fixture-eval', 'provenance.json')
  fs.mkdirSync(path.dirname(provenancePath), { recursive: true })
  fs.writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
  console.log(
    `Generated ${records.length} SVG wall records across ${DESIGNATED_SLUGS.length} stores.`,
  )
  if (records.length !== TOTAL_GALLERY_RECORDS) {
    throw new Error(
      `Expected ${TOTAL_GALLERY_RECORDS} gallery records, generated ${records.length}`,
    )
  }
}

main()

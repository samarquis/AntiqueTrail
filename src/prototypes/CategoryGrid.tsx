import React, { useState } from 'react'

interface Store {
  id: string
  name: string
  category: string
  town: string
  distance: number
  hours: string
  cover: string
  rating?: number
}

export function CategoryGrid({ stores, onAdd }) {
  const [filter, setFilter] = useState<'all' | 'furniture' | 'tools' | 'books' | 'decor'>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12

  const filtered = filter !== 'all'
    ? stores.filter(s => s.category.toLowerCase().includes(filter))
    : stores

  const pageStores = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  return (
    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 12px',
            background: filter === 'all' ? '#f97316' : 'transparent',
            color: filter === 'all' ? 'white' : '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
          All
        </button>
        <button
          onClick={() => setFilter('furniture')}
          style={{
            padding: '6px 12px',
            background: filter === 'furniture' ? '#f97316' : 'transparent',
            color: filter === 'furniture' ? 'white' : '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
          Furniture
        </button>
        <button
          onClick={() => setFilter('tools')}
          style={{
            padding: '6px 12px',
            background: filter === 'tools' ? '#f97316' : 'transparent',
            color: filter === 'tools' ? 'white' : '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
          Tools
        </button>
        <button
          onClick={() => setFilter('books')}
          style={{
            padding: '6px 12px',
            background: filter === 'books' ? '#f97316' : 'transparent',
            color: filter === 'books' ? 'white' : '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
          Books
        </button>
        <button
          onClick={() => setFilter('decor')}
          style={{
            padding: '6px 12px',
            background: filter === 'decor' ? '#f97316' : 'transparent',
            color: filter === 'decor' ? 'white' : '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
          Decor
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
        {pageStores.map(s => (
          <div
            key={s.id}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '180px',
            }}>
            <img
              src={s.cover}
              alt={s.name}
              style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px', marginBottom: '6px' }}
            />
            <strong style={{ fontSize: '13px', marginBottom: '4px' }}>{s.name}</strong>
            <span style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{s.category}</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{s.town} • {s.distance} mi</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{s.hours}</span>
            {s.rating !== undefined && (
              <span style={{ fontSize: '11px', color: '#f97316', marginTop: '4px' }}>
                ⭐ {s.rating}
              </span>
            )}
            <button
              onClick={() => onAdd(s)}
              style={{
                marginTop: '4px',
                padding: '4px 8px',
                background: '#f97316',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '10px',
                alignSelf: 'flex-start',
                cursor: 'pointer',
              }}>
              Add
            </button>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
          Page {page} of {totalPages} {'·'.repeat(20)} Load more: {' '}
          {page < totalPages && (
            <button onClick={() => setPage(page + 1)} style={{ fontSize: '11px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer' }}>
              Next
            </button>
          )}{' '}{page > 1 && (
            <button onClick={() => setPage(page - 1)} style={{ fontSize: '11px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer' }}>
              Prev
            </button>
          )}
        </div>
      )}
    </div>
  )
}
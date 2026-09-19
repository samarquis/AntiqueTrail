import React, { useState } from 'react'

interface Store {
  id: string
  name: string
  category: string
  town: string
  distance: number
}

interface TripStop {
  store: Store
  estimatedDuration: number // minutes
}

export function TripBuilder({ stores, onAddStore }) {
  const [tripStops, setTripStops] = useState<TripStop[]>([])
  const [selected, setSelected] = useState<Store | null>(null)

  const addToTrip = (store: Store) => {
    const newStop: TripStop = {
      store,
      estimatedDuration: 60,
    }
    setTripStops(prev => {
      // Check if store already in trip
      if (prev.some(s => s.store.id === store.id)) return prev
      return [...prev, newStop]
    })
    setSelected(null)
  }

  const removeStop = (storeId: string) =>
    setTripStops(prev => prev.filter(s => s.store.id !== storeId))

  const tripSummary = tripStops.map((s, i) => (
    <div
      key={s.store.id}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 8px',
        background: '#f1f5f9',
        borderRadius: '4px',
        marginBottom: '4px',
        fontSize: '12px',
      }}>
      <span>{s.store.name} ({s.store.town})</span>
      <span>{s.estimatedDuration} min</span>
      <button
        onClick={() => removeStop(s.store.id)}
        style={{
          marginLeft: '8px',
          padding: '2px 6px',
          background: 'transparent',
          border: 'none',
          color: '#e53e3e',
          fontSize: '11px',
          cursor: 'pointer',
        }}>
        ✕
      </button>
    </div>
  ))

  return (
    <div style={{ display: 'flex', height: '320px', width: '100%', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Left: Trip plan panel */}
      <div
        style={{
          flex: '0 0 200px',
          borderRight: '1px solid #e2e8f0',
          overflowY: 'auto',
          background: '#f8fafc',
        }}>
        <strong style={{ fontSize: '13px', padding: '8px 12px' }}>📋 My Day Trip</strong>
        <div style={{ padding: '0 12px' }}>
          {tripStops.length === 0 && (
            <div style={{ padding: '8px 12px', color: '#64748b' }}>
              No stops yet – browse stores on the right
            </div>
          )}
          {tripSummary}
          {tripStops.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={() => alert('Start Trip!')}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}>
                Start Trip →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Store suggestions */}
      <div style={{ flex: '1', overflowY: 'auto', background: '#fff' }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#64748b',
          }}>
            <span>Add stores</span>
            <span>→</span>
          </div>
        <div style={{ padding: '0 12px' }}>
          {stores.map(s => (
            <div
              key={s.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '8px',
                marginBottom: '8px',
                background: '#fff',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={() => setSelected(s)}
              onMouseOut={() => setSelected(null)}
            >
              {selected && selected.id === s.id
                ? { /* highlighted state */}
                : null}
              <img
                src={s.cover}
                alt={s.name}
                style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', marginBottom: '6px' }}
              />
              <strong style={{ fontSize: '13px', marginBottom: '4px' }}>{s.name}</strong>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{s.category}</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{s.town} • {s.distance} mi</span>
              <button
                onClick={() => addToTrip(s)}
                style={{
                  marginTop: '4px',
                  padding: '4px 8px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '10px',
                  alignSelf: 'flex-start',
                }}>
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
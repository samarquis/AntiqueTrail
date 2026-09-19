interface Store {
  id: string
  name: string
  category: string
  town: string
  distance: number
  hours: string
  cover: string
}

interface MapFirstGridProps {
  stores: Store[]
  onAdd: (store: Store) => void
}

export function MapFirstGrid({ stores, onAdd }: MapFirstGridProps) {
  const filtered = stores.filter(s => s.distance <= 20)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
      {filtered.map(s => (
        <div
          key={s.id}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: '#fff',
          }}>
          <img
            src={s.cover}
            alt={s.name}
            style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }}
          />
          <div style={{ marginTop: '8px' }}>
            <strong>{s.name}</strong>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{s.category} • {s.town}</span>
            <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>📍 {s.distance} mi • {s.hours}</span>
          </div>
          <button
            onClick={() => onAdd(s)}
            style={{
              marginTop: '8px',
              alignSelf: 'flex-start',
              padding: '6px 12px',
              background: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}>
            Add to Trip
          </button>
        </div>
      ))}
      {stores.length > filtered.length && (
        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
          {stores.length - filtered.length} more stores beyond 20 mi
        </div>
      )}
    </div>
  )
}

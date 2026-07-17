import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl } from '../api-config.js'

/**
 * Public, unauthenticated page shown when someone scans a receipt or invoice
 * QR code. Deliberately shows only enough to confirm the document is
 * genuine — no items, prices, or customer details.
 */
export default function VerifyDocument({ kind }) {
  const { id } = useParams()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const path = kind === 'invoice' ? `/public/verify/invoice/${id}` : `/public/verify/receipt/${id}`
    fetch(apiUrl(`/api${path}`))
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setError('Could not check this document right now. Please try again.'))
  }, [kind, id])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#faf8f3', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '36px 28px', maxWidth: 360, width: '100%',
        textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
      }}>
        {!result && !error && (
          <div style={{ color: '#8a8272', fontSize: 14 }}>Checking…</div>
        )}
        {error && <div style={{ color: '#c0392b', fontSize: 14 }}>{error}</div>}
        {result && result.valid && (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2B2622' }}>Valid {result.document_type}</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginTop: 10 }}>{result.number}</div>
            <div style={{ fontSize: 13, color: '#8a8272', marginTop: 4 }}>
              Issued by <strong>{result.business_name}</strong>
            </div>
            <div style={{ fontSize: 12, color: '#a79d8e', marginTop: 10 }}>
              {new Date(result.date).toLocaleDateString()}
            </div>
          </>
        )}
        {result && !result.valid && (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2B2622' }}>Not Found</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>
              This code doesn't match a known {kind === 'invoice' ? 'invoice' : 'receipt'}.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

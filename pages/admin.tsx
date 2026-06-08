// pages/admin.tsx
import { useState } from 'react';

export default function Admin() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const triggerUpdate = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/trigger-update', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
    } catch (e) {
      setMessage('Error triggering update.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <h1 className="text-3xl font-bold mb-8">Admin Engine Control</h1>
      <div className="p-6 bg-white rounded-lg shadow-sm border border-zinc-200">
        <h2 className="text-xl font-semibold mb-4">Update Data & Narratives</h2>
        <p className="mb-6 text-zinc-600">Trigger a fetch of the current 2026 AFL season data and generate new narratives.</p>
        <button 
          onClick={triggerUpdate}
          disabled={loading}
          className="px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:bg-zinc-400 font-medium"
        >
          {loading ? "Processing..." : "Run Engine Update"}
        </button>
        {message && (
          <p className="mt-4 text-zinc-800 font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}

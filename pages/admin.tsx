// pages/admin.tsx
import { useState } from 'react';
import Link from 'next/link';

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
    <div className="min-h-screen bg-zinc-950 p-8 font-sans text-zinc-100">
      <header className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Engine Control</h1>
          <p className="text-zinc-400">Trigger data pipelines and narrative updates.</p>
        </div>
        <Link href="/" className="text-blue-400 hover:underline font-semibold">
          ← Back to Dashboard
        </Link>
      </header>
      <div className="p-6 bg-zinc-900 rounded-lg shadow-sm border border-zinc-800">
        <h2 className="text-xl font-semibold mb-4 text-white">Update Data & Narratives</h2>
        <p className="mb-6 text-zinc-400">Trigger a fetch of the current 2026 AFL season data and generate new narratives.</p>
        <button 
          onClick={triggerUpdate}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 font-medium transition-colors"
        >
          {loading ? "Processing..." : "Run Engine Update"}
        </button>
        {message && (
          <p className="mt-4 text-zinc-300 font-medium bg-zinc-950 p-4 rounded border border-zinc-850">{message}</p>
        )}
      </div>
    </div>
  );
}

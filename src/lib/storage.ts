import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const PROOF_BUCKET = 'payment-proofs'

/** A short-lived link to a private screenshot. */
export function useSignedUrl(path: string | null | undefined, seconds = 600): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (!path) return
    void supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, seconds).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null) })
    return () => { alive = false }
  }, [path, seconds])
  return url
}

export async function uploadProof(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Couldn’t upload the screenshot. Try again.')
}

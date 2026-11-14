import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Calls a Supabase edge function and turns its { error } body into a readable Error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = navigator.onLine ? 'Couldn’t reach the server. Try again.' : 'You’re offline. Check your connection.'
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string }
        if (payload?.error) message = payload.error
      } catch { /* keep default */ }
    }
    throw new Error(message)
  }
  return data as T
}

/** Turns a Postgres/RPC error into a short sentence. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Something went wrong. Try again.'
}

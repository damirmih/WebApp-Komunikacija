// Jedinstveno skladište: localStorage odmah, Supabase kad je podešen i korisnik ulogovan.
// Model: entries[kind][key] = { data, updated_at }. kind: done | journal | challenge | metrics | settings
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const LS_KEY = "komunikacija.entries.v1";
const LS_QUEUE = "komunikacija.queue.v1";
const listeners = new Set();

let entries = load(LS_KEY, {});
let queue = load(LS_QUEUE, []);
let supabase = null;
let user = null;
let syncState = { status: SUPABASE_URL ? "offline" : "local", lastSync: null, error: "" };

function load(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}
function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
    localStorage.setItem(LS_QUEUE, JSON.stringify(queue));
  } catch { /* privatni režim i sl. */ }
}
function emit() { listeners.forEach((fn) => fn()); }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function sync() { return syncState; }
export function currentUser() { return user; }

export function get(kind, key) { return entries[kind]?.[key]?.data ?? null; }
export function all(kind) {
  const out = {};
  for (const [k, v] of Object.entries(entries[kind] ?? {})) out[k] = v.data;
  return out;
}

export function set(kind, key, data) {
  const updated_at = new Date().toISOString();
  (entries[kind] ??= {})[key] = { data, updated_at };
  queue.push({ kind, key, data, updated_at });
  persist();
  emit();
  flush();
}

export function remove(kind, key) { set(kind, key, null); }

// ---- Supabase ----
async function client() {
  if (supabase || !SUPABASE_URL) return supabase;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await supabase.auth.getSession();
  user = data.session?.user ?? null;
  supabase.auth.onAuthStateChange((_e, session) => {
    user = session?.user ?? null;
    syncState.status = user ? "online" : "offline";
    emit();
    if (user) pull().then(flush);
  });
  syncState.status = user ? "online" : "offline";
  return supabase;
}

export async function init() {
  await client();
  if (user) { await pull(); await flush(); }
  emit();
}

export async function signIn(email, password) {
  const sb = await client();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const sb = await client();
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
}
export async function signOut() { const sb = await client(); await sb.auth.signOut(); }

async function pull() {
  const sb = await client();
  if (!sb || !user) return;
  const { data, error } = await sb.from("entries").select("kind,key,data,updated_at").eq("user_id", user.id);
  if (error) { syncState.error = error.message; emit(); return; }
  let changed = false;
  for (const row of data) {
    const local = entries[row.kind]?.[row.key];
    if (!local || local.updated_at < row.updated_at) {
      (entries[row.kind] ??= {})[row.key] = { data: row.data, updated_at: row.updated_at };
      changed = true;
    }
  }
  syncState.lastSync = new Date().toISOString();
  syncState.error = "";
  persist();
  if (changed) emit();
}

let flushing = false;
async function flush() {
  const sb = await client();
  if (!sb || !user || flushing || queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.map((q) => ({ user_id: user.id, ...q }));
    const { error } = await sb.from("entries").upsert(batch, { onConflict: "user_id,kind,key" });
    if (error) throw error;
    queue = [];
    syncState.lastSync = new Date().toISOString();
    syncState.error = "";
  } catch (e) {
    syncState.error = e.message ?? String(e);
  } finally {
    flushing = false;
    persist();
    emit();
  }
}

export function pendingCount() { return queue.length; }

export function exportJSON() {
  return JSON.stringify({ exported: new Date().toISOString(), entries }, null, 1);
}
export function importJSON(text) {
  const obj = JSON.parse(text);
  for (const [kind, map] of Object.entries(obj.entries ?? {}))
    for (const [key, v] of Object.entries(map)) set(kind, key, v.data);
}
export function resetLocal() {
  entries = {}; queue = []; persist(); emit();
}

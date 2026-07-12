import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

export interface AlbaAccountContext {
  userId: string;
  email: string;
  coupleId: string;
  subjectId: string;
  subjectName: string;
  role: "owner" | "member";
}

export async function createPartnerInvite(): Promise<{ code: string; expiresAt: string }> {
  const { data, error } = await getSupabaseClient().rpc("create_partner_invite");
  if (error) throw error;
  const invite = Array.isArray(data) ? data[0] : data;
  if (!invite) throw new Error("Supabase no devolvió el código. Ejecuta la migración 008 y vuelve a intentarlo.");
  return { code: invite.invite_code, expiresAt: invite.expires_at };
}

export async function acceptPartnerInvite(code: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("accept_partner_invite", { invite_code: code.trim() });
  if (error) throw error;
}

let sharedClient: SupabaseClient<any> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient<any> {
  if (sharedClient) return sharedClient;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Falta la configuración de Supabase.");
  sharedClient = createClient<any>(url.replace(/\/$/, ""), key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return sharedClient;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error("Supabase no devolvió una sesión.");
  return data.session;
}

export async function signUpWithPassword(email: string, password: string): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
  return data.session;
}

export async function resendSignupConfirmation(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

function authRedirectUrl(): string {
  return typeof window === "undefined" ? "https://alba-psi.vercel.app/" : `${window.location.origin}/`;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function resolveAccountContext(session: Session): Promise<AlbaAccountContext> {
  const client = getSupabaseClient();
  const { data: membership, error: membershipError } = await client
    .from("couple_members")
    .select("couple_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership && session.user.email?.toLowerCase() === "saritcarrillofuentes@gmail.com") {
    const { error: claimError } = await client.rpc("claim_legacy_cycle_dataset");
    if (claimError) throw claimError;
    return resolveAccountContext(session);
  }
  if (!membership) throw new Error("Esta cuenta todavía no tiene una pareja. Usa una invitación para unirte.");

  const { data: subject, error: subjectError } = await client
    .from("cycle_subjects")
    .select("id, display_name")
    .eq("couple_id", membership.couple_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (subjectError) throw subjectError;
  if (!subject) throw new Error("Esta pareja todavía no tiene un sujeto de ciclo.");

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    coupleId: membership.couple_id,
    subjectId: subject.id,
    subjectName: subject.display_name,
    role: membership.role,
  };
}

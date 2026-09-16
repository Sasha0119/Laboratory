/**
 * The shape of the database, hand-written to match `supabase/schema.sql`.
 *
 * Only the `profiles` table exists so far. Keep this in step with the SQL: it
 * is what gives `supabase.from('profiles')` its types, so a column renamed in
 * one place and not the other becomes a compile error rather than a runtime
 * `undefined`.
 */

/**
 * What a user is entitled to.
 *
 *   free  — Beginner content only. Every new account starts here.
 *   pro   — Everything.
 *
 * For now this is set by hand in the Supabase table editor. When real payments
 * arrive, the purchase webhook writes this same column and nothing else in the
 * app has to change.
 */
export type SubscriptionStatus = 'free' | 'pro';

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'free' || value === 'pro';
}

/**
 * A type alias rather than an interface on purpose: supabase-js requires each
 * `Row` to satisfy `Record<string, unknown>`, and TypeScript only allows that
 * for type aliases. Declared as an interface, every query would come back
 * typed `never`.
 */
export type Profile = {
  id: string;
  display_name: string;
  subscription_status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          display_name: string;
          subscription_status?: SubscriptionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          subscription_status?: SubscriptionStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    // `{ [_ in never]: never }` is the "no members at all" shape the Supabase
    // type generator emits. `Record<string, never>` looks equivalent but is
    // not: it claims *every* key exists with type `never`, which intersects
    // with Tables and collapses every row type to `never`.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

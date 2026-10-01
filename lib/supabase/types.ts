/**
 * The shape of the database, hand-written to match `supabase/schema.sql`.
 *
 * Only the `profiles` table exists so far. Keep this in step with the SQL: it
 * is what gives `supabase.from('profiles')` its types, so a column renamed in
 * one place and not the other becomes a compile error rather than a runtime
 * `undefined`.
 */

/**
 * A type alias rather than an interface on purpose: supabase-js requires each
 * `Row` to satisfy `Record<string, unknown>`, and TypeScript only allows that
 * for type aliases. Declared as an interface, every query would come back
 * typed `never`.
 */
export type Profile = {
  id: string;
  display_name: string;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
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
        };
    CompositeTypes: { [_ in never]: never };
  };
}

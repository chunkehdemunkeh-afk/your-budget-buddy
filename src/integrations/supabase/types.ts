export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          created_at: string
          household_id: string
          icon: string
          id: string
          is_default: boolean
          monthly_budget: number | null
          name: string
          type: Database["public"]["Enums"]["category_type"]
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          household_id: string
          icon?: string
          id?: string
          is_default?: boolean
          monthly_budget?: number | null
          name: string
          type?: Database["public"]["Enums"]["category_type"]
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          is_default?: boolean
          monthly_budget?: number | null
          name?: string
          type?: Database["public"]["Enums"]["category_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          created_at: string
          goal_id: string
          household_id: string
          id: string
          note: string | null
          occurred_on: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          goal_id: string
          household_id: string
          id?: string
          note?: string | null
          occurred_on?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          goal_id?: string
          household_id?: string
          id?: string
          note?: string | null
          occurred_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          color: string
          created_at: string
          household_id: string
          icon: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          household_id: string
          icon?: string
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          household_id: string
          id: string
          invited_by: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          household_id: string
          id?: string
          invited_by: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          household_id?: string
          id?: string
          invited_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          id: string
          name: string
          opening_balance: number
          opening_balance_date: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          name?: string
          opening_balance?: number
          opening_balance_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          name?: string
          opening_balance?: number
          opening_balance_date?: string | null
        }
        Relationships: []
      }
      one_off_bills: {
        Row: {
          amount: number | null
          created_at: string
          due_date: string | null
          household_id: string
          id: string
          name: string
          paid: boolean
          paid_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          due_date?: string | null
          household_id: string
          id?: string
          name: string
          paid?: boolean
          paid_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          due_date?: string | null
          household_id?: string
          id?: string
          name?: string
          paid?: boolean
          paid_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_off_bills_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          display_name: string | null
          id: string
          opening_balance: number
          opening_balance_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id: string
          opening_balance?: number
          opening_balance_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          opening_balance?: number
          opening_balance_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          day_of_cycle: number | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          name: string
          next_run: string
          paused: boolean
          start_date: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_cycle?: number | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id?: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          name: string
          next_run?: string
          paused?: boolean
          start_date?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_cycle?: number | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          household_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          name?: string
          next_run?: string
          paused?: boolean
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          amount: number
          created_at: string
          household_id: string
          id: string
          name: string
          quantity: number
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          household_id: string
          id?: string
          name: string
          quantity?: number
          transaction_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          quantity?: number
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          note: string | null
          occurred_on: string
          recurring_rule_id: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          note?: string | null
          occurred_on?: string
          recurring_rule_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          note?: string | null
          occurred_on?: string
          recurring_rule_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_fk"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_household_member: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      user_household_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      category_type: "income" | "outgoing"
      recurrence_frequency:
        | "weekly"
        | "fortnightly"
        | "monthly"
        | "yearly"
        | "fourweekly"
      transaction_kind: "income" | "outgoing" | "shopping"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      category_type: ["income", "outgoing"],
      recurrence_frequency: [
        "weekly",
        "fortnightly",
        "monthly",
        "yearly",
        "fourweekly",
      ],
      transaction_kind: ["income", "outgoing", "shopping"],
    },
  },
} as const

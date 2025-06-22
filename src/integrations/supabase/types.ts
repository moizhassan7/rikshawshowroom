export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          address: string
          cnic: string
          created_at: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          address: string
          cnic: string
          created_at?: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string
          cnic?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          advance_paid: number
          created_at: string
          customer_id: string
          duration_months: number
          id: string
          monthly_amount: number
          remaining_amount: number
          rikshaw_id: string
          start_date: string
          total_price: number
          updated_at: string
        }
        Insert: {
          advance_paid?: number
          created_at?: string
          customer_id: string
          duration_months: number
          id?: string
          monthly_amount: number
          remaining_amount: number
          rikshaw_id: string
          start_date?: string
          total_price: number
          updated_at?: string
        }
        Update: {
          advance_paid?: number
          created_at?: string
          customer_id?: string
          duration_months?: number
          id?: string
          monthly_amount?: number
          remaining_amount?: number
          rikshaw_id?: string
          start_date?: string
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_rikshaw_id_fkey"
            columns: ["rikshaw_id"]
            isOneToOne: false
            referencedRelation: "rikshaws"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount: number
          collector_name: string | null
          created_at: string
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          collector_name?: string | null
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          collector_name?: string | null
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      rikshaws: {
        Row: {
          color: string
          created_at: string
          customer_id: string | null
          engine_number: string
          id: string
          model: string
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          customer_id?: string | null
          engine_number: string
          id?: string
          model: string
          price: number
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          customer_id?: string | null
          engine_number?: string
          id?: string
          model?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rikshaws_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_installments: {
        Args: { plan_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

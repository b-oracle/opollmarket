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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      balances: {
        Row: {
          amount: number
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          wallet_address: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          wallet_address: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_name: string
          author_wallet: string | null
          content: string
          created_at: string
          id: string
          likes_count: number
          market_id: string
          parent_id: string | null
        }
        Insert: {
          author_name?: string
          author_wallet?: string | null
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          market_id: string
          parent_id?: string | null
        }
        Update: {
          author_name?: string
          author_wallet?: string | null
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          market_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settings: {
        Row: {
          admin_fee_percent: number
          creator_fee_percent: number
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_fee_percent?: number
          creator_fee_percent?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_fee_percent?: number
          creator_fee_percent?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      market_boosts: {
        Row: {
          amount: number
          created_at: string
          ends_at: string
          id: string
          market_id: string
          payer_wallet: string
          starts_at: string
          status: string
          tier: string
          tx_hash: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          ends_at: string
          id?: string
          market_id: string
          payer_wallet: string
          starts_at?: string
          status?: string
          tier: string
          tx_hash?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          ends_at?: string
          id?: string
          market_id?: string
          payer_wallet?: string
          starts_at?: string
          status?: string
          tier?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_boosts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_options: {
        Row: {
          created_at: string
          id: string
          label: string
          market_id: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          market_id: string
          price?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          market_id?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_options_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          category: string
          contract_address: string | null
          created_at: string
          creator_name: string
          creator_wallet: string
          description: string
          end_date: string
          id: string
          image_url: string | null
          initial_liquidity: number
          liquidity: number
          market_type: string
          no_price: number
          participants: number
          resolution_source: string
          status: string
          title: string
          trending: boolean
          tx_hash: string | null
          updated_at: string
          volume: number
          yes_price: number
        }
        Insert: {
          category: string
          contract_address?: string | null
          created_at?: string
          creator_name?: string
          creator_wallet: string
          description: string
          end_date: string
          id?: string
          image_url?: string | null
          initial_liquidity?: number
          liquidity?: number
          market_type?: string
          no_price?: number
          participants?: number
          resolution_source: string
          status?: string
          title: string
          trending?: boolean
          tx_hash?: string | null
          updated_at?: string
          volume?: number
          yes_price?: number
        }
        Update: {
          category?: string
          contract_address?: string | null
          created_at?: string
          creator_name?: string
          creator_wallet?: string
          description?: string
          end_date?: string
          id?: string
          image_url?: string | null
          initial_liquidity?: number
          liquidity?: number
          market_type?: string
          no_price?: number
          participants?: number
          resolution_source?: string
          status?: string
          title?: string
          trending?: boolean
          tx_hash?: string | null
          updated_at?: string
          volume?: number
          yes_price?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          market_id: string
          option_id: string | null
          shares: number
          side: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          created_at?: string
          id?: string
          market_id: string
          option_id?: string | null
          shares?: number
          side?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          market_id?: string
          option_id?: string | null
          shares?: number
          side?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string | null
          option_id: string | null
          price: number | null
          shares: number | null
          side: string | null
          status: string
          tx_hash: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string
          tx_hash?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string
          tx_hash?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

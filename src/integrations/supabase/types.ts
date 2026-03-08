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
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      balances: {
        Row: {
          amount: number
          bonus_balance: number
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bonus_balance?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bonus_balance?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          market_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
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
          exit_fee_percent: number
          id: string
          market_creation_fee: number | null
          min_nft_balance: number
          min_token_balance: number
          min_withdrawal_amount: number
          nft_buy_url: string | null
          nft_contract_address: string | null
          qt_enabled_assets: string
          qt_enabled_timeframes: string
          qt_max_bet: number
          qt_min_bet: number
          qt_streak_2x: number
          qt_streak_3x: number
          qt_streak_4x: number
          qt_streak_5x: number
          quick_trade_fee_percent: number
          referral_reward_amount: number
          token_contract_address: string | null
          token_decimals: number | null
          updated_at: string
          updated_by: string | null
          withdrawal_cooldown_minutes: number
          withdrawal_multiplier: number
        }
        Insert: {
          admin_fee_percent?: number
          creator_fee_percent?: number
          exit_fee_percent?: number
          id?: string
          market_creation_fee?: number | null
          min_nft_balance?: number
          min_token_balance?: number
          min_withdrawal_amount?: number
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          qt_enabled_assets?: string
          qt_enabled_timeframes?: string
          qt_max_bet?: number
          qt_min_bet?: number
          qt_streak_2x?: number
          qt_streak_3x?: number
          qt_streak_4x?: number
          qt_streak_5x?: number
          quick_trade_fee_percent?: number
          referral_reward_amount?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawal_cooldown_minutes?: number
          withdrawal_multiplier?: number
        }
        Update: {
          admin_fee_percent?: number
          creator_fee_percent?: number
          exit_fee_percent?: number
          id?: string
          market_creation_fee?: number | null
          min_nft_balance?: number
          min_token_balance?: number
          min_withdrawal_amount?: number
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          qt_enabled_assets?: string
          qt_enabled_timeframes?: string
          qt_max_bet?: number
          qt_min_bet?: number
          qt_streak_2x?: number
          qt_streak_3x?: number
          qt_streak_4x?: number
          qt_streak_5x?: number
          quick_trade_fee_percent?: number
          referral_reward_amount?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawal_cooldown_minutes?: number
          withdrawal_multiplier?: number
        }
        Relationships: []
      }
      limit_orders: {
        Row: {
          amount: number
          created_at: string
          id: string
          limit_price: number
          market_id: string
          option_id: string | null
          order_type: string
          shares: number
          side: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          limit_price: number
          market_id: string
          option_id?: string | null
          order_type?: string
          shares: number
          side?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          limit_price?: number
          market_id?: string
          option_id?: string | null
          order_type?: string
          shares?: number
          side?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "limit_orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "limit_orders_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
        ]
      }
      market_boosts: {
        Row: {
          amount: number
          created_at: string
          ends_at: string
          id: string
          market_id: string
          nowpayments_payment_id: string | null
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
          nowpayments_payment_id?: string | null
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
          nowpayments_payment_id?: string | null
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
      market_likes: {
        Row: {
          created_at: string
          id: string
          market_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_likes_market_id_fkey"
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
          auto_resolve: boolean
          auto_resolve_asset: string | null
          auto_resolve_deadline: string | null
          auto_resolve_operator: string | null
          auto_resolve_target_price: number | null
          category: string
          contract_address: string | null
          created_at: string
          creator_name: string
          creator_wallet: string
          description: string
          details: string | null
          end_date: string
          id: string
          image_url: string | null
          initial_liquidity: number
          liquidity: number
          market_type: string
          moderator_decision: string | null
          moderator_id: string | null
          moderator_reviewed_at: string | null
          no_price: number
          participants: number
          pinned_trending: boolean
          polymarket_event_slug: string | null
          polymarket_id: string | null
          resolution_source: string
          resolved_side: string | null
          sport_league: string | null
          sport_match_id: string | null
          sport_predicted_outcome: string | null
          sport_type: string | null
          status: string
          title: string
          trending: boolean
          tx_hash: string | null
          updated_at: string
          video_url: string | null
          volume: number
          winning_option_id: string | null
          yes_price: number
        }
        Insert: {
          auto_resolve?: boolean
          auto_resolve_asset?: string | null
          auto_resolve_deadline?: string | null
          auto_resolve_operator?: string | null
          auto_resolve_target_price?: number | null
          category: string
          contract_address?: string | null
          created_at?: string
          creator_name?: string
          creator_wallet: string
          description: string
          details?: string | null
          end_date: string
          id?: string
          image_url?: string | null
          initial_liquidity?: number
          liquidity?: number
          market_type?: string
          moderator_decision?: string | null
          moderator_id?: string | null
          moderator_reviewed_at?: string | null
          no_price?: number
          participants?: number
          pinned_trending?: boolean
          polymarket_event_slug?: string | null
          polymarket_id?: string | null
          resolution_source: string
          resolved_side?: string | null
          sport_league?: string | null
          sport_match_id?: string | null
          sport_predicted_outcome?: string | null
          sport_type?: string | null
          status?: string
          title: string
          trending?: boolean
          tx_hash?: string | null
          updated_at?: string
          video_url?: string | null
          volume?: number
          winning_option_id?: string | null
          yes_price?: number
        }
        Update: {
          auto_resolve?: boolean
          auto_resolve_asset?: string | null
          auto_resolve_deadline?: string | null
          auto_resolve_operator?: string | null
          auto_resolve_target_price?: number | null
          category?: string
          contract_address?: string | null
          created_at?: string
          creator_name?: string
          creator_wallet?: string
          description?: string
          details?: string | null
          end_date?: string
          id?: string
          image_url?: string | null
          initial_liquidity?: number
          liquidity?: number
          market_type?: string
          moderator_decision?: string | null
          moderator_id?: string | null
          moderator_reviewed_at?: string | null
          no_price?: number
          participants?: number
          pinned_trending?: boolean
          polymarket_event_slug?: string | null
          polymarket_id?: string | null
          resolution_source?: string
          resolved_side?: string | null
          sport_league?: string | null
          sport_match_id?: string | null
          sport_predicted_outcome?: string | null
          sport_type?: string | null
          status?: string
          title?: string
          trending?: boolean
          tx_hash?: string | null
          updated_at?: string
          video_url?: string | null
          volume?: number
          winning_option_id?: string | null
          yes_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_winning_option_id_fkey"
            columns: ["winning_option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_logs: {
        Row: {
          admin_note: string | null
          category: string | null
          content_id: string | null
          content_type: string
          created_at: string
          flagged_content: string | null
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          category?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          flagged_content?: string | null
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          category?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          flagged_content?: string | null
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          market_id: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      polymarket_presets: {
        Row: {
          auto_approve: boolean
          category: string
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          max_days_ahead: number
          updated_at: string
        }
        Insert: {
          auto_approve?: boolean
          category: string
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          max_days_ahead?: number
          updated_at?: string
        }
        Update: {
          auto_approve?: boolean
          category?: string
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          max_days_ahead?: number
          updated_at?: string
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
          referred_by: string | null
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          referred_by?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          referred_by?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_bets: {
        Row: {
          amount: number
          created_at: string
          id: string
          payout: number | null
          round_id: string
          side: string
          status: string
          streak: number
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payout?: number | null
          round_id: string
          side: string
          status?: string
          streak?: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payout?: number | null
          round_id?: string
          side?: string
          status?: string
          streak?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "quick_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_rounds: {
        Row: {
          asset: string
          close_price: number | null
          created_at: string
          duration_seconds: number
          id: string
          locks_at: string
          open_price: number | null
          resolved_at: string | null
          result: string | null
          status: string
        }
        Insert: {
          asset?: string
          close_price?: number | null
          created_at?: string
          duration_seconds?: number
          id?: string
          locks_at?: string
          open_price?: number | null
          resolved_at?: string | null
          result?: string | null
          status?: string
        }
        Update: {
          asset?: string
          close_price?: number | null
          created_at?: string
          duration_seconds?: number
          id?: string
          locks_at?: string
          open_price?: number | null
          resolved_at?: string | null
          result?: string | null
          status?: string
        }
        Relationships: []
      }
      quick_trade_streaks: {
        Row: {
          best_streak: number
          current_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          current_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          current_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          amount: number
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      sport_score_cache: {
        Row: {
          away_score: number | null
          home_score: number | null
          id: string
          is_live: boolean | null
          market_id: string
          match_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          away_score?: number | null
          home_score?: number | null
          id?: string
          is_live?: boolean | null
          market_id: string
          match_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          away_score?: number | null
          home_score?: number | null
          id?: string
          is_live?: boolean | null
          market_id?: string
          match_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sport_score_cache_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string | null
          nowpayments_payment_id: string | null
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
          nowpayments_payment_id?: string | null
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
          nowpayments_payment_id?: string | null
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
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          crypto_currency: string
          id: string
          nowpayments_id: string | null
          status: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          crypto_currency?: string
          id?: string
          nowpayments_id?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          crypto_currency?: string
          id?: string
          nowpayments_id?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_pending_deposits: { Args: never; Returns: undefined }
      get_quick_trade_leaderboard:
        | {
            Args: { _limit?: number }
            Returns: {
              avatar_url: string
              display_name: string
              profit: number
              total_bets: number
              total_wagered: number
              total_won: number
              user_id: string
              wins: number
            }[]
          }
        | {
            Args: { _cutoff?: string; _limit?: number }
            Returns: {
              avatar_url: string
              display_name: string
              profit: number
              total_bets: number
              total_wagered: number
              total_won: number
              user_id: string
              wins: number
            }[]
          }
      get_streak_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          best_streak: number
          current_streak: number
          display_name: string
          user_id: string
        }[]
      }
      get_trending_scores: {
        Args: never
        Returns: {
          comments_score: number
          likes_score: number
          market_id: string
          participant_score: number
          recent_bets_score: number
          total_score: number
          volume_score: number
        }[]
      }
      get_user_id_by_username: { Args: { _username: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_referral_code:
        | {
            Args: { _code: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_valid_referral_code(_code => text), public.is_valid_referral_code(_code => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { _code: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_valid_referral_code(_code => text), public.is_valid_referral_code(_code => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      update_trending_markets: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin"
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
      app_role: ["admin", "moderator", "user", "super_admin"],
    },
  },
} as const

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
      balance_debts: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string | null
          reason: string
          settled_amount: number
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          market_id?: string | null
          reason?: string
          settled_amount?: number
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          market_id?: string | null
          reason?: string
          settled_amount?: number
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_debts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      balances: {
        Row: {
          amount: number
          bonus_balance: number
          currency: string
          id: string
          insurance_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bonus_balance?: number
          currency?: string
          id?: string
          insurance_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bonus_balance?: number
          currency?: string
          id?: string
          insurance_balance?: number
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
          ai_generation_cost: number
          auto_resolve_fee: number
          bc400_pool_balance: number
          bc400_pool_percent: number
          blue_max_free_markets: number
          blue_revenue_share_percent: number
          blue_trending_multiplier: number
          boost_flash_price: number
          boost_standard_price: number
          boost_whale_price: number
          broadcast_price: number
          copy_trade_commission_percent: number
          creator_fee_blue_percent: number
          creator_fee_gold_percent: number
          creator_fee_percent: number
          deposit_provider: string
          exit_fee_percent: number
          fallback_naira_rate: number
          fallback_payout_naira_rate: number
          gold_max_free_markets: number
          gold_revenue_share_percent: number
          gold_trending_multiplier: number
          id: string
          market_creation_fee: number | null
          min_gold_token_balance: number
          min_nft_balance: number
          min_token_balance: number
          min_withdrawal_amount: number
          naira_payout_markdown: number
          naira_rate_markup: number
          nft_buy_url: string | null
          nft_contract_address: string | null
          osure_100_premium: number
          osure_25_premium: number
          osure_50_premium: number
          osure_enabled: boolean
          payaza_mode: string
          payout_provider: string
          prediction_fee_percent: number
          qt_disabled_assets: string
          qt_enabled_assets: string
          qt_enabled_timeframes: string
          qt_max_bet: number
          qt_min_bet: number
          qt_one_sided_bonus: boolean
          qt_streak_2x: number
          qt_streak_3x: number
          qt_streak_4x: number
          qt_streak_5x: number
          quick_trade_fee_percent: number
          referral_reward_amount: number
          referrer_commission_percent: number
          token_contract_address: string | null
          token_decimals: number | null
          updated_at: string
          updated_by: string | null
          withdrawal_cooldown_minutes: number
          withdrawal_fee_percent: number
          withdrawal_limit_enabled: boolean
          withdrawal_multiplier: number
        }
        Insert: {
          admin_fee_percent?: number
          ai_generation_cost?: number
          auto_resolve_fee?: number
          bc400_pool_balance?: number
          bc400_pool_percent?: number
          blue_max_free_markets?: number
          blue_revenue_share_percent?: number
          blue_trending_multiplier?: number
          boost_flash_price?: number
          boost_standard_price?: number
          boost_whale_price?: number
          broadcast_price?: number
          copy_trade_commission_percent?: number
          creator_fee_blue_percent?: number
          creator_fee_gold_percent?: number
          creator_fee_percent?: number
          deposit_provider?: string
          exit_fee_percent?: number
          fallback_naira_rate?: number
          fallback_payout_naira_rate?: number
          gold_max_free_markets?: number
          gold_revenue_share_percent?: number
          gold_trending_multiplier?: number
          id?: string
          market_creation_fee?: number | null
          min_gold_token_balance?: number
          min_nft_balance?: number
          min_token_balance?: number
          min_withdrawal_amount?: number
          naira_payout_markdown?: number
          naira_rate_markup?: number
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          osure_100_premium?: number
          osure_25_premium?: number
          osure_50_premium?: number
          osure_enabled?: boolean
          payaza_mode?: string
          payout_provider?: string
          prediction_fee_percent?: number
          qt_disabled_assets?: string
          qt_enabled_assets?: string
          qt_enabled_timeframes?: string
          qt_max_bet?: number
          qt_min_bet?: number
          qt_one_sided_bonus?: boolean
          qt_streak_2x?: number
          qt_streak_3x?: number
          qt_streak_4x?: number
          qt_streak_5x?: number
          quick_trade_fee_percent?: number
          referral_reward_amount?: number
          referrer_commission_percent?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawal_cooldown_minutes?: number
          withdrawal_fee_percent?: number
          withdrawal_limit_enabled?: boolean
          withdrawal_multiplier?: number
        }
        Update: {
          admin_fee_percent?: number
          ai_generation_cost?: number
          auto_resolve_fee?: number
          bc400_pool_balance?: number
          bc400_pool_percent?: number
          blue_max_free_markets?: number
          blue_revenue_share_percent?: number
          blue_trending_multiplier?: number
          boost_flash_price?: number
          boost_standard_price?: number
          boost_whale_price?: number
          broadcast_price?: number
          copy_trade_commission_percent?: number
          creator_fee_blue_percent?: number
          creator_fee_gold_percent?: number
          creator_fee_percent?: number
          deposit_provider?: string
          exit_fee_percent?: number
          fallback_naira_rate?: number
          fallback_payout_naira_rate?: number
          gold_max_free_markets?: number
          gold_revenue_share_percent?: number
          gold_trending_multiplier?: number
          id?: string
          market_creation_fee?: number | null
          min_gold_token_balance?: number
          min_nft_balance?: number
          min_token_balance?: number
          min_withdrawal_amount?: number
          naira_payout_markdown?: number
          naira_rate_markup?: number
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          osure_100_premium?: number
          osure_25_premium?: number
          osure_50_premium?: number
          osure_enabled?: boolean
          payaza_mode?: string
          payout_provider?: string
          prediction_fee_percent?: number
          qt_disabled_assets?: string
          qt_enabled_assets?: string
          qt_enabled_timeframes?: string
          qt_max_bet?: number
          qt_min_bet?: number
          qt_one_sided_bonus?: boolean
          qt_streak_2x?: number
          qt_streak_3x?: number
          qt_streak_4x?: number
          qt_streak_5x?: number
          quick_trade_fee_percent?: number
          referral_reward_amount?: number
          referrer_commission_percent?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawal_cooldown_minutes?: number
          withdrawal_fee_percent?: number
          withdrawal_limit_enabled?: boolean
          withdrawal_multiplier?: number
        }
        Relationships: []
      }
      commodity_price_cache: {
        Row: {
          asset: string
          price: number
          updated_at: string
        }
        Insert: {
          asset: string
          price: number
          updated_at?: string
        }
        Update: {
          asset?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      copy_settings: {
        Row: {
          auto_copy: boolean
          copy_predictions: boolean
          copy_quick_trades: boolean
          created_at: string
          id: string
          max_amount: number
          target_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_copy?: boolean
          copy_predictions?: boolean
          copy_quick_trades?: boolean
          created_at?: string
          id?: string
          max_amount?: number
          target_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_copy?: boolean
          copy_predictions?: boolean
          copy_quick_trades?: boolean
          created_at?: string
          id?: string
          max_amount?: number
          target_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      copy_trade_earnings: {
        Row: {
          commission_amount: number
          commission_percent: number
          copier_profit: number
          copier_user_id: string
          created_at: string
          id: string
          market_id: string | null
          pending_trade_id: string | null
          trade_type: string
          trader_user_id: string
        }
        Insert: {
          commission_amount?: number
          commission_percent?: number
          copier_profit?: number
          copier_user_id: string
          created_at?: string
          id?: string
          market_id?: string | null
          pending_trade_id?: string | null
          trade_type?: string
          trader_user_id: string
        }
        Update: {
          commission_amount?: number
          commission_percent?: number
          copier_profit?: number
          copier_user_id?: string
          created_at?: string
          id?: string
          market_id?: string | null
          pending_trade_id?: string | null
          trade_type?: string
          trader_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copy_trade_earnings_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_trade_earnings_pending_trade_id_fkey"
            columns: ["pending_trade_id"]
            isOneToOne: false
            referencedRelation: "pending_copy_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_toggles: {
        Row: {
          enabled: boolean
          feature_key: string
          id: string
          label: string
          scheduled_end: string | null
          scheduled_start: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          id?: string
          label: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          id?: string
          label?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      insurance_claims: {
        Row: {
          claim_amount: number
          claimed_at: string | null
          created_at: string
          id: string
          market_id: string
          position_id: string
          premium_paid: number
          status: string
          tier: number
          user_id: string
        }
        Insert: {
          claim_amount?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          market_id: string
          position_id: string
          premium_paid?: number
          status?: string
          tier: number
          user_id: string
        }
        Update: {
          claim_amount?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          market_id?: string
          position_id?: string
          premium_paid?: number
          status?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
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
      market_broadcasts: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string
          nowpayments_payment_id: string | null
          status: string
          tier: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          market_id: string
          nowpayments_payment_id?: string | null
          status?: string
          tier?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          market_id?: string
          nowpayments_payment_id?: string | null
          status?: string
          tier?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_broadcasts_market_id_fkey"
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
          liquidity_verified: boolean
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
          simulated_participants: number
          simulated_volume: number
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
          liquidity_verified?: boolean
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
          simulated_participants?: number
          simulated_volume?: number
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
          liquidity_verified?: boolean
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
          simulated_participants?: number
          simulated_volume?: number
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
          actor_id: string | null
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
          actor_id?: string | null
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
          actor_id?: string | null
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
      pending_commissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string | null
          releases_at: string
          status: string
          trade_transaction_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          market_id?: string | null
          releases_at?: string
          status?: string
          trade_transaction_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          market_id?: string | null
          releases_at?: string
          status?: string
          trade_transaction_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_commissions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_commissions_trade_transaction_id_fkey"
            columns: ["trade_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_copy_trades: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          market_id: string | null
          option_id: string | null
          price: number | null
          shares: number | null
          side: string | null
          status: string
          trade_type: string
          trader_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string
          id?: string
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string
          trade_type?: string
          trader_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string
          trade_type?: string
          trader_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_copy_trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_copy_trades_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
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
          max_imports_per_run: number
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
          max_imports_per_run?: number
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
          max_imports_per_run?: number
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          insurance_claimed: boolean
          insurance_premium: number
          insurance_tier: number | null
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
          insurance_claimed?: boolean
          insurance_premium?: number
          insurance_tier?: number | null
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
          insurance_claimed?: boolean
          insurance_premium?: number
          insurance_tier?: number | null
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
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_public: boolean
          referred_by: string | null
          social_tutorial_seen: boolean
          updated_at: string
          verification_level: string
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_public?: boolean
          referred_by?: string | null
          social_tutorial_seen?: boolean
          updated_at?: string
          verification_level?: string
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_public?: boolean
          referred_by?: string | null
          social_tutorial_seen?: boolean
          updated_at?: string
          verification_level?: string
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
      revenue_shares: {
        Row: {
          amount: number
          created_at: string
          id: string
          market_id: string
          share_percent: number
          user_id: string
          verification_tier: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          market_id: string
          share_percent?: number
          user_id: string
          verification_tier?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          market_id?: string
          share_percent?: number
          user_id?: string
          verification_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_shares_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      social_links: {
        Row: {
          enabled: boolean
          icon_key: string
          id: string
          label: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          url: string
        }
        Insert: {
          enabled?: boolean
          icon_key: string
          id: string
          label: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          url?: string
        }
        Update: {
          enabled?: boolean
          icon_key?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          url?: string
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
      telegram_link_sessions: {
        Row: {
          chat_id: number
          created_at: string
          email: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          email: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      telegram_users: {
        Row: {
          id: string
          linked_at: string
          telegram_chat_id: number
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          id?: string
          linked_at?: string
          telegram_chat_id: number
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          id?: string
          linked_at?: string
          telegram_chat_id?: number
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_copy_trade: boolean
          market_id: string | null
          nowpayments_payment_id: string | null
          option_id: string | null
          payment_provider: string | null
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
          is_copy_trade?: boolean
          market_id?: string | null
          nowpayments_payment_id?: string | null
          option_id?: string | null
          payment_provider?: string | null
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
          is_copy_trade?: boolean
          market_id?: string | null
          nowpayments_payment_id?: string | null
          option_id?: string | null
          payment_provider?: string | null
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
      user_security_settings: {
        Row: {
          created_at: string
          last_verified_at: string | null
          pin_enabled: boolean
          pin_hash: string | null
          require_pin_login: boolean
          require_pin_withdrawal: boolean
          require_totp_login: boolean
          require_totp_withdrawal: boolean
          security_setup_complete: boolean
          totp_enabled: boolean
          totp_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_verified_at?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          require_pin_login?: boolean
          require_pin_withdrawal?: boolean
          require_totp_login?: boolean
          require_totp_withdrawal?: boolean
          security_setup_complete?: boolean
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_verified_at?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          require_pin_login?: boolean
          require_pin_withdrawal?: boolean
          require_totp_login?: boolean
          require_totp_withdrawal?: boolean
          security_setup_complete?: boolean
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_security_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notification_prefs: {
        Row: {
          copy_trade: boolean
          general: boolean
          market_cancelled: boolean
          market_resolution: boolean
          new_follower: boolean
          payout: boolean
          price_alert: boolean
          referral: boolean
          sports_score: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          copy_trade?: boolean
          general?: boolean
          market_cancelled?: boolean
          market_resolution?: boolean
          new_follower?: boolean
          payout?: boolean
          price_alert?: boolean
          referral?: boolean
          sports_score?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          copy_trade?: boolean
          general?: boolean
          market_cancelled?: boolean
          market_resolution?: boolean
          new_follower?: boolean
          payout?: boolean
          price_alert?: boolean
          referral?: boolean
          sports_score?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          created_at: string
          data: Json | null
          phone: string
          state: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          phone: string
          state?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          phone?: string
          state?: string
        }
        Relationships: []
      }
      whatsapp_users: {
        Row: {
          display_name: string | null
          id: string
          linked_at: string
          user_id: string
          whatsapp_phone: string
        }
        Insert: {
          display_name?: string | null
          id?: string
          linked_at?: string
          user_id: string
          whatsapp_phone: string
        }
        Update: {
          display_name?: string | null
          id?: string
          linked_at?: string
          user_id?: string
          whatsapp_phone?: string
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
      adjust_balance:
        | {
            Args: { _bonus_delta?: number; _delta: number; _user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              _bonus_delta?: number
              _delta: number
              _insurance_delta?: number
              _user_id: string
            }
            Returns: undefined
          }
      debit_balance_atomic: {
        Args: { _bonus_deduct?: number; _main_deduct: number; _user_id: string }
        Returns: Json
      }
      deduct_market_liquidity: {
        Args: {
          _bonus_for_fee?: number
          _fee_amount?: number
          _liquidity_amount: number
          _user_id: string
        }
        Returns: Json
      }
      expire_stale_pending_deposits: { Args: never; Returns: undefined }
      flag_unverified_liquidity: {
        Args: never
        Returns: {
          created_at: string
          creator_wallet: string
          initial_liquidity: number
          market_id: string
          title: string
        }[]
      }
      get_admin_user_stats: { Args: never; Returns: Json }
      get_copy_trade_stats: {
        Args: { _trader_id: string }
        Returns: {
          total_copiers: number
          total_revenue: number
        }[]
      }
      get_follow_counts: {
        Args: { _user_id: string }
        Returns: {
          followers_count: number
          following_count: number
        }[]
      }
      get_follow_suggestions: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          id: string
          verification_level: string
        }[]
      }
      get_platform_volume: {
        Args: never
        Returns: {
          prediction_volume: number
          qt_volume: number
        }[]
      }
      get_prediction_leaderboard: {
        Args: { _cutoff?: string; _limit?: number; _sort?: string }
        Returns: {
          avatar_url: string
          display_name: string
          pnl: number
          trades: number
          user_id: string
          verification_level: string
          volume: number
        }[]
      }
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
      get_user_trade_count: {
        Args: { _user_id: string }
        Returns: {
          predictions: number
          quick_trades: number
        }[]
      }
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
      settle_user_debts: { Args: { _user_id: string }; Returns: Json }
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

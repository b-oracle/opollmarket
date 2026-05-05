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
      admin_notification_broadcasts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message: string
          recipients_count: number | null
          scheduled_at: string | null
          send_push: boolean
          sent_at: string | null
          status: string
          target_filter: Json | null
          target_type: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message: string
          recipients_count?: number | null
          scheduled_at?: string | null
          send_push?: boolean
          sent_at?: string | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          recipients_count?: number | null
          scheduled_at?: string | null
          send_push?: boolean
          sent_at?: string | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      affiliate_earnings: {
        Row: {
          api_key_id: string
          bet_amount: number
          commission_amount: number
          commission_percent: number
          created_at: string
          fee_amount: number
          id: string
          status: string
          transaction_id: string
        }
        Insert: {
          api_key_id: string
          bet_amount: number
          commission_amount: number
          commission_percent?: number
          created_at?: string
          fee_amount: number
          id?: string
          status?: string
          transaction_id: string
        }
        Update: {
          api_key_id?: string
          bet_amount?: number
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          fee_amount?: number
          id?: string
          status?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_earnings_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_earnings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "public_market_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_earnings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      aimtell_auto_broadcast_settings: {
        Row: {
          body_template: string
          enabled: boolean
          event_type: string
          id: string
          segment_id: string | null
          title_template: string
          updated_at: string
          updated_by: string | null
          url_template: string | null
        }
        Insert: {
          body_template?: string
          enabled?: boolean
          event_type: string
          id?: string
          segment_id?: string | null
          title_template: string
          updated_at?: string
          updated_by?: string | null
          url_template?: string | null
        }
        Update: {
          body_template?: string
          enabled?: boolean
          event_type?: string
          id?: string
          segment_id?: string | null
          title_template?: string
          updated_at?: string
          updated_by?: string | null
          url_template?: string | null
        }
        Relationships: []
      }
      aimtell_push_templates: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
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
      api_keys: {
        Row: {
          affiliate_commission_percent: number
          api_key: string
          brand_dark_bg: string | null
          brand_logo_url: string | null
          brand_name: string | null
          brand_primary_color: string | null
          created_at: string
          id: string
          is_active: boolean
          owner_id: string | null
          partner_name: string
          permissions: Json
          rate_limit_per_min: number
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          affiliate_commission_percent?: number
          api_key: string
          brand_dark_bg?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          brand_primary_color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string | null
          partner_name: string
          permissions?: Json
          rate_limit_per_min?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          affiliate_commission_percent?: number
          api_key?: string
          brand_dark_bg?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          brand_primary_color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string | null
          partner_name?: string
          permissions?: Json
          rate_limit_per_min?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      api_request_logs: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          ip: string | null
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          ip?: string | null
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
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
          gift_balance: number
          id: string
          insurance_balance: number
          rewards_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bonus_balance?: number
          currency?: string
          gift_balance?: number
          id?: string
          insurance_balance?: number
          rewards_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bonus_balance?: number
          currency?: string
          gift_balance?: number
          id?: string
          insurance_balance?: number
          rewards_balance?: number
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
          deposit_expiry_minutes: number
          deposit_large_overpay_alert: number
          deposit_max_amount: number
          deposit_min_amount: number
          deposit_overpay_threshold: number
          deposit_partial_threshold: number
          deposit_provider: string
          deposit_wrong_asset_high: number
          deposit_wrong_asset_low: number
          exit_fee_percent: number
          fallback_naira_rate: number
          fallback_payout_naira_rate: number
          gift_fee_percent: number
          gold_max_free_markets: number
          gold_revenue_share_percent: number
          gold_trending_multiplier: number
          id: string
          kyc_tier1_daily_limit: number
          kyc_tier2_daily_limit: number
          liquidity_return_fee_percent: number
          market_creation_fee: number | null
          max_daily_withdrawals: number
          max_drafts_blue: number
          max_drafts_gold: number
          max_drafts_none: number
          min_gold_token_balance: number
          min_liquidity: number
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
          prediction_max_bet: number
          prediction_min_bet: number
          push_prompt_cooldown_days: number
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
          registration_bonus_amount: number
          social_ad_price: number
          token_contract_address: string | null
          token_decimals: number | null
          updated_at: string
          updated_by: string | null
          welcome_bonus_cap: number
          welcome_bonus_percent: number
          withdrawal_anomaly_threshold: number
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
          deposit_expiry_minutes?: number
          deposit_large_overpay_alert?: number
          deposit_max_amount?: number
          deposit_min_amount?: number
          deposit_overpay_threshold?: number
          deposit_partial_threshold?: number
          deposit_provider?: string
          deposit_wrong_asset_high?: number
          deposit_wrong_asset_low?: number
          exit_fee_percent?: number
          fallback_naira_rate?: number
          fallback_payout_naira_rate?: number
          gift_fee_percent?: number
          gold_max_free_markets?: number
          gold_revenue_share_percent?: number
          gold_trending_multiplier?: number
          id?: string
          kyc_tier1_daily_limit?: number
          kyc_tier2_daily_limit?: number
          liquidity_return_fee_percent?: number
          market_creation_fee?: number | null
          max_daily_withdrawals?: number
          max_drafts_blue?: number
          max_drafts_gold?: number
          max_drafts_none?: number
          min_gold_token_balance?: number
          min_liquidity?: number
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
          prediction_max_bet?: number
          prediction_min_bet?: number
          push_prompt_cooldown_days?: number
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
          registration_bonus_amount?: number
          social_ad_price?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          welcome_bonus_cap?: number
          welcome_bonus_percent?: number
          withdrawal_anomaly_threshold?: number
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
          deposit_expiry_minutes?: number
          deposit_large_overpay_alert?: number
          deposit_max_amount?: number
          deposit_min_amount?: number
          deposit_overpay_threshold?: number
          deposit_partial_threshold?: number
          deposit_provider?: string
          deposit_wrong_asset_high?: number
          deposit_wrong_asset_low?: number
          exit_fee_percent?: number
          fallback_naira_rate?: number
          fallback_payout_naira_rate?: number
          gift_fee_percent?: number
          gold_max_free_markets?: number
          gold_revenue_share_percent?: number
          gold_trending_multiplier?: number
          id?: string
          kyc_tier1_daily_limit?: number
          kyc_tier2_daily_limit?: number
          liquidity_return_fee_percent?: number
          market_creation_fee?: number | null
          max_daily_withdrawals?: number
          max_drafts_blue?: number
          max_drafts_gold?: number
          max_drafts_none?: number
          min_gold_token_balance?: number
          min_liquidity?: number
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
          prediction_max_bet?: number
          prediction_min_bet?: number
          push_prompt_cooldown_days?: number
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
          registration_bonus_amount?: number
          social_ad_price?: number
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string
          updated_by?: string | null
          welcome_bonus_cap?: number
          welcome_bonus_percent?: number
          withdrawal_anomaly_threshold?: number
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
      community_memberships: {
        Row: {
          community_slug: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          community_slug: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          community_slug?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_messages: {
        Row: {
          community_slug: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          image_url: string | null
          reactions: Json
          reply_to_content: string | null
          reply_to_id: string | null
          reply_to_name: string | null
          tagged_market_ids: string[] | null
          user_id: string
        }
        Insert: {
          community_slug: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          reactions?: Json
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_name?: string | null
          tagged_market_ids?: string[] | null
          user_id: string
        }
        Update: {
          community_slug?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          reactions?: Json
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_name?: string | null
          tagged_market_ids?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      community_reads: {
        Row: {
          community_slug: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          community_slug: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          community_slug?: string
          last_read_at?: string
          user_id?: string
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
      creation_fee_escrows: {
        Row: {
          amount: number
          created_at: string
          id: string
          released_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          released_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          released_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      dm_call_events: {
        Row: {
          actor_id: string | null
          call_id: string
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          source: string
        }
        Insert: {
          actor_id?: string | null
          call_id: string
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          source?: string
        }
        Update: {
          actor_id?: string | null
          call_id?: string
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          source?: string
        }
        Relationships: []
      }
      dm_calls: {
        Row: {
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          room_name: string
          started_at: string | null
          status: string
        }
        Insert: {
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          room_name: string
          started_at?: string | null
          status?: string
        }
        Update: {
          callee_id?: string
          caller_id?: string
          conversation_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          room_name?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          created_at: string
          id: string
          initiated_by: string | null
          last_message_at: string | null
          status: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          initiated_by?: string | null
          last_message_at?: string | null
          status?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          initiated_by?: string | null
          last_message_at?: string | null
          status?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          gift_amount: number | null
          id: string
          reactions: Json
          read_at: string | null
          reply_to_content: string | null
          reply_to_id: string | null
          reply_to_sender_name: string | null
          sender_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          gift_amount?: number | null
          id?: string
          reactions?: Json
          read_at?: string | null
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_sender_name?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          gift_amount?: number | null
          id?: string
          reactions?: Json
          read_at?: string | null
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_sender_name?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
      kyc_device_logs: {
        Row: {
          created_at: string
          device_pixel_ratio: number | null
          id: string
          ip_address: string | null
          kyc_submission_id: string
          language: string | null
          platform: string | null
          screen_height: number | null
          screen_width: number | null
          timezone: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_pixel_ratio?: number | null
          id?: string
          ip_address?: string | null
          kyc_submission_id: string
          language?: string | null
          platform?: string | null
          screen_height?: number | null
          screen_width?: number | null
          timezone?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_pixel_ratio?: number | null
          id?: string
          ip_address?: string | null
          kyc_submission_id?: string
          language?: string | null
          platform?: string | null
          screen_height?: number | null
          screen_width?: number | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_device_logs_kyc_submission_id_fkey"
            columns: ["kyc_submission_id"]
            isOneToOne: false
            referencedRelation: "kyc_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          address: string | null
          admin_note: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          id: string
          id_back_url: string | null
          id_front_url: string | null
          phone_number: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          status: string
          tier: number
          updated_at: string
          user_id: string
          utility_bill_url: string | null
        }
        Insert: {
          address?: string | null
          admin_note?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          id_back_url?: string | null
          id_front_url?: string | null
          phone_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          tier?: number
          updated_at?: string
          user_id: string
          utility_bill_url?: string | null
        }
        Update: {
          address?: string | null
          admin_note?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          id_back_url?: string | null
          id_front_url?: string | null
          phone_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          tier?: number
          updated_at?: string
          user_id?: string
          utility_bill_url?: string | null
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
          api_key_id: string | null
          auto_resolve: boolean
          auto_resolve_asset: string | null
          auto_resolve_deadline: string | null
          auto_resolve_operator: string | null
          auto_resolve_target_price: number | null
          blockchain_tx_hash: string | null
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
          is_hidden: boolean
          is_streaming: boolean
          last_draft_reminder_at: string | null
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
          resolution_block_reason: string | null
          resolution_blocked: boolean
          resolution_blocked_at: string | null
          resolution_source: string
          resolved_side: string | null
          simulated_participants: number
          simulated_volume: number
          sport_league: string | null
          sport_match_id: string | null
          sport_predicted_outcome: string | null
          sport_type: string | null
          status: string
          stream_url: string | null
          title: string
          trending: boolean
          twitter_current_count: number | null
          twitter_metric_type: string | null
          twitter_resource_id: string | null
          tx_hash: string | null
          updated_at: string
          video_url: string | null
          volume: number
          winning_option_id: string | null
          yes_price: number
        }
        Insert: {
          api_key_id?: string | null
          auto_resolve?: boolean
          auto_resolve_asset?: string | null
          auto_resolve_deadline?: string | null
          auto_resolve_operator?: string | null
          auto_resolve_target_price?: number | null
          blockchain_tx_hash?: string | null
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
          is_hidden?: boolean
          is_streaming?: boolean
          last_draft_reminder_at?: string | null
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
          resolution_block_reason?: string | null
          resolution_blocked?: boolean
          resolution_blocked_at?: string | null
          resolution_source: string
          resolved_side?: string | null
          simulated_participants?: number
          simulated_volume?: number
          sport_league?: string | null
          sport_match_id?: string | null
          sport_predicted_outcome?: string | null
          sport_type?: string | null
          status?: string
          stream_url?: string | null
          title: string
          trending?: boolean
          twitter_current_count?: number | null
          twitter_metric_type?: string | null
          twitter_resource_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          video_url?: string | null
          volume?: number
          winning_option_id?: string | null
          yes_price?: number
        }
        Update: {
          api_key_id?: string | null
          auto_resolve?: boolean
          auto_resolve_asset?: string | null
          auto_resolve_deadline?: string | null
          auto_resolve_operator?: string | null
          auto_resolve_target_price?: number | null
          blockchain_tx_hash?: string | null
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
          is_hidden?: boolean
          is_streaming?: boolean
          last_draft_reminder_at?: string | null
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
          resolution_block_reason?: string | null
          resolution_blocked?: boolean
          resolution_blocked_at?: string | null
          resolution_source?: string
          resolved_side?: string | null
          simulated_participants?: number
          simulated_volume?: number
          sport_league?: string | null
          sport_match_id?: string | null
          sport_predicted_outcome?: string | null
          sport_type?: string | null
          status?: string
          stream_url?: string | null
          title?: string
          trending?: boolean
          twitter_current_count?: number | null
          twitter_metric_type?: string | null
          twitter_resource_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          video_url?: string | null
          volume?: number
          winning_option_id?: string | null
          yes_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
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
      notification_email_claims: {
        Row: {
          created_at: string
          idempotency_key: string
          template_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          template_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          template_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          pref_key: string | null
          recipient_email: string | null
          sent_at: string | null
          status: string
          template_data: Json
          template_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          pref_key?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          template_data?: Json
          template_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          pref_key?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          template_data?: Json
          template_name?: string
          updated_at?: string
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
            referencedRelation: "public_market_trades"
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
      platform_pool: {
        Row: {
          balance: number
          id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
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
          age: number | null
          avatar_url: string | null
          bio: string | null
          block_reason: string | null
          blocked_at: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          gender: string | null
          id: string
          interests: string[] | null
          is_blocked: boolean
          is_public: boolean
          kyc_status: string
          location: string | null
          referred_by: string | null
          social_tutorial_seen: boolean
          twitter_avatar_url: string | null
          twitter_id: string | null
          twitter_linked_at: string | null
          twitter_username: string | null
          unlimited_markets: boolean
          updated_at: string
          username: string
          verification_level: string
          wallet_address: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          block_reason?: string | null
          blocked_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          gender?: string | null
          id: string
          interests?: string[] | null
          is_blocked?: boolean
          is_public?: boolean
          kyc_status?: string
          location?: string | null
          referred_by?: string | null
          social_tutorial_seen?: boolean
          twitter_avatar_url?: string | null
          twitter_id?: string | null
          twitter_linked_at?: string | null
          twitter_username?: string | null
          unlimited_markets?: boolean
          updated_at?: string
          username?: string
          verification_level?: string
          wallet_address?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          block_reason?: string | null
          blocked_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          interests?: string[] | null
          is_blocked?: boolean
          is_public?: boolean
          kyc_status?: string
          location?: string | null
          referred_by?: string | null
          social_tutorial_seen?: boolean
          twitter_avatar_url?: string | null
          twitter_id?: string | null
          twitter_linked_at?: string | null
          twitter_username?: string | null
          unlimited_markets?: boolean
          updated_at?: string
          username?: string
          verification_level?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      push_delivery_logs: {
        Row: {
          body: string | null
          call_id: string | null
          created_at: string
          fcm_error_code: string | null
          fcm_error_message: string | null
          fcm_error_status: string | null
          hint: string | null
          http_status: number | null
          id: string
          is_call: boolean
          ok: boolean
          removed: boolean
          title: string | null
          token_id: string | null
          token_tail: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          call_id?: string | null
          created_at?: string
          fcm_error_code?: string | null
          fcm_error_message?: string | null
          fcm_error_status?: string | null
          hint?: string | null
          http_status?: number | null
          id?: string
          is_call?: boolean
          ok: boolean
          removed?: boolean
          title?: string | null
          token_id?: string | null
          token_tail?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          call_id?: string | null
          created_at?: string
          fcm_error_code?: string | null
          fcm_error_message?: string | null
          fcm_error_status?: string | null
          hint?: string | null
          http_status?: number | null
          id?: string
          is_call?: boolean
          ok?: boolean
          removed?: boolean
          title?: string | null
          token_id?: string | null
          token_tail?: string | null
          user_id?: string | null
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
      scheduled_aimtell_pushes: {
        Row: {
          body: string | null
          broadcast_all: boolean | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          scheduled_at: string
          segment_id: string | null
          sent_at: string | null
          status: string
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          broadcast_all?: boolean | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          scheduled_at: string
          segment_id?: string | null
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          broadcast_all?: boolean | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          scheduled_at?: string
          segment_id?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      signup_device_fingerprints: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          referrer_id: string | null
          user_agent_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          referrer_id?: string | null
          user_agent_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          referrer_id?: string | null
          user_agent_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_ads: {
        Row: {
          amount: number
          clicks: number
          created_at: string
          ends_at: string
          headline: string | null
          id: string
          impressions: number
          market_id: string
          starts_at: string
          status: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          amount?: number
          clicks?: number
          created_at?: string
          ends_at: string
          headline?: string | null
          id?: string
          impressions?: number
          market_id: string
          starts_at?: string
          status?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          amount?: number
          clicks?: number
          created_at?: string
          ends_at?: string
          headline?: string | null
          id?: string
          impressions?: number
          market_id?: string
          starts_at?: string
          status?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_ads_market_id_fkey"
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
      space_bans: {
        Row: {
          banned_by: string
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          reason: string | null
          space_id: string
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          space_id: string
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_bans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_broadcasts: {
        Row: {
          amount: number
          bonus_amount: number | null
          created_at: string | null
          id: string
          space_id: string
          status: string
          tier: string
          user_id: string
        }
        Insert: {
          amount?: number
          bonus_amount?: number | null
          created_at?: string | null
          id?: string
          space_id: string
          status?: string
          tier?: string
          user_id: string
        }
        Update: {
          amount?: number
          bonus_amount?: number | null
          created_at?: string | null
          id?: string
          space_id?: string
          status?: string
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_broadcasts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_gifts: {
        Row: {
          amount: number
          created_at: string
          emoji: string
          id: string
          recipient_id: string
          sender_id: string
          space_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          emoji: string
          id?: string
          recipient_id: string
          sender_id: string
          space_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          emoji?: string
          id?: string
          recipient_id?: string
          sender_id?: string
          space_id?: string
        }
        Relationships: []
      }
      space_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          space_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          space_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          reactions: Json
          reply_to_content: string | null
          reply_to_id: string | null
          reply_to_name: string | null
          space_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          reactions?: Json
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_name?: string | null
          space_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          reactions?: Json
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_name?: string | null
          space_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "space_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_participants: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["space_role"]
          space_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["space_role"]
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_participants_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_reminders: {
        Row: {
          created_at: string
          id: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_reminders_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          co_host_ids: string[]
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          is_private: boolean
          is_recorded: boolean
          listener_count: number
          peak_listeners: number
          recording_egress_id: string | null
          recording_url: string | null
          reminder_count: number
          scheduled_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["space_status"]
          stream_url: string | null
          tagged_market_ids: string[]
          title: string
          visibility_scope: string
        }
        Insert: {
          co_host_ids?: string[]
          created_at?: string
          ended_at?: string | null
          host_id: string
          id?: string
          is_private?: boolean
          is_recorded?: boolean
          listener_count?: number
          peak_listeners?: number
          recording_egress_id?: string | null
          recording_url?: string | null
          reminder_count?: number
          scheduled_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["space_status"]
          stream_url?: string | null
          tagged_market_ids?: string[]
          title: string
          visibility_scope?: string
        }
        Update: {
          co_host_ids?: string[]
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          is_private?: boolean
          is_recorded?: boolean
          listener_count?: number
          peak_listeners?: number
          recording_egress_id?: string | null
          recording_url?: string | null
          reminder_count?: number
          scheduled_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["space_status"]
          stream_url?: string | null
          tagged_market_ids?: string[]
          title?: string
          visibility_scope?: string
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
      sports_import_presets: {
        Row: {
          auto_approve: boolean
          country: string | null
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          league_id: number
          league_logo: string | null
          league_name: string
          max_days_ahead: number
          max_imports_per_run: number
          sport_type: string
          updated_at: string
        }
        Insert: {
          auto_approve?: boolean
          country?: string | null
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          league_id: number
          league_logo?: string | null
          league_name: string
          max_days_ahead?: number
          max_imports_per_run?: number
          sport_type?: string
          updated_at?: string
        }
        Update: {
          auto_approve?: boolean
          country?: string | null
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          league_id?: number
          league_logo?: string | null
          league_name?: string
          max_days_ahead?: number
          max_imports_per_run?: number
          sport_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      status_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "status_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      status_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number
          parent_id: string | null
          status_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          status_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          status_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "status_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_comments_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      status_likes: {
        Row: {
          created_at: string
          id: string
          status_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_likes_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      status_reposts: {
        Row: {
          created_at: string
          id: string
          status_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_reposts_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      status_updates: {
        Row: {
          comments_count: number
          content: string
          created_at: string
          id: string
          image_url: string | null
          likes_count: number
          market_id: string | null
          replies_count: number
          reposts_count: number
          user_id: string
          views_count: number
        }
        Insert: {
          comments_count?: number
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          likes_count?: number
          market_id?: string | null
          replies_count?: number
          reposts_count?: number
          user_id: string
          views_count?: number
        }
        Update: {
          comments_count?: number
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          likes_count?: number
          market_id?: string | null
          replies_count?: number
          reposts_count?: number
          user_id?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "status_updates_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      status_views: {
        Row: {
          created_at: string
          id: string
          status_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_views_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          background_color: string | null
          content: string | null
          created_at: string
          expires_at: string
          id: string
          image_url: string | null
          market_id: string | null
          user_id: string
        }
        Insert: {
          background_color?: string | null
          content?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string | null
          market_id?: string | null
          user_id: string
        }
        Update: {
          background_color?: string | null
          content?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string | null
          market_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      story_likes: {
        Row: {
          created_at: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          created_at: string
          id: string
          story_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          is_ai: boolean
          is_staff: boolean
          reactions: Json | null
          reply_to_content: string | null
          reply_to_id: string | null
          reply_to_sender_name: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_ai?: boolean
          is_staff?: boolean
          reactions?: Json | null
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_sender_name?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_ai?: boolean
          is_staff?: boolean
          reactions?: Json | null
          reply_to_content?: string | null
          reply_to_id?: string | null
          reply_to_sender_name?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          id: string
          status: string
          subject: string
          ticket_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
          notification_preferences: Json
          telegram_chat_id: number
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          id?: string
          linked_at?: string
          notification_preferences?: Json
          telegram_chat_id: number
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          id?: string
          linked_at?: string
          notification_preferences?: Json
          telegram_chat_id?: number
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          api_key_id: string | null
          bonus_amount: number
          created_at: string
          description: string | null
          gross_amount_usd: number | null
          id: string
          is_copy_trade: boolean
          market_id: string | null
          net_amount_usd: number | null
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
          withdrawal_request_id: string | null
        }
        Insert: {
          amount: number
          api_key_id?: string | null
          bonus_amount?: number
          created_at?: string
          description?: string | null
          gross_amount_usd?: number | null
          id?: string
          is_copy_trade?: boolean
          market_id?: string | null
          net_amount_usd?: number | null
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
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          api_key_id?: string | null
          bonus_amount?: number
          created_at?: string
          description?: string | null
          gross_amount_usd?: number | null
          id?: string
          is_copy_trade?: boolean
          market_id?: string | null
          net_amount_usd?: number | null
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
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "transactions_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      twitter_auth_sessions: {
        Row: {
          code_verifier: string
          created_at: string
          id: string
          redirect_url: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          id?: string
          redirect_url?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          id?: string
          redirect_url?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      twitter_auto_post_settings: {
        Row: {
          enabled: boolean
          event_type: string
          id: string
          tweet_template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          event_type: string
          id?: string
          tweet_template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          event_type?: string
          id?: string
          tweet_template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      twitter_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          id: string
          refresh_token: string | null
          scopes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_fcm_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          token_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          token_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          token_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "user_security_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          allow_calls: boolean
          allow_copy_trading: boolean
          allow_dm_gifts: boolean
          allow_dm_money: boolean
          allow_dms: boolean
          allow_screen_sharing: boolean
          created_at: string
          email_deposit_completed: boolean
          email_market_expired_creator: boolean
          email_market_lost: boolean
          email_market_won: boolean
          email_withdrawal_completed: boolean
          enable_gift_animations: boolean
          id: string
          mute_notifications: boolean
          private_account: boolean
          show_online_status: boolean
          show_portfolio: boolean
          show_trade_history: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_calls?: boolean
          allow_copy_trading?: boolean
          allow_dm_gifts?: boolean
          allow_dm_money?: boolean
          allow_dms?: boolean
          allow_screen_sharing?: boolean
          created_at?: string
          email_deposit_completed?: boolean
          email_market_expired_creator?: boolean
          email_market_lost?: boolean
          email_market_won?: boolean
          email_withdrawal_completed?: boolean
          enable_gift_animations?: boolean
          id?: string
          mute_notifications?: boolean
          private_account?: boolean
          show_online_status?: boolean
          show_portfolio?: boolean
          show_trade_history?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_calls?: boolean
          allow_copy_trading?: boolean
          allow_dm_gifts?: boolean
          allow_dm_money?: boolean
          allow_dms?: boolean
          allow_screen_sharing?: boolean
          created_at?: string
          email_deposit_completed?: boolean
          email_market_expired_creator?: boolean
          email_market_lost?: boolean
          email_market_won?: boolean
          email_withdrawal_completed?: boolean
          enable_gift_animations?: boolean
          id?: string
          mute_notifications?: boolean
          private_account?: boolean
          show_online_status?: boolean
          show_portfolio?: boolean
          show_trade_history?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_event_ledger: {
        Row: {
          event_key: string
          first_seen_at: string
          id: string
          payload: Json | null
          provider: string
        }
        Insert: {
          event_key: string
          first_seen_at?: string
          id?: string
          payload?: Json | null
          provider: string
        }
        Update: {
          event_key?: string
          first_seen_at?: string
          id?: string
          payload?: Json | null
          provider?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          api_key_id: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_retry_at: string | null
          payload: Json
          response_code: number | null
          status: string
        }
        Insert: {
          api_key_id: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          payload: Json
          response_code?: number | null
          status?: string
        }
        Update: {
          api_key_id?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json
          response_code?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_failures: {
        Row: {
          attempts: number
          created_at: string
          event_type: string | null
          external_reference: string | null
          id: string
          last_error: string | null
          last_stack: string | null
          next_run_at: string | null
          payload: Json
          payload_hash: string
          provider: string
          resolved_at: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type?: string | null
          external_reference?: string | null
          id?: string
          last_error?: string | null
          last_stack?: string | null
          next_run_at?: string | null
          payload: Json
          payload_hash: string
          provider: string
          resolved_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string | null
          external_reference?: string | null
          id?: string
          last_error?: string | null
          last_stack?: string | null
          next_run_at?: string | null
          payload?: Json
          payload_hash?: string
          provider?: string
          resolved_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          bonus_amount: number | null
          created_at: string
          credited_amount: number | null
          error: string | null
          event_type: string
          id: string
          message: string | null
          payload: Json | null
          provider: string
          reference: string | null
          requested_amount: number | null
          stack: string | null
          status: string
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          bonus_amount?: number | null
          created_at?: string
          credited_amount?: number | null
          error?: string | null
          event_type: string
          id?: string
          message?: string | null
          payload?: Json | null
          provider: string
          reference?: string | null
          requested_amount?: number | null
          stack?: string | null
          status?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          bonus_amount?: number | null
          created_at?: string
          credited_amount?: number | null
          error?: string | null
          event_type?: string
          id?: string
          message?: string | null
          payload?: Json | null
          provider?: string
          reference?: string | null
          requested_amount?: number | null
          stack?: string | null
          status?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "public_market_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
          idempotency_key: string | null
          ip_address: string | null
          nowpayments_id: string | null
          status: string
          tx_hash: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          crypto_currency?: string
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          nowpayments_id?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          crypto_currency?: string
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          nowpayments_id?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_security_overview: {
        Row: {
          created_at: string | null
          last_verified_at: string | null
          pin_enabled: boolean | null
          require_pin_login: boolean | null
          require_pin_withdrawal: boolean | null
          require_totp_login: boolean | null
          require_totp_withdrawal: boolean | null
          security_setup_complete: boolean | null
          totp_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          last_verified_at?: string | null
          pin_enabled?: boolean | null
          require_pin_login?: boolean | null
          require_pin_withdrawal?: boolean | null
          require_totp_login?: boolean | null
          require_totp_withdrawal?: boolean | null
          security_setup_complete?: boolean | null
          totp_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          last_verified_at?: string | null
          pin_enabled?: boolean | null
          require_pin_login?: boolean | null
          require_pin_withdrawal?: boolean | null
          require_totp_login?: boolean | null
          require_totp_withdrawal?: boolean | null
          security_setup_complete?: boolean | null
          totp_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_security_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_security_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_commission_settings: {
        Row: {
          admin_fee_percent: number | null
          ai_generation_cost: number | null
          auto_resolve_fee: number | null
          bc400_pool_balance: number | null
          bc400_pool_percent: number | null
          blue_max_free_markets: number | null
          blue_revenue_share_percent: number | null
          blue_trending_multiplier: number | null
          boost_flash_price: number | null
          boost_standard_price: number | null
          boost_whale_price: number | null
          broadcast_price: number | null
          copy_trade_commission_percent: number | null
          creator_fee_blue_percent: number | null
          creator_fee_gold_percent: number | null
          creator_fee_percent: number | null
          deposit_expiry_minutes: number | null
          deposit_large_overpay_alert: number | null
          deposit_max_amount: number | null
          deposit_min_amount: number | null
          deposit_overpay_threshold: number | null
          deposit_partial_threshold: number | null
          deposit_provider: string | null
          deposit_wrong_asset_high: number | null
          deposit_wrong_asset_low: number | null
          exit_fee_percent: number | null
          fallback_naira_rate: number | null
          fallback_payout_naira_rate: number | null
          gift_fee_percent: number | null
          gold_max_free_markets: number | null
          gold_revenue_share_percent: number | null
          gold_trending_multiplier: number | null
          id: string | null
          kyc_tier1_daily_limit: number | null
          kyc_tier2_daily_limit: number | null
          liquidity_return_fee_percent: number | null
          market_creation_fee: number | null
          max_daily_withdrawals: number | null
          max_drafts_blue: number | null
          max_drafts_gold: number | null
          max_drafts_none: number | null
          min_gold_token_balance: number | null
          min_liquidity: number | null
          min_nft_balance: number | null
          min_token_balance: number | null
          min_withdrawal_amount: number | null
          naira_payout_markdown: number | null
          naira_rate_markup: number | null
          nft_buy_url: string | null
          nft_contract_address: string | null
          osure_100_premium: number | null
          osure_25_premium: number | null
          osure_50_premium: number | null
          osure_enabled: boolean | null
          payaza_mode: string | null
          payout_provider: string | null
          prediction_fee_percent: number | null
          prediction_max_bet: number | null
          prediction_min_bet: number | null
          push_prompt_cooldown_days: number | null
          qt_disabled_assets: string | null
          qt_enabled_assets: string | null
          qt_enabled_timeframes: string | null
          qt_max_bet: number | null
          qt_min_bet: number | null
          qt_one_sided_bonus: boolean | null
          qt_streak_2x: number | null
          qt_streak_3x: number | null
          qt_streak_4x: number | null
          qt_streak_5x: number | null
          quick_trade_fee_percent: number | null
          referral_reward_amount: number | null
          referrer_commission_percent: number | null
          registration_bonus_amount: number | null
          social_ad_price: number | null
          token_contract_address: string | null
          token_decimals: number | null
          updated_at: string | null
          updated_by: string | null
          welcome_bonus_cap: number | null
          welcome_bonus_percent: number | null
          withdrawal_anomaly_threshold: number | null
          withdrawal_cooldown_minutes: number | null
          withdrawal_fee_percent: number | null
          withdrawal_limit_enabled: boolean | null
          withdrawal_multiplier: number | null
        }
        Insert: {
          admin_fee_percent?: number | null
          ai_generation_cost?: number | null
          auto_resolve_fee?: number | null
          bc400_pool_balance?: number | null
          bc400_pool_percent?: number | null
          blue_max_free_markets?: number | null
          blue_revenue_share_percent?: number | null
          blue_trending_multiplier?: number | null
          boost_flash_price?: number | null
          boost_standard_price?: number | null
          boost_whale_price?: number | null
          broadcast_price?: number | null
          copy_trade_commission_percent?: number | null
          creator_fee_blue_percent?: number | null
          creator_fee_gold_percent?: number | null
          creator_fee_percent?: number | null
          deposit_expiry_minutes?: number | null
          deposit_large_overpay_alert?: number | null
          deposit_max_amount?: number | null
          deposit_min_amount?: number | null
          deposit_overpay_threshold?: number | null
          deposit_partial_threshold?: number | null
          deposit_provider?: string | null
          deposit_wrong_asset_high?: number | null
          deposit_wrong_asset_low?: number | null
          exit_fee_percent?: number | null
          fallback_naira_rate?: number | null
          fallback_payout_naira_rate?: number | null
          gift_fee_percent?: number | null
          gold_max_free_markets?: number | null
          gold_revenue_share_percent?: number | null
          gold_trending_multiplier?: number | null
          id?: string | null
          kyc_tier1_daily_limit?: number | null
          kyc_tier2_daily_limit?: number | null
          liquidity_return_fee_percent?: number | null
          market_creation_fee?: number | null
          max_daily_withdrawals?: number | null
          max_drafts_blue?: number | null
          max_drafts_gold?: number | null
          max_drafts_none?: number | null
          min_gold_token_balance?: number | null
          min_liquidity?: number | null
          min_nft_balance?: number | null
          min_token_balance?: number | null
          min_withdrawal_amount?: number | null
          naira_payout_markdown?: number | null
          naira_rate_markup?: number | null
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          osure_100_premium?: number | null
          osure_25_premium?: number | null
          osure_50_premium?: number | null
          osure_enabled?: boolean | null
          payaza_mode?: string | null
          payout_provider?: string | null
          prediction_fee_percent?: number | null
          prediction_max_bet?: number | null
          prediction_min_bet?: number | null
          push_prompt_cooldown_days?: number | null
          qt_disabled_assets?: string | null
          qt_enabled_assets?: string | null
          qt_enabled_timeframes?: string | null
          qt_max_bet?: number | null
          qt_min_bet?: number | null
          qt_one_sided_bonus?: boolean | null
          qt_streak_2x?: number | null
          qt_streak_3x?: number | null
          qt_streak_4x?: number | null
          qt_streak_5x?: number | null
          quick_trade_fee_percent?: number | null
          referral_reward_amount?: number | null
          referrer_commission_percent?: number | null
          registration_bonus_amount?: number | null
          social_ad_price?: number | null
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string | null
          updated_by?: string | null
          welcome_bonus_cap?: number | null
          welcome_bonus_percent?: number | null
          withdrawal_anomaly_threshold?: number | null
          withdrawal_cooldown_minutes?: number | null
          withdrawal_fee_percent?: number | null
          withdrawal_limit_enabled?: boolean | null
          withdrawal_multiplier?: number | null
        }
        Update: {
          admin_fee_percent?: number | null
          ai_generation_cost?: number | null
          auto_resolve_fee?: number | null
          bc400_pool_balance?: number | null
          bc400_pool_percent?: number | null
          blue_max_free_markets?: number | null
          blue_revenue_share_percent?: number | null
          blue_trending_multiplier?: number | null
          boost_flash_price?: number | null
          boost_standard_price?: number | null
          boost_whale_price?: number | null
          broadcast_price?: number | null
          copy_trade_commission_percent?: number | null
          creator_fee_blue_percent?: number | null
          creator_fee_gold_percent?: number | null
          creator_fee_percent?: number | null
          deposit_expiry_minutes?: number | null
          deposit_large_overpay_alert?: number | null
          deposit_max_amount?: number | null
          deposit_min_amount?: number | null
          deposit_overpay_threshold?: number | null
          deposit_partial_threshold?: number | null
          deposit_provider?: string | null
          deposit_wrong_asset_high?: number | null
          deposit_wrong_asset_low?: number | null
          exit_fee_percent?: number | null
          fallback_naira_rate?: number | null
          fallback_payout_naira_rate?: number | null
          gift_fee_percent?: number | null
          gold_max_free_markets?: number | null
          gold_revenue_share_percent?: number | null
          gold_trending_multiplier?: number | null
          id?: string | null
          kyc_tier1_daily_limit?: number | null
          kyc_tier2_daily_limit?: number | null
          liquidity_return_fee_percent?: number | null
          market_creation_fee?: number | null
          max_daily_withdrawals?: number | null
          max_drafts_blue?: number | null
          max_drafts_gold?: number | null
          max_drafts_none?: number | null
          min_gold_token_balance?: number | null
          min_liquidity?: number | null
          min_nft_balance?: number | null
          min_token_balance?: number | null
          min_withdrawal_amount?: number | null
          naira_payout_markdown?: number | null
          naira_rate_markup?: number | null
          nft_buy_url?: string | null
          nft_contract_address?: string | null
          osure_100_premium?: number | null
          osure_25_premium?: number | null
          osure_50_premium?: number | null
          osure_enabled?: boolean | null
          payaza_mode?: string | null
          payout_provider?: string | null
          prediction_fee_percent?: number | null
          prediction_max_bet?: number | null
          prediction_min_bet?: number | null
          push_prompt_cooldown_days?: number | null
          qt_disabled_assets?: string | null
          qt_enabled_assets?: string | null
          qt_enabled_timeframes?: string | null
          qt_max_bet?: number | null
          qt_min_bet?: number | null
          qt_one_sided_bonus?: boolean | null
          qt_streak_2x?: number | null
          qt_streak_3x?: number | null
          qt_streak_4x?: number | null
          qt_streak_5x?: number | null
          quick_trade_fee_percent?: number | null
          referral_reward_amount?: number | null
          referrer_commission_percent?: number | null
          registration_bonus_amount?: number | null
          social_ad_price?: number | null
          token_contract_address?: string | null
          token_decimals?: number | null
          updated_at?: string | null
          updated_by?: string | null
          welcome_bonus_cap?: number | null
          welcome_bonus_percent?: number | null
          withdrawal_anomaly_threshold?: number | null
          withdrawal_cooldown_minutes?: number | null
          withdrawal_fee_percent?: number | null
          withdrawal_limit_enabled?: boolean | null
          withdrawal_multiplier?: number | null
        }
        Relationships: []
      }
      public_market_trades: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string | null
          market_id: string | null
          option_id: string | null
          price: number | null
          shares: number | null
          side: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          market_id?: string | null
          option_id?: string | null
          price?: number | null
          shares?: number | null
          side?: string | null
          status?: string | null
          type?: string | null
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
      public_orderbook: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string | null
          limit_price: number | null
          market_id: string | null
          option_id: string | null
          order_type: string | null
          shares: number | null
          side: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          limit_price?: number | null
          market_id?: string | null
          option_id?: string | null
          order_type?: string | null
          shares?: number | null
          side?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          limit_price?: number | null
          market_id?: string | null
          option_id?: string | null
          order_type?: string | null
          shares?: number | null
          side?: string | null
          status?: string | null
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
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          interests: string[] | null
          is_blocked: boolean | null
          is_public: boolean | null
          kyc_status: string | null
          referred_by: string | null
          social_tutorial_seen: boolean | null
          twitter_avatar_url: string | null
          twitter_username: string | null
          unlimited_markets: boolean | null
          updated_at: string | null
          verification_level: string | null
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          interests?: string[] | null
          is_blocked?: boolean | null
          is_public?: boolean | null
          kyc_status?: string | null
          referred_by?: string | null
          social_tutorial_seen?: boolean | null
          twitter_avatar_url?: string | null
          twitter_username?: string | null
          unlimited_markets?: boolean | null
          updated_at?: string | null
          verification_level?: string | null
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          interests?: string[] | null
          is_blocked?: boolean | null
          is_public?: boolean | null
          kyc_status?: string | null
          referred_by?: string | null
          social_tutorial_seen?: boolean | null
          twitter_avatar_url?: string | null
          twitter_username?: string | null
          unlimited_markets?: boolean | null
          updated_at?: string | null
          verification_level?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_dm_request: { Args: { _conversation_id: string }; Returns: Json }
      add_market_liquidity: {
        Args: { _amount: number; _market_id: string; _user_id: string }
        Returns: Json
      }
      adjust_balance: {
        Args: {
          _bonus_delta?: number
          _delta: number
          _insurance_delta?: number
          _user_id: string
        }
        Returns: undefined
      }
      adjust_platform_pool: { Args: { _delta: number }; Returns: undefined }
      admin_update_profile: {
        Args: {
          _block_reason?: string
          _blocked_at?: string
          _is_blocked?: boolean
          _target_user_id: string
          _unlimited_markets?: boolean
        }
        Returns: undefined
      }
      buy_update_market_prices: {
        Args: {
          _bet_amount: number
          _is_multi: boolean
          _market_id: string
          _pool_amount: number
          _side: string
        }
        Returns: Json
      }
      can_invite_to_space: { Args: { _space_id: string }; Returns: boolean }
      can_read_space_invite: {
        Args: { _invitee_id: string; _inviter_id: string; _space_id: string }
        Returns: boolean
      }
      can_send_dm: {
        Args: { _conversation_id: string; _sender_id: string }
        Returns: boolean
      }
      cancel_market_atomic: { Args: { _market_id: string }; Returns: Json }
      claim_market_for_resolution: {
        Args: { _market_id: string }
        Returns: Json
      }
      claim_notification_email: {
        Args: {
          _idempotency_key: string
          _template_name: string
          _user_id?: string
        }
        Returns: boolean
      }
      claim_notification_email_outbox: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          pref_key: string | null
          recipient_email: string | null
          sent_at: string | null
          status: string
          template_data: Json
          template_name: string
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_boost: {
        Args: { _market_id: string; _payer: string; _payment_id: string }
        Returns: {
          ends_at: string
          id: string
          status: string
        }[]
      }
      claim_webhook_broadcast: {
        Args: { _market_id: string; _payment_id: string; _user_id: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      claim_webhook_deposit: {
        Args: { _payment_id: string; _provider: string }
        Returns: {
          amount: number
          id: string
          status: string
          user_id: string
        }[]
      }
      claim_withdrawal_for_processing: {
        Args: { _action: string; _withdrawal_id: string }
        Returns: Json
      }
      cleanup_webhook_event_ledger: { Args: never; Returns: undefined }
      count_visible_live_spaces: { Args: { _user_id: string }; Returns: number }
      debit_balance_atomic: {
        Args: { _bonus_deduct?: number; _main_deduct: number; _user_id: string }
        Returns: Json
      }
      deduct_market_liquidity:
        | {
            Args: {
              _bonus_for_fee?: number
              _fee_amount?: number
              _liquidity_amount: number
              _user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _bonus_for_fee?: number
              _fee_amount?: number
              _liquidity_amount: number
              _log_transactions?: boolean
              _market_id?: string
              _user_id: string
            }
            Returns: Json
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_space_bans: {
        Args: never
        Returns: {
          expired_count: number
        }[]
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
      generate_unique_username: {
        Args: { _display_name: string }
        Returns: string
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
      get_live_space_user_ids: { Args: never; Returns: string[] }
      get_platform_user_count: { Args: never; Returns: number }
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
      get_space_analytics: {
        Args: { _space_id: string }
        Returns: {
          duration_minutes: number
          peak_listeners: number
          total_messages: number
          total_unique_listeners: number
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
      get_visible_spaces: {
        Args: { _user_id: string }
        Returns: {
          co_host_ids: string[]
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          is_private: boolean
          is_recorded: boolean
          listener_count: number
          peak_listeners: number
          recording_egress_id: string | null
          recording_url: string | null
          reminder_count: number
          scheduled_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["space_status"]
          stream_url: string | null
          tagged_market_ids: string[]
          title: string
          visibility_scope: string
        }[]
        SetofOptions: {
          from: "*"
          to: "spaces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_creation_fee_escrow: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      increment_bc400_pool: { Args: { _amount: number }; Returns: undefined }
      is_mutual_follow: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      is_space_participant: {
        Args: { _space_id: string; _user_id: string }
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
      log_dm_call_event: {
        Args: { _call_id: string; _event_type: string; _metadata?: Json }
        Returns: string
      }
      mark_dm_messages_read: {
        Args: { _conversation_id: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_email: { Args: { _email: string }; Returns: string }
      publish_draft_market: {
        Args: { _market_data: Json; _market_id: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_webhook_event: {
        Args: { _event_key: string; _payload?: Json; _provider: string }
        Returns: boolean
      }
      record_webhook_failure: {
        Args: {
          _error?: string
          _event_type?: string
          _external_reference?: string
          _next_run_at?: string
          _payload: Json
          _payload_hash: string
          _provider: string
          _stack?: string
          _transaction_id?: string
          _user_id?: string
        }
        Returns: string
      }
      reject_dm_request: { Args: { _conversation_id: string }; Returns: Json }
      release_creation_fee_escrow: {
        Args: { _action: string; _escrow_id: string }
        Returns: Json
      }
      requeue_webhook_event: { Args: { _event_id: string }; Returns: Json }
      resolve_webhook_failure: { Args: { _id: string }; Returns: boolean }
      sell_update_market_prices: {
        Args: {
          _gross_proceeds: number
          _is_multi: boolean
          _market_id: string
          _net_proceeds: number
          _side: string
        }
        Returns: Json
      }
      send_dm_gift: {
        Args: {
          p_amount: number
          p_conversation_id: string
          p_emoji: string
          p_recipient_id: string
        }
        Returns: string
      }
      send_dm_money: {
        Args: {
          p_amount: number
          p_conversation_id: string
          p_recipient_id: string
        }
        Returns: string
      }
      send_space_gift: {
        Args: {
          _amount: number
          _emoji: string
          _recipient_id: string
          _sender_id: string
          _space_id: string
        }
        Returns: Json
      }
      settle_user_debts: { Args: { _user_id: string }; Returns: Json }
      start_dm_conversation: {
        Args: { _other_user_id: string }
        Returns: string
      }
      toggle_message_reaction: {
        Args: { _emoji: string; _message_id: string; _table: string }
        Returns: Json
      }
      topup_gift_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      transfer_rewards_to_gift: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      update_trending_markets: { Args: never; Returns: undefined }
      withdraw_rewards_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "super_admin"
        | "support"
        | "business"
      space_role: "host" | "speaker" | "listener"
      space_status: "scheduled" | "live" | "ended" | "cancelled"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "super_admin",
        "support",
        "business",
      ],
      space_role: ["host", "speaker", "listener"],
      space_status: ["scheduled", "live", "ended", "cancelled"],
    },
  },
} as const


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "achievement_definitions": {
              Row: { id: string; metric: string; target: number; display_order: number }
              Insert: { id: string; metric: string; target: number; display_order: number }
              Update: { id?: string; metric?: string; target?: number; display_order?: number }
              Relationships: []
            },
            "user_achievement_progress": {
              Row: { user_id: string; achievement_id: string; progress: number; details: Json; updated_at: string }
              Insert: { user_id?: string; achievement_id: string; progress?: number; details?: Json; updated_at?: string }
              Update: { user_id?: string; achievement_id?: string; progress?: number; details?: Json; updated_at?: string }
              Relationships: [
                { foreignKeyName: "user_achievement_progress_achievement_id_fkey"; columns: ["achievement_id"]; isOneToOne: false; referencedRelation: "achievement_definitions"; referencedColumns: ["id"] },
                { foreignKeyName: "user_achievement_progress_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
              ]
            },
            "user_achievements": {
              Row: { user_id: string; achievement_id: string; earned_at: string; source: "event" | "backfill"; notification_claimed_at: string | null }
              Insert: { user_id?: string; achievement_id: string; earned_at?: string; source: "event" | "backfill"; notification_claimed_at?: string | null }
              Update: { user_id?: string; achievement_id?: string; earned_at?: string; source?: "event" | "backfill"; notification_claimed_at?: string | null }
              Relationships: [
                { foreignKeyName: "user_achievements_achievement_id_fkey"; columns: ["achievement_id"]; isOneToOne: false; referencedRelation: "achievement_definitions"; referencedColumns: ["id"] },
                { foreignKeyName: "user_achievements_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
              ]
            },
            "viewer_presets": {
              Row: { id: string; user_id: string; name: string; look: NonNullable<Json>; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; name: string; look: NonNullable<Json>; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; name?: string; look?: NonNullable<Json>; created_at?: string; updated_at?: string }
              Relationships: [
                { foreignKeyName: "viewer_presets_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
              ]
            },
            "task_groups": {
              Row: { id: string; user_id: string; name: string; position: number; collapsed: boolean; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; name: string; position?: number; collapsed?: boolean; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; name?: string; position?: number; collapsed?: boolean; created_at?: string; updated_at?: string }
              Relationships: []
            },
            "task_lists": {
              Row: { id: string; user_id: string; group_id: string | null; name: string; icon: string | null; accent_color: string | null; is_inbox: boolean; position: number; show_completed: boolean; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; group_id?: string | null; name: string; icon?: string | null; accent_color?: string | null; is_inbox?: boolean; position?: number; show_completed?: boolean; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; group_id?: string | null; name?: string; icon?: string | null; accent_color?: string | null; is_inbox?: boolean; position?: number; show_completed?: boolean; created_at?: string; updated_at?: string }
              Relationships: []
            },
            "tasks": {
              Row: { id: string; user_id: string; list_id: string; title: string; notes: string; notes_rev: number; has_notes: boolean; important: boolean; due_date: string | null; my_day_on: string | null; completed_at: string | null; entry_id: string | null; position: number; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; list_id: string; title: string; notes?: string; notes_rev?: number; important?: boolean; due_date?: string | null; my_day_on?: string | null; completed_at?: string | null; entry_id?: string | null; position?: number; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; list_id?: string; title?: string; notes?: string; notes_rev?: number; important?: boolean; due_date?: string | null; my_day_on?: string | null; completed_at?: string | null; entry_id?: string | null; position?: number; created_at?: string; updated_at?: string }
              Relationships: []
            },
            "task_steps": {
              Row: { id: string; user_id: string; task_id: string; title: string; completed: boolean; position: number; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; task_id: string; title: string; completed?: boolean; position?: number; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; task_id?: string; title?: string; completed?: boolean; position?: number; created_at?: string; updated_at?: string }
              Relationships: []
            },
            "attachment_objects": {
              Row: { user_id: string; name: string; origin: "supabase" | "r2"; r2_state: "pending" | "verified" | null; content_type: string; size_bytes: number; md5: string | null; sha256: string | null; created_at: string; verified_at: string | null }
              Insert: { user_id: string; name: string; origin: "supabase" | "r2"; r2_state?: "pending" | "verified" | null; content_type: string; size_bytes: number; md5?: string | null; sha256?: string | null; created_at?: string; verified_at?: string | null }
              Update: { user_id?: string; name?: string; origin?: "supabase" | "r2"; r2_state?: "pending" | "verified" | null; content_type?: string; size_bytes?: number; md5?: string | null; sha256?: string | null; created_at?: string; verified_at?: string | null }
              Relationships: [
                { foreignKeyName: "attachment_objects_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
              ]
            },
            "collections": {
              Row: { id: string; user_id: string; name: string; slug: string; description: string; legacy_slug: string | null; position: number; icon: string | null; accent_color: string | null; banner_url: string | null; progress_label: string | null; default_template_id: string | null; layout: string; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; name: string; slug?: string; description?: string; legacy_slug?: string | null; position?: number; icon?: string | null; accent_color?: string | null; banner_url?: string | null; progress_label?: string | null; default_template_id?: string | null; layout?: string; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; name?: string; slug?: string; description?: string; legacy_slug?: string | null; position?: number; icon?: string | null; accent_color?: string | null; banner_url?: string | null; progress_label?: string | null; default_template_id?: string | null; layout?: string; created_at?: string; updated_at?: string }
              Relationships: [
                { foreignKeyName: "collections_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
                { foreignKeyName: "collections_default_template_fkey"; columns: ["user_id", "default_template_id"]; isOneToOne: false; referencedRelation: "workspace_templates"; referencedColumns: ["user_id", "id"] },
              ]
            },
            "slug_redirects": {
              Row: { user_id: string; kind: "collection" | "entry"; slug: string; target_id: string; created_at: string }
              Insert: { user_id: string; kind: "collection" | "entry"; slug: string; target_id: string; created_at?: string }
              Update: { user_id?: string; kind?: "collection" | "entry"; slug?: string; target_id?: string; created_at?: string }
              Relationships: [{ foreignKeyName: "slug_redirects_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "workspace_templates": {
              Row: { id: string; user_id: string; name: string; structure: NonNullable<Json>; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; name: string; structure?: NonNullable<Json>; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; name?: string; structure?: NonNullable<Json>; created_at?: string; updated_at?: string }
              Relationships: [{ foreignKeyName: "workspace_templates_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "entry_visits": {
              Row: { user_id: string; entry_id: string; last_file_id: string | null; visited_at: string }
              Insert: { user_id?: string; entry_id: string; last_file_id?: string | null; visited_at?: string }
              Update: { user_id?: string; entry_id?: string; last_file_id?: string | null; visited_at?: string }
              Relationships: [
                { foreignKeyName: "entry_visits_user_id_entry_id_fkey"; columns: ["user_id", "entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["user_id", "id"] },
                { foreignKeyName: "entry_visits_user_id_entry_id_last_file_id_fkey"; columns: ["user_id", "entry_id", "last_file_id"]; isOneToOne: false; referencedRelation: "workspace_nodes"; referencedColumns: ["user_id", "entry_id", "id"] },
              ]
            },
            "arcade_records": {
              Row: { user_id: string; game: string; variant: string; score: number; achieved_at: string }
              Insert: { user_id?: string; game: string; variant?: string; score: number; achieved_at?: string }
              Update: { user_id?: string; game?: string; variant?: string; score?: number; achieved_at?: string }
              Relationships: [{ foreignKeyName: "arcade_records_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "coin_wallets": {
              Row: { user_id: string; balance: number; earned: number; spent: number; updated_at: string }
              Insert: { user_id: string; balance?: number; earned?: number; spent?: number; updated_at?: string }
              Update: { user_id?: string; balance?: number; earned?: number; spent?: number; updated_at?: string }
              Relationships: [{ foreignKeyName: "coin_wallets_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "coin_transactions": {
              Row: { id: number; user_id: string; amount: number; balance_after: number; kind: "reward" | "purchase" | "code" | "slots"; reference: string; details: NonNullable<Json>; created_at: string }
              Insert: { id?: never; user_id: string; amount: number; balance_after: number; kind: "reward" | "purchase" | "code" | "slots"; reference: string; details?: NonNullable<Json>; created_at?: string }
              Update: { id?: never; user_id?: string; amount?: number; balance_after?: number; kind?: "reward" | "purchase" | "code" | "slots"; reference?: string; details?: NonNullable<Json>; created_at?: string }
              Relationships: [{ foreignKeyName: "coin_transactions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "cosmetic_items": {
              Row: { id: string; kind: "frame" | "avatar_decoration" | "game" | "badge" | "title"; price: number; available: boolean; secret: boolean; created_at: string; game: string | null; category: string | null }
              Insert: { id: string; kind: "frame" | "avatar_decoration" | "game" | "badge" | "title"; price: number; available?: boolean; secret?: boolean; created_at?: string; game?: string | null; category?: string | null }
              Update: { id?: string; kind?: "frame" | "avatar_decoration" | "game" | "badge" | "title"; price?: number; available?: boolean; secret?: boolean; created_at?: string; game?: string | null; category?: string | null }
              Relationships: []
            },
            "game_loadouts": {
              Row: { user_id: string; game: string; category: string; item_id: string; updated_at: string }
              Insert: { user_id: string; game: string; category: string; item_id: string; updated_at?: string }
              Update: { user_id?: string; game?: string; category?: string; item_id?: string; updated_at?: string }
              Relationships: [
                { foreignKeyName: "game_loadouts_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
                { foreignKeyName: "game_loadouts_item_id_fkey"; columns: ["item_id"]; isOneToOne: false; referencedRelation: "cosmetic_items"; referencedColumns: ["id"] },
              ]
            },
            "user_cosmetics": {
              Row: { user_id: string; item_id: string; acquired_at: string; transaction_id: number | null }
              Insert: { user_id: string; item_id: string; acquired_at?: string; transaction_id?: number | null }
              Update: { user_id?: string; item_id?: string; acquired_at?: string; transaction_id?: number | null }
              Relationships: [
                { foreignKeyName: "user_cosmetics_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
                { foreignKeyName: "user_cosmetics_item_id_fkey"; columns: ["item_id"]; isOneToOne: false; referencedRelation: "cosmetic_items"; referencedColumns: ["id"] },
              ]
            },
            "secret_code_redemptions": {
              Row: { code_id: string; user_id: string; redeemed_at: string; coins: number; items: string[] }
              Insert: { code_id: string; user_id: string; redeemed_at?: string; coins?: number; items?: string[] }
              Update: { code_id?: string; user_id?: string; redeemed_at?: string; coins?: number; items?: string[] }
              Relationships: [{ foreignKeyName: "secret_code_redemptions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "slot_machines": {
              Row: { id: string; reels: Json; paytable: Json; bets: number[]; daily_wager_limit: number; max_spins_per_minute: number; updated_at: string }
              Insert: { id: string; reels: Json; paytable: Json; bets: number[]; daily_wager_limit: number; max_spins_per_minute?: number; updated_at?: string }
              Update: { id?: string; reels?: Json; paytable?: Json; bets?: number[]; daily_wager_limit?: number; max_spins_per_minute?: number; updated_at?: string }
              Relationships: []
            },
            "slot_spins": {
              Row: { id: string; user_id: string; machine: string; bet: number; stops: number[]; symbols: string[]; multiplier: number; payout: number; balance_after: number; created_at: string }
              Insert: { id: string; user_id: string; machine: string; bet: number; stops: number[]; symbols: string[]; multiplier: number; payout: number; balance_after: number; created_at?: string }
              Update: { id?: string; user_id?: string; machine?: string; bet?: number; stops?: number[]; symbols?: string[]; multiplier?: number; payout?: number; balance_after?: number; created_at?: string }
              Relationships: [{ foreignKeyName: "slot_spins_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "arcade_reward_rules": {
              Row: { game: string; variant: string; min_score: number; min_seconds: number; points_per_coin: number; flat_coins: number; max_coins: number; max_score_per_second: number; score_allowance: number; max_score: number }
              Insert: { game: string; variant?: string; min_score?: number; min_seconds?: number; points_per_coin?: number; flat_coins?: number; max_coins: number; max_score_per_second: number; score_allowance?: number; max_score: number }
              Update: { game?: string; variant?: string; min_score?: number; min_seconds?: number; points_per_coin?: number; flat_coins?: number; max_coins?: number; max_score_per_second?: number; score_allowance?: number; max_score?: number }
              Relationships: []
            },
            "sudoku_games": {
              Row: { user_id: string; id: string; slot: "regular" | "daily"; puzzle_date: string | null; hints: number; difficulty: "easy" | "medium" | "hard"; puzzle: string; solution: string; entries: string; notes: number[]; elapsed_ms: number; completed_at: string | null; started_at: string; updated_at: string; reward_eligible: boolean }
              Insert: { user_id?: string; id?: string; slot?: "regular" | "daily"; puzzle_date?: string | null; difficulty: "easy" | "medium" | "hard"; puzzle: string; solution: string; entries?: string; notes?: number[]; elapsed_ms?: number; completed_at?: string | null; started_at?: string; updated_at?: string }
              Update: { user_id?: string; id?: string; slot?: "regular" | "daily"; puzzle_date?: string | null; difficulty?: "easy" | "medium" | "hard"; puzzle?: string; solution?: string; entries?: string; notes?: number[]; elapsed_ms?: number; completed_at?: string | null; started_at?: string; updated_at?: string }
              Relationships: [{ foreignKeyName: "sudoku_games_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "sudoku_daily_results": {
              Row: { user_id: string; puzzle_date: string; game_id: string; elapsed_ms: number; hints: number; completed_at: string }
              Insert: { user_id: string; puzzle_date: string; game_id: string; elapsed_ms: number; hints: number; completed_at?: string }
              Update: { user_id?: string; puzzle_date?: string; game_id?: string; elapsed_ms?: number; hints?: number; completed_at?: string }
              Relationships: [{ foreignKeyName: "sudoku_daily_results_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
            },
            "home_fan_items": {
              Row: { id: string; user_id: string; position: number; entry_id: string | null; image_url: string | null; image_shape: "square" | "portrait"; created_at: string }
              Insert: { id?: string; user_id?: string; position: number; entry_id?: string | null; image_url?: string | null; image_shape?: "square" | "portrait"; created_at?: string }
              Update: { id?: string; user_id?: string; position?: number; entry_id?: string | null; image_url?: string | null; image_shape?: "square" | "portrait"; created_at?: string }
              Relationships: [
                { foreignKeyName: "home_fan_items_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
                { foreignKeyName: "home_fan_items_user_id_entry_id_fkey"; columns: ["user_id", "entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["user_id", "id"] },
              ]
            },
            "collection_cover_items": {
              Row: { id: string; user_id: string; collection_id: string; position: number; entry_id: string | null; image_url: string | null; image_shape: "square" | "portrait"; created_at: string }
              Insert: { id?: string; user_id?: string; collection_id: string; position: number; entry_id?: string | null; image_url?: string | null; image_shape?: "square" | "portrait"; created_at?: string }
              Update: { id?: string; user_id?: string; collection_id?: string; position?: number; entry_id?: string | null; image_url?: string | null; image_shape?: "square" | "portrait"; created_at?: string }
              Relationships: [
                { foreignKeyName: "collection_cover_items_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
                { foreignKeyName: "collection_cover_items_user_id_collection_id_fkey"; columns: ["user_id", "collection_id"]; isOneToOne: false; referencedRelation: "collections"; referencedColumns: ["user_id", "id"] },
                { foreignKeyName: "collection_cover_items_user_id_entry_id_fkey"; columns: ["user_id", "entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["user_id", "id"] },
              ]
            },
            "entry_pins": {
              Row: { user_id: string; entry_id: string; pinned_at: string }
              Insert: { user_id?: string; entry_id: string; pinned_at?: string }
              Update: { user_id?: string; entry_id?: string; pinned_at?: string }
              Relationships: [
                { foreignKeyName: "entry_pins_user_id_entry_id_fkey"; columns: ["user_id", "entry_id"]; isOneToOne: false; referencedRelation: "entries"; referencedColumns: ["user_id", "id"] },
              ]
            },
            "categories": {
                  Row: {
                    "collection_id": string,"created_at": string,"id": string,"kind": string | null,"name": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "collection_id": string,"created_at"?: string,"id"?: string,"kind"?: string | null,"name": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "collection_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string | null,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"entries": {
                  Row: {
                    "cover_shape": "square" | "portrait","frame": string | null,"collection_id": string,"banner_url": string | null,"cover_url": string | null,"created_at": string,"id": string,"kind": string,"metadata": NonNullable<Json>,"platform": string | null,"progress_label": string | null,"slug": string,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "cover_shape"?: "square" | "portrait","frame"?: string | null,"collection_id": string,"banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"progress_label"?: string | null,"slug"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "cover_shape"?: "square" | "portrait","frame"?: string | null,"collection_id"?: string,"banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"progress_label"?: string | null,"slug"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_categories": {
                  Row: {
                    "collection_id": string,"category_id": string,"created_at": string,"entry_id": string,"kind": string | null,"user_id": string
                  }
                  Insert: {
                    "collection_id"?: string,"category_id": string,"created_at"?: string,"entry_id": string,"kind"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "collection_id"?: string,"category_id"?: string,"created_at"?: string,"entry_id"?: string,"kind"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_categories_user_id_category_id_fkey"
      columns: ["user_id","category_id","collection_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["user_id","id","collection_id"]
    },{
      foreignKeyName: "entry_categories_user_id_entry_id_fkey"
      columns: ["user_id","entry_id","collection_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id","collection_id"]
    },{
      foreignKeyName: "entry_categories_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_workspace_summary"
      referencedColumns: ["user_id","entry_id"]
    },{
      foreignKeyName: "entry_categories_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "preferred_cover_shape": "square" | "portrait","pin_style": "current" | "clean","intro_seen_on": string | null,"settings": NonNullable<Json>,"created_at": string,"display_name": string | null,"avatar_url": string | null,"motto": string | null,"avatar_decoration": string | null,"profile_badge": string | null,"profile_title": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "preferred_cover_shape"?: "square" | "portrait","pin_style"?: "current" | "clean","intro_seen_on"?: string | null,"settings"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string | null,"avatar_url"?: string | null,"motto"?: string | null,"avatar_decoration"?: string | null,"profile_badge"?: string | null,"profile_title"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "preferred_cover_shape"?: "square" | "portrait","pin_style"?: "current" | "clean","intro_seen_on"?: string | null,"settings"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string | null,"avatar_url"?: string | null,"motto"?: string | null,"avatar_decoration"?: string | null,"profile_badge"?: string | null,"profile_title"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workspace_checklist_items": {
                  Row: {
                    "checked": boolean,"created_at": string,"due_date": string | null,"file_id": string,"id": string,"label": string,"notes": string,"position": number,"starred": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "checked"?: boolean,"created_at"?: string,"due_date"?: string | null,"file_id": string,"id"?: string,"label": string,"notes"?: string,"position"?: number,"starred"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checked"?: boolean,"created_at"?: string,"due_date"?: string | null,"file_id"?: string,"id"?: string,"label"?: string,"notes"?: string,"position"?: number,"starred"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_checklist_items_user_id_file_id_fkey"
      columns: ["user_id","file_id"]
isOneToOne: false
      referencedRelation: "workspace_nodes"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "workspace_checklist_items_user_id_file_id_fkey"
      columns: ["user_id","file_id"]
isOneToOne: false
      referencedRelation: "workspace_tree"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "workspace_checklist_items_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_checklist_steps": {
                  Row: {
                    "checked": boolean,"created_at": string,"id": string,"item_id": string,"label": string,"position": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "checked"?: boolean,"created_at"?: string,"id"?: string,"item_id": string,"label": string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checked"?: boolean,"created_at"?: string,"id"?: string,"item_id"?: string,"label"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_checklist_steps_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_checklist_steps_user_id_item_id_fkey"
      columns: ["user_id","item_id"]
isOneToOne: false
      referencedRelation: "workspace_checklist_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"workspace_nodes": {
                  Row: {
                    "content": string,"created_at": string,"entry_id": string,"id": string,"include_in_cover_progress": boolean,"kind": string,"markdown_tasks_checked": number,"markdown_tasks_total": number,"name": string,"parent_id": string | null,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "content"?: string,"created_at"?: string,"entry_id": string,"id"?: string,"include_in_cover_progress"?: boolean,"kind": string,"markdown_tasks_checked"?: number,"markdown_tasks_total"?: number,"name": string,"parent_id"?: string | null,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"entry_id"?: string,"id"?: string,"include_in_cover_progress"?: boolean,"kind"?: string,"markdown_tasks_checked"?: number,"markdown_tasks_total"?: number,"name"?: string,"parent_id"?: string | null,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_nodes_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_workspace_summary"
      referencedColumns: ["user_id","entry_id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_parent_id_fkey"
      columns: ["user_id","entry_id","parent_id"]
isOneToOne: false
      referencedRelation: "workspace_nodes"
      referencedColumns: ["user_id","entry_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_parent_id_fkey"
      columns: ["user_id","entry_id","parent_id"]
isOneToOne: false
      referencedRelation: "workspace_tree"
      referencedColumns: ["user_id","entry_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "entry_workspace_summary": {
                  Row: {
                    "checklist_checked": number | null,"checklist_total": number | null,"entry_id": string | null,"files_total": number | null,"last_activity_at": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_tree": {
                  Row: {
                    "entry_id": string | null,"id": string | null,"include_in_cover_progress": boolean | null,"items_checked": number | null,"items_total": number | null,"kind": string | null,"name": string | null,"parent_id": string | null,"updated_at": string | null,"user_id": string | null,"version": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_nodes_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_workspace_summary"
      referencedColumns: ["user_id","entry_id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_parent_id_fkey"
      columns: ["user_id","entry_id","parent_id"]
isOneToOne: false
      referencedRelation: "workspace_nodes"
      referencedColumns: ["user_id","entry_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_entry_id_parent_id_fkey"
      columns: ["user_id","entry_id","parent_id"]
isOneToOne: false
      referencedRelation: "workspace_tree"
      referencedColumns: ["user_id","entry_id","id"]
    },{
      foreignKeyName: "workspace_nodes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_checklist_items":
{ Args: { "p_file_id": string,"p_labels": (string)[] }; Returns: {
              "checked": boolean,
"created_at": string,
"due_date": string | null,
"file_id": string,
"id": string,
"label": string,
"notes": string,
"position": number,
"starred": boolean,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workspace_checklist_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"add_checklist_tasks":
{ Args: { "p_file_id": string,"p_labels": (string)[],"p_checked": (boolean)[] }; Returns: {
              "checked": boolean,
"created_at": string,
"due_date": string | null,
"file_id": string,
"id": string,
"label": string,
"notes": string,
"position": number,
"starred": boolean,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workspace_checklist_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"delete_collection":
{ Args: { "p_collection_id": string,"p_expected_entries": number }; Returns: number
                           },
"apply_workspace_template":
{ Args: { "p_entry_id": string,"p_template_id": string }; Returns: number
                           },
"record_entry_visit":
{ Args: { "p_entry_id": string,"p_file_id"?: string | null }; Returns: undefined
                           },
"record_arcade_score":
{ Args: { "p_game": string,"p_variant": string,"p_score": number }; Returns: { best: number; improved: boolean; had_previous: boolean }[]
                           },
"record_achievement_event":
{ Args: { "p_event": string,"p_payload"?: Json }; Returns: Json
                           },
"start_arcade_run":
{ Args: { "p_game": string }; Returns: string
                           },
"finish_arcade_run":
{ Args: { "p_run": string,"p_score": number,"p_metrics"?: Json }; Returns: Json
                           },
"claim_sudoku_reward":
{ Args: { "p_game": string }; Returns: Json
                           },
"sudoku_hint":
{ Args: { "p_game": string,"p_cell": number }; Returns: number
                           },
"purchase_cosmetic":
{ Args: { "p_item": string,"p_expected_price": number }; Returns: Json
                           },
"redeem_secret_code":
{ Args: { "p_code_hash": string }; Returns: Json
                           },
"admin_create_secret_code":
{ Args: { "p_code_hash": string,"p_label": string,"p_coins"?: number,"p_items"?: string[],"p_expires_at"?: string | null,"p_max_redemptions"?: number | null }; Returns: string
                           },
"admin_disable_secret_code":
{ Args: { "p_id": string }; Returns: boolean
                           },
"spin_slots":
{ Args: { "p_spin": string,"p_bet": number }; Returns: Json
                           },
"slot_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"set_game_cosmetic":
{ Args: { "p_game": string,"p_category": string,"p_item": string | null }; Returns: Json
                           },
"claim_achievement_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reconcile_achievements":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"reorder_collections":
{ Args: { "p_collection_ids": (string)[] }; Returns: undefined
                           },
"task_changes":
{ Args: { "p_since"?: string | null }; Returns: Json
                           },
"add_tasks":
{ Args: { "p_list_id": string,"p_titles": (string)[],"p_completed": (boolean)[],"p_important"?: boolean,"p_due_date"?: string | null,"p_my_day"?: string | null }; Returns: Database["public"]["Tables"]["tasks"]["Row"][]
                           },
"reorder_tasks":
{ Args: { "p_task_ids": (string)[] }; Returns: undefined
                           },
"set_task_layout":
{ Args: { "p_layout": Json }; Returns: undefined
                           },
"add_task_batch":
{ Args: { "p_batch_id": string; "p_target_id": string; "p_kind": "todo" | "checklist"; "p_tasks": Json; "p_important"?: boolean; "p_due_date"?: string | null; "p_my_day"?: string | null }; Returns: Json
                           },
"delete_task_group":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"delete_task_list":
{ Args: { "p_list_id": string,"p_expected_tasks": number }; Returns: undefined
                           },
"add_task_step":
{ Args: { "p_task_id": string,"p_title": string }; Returns: Database["public"]["Tables"]["task_steps"]["Row"]
                           },
"reorder_task_steps":
{ Args: { "p_task_id": string,"p_step_ids": (string)[] }; Returns: undefined
                           },
"set_home_fan":
{ Args: { "p_items": Json }; Returns: undefined
                           },
"set_collection_covers":
{ Args: { "p_collection": string,"p_items": Json }; Returns: undefined
                           },
"reserve_attachment":
{ Args: { "p_name": string,"p_content_type": string,"p_size": number,"p_origin": "supabase" | "r2" }; Returns: boolean
                           },
"confirm_attachment":
{ Args: { "p_name": string,"p_size": number,"p_md5": string }; Returns: boolean
                           },
"attachment_inventory":
{ Args: Record<PropertyKey, never>; Returns: { object_name: string; size_bytes: number | null; content_type: string | null; etag: string | null; uploaded_at: string; origin: "supabase" | "r2" | null; r2_state: "pending" | "verified" | null; manifest_size: number | null; manifest_md5: string | null }[]
                           },
"update_user_settings":
{ Args: { "patch": Json }; Returns: Json
                           },
"add_checklist_step":
{ Args: { "p_item_id": string,"p_label": string }; Returns: {
              "checked": boolean,
"created_at": string,
"id": string,
"item_id": string,
"label": string,
"position": number,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "workspace_checklist_steps"
        isOneToOne: true
        isSetofReturn: false
      } },
"ensure_profile":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"reorder_checklist_items":
{ Args: { "p_file_id": string,"p_item_ids": (string)[] }; Returns: undefined
                           },
"reorder_checklist_steps":
{ Args: { "p_item_id": string,"p_step_ids": (string)[] }; Returns: undefined
                           },
"set_checklist_checked":
{ Args: { "p_checked": boolean,"p_file_id": string }; Returns: number
                           },
"set_entry_categories":
{ Args: { "p_category_ids": (string)[],"p_entry_id": string }; Returns: string[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const



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
            "arc_items": {
                  Row: {
                    "arc_id": string,"media_item_id": string,"user_id": string
                  }
                  Insert: {
                    "arc_id": string,"media_item_id": string,"user_id"?: string
                  }
                  Update: {
                    "arc_id"?: string,"media_item_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "arc_items_user_id_arc_id_fkey"
      columns: ["user_id","arc_id"]
isOneToOne: false
      referencedRelation: "arcs"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "arc_items_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"arcs": {
                  Row: {
                    "created_at": string,"end_episode": number | null,"entry_id": string,"id": string,"position": number,"series_item_id": string | null,"source": string,"start_episode": number | null,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"end_episode"?: number | null,"entry_id": string,"id"?: string,"position"?: number,"series_item_id"?: string | null,"source"?: string,"start_episode"?: number | null,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_episode"?: number | null,"entry_id"?: string,"id"?: string,"position"?: number,"series_item_id"?: string | null,"source"?: string,"start_episode"?: number | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "arcs_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "arcs_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_progress_summary"
      referencedColumns: ["user_id","entry_id"]
    },{
      foreignKeyName: "arcs_user_id_series_item_id_fkey"
      columns: ["user_id","series_item_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"catalog_anime": {
                  Row: {
                    "aired_from": string | null,"airing_status": string | null,"data": NonNullable<Json>,"episodes": number | null,"fetched_at": string,"image_url": string | null,"mal_id": number,"media_type": string | null,"score": number | null,"synopsis": string | null,"title": string,"title_english": string | null,"year": number | null
                  }
                  Insert: {
                    "aired_from"?: string | null,"airing_status"?: string | null,"data"?: NonNullable<Json>,"episodes"?: number | null,"fetched_at"?: string,"image_url"?: string | null,"mal_id": number,"media_type"?: string | null,"score"?: number | null,"synopsis"?: string | null,"title": string,"title_english"?: string | null,"year"?: number | null
                  }
                  Update: {
                    "aired_from"?: string | null,"airing_status"?: string | null,"data"?: NonNullable<Json>,"episodes"?: number | null,"fetched_at"?: string,"image_url"?: string | null,"mal_id"?: number,"media_type"?: string | null,"score"?: number | null,"synopsis"?: string | null,"title"?: string,"title_english"?: string | null,"year"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"catalog_characters": {
                  Row: {
                    "anime_mal_id": number,"character_mal_id": number,"favorites": number | null,"fetched_at": string,"image_url": string | null,"name": string,"position": number,"role": string | null
                  }
                  Insert: {
                    "anime_mal_id": number,"character_mal_id": number,"favorites"?: number | null,"fetched_at"?: string,"image_url"?: string | null,"name": string,"position"?: number,"role"?: string | null
                  }
                  Update: {
                    "anime_mal_id"?: number,"character_mal_id"?: number,"favorites"?: number | null,"fetched_at"?: string,"image_url"?: string | null,"name"?: string,"position"?: number,"role"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"catalog_relations": {
                  Row: {
                    "fetched_at": string,"from_mal_id": number,"relation": string,"to_mal_id": number,"to_name": string | null,"to_type": string
                  }
                  Insert: {
                    "fetched_at"?: string,"from_mal_id": number,"relation": string,"to_mal_id": number,"to_name"?: string | null,"to_type"?: string
                  }
                  Update: {
                    "fetched_at"?: string,"from_mal_id"?: number,"relation"?: string,"to_mal_id"?: number,"to_name"?: string | null,"to_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"custom_games": {
                  Row: {
                    "created_at": string,"entry_id": string,"platform": string | null,"tabs": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"entry_id": string,"platform"?: string | null,"tabs"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"entry_id"?: string,"platform"?: string | null,"tabs"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_games_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "custom_games_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_progress_summary"
      referencedColumns: ["user_id","entry_id"]
    }
                  ]
                },"entries": {
                  Row: {
                    "banner_url": string | null,"cover_url": string | null,"created_at": string,"id": string,"kind": string,"metadata": NonNullable<Json>,"notes": string,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"metadata"?: NonNullable<Json>,"notes"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"notes"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
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
                },"entry_media_items": {
                  Row: {
                    "added_via": string,"created_at": string,"entry_id": string,"media_item_id": string,"position": number,"relation": string | null,"section": string,"tab_id": string | null,"user_id": string
                  }
                  Insert: {
                    "added_via"?: string,"created_at"?: string,"entry_id": string,"media_item_id": string,"position"?: number,"relation"?: string | null,"section"?: string,"tab_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "added_via"?: string,"created_at"?: string,"entry_id"?: string,"media_item_id"?: string,"position"?: number,"relation"?: string | null,"section"?: string,"tab_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_media_items_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "entry_media_items_user_id_entry_id_fkey"
      columns: ["user_id","entry_id"]
isOneToOne: false
      referencedRelation: "entry_progress_summary"
      referencedColumns: ["user_id","entry_id"]
    },{
      foreignKeyName: "entry_media_items_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "attempts": number,"checkpoint": NonNullable<Json>,"created_at": string,"dedupe_key": string,"finished_at": string | null,"id": string,"input": NonNullable<Json>,"kind": string,"last_error": string | null,"locked_by": string | null,"locked_until": string | null,"max_attempts": number,"progress": NonNullable<Json>,"result": NonNullable<Json>,"run_after": string,"status": string,"updated_at": string,"user_id": string,"warnings": NonNullable<Json>
                  }
                  Insert: {
                    "attempts"?: number,"checkpoint"?: NonNullable<Json>,"created_at"?: string,"dedupe_key": string,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"kind": string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"progress"?: NonNullable<Json>,"result"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "attempts"?: number,"checkpoint"?: NonNullable<Json>,"created_at"?: string,"dedupe_key"?: string,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"kind"?: string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"progress"?: NonNullable<Json>,"result"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"mal_accounts": {
                  Row: {
                    "created_at": string,"initial_sync": string,"last_error": string | null,"last_pull_at": string | null,"last_push_at": string | null,"mal_user_id": number | null,"mal_username": string | null,"outbound_enabled": boolean,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"initial_sync"?: string,"last_error"?: string | null,"last_pull_at"?: string | null,"last_push_at"?: string | null,"mal_user_id"?: number | null,"mal_username"?: string | null,"outbound_enabled"?: boolean,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"initial_sync"?: string,"last_error"?: string | null,"last_pull_at"?: string | null,"last_push_at"?: string | null,"mal_user_id"?: number | null,"mal_username"?: string | null,"outbound_enabled"?: boolean,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mal_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"mal_credentials": {
                  Row: {
                    "access_expires_at": string,"access_token_ciphertext": string,"created_at": string,"key_version": number,"refresh_expires_at": string | null,"refresh_token_ciphertext": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "access_expires_at": string,"access_token_ciphertext": string,"created_at"?: string,"key_version"?: number,"refresh_expires_at"?: string | null,"refresh_token_ciphertext": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "access_expires_at"?: string,"access_token_ciphertext"?: string,"created_at"?: string,"key_version"?: number,"refresh_expires_at"?: string | null,"refresh_token_ciphertext"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mal_credentials_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"mal_list_entries": {
                  Row: {
                    "image_url": string | null,"mal_id": number,"media_type": string | null,"num_episodes": number | null,"num_episodes_watched": number,"pulled_at": string,"remote_updated_at": string | null,"score": number | null,"status": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "image_url"?: string | null,"mal_id": number,"media_type"?: string | null,"num_episodes"?: number | null,"num_episodes_watched"?: number,"pulled_at"?: string,"remote_updated_at"?: string | null,"score"?: number | null,"status"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "image_url"?: string | null,"mal_id"?: number,"media_type"?: string | null,"num_episodes"?: number | null,"num_episodes_watched"?: number,"pulled_at"?: string,"remote_updated_at"?: string | null,"score"?: number | null,"status"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mal_list_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"media_items": {
                  Row: {
                    "created_at": string,"episode_number": number | null,"id": string,"kind": string,"mal_id": number | null,"metadata": NonNullable<Json>,"parent_id": string | null,"position": number,"source_key": string,"title": string,"total_episodes": number | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"episode_number"?: number | null,"id"?: string,"kind": string,"mal_id"?: number | null,"metadata"?: NonNullable<Json>,"parent_id"?: string | null,"position"?: number,"source_key": string,"title": string,"total_episodes"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"episode_number"?: number | null,"id"?: string,"kind"?: string,"mal_id"?: number | null,"metadata"?: NonNullable<Json>,"parent_id"?: string | null,"position"?: number,"source_key"?: string,"title"?: string,"total_episodes"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_items_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_items_user_id_parent_id_fkey"
      columns: ["user_id","parent_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"oauth_states": {
                  Row: {
                    "code_verifier_ciphertext": string,"consumed_at": string | null,"created_at": string,"expires_at": string,"provider": string,"redirect_path": string,"state_hash": string,"user_id": string
                  }
                  Insert: {
                    "code_verifier_ciphertext": string,"consumed_at"?: string | null,"created_at"?: string,"expires_at": string,"provider"?: string,"redirect_path"?: string,"state_hash": string,"user_id": string
                  }
                  Update: {
                    "code_verifier_ciphertext"?: string,"consumed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"provider"?: string,"redirect_path"?: string,"state_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "oauth_states_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_cache": {
                  Row: {
                    "endpoint": string,"expires_at": string,"fetched_at": string,"page": number,"payload": Json | null,"provider": string,"resource_id": string,"status": number
                  }
                  Insert: {
                    "endpoint": string,"expires_at": string,"fetched_at"?: string,"page"?: number,"payload"?: Json | null,"provider": string,"resource_id": string,"status": number
                  }
                  Update: {
                    "endpoint"?: string,"expires_at"?: string,"fetched_at"?: string,"page"?: number,"payload"?: Json | null,"provider"?: string,"resource_id"?: string,"status"?: number
                  }
                  Relationships: [
                    
                  ]
                },"provider_throttle": {
                  Row: {
                    "blocked_until": string | null,"next_slot_at": string,"provider": string
                  }
                  Insert: {
                    "blocked_until"?: string | null,"next_slot_at"?: string,"provider": string
                  }
                  Update: {
                    "blocked_until"?: string | null,"next_slot_at"?: string,"provider"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sync_baselines": {
                  Row: {
                    "episodes_watched": number | null,"mal_id": number,"media_item_id": string,"remote_updated_at": string | null,"score": number | null,"status": string | null,"synced_at": string,"user_id": string
                  }
                  Insert: {
                    "episodes_watched"?: number | null,"mal_id": number,"media_item_id": string,"remote_updated_at"?: string | null,"score"?: number | null,"status"?: string | null,"synced_at"?: string,"user_id": string
                  }
                  Update: {
                    "episodes_watched"?: number | null,"mal_id"?: number,"media_item_id"?: string,"remote_updated_at"?: string | null,"score"?: number | null,"status"?: string | null,"synced_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_baselines_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: true
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"sync_conflicts": {
                  Row: {
                    "baseline": Json | null,"created_at": string,"id": string,"local": NonNullable<Json>,"mal_id": number,"media_item_id": string,"remote": NonNullable<Json>,"resolved_at": string | null,"state": string,"user_id": string
                  }
                  Insert: {
                    "baseline"?: Json | null,"created_at"?: string,"id"?: string,"local": NonNullable<Json>,"mal_id": number,"media_item_id": string,"remote": NonNullable<Json>,"resolved_at"?: string | null,"state"?: string,"user_id": string
                  }
                  Update: {
                    "baseline"?: Json | null,"created_at"?: string,"id"?: string,"local"?: NonNullable<Json>,"mal_id"?: number,"media_item_id"?: string,"remote"?: NonNullable<Json>,"resolved_at"?: string | null,"state"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_conflicts_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"sync_outbox": {
                  Row: {
                    "attempts": number,"completed_at": string | null,"created_at": string,"desired": NonNullable<Json>,"id": string,"last_error": string | null,"locked_by": string | null,"locked_until": string | null,"mal_id": number,"media_item_id": string,"not_before": string,"state": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"desired": NonNullable<Json>,"id"?: string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"mal_id": number,"media_item_id": string,"not_before"?: string,"state"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"desired"?: NonNullable<Json>,"id"?: string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"mal_id"?: number,"media_item_id"?: string,"not_before"?: string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_outbox_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: false
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"user_progress": {
                  Row: {
                    "episodes_mapped": boolean,"episodes_watched": number,"is_checked": boolean,"media_item_id": string,"notes": string,"score": number | null,"status": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "episodes_mapped"?: boolean,"episodes_watched"?: number,"is_checked"?: boolean,"media_item_id": string,"notes"?: string,"score"?: number | null,"status"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "episodes_mapped"?: boolean,"episodes_watched"?: number,"is_checked"?: boolean,"media_item_id"?: string,"notes"?: string,"score"?: number | null,"status"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_progress_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: true
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "continue_watching": {
                  Row: {
                    "entry_cover_url": string | null,"entry_id": string | null,"entry_title": string | null,"episodes_watched": number | null,"image_url": string | null,"kind": string | null,"media_item_id": string | null,"status": string | null,"title": string | null,"total_episodes": number | null,"updated_at": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_progress_user_id_media_item_id_fkey"
      columns: ["user_id","media_item_id"]
isOneToOne: true
      referencedRelation: "media_items"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"entry_progress_summary": {
                  Row: {
                    "any_watching": boolean | null,"checklist_checked": number | null,"checklist_total": number | null,"entry_id": string | null,"episodes_known_total": number | null,"episodes_watched": number | null,"has_unknown_total": boolean | null,"last_activity_at": string | null,"user_id": string | null,"works_completed": number | null,"works_total": number | null
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
                }
          }
          Functions: {
            "add_checklist_item":
{ Args: { "p_entry_id": string,"p_tab_id": string,"p_title": string }; Returns: {
              "created_at": string,
"episode_number": number | null,
"id": string,
"kind": string,
"mal_id": number | null,
"metadata": NonNullable<Json>,
"parent_id": string | null,
"position": number,
"source_key": string,
"title": string,
"total_episodes": number | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "media_items"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_mal_remote":
{ Args: { "p_media_item_id": string,"p_remote_updated_at"?: string,"p_score": number,"p_status": string,"p_user": string,"p_watched": number }; Returns: undefined
                           },
"approve_initial_sync":
{ Args: { "p_apply_remote": (number)[],"p_enable_outbound": boolean }; Returns: Json
                           },
"block_provider":
{ Args: { "p_provider": string,"p_retry_after_ms": number }; Returns: undefined
                           },
"claim_jobs":
{ Args: { "p_lease_seconds": number,"p_limit": number,"p_worker": string }; Returns: {
              "attempts": number,
"checkpoint": NonNullable<Json>,
"created_at": string,
"dedupe_key": string,
"finished_at": string | null,
"id": string,
"input": NonNullable<Json>,
"kind": string,
"last_error": string | null,
"locked_by": string | null,
"locked_until": string | null,
"max_attempts": number,
"progress": NonNullable<Json>,
"result": NonNullable<Json>,
"run_after": string,
"status": string,
"updated_at": string,
"user_id": string,
"warnings": NonNullable<Json>
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_outbox":
{ Args: { "p_lease_seconds": number,"p_limit": number,"p_worker": string }; Returns: {
              "attempts": number,
"completed_at": string | null,
"created_at": string,
"desired": NonNullable<Json>,
"id": string,
"last_error": string | null,
"locked_by": string | null,
"locked_until": string | null,
"mal_id": number,
"media_item_id": string,
"not_before": string,
"state": string,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "sync_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_arc":
{ Args: { "p_end": number,"p_entry_id": string,"p_series_item_id": string,"p_start": number,"p_title": string }; Returns: {
              "created_at": string,
"end_episode": number | null,
"entry_id": string,
"id": string,
"position": number,
"series_item_id": string | null,
"source": string,
"start_episode": number | null,
"title": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "arcs"
        isOneToOne: true
        isSetofReturn: false
      } },
"derive_watch_status":
{ Args: { "p_current": string,"p_total": number,"p_watched": number }; Returns: string
                           },
"enqueue_scheduled_mal_pulls":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"ensure_profile":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"entry_episode_rows":
{ Args: { "p_entry_id": string }; Returns: {
              "created_at": string,
"episode_number": number | null,
"id": string,
"kind": string,
"mal_id": number | null,
"metadata": NonNullable<Json>,
"parent_id": string | null,
"position": number,
"source_key": string,
"title": string,
"total_episodes": number | null,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "media_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"entry_progress_rows":
{ Args: { "p_entry_id": string }; Returns: {
              "episodes_mapped": boolean,
"episodes_watched": number,
"is_checked": boolean,
"media_item_id": string,
"notes": string,
"score": number | null,
"status": string,
"updated_at": string,
"user_id": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_progress"
        isOneToOne: false
        isSetofReturn: true
      } },
"import_apply_episodes":
{ Args: { "p_episodes": Json,"p_job_id": string,"p_parent_mal_id": number }; Returns: number
                           },
"import_apply_node":
{ Args: { "p_entry_id": string,"p_job_id": string,"p_node": Json }; Returns: string
                           },
"import_begin":
{ Args: { "p_job_id": string,"p_root": Json }; Returns: string
                           },
"import_finish":
{ Args: { "p_entry_id": string,"p_job_id": string,"p_summary": Json }; Returns: undefined
                           },
"invoke_worker":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"is_valid_custom_tabs":
{ Args: { "p_tabs": Json }; Returns: boolean
                           },
"lock_progress_items":
{ Args: { "p_item_ids": (string)[] }; Returns: undefined
                           },
"map_watched_count_to_episodes":
{ Args: { "p_item_id": string }; Returns: {
              "episodes_mapped": boolean,
"episodes_watched": number,
"is_checked": boolean,
"media_item_id": string,
"notes": string,
"score": number | null,
"status": string,
"updated_at": string,
"user_id": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_progress"
        isOneToOne: false
        isSetofReturn: true
      } },
"purge_expired_server_state":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"recompute_container_progress":
{ Args: { "p_item_ids": (string)[] }; Returns: undefined
                           },
"record_sync_conflict":
{ Args: { "p_baseline": Json,"p_local": Json,"p_mal_id": number,"p_media_item_id": string,"p_remote": Json,"p_user": string }; Returns: undefined
                           },
"release_stale_outbox":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reorder_entry_items":
{ Args: { "p_entry_id": string,"p_item_ids": (string)[] }; Returns: undefined
                           },
"reserve_provider_slot":
{ Args: { "p_interval_ms": number,"p_provider": string }; Returns: number
                           },
"resolve_sync_conflict":
{ Args: { "p_choice": string,"p_conflict_id": string }; Returns: undefined
                           },
"save_custom_tabs":
{ Args: { "p_entry_id": string,"p_tabs": Json }; Returns: {
              "created_at": string,
"entry_id": string,
"platform": string | null,
"tabs": NonNullable<Json>,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "custom_games"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_arc_checked":
{ Args: { "p_arc_id": string,"p_checked": boolean }; Returns: {
              "episodes_mapped": boolean,
"episodes_watched": number,
"is_checked": boolean,
"media_item_id": string,
"notes": string,
"score": number | null,
"status": string,
"updated_at": string,
"user_id": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_progress"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_container_progress":
{ Args: { "p_clear_score"?: boolean,"p_episodes_watched"?: number,"p_item_id": string,"p_score"?: number,"p_status"?: string }; Returns: {
              "episodes_mapped": boolean,
"episodes_watched": number,
"is_checked": boolean,
"media_item_id": string,
"notes": string,
"score": number | null,
"status": string,
"updated_at": string,
"user_id": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_progress"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_items_checked":
{ Args: { "p_checked": boolean,"p_item_ids": (string)[] }; Returns: {
              "episodes_mapped": boolean,
"episodes_watched": number,
"is_checked": boolean,
"media_item_id": string,
"notes": string,
"score": number | null,
"status": string,
"updated_at": string,
"user_id": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_progress"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_worker_schedule_active":
{ Args: { "p_active": boolean }; Returns: undefined
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


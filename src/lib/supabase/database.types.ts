
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
            "collections": {
              Row: { id: string; user_id: string; name: string; slug: string; description: string; legacy_slug: string | null; position: number; icon: string | null; accent_color: string | null; banner_url: string | null; progress_label: string | null; default_template_id: string | null; created_at: string; updated_at: string }
              Insert: { id?: string; user_id?: string; name: string; slug?: string; description?: string; legacy_slug?: string | null; position?: number; icon?: string | null; accent_color?: string | null; banner_url?: string | null; progress_label?: string | null; default_template_id?: string | null; created_at?: string; updated_at?: string }
              Update: { id?: string; user_id?: string; name?: string; slug?: string; description?: string; legacy_slug?: string | null; position?: number; icon?: string | null; accent_color?: string | null; banner_url?: string | null; progress_label?: string | null; default_template_id?: string | null; created_at?: string; updated_at?: string }
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
            "sudoku_games": {
              Row: { user_id: string; id: string; difficulty: "easy" | "medium" | "hard"; puzzle: string; solution: string; entries: string; notes: number[]; elapsed_ms: number; completed_at: string | null; started_at: string; updated_at: string }
              Insert: { user_id?: string; id?: string; difficulty: "easy" | "medium" | "hard"; puzzle: string; solution: string; entries?: string; notes?: number[]; elapsed_ms?: number; completed_at?: string | null; started_at?: string; updated_at?: string }
              Update: { user_id?: string; id?: string; difficulty?: "easy" | "medium" | "hard"; puzzle?: string; solution?: string; entries?: string; notes?: number[]; elapsed_ms?: number; completed_at?: string | null; started_at?: string; updated_at?: string }
              Relationships: [{ foreignKeyName: "sudoku_games_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }]
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
                    "cover_shape": "square" | "portrait","collection_id": string,"banner_url": string | null,"cover_url": string | null,"created_at": string,"id": string,"kind": string,"metadata": NonNullable<Json>,"platform": string | null,"progress_label": string | null,"slug": string,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "cover_shape"?: "square" | "portrait","collection_id": string,"banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"progress_label"?: string | null,"slug"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "cover_shape"?: "square" | "portrait","collection_id"?: string,"banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"progress_label"?: string | null,"slug"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
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
                    "preferred_cover_shape": "square" | "portrait","pin_style": "current" | "clean","intro_seen_on": string | null,"settings": NonNullable<Json>,"created_at": string,"display_name": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "preferred_cover_shape"?: "square" | "portrait","pin_style"?: "current" | "clean","intro_seen_on"?: string | null,"settings"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "preferred_cover_shape"?: "square" | "portrait","pin_style"?: "current" | "clean","intro_seen_on"?: string | null,"settings"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string
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
"claim_achievement_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"reorder_collections":
{ Args: { "p_collection_ids": (string)[] }; Returns: undefined
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


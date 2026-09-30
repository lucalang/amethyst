
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
            "entries": {
                  Row: {
                    "banner_url": string | null,"cover_url": string | null,"created_at": string,"id": string,"kind": string,"metadata": NonNullable<Json>,"platform": string | null,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "banner_url"?: string | null,"cover_url"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"platform"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
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
                },"workspace_checklist_items": {
                  Row: {
                    "checked": boolean,"created_at": string,"file_id": string,"id": string,"label": string,"position": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "checked"?: boolean,"created_at"?: string,"file_id": string,"id"?: string,"label": string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checked"?: boolean,"created_at"?: string,"file_id"?: string,"id"?: string,"label"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
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
                },"workspace_nodes": {
                  Row: {
                    "content": string,"created_at": string,"entry_id": string,"id": string,"kind": string,"name": string,"parent_id": string | null,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "content"?: string,"created_at"?: string,"entry_id": string,"id"?: string,"kind": string,"name": string,"parent_id"?: string | null,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"entry_id"?: string,"id"?: string,"kind"?: string,"name"?: string,"parent_id"?: string | null,"updated_at"?: string,"user_id"?: string,"version"?: number
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
                    "entry_id": string | null,"id": string | null,"items_checked": number | null,"items_total": number | null,"kind": string | null,"name": string | null,"parent_id": string | null,"updated_at": string | null,"user_id": string | null,"version": number | null
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
"file_id": string,
"id": string,
"label": string,
"position": number,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workspace_checklist_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"ensure_profile":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"reorder_checklist_items":
{ Args: { "p_file_id": string,"p_item_ids": (string)[] }; Returns: undefined
                           },
"set_checklist_checked":
{ Args: { "p_checked": boolean,"p_file_id": string }; Returns: number
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


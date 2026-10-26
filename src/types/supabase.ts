export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          linked_id: string | null
          linked_type: string | null
          notes: string | null
          occurred_at: string
          outcome: string | null
          owner_id: string
          production_id: string | null
          scheduled_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
          owner_id: string
          production_id?: string | null
          scheduled_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
          owner_id?: string
          production_id?: string | null
          scheduled_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      budget_targets: {
        Row: {
          budget_amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          id: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          budget_amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          budget_amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      business_calendar: {
        Row: {
          day: string
          name: string
          region: string
        }
        Insert: {
          day: string
          name: string
          region?: string
        }
        Update: {
          day?: string
          name?: string
          region?: string
        }
        Relationships: []
      }
      career_level_history: {
        Row: {
          approved_by: string | null
          created_at: string
          effective_from: string
          employee_id: string
          evidence: Json | null
          id: string
          level_code: string
          reason: string | null
          source: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          effective_from: string
          employee_id: string
          evidence?: Json | null
          id?: string
          level_code: string
          reason?: string | null
          source: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          effective_from?: string
          employee_id?: string
          evidence?: Json | null
          id?: string
          level_code?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_level_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_level_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      career_levels: {
        Row: {
          code: string
          id: string
          kv_min_ratio: number
          max_subsidy: number | null
          name_de: string
          point_rate: number
          rank: number
          rule_version_id: string
          structure_cap_ratio: number | null
          threshold_points: number
        }
        Insert: {
          code: string
          id?: string
          kv_min_ratio?: number
          max_subsidy?: number | null
          name_de: string
          point_rate: number
          rank: number
          rule_version_id: string
          structure_cap_ratio?: number | null
          threshold_points: number
        }
        Update: {
          code?: string
          id?: string
          kv_min_ratio?: number
          max_subsidy?: number | null
          name_de?: string
          point_rate?: number
          rank?: number
          rule_version_id?: string
          structure_cap_ratio?: number | null
          threshold_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "career_levels_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      career_periods: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          period_type: string
          start_date: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          period_type: string
          start_date: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          period_type?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_periods_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_periods_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      coaching_actions: {
        Row: {
          created_at: string
          created_by: string | null
          done_at: string | null
          due_on: string | null
          employee_id: string
          id: string
          owner_id: string
          session_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_on?: string | null
          employee_id: string
          id?: string
          owner_id: string
          session_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_on?: string | null
          employee_id?: string
          id?: string
          owner_id?: string
          session_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "coaching_actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "coaching_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          employee_id: string
          id: string
          visibility: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          employee_id: string
          id?: string
          visibility: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          employee_id?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "coaching_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          created_at: string
          employee_id: string
          held_on: string
          id: string
          leader_id: string
          next_review_on: string | null
          participants: string | null
          summary: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          held_on: string
          id?: string
          leader_id: string
          next_review_on?: string | null
          participants?: string | null
          summary: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          held_on?: string
          id?: string
          leader_id?: string
          next_review_on?: string | null
          participants?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "coaching_sessions_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      commission_ledger: {
        Row: {
          calculation_id: string
          commission_type: string
          created_at: string
          depth: number
          entry_kind: string
          gross_amount: number
          id: string
          net_after_reserve: number
          points: number
          producer_id: string
          producer_level: string
          production_id: string
          rate_per_point: number
          recipient_id: string
          recipient_level: string
          relationship: string
          reserve_amount: number
          reverses_entry_id: string | null
          rule_version_id: string
          seq: number
          statement_period_id: string
        }
        Insert: {
          calculation_id: string
          commission_type: string
          created_at?: string
          depth: number
          entry_kind: string
          gross_amount: number
          id?: string
          net_after_reserve: number
          points: number
          producer_id: string
          producer_level: string
          production_id: string
          rate_per_point: number
          recipient_id: string
          recipient_level: string
          relationship: string
          reserve_amount: number
          reverses_entry_id?: string | null
          rule_version_id: string
          seq?: never
          statement_period_id: string
        }
        Update: {
          calculation_id?: string
          commission_type?: string
          created_at?: string
          depth?: number
          entry_kind?: string
          gross_amount?: number
          id?: string
          net_after_reserve?: number
          points?: number
          producer_id?: string
          producer_level?: string
          production_id?: string
          rate_per_point?: number
          recipient_id?: string
          recipient_level?: string
          relationship?: string
          reserve_amount?: number
          reverses_entry_id?: string | null
          rule_version_id?: string
          seq?: never
          statement_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "point_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_ledger_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "v_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_statement_period_id_fkey"
            columns: ["statement_period_id"]
            isOneToOne: false
            referencedRelation: "statement_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_links: {
        Row: {
          archived_at: string | null
          category_code: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          date_source: string | null
          dates_confirmed_by: string | null
          deep_link: string | null
          end_date: string | null
          external_contract_id: string
          id: string
          insurer: string | null
          last_synced_at: string | null
          product_name: string | null
          production_id: string | null
          renewal_date: string | null
          source_system: string
          start_date: string | null
          status: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          date_source?: string | null
          dates_confirmed_by?: string | null
          deep_link?: string | null
          end_date?: string | null
          external_contract_id: string
          id?: string
          insurer?: string | null
          last_synced_at?: string | null
          product_name?: string | null
          production_id?: string | null
          renewal_date?: string | null
          source_system: string
          start_date?: string | null
          status?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date_source?: string | null
          dates_confirmed_by?: string | null
          deep_link?: string | null
          end_date?: string | null
          external_contract_id?: string
          id?: string
          insurer?: string | null
          last_synced_at?: string | null
          product_name?: string | null
          production_id?: string | null
          renewal_date?: string | null
          source_system?: string
          start_date?: string | null
          status?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_links_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contract_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contract_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_dates_confirmed_by_fkey"
            columns: ["dates_confirmed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_dates_confirmed_by_fkey"
            columns: ["dates_confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "contract_links_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_rules: {
        Row: {
          category_code: string
          divisor: number | null
          formula_kind: string
          id: string
          max_term_years: number | null
          required_net_gross: string | null
          required_premium_period: string | null
          rule_version_id: string
        }
        Insert: {
          category_code: string
          divisor?: number | null
          formula_kind: string
          id?: string
          max_term_years?: number | null
          required_net_gross?: string | null
          required_premium_period?: string | null
          rule_version_id: string
        }
        Update: {
          category_code?: string
          divisor?: number | null
          formula_kind?: string
          id?: string
          max_term_years?: number | null
          required_net_gross?: string | null
          required_premium_period?: string | null
          rule_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_rules_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "conversion_rules_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          customer_id: string
          from_owner: string | null
          id: number
          reason: string | null
          to_owner: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          customer_id: string
          from_owner?: string | null
          id?: never
          reason?: string | null
          to_owner?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          customer_id?: string
          from_owner?: string | null
          id?: never
          reason?: string | null
          to_owner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_from_owner_fkey"
            columns: ["from_owner"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_from_owner_fkey"
            columns: ["from_owner"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_assignments_to_owner_fkey"
            columns: ["to_owner"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_to_owner_fkey"
            columns: ["to_owner"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          action: string
          customer_id: string
          effective_at: string
          evidence: string | null
          id: number
          legal_basis: string | null
          purpose: string
          recorded_at: string
          recorded_by: string | null
          source: string
        }
        Insert: {
          action: string
          customer_id: string
          effective_at?: string
          evidence?: string | null
          id?: never
          legal_basis?: string | null
          purpose: string
          recorded_at?: string
          recorded_by?: string | null
          source: string
        }
        Update: {
          action?: string
          customer_id?: string
          effective_at?: string
          evidence?: string | null
          id?: never
          legal_basis?: string | null
          purpose?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      customer_service_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          contract_link_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          due_on: string
          id: string
          kind: string
          note: string | null
          owner_id: string
          previous_id: string | null
          recurrence: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          contract_link_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_on: string
          id?: string
          kind: string
          note?: string | null
          owner_id: string
          previous_id?: string | null
          recurrence?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          contract_link_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_on?: string
          id?: string
          kind?: string
          note?: string | null
          owner_id?: string
          previous_id?: string | null
          recurrence?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_service_items_contract_link_id_fkey"
            columns: ["contract_link_id"]
            isOneToOne: false
            referencedRelation: "contract_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_service_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_service_items_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "customer_service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string | null
          customer_no: number
          date_of_birth: string | null
          email: string | null
          erased_at: string | null
          external_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_synced_at: string | null
          lead_id: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          postal_code: string | null
          preferred_channel: string
          preferred_name: string | null
          search_name: string | null
          source_system: string | null
          status: string
          street: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: never
          date_of_birth?: string | null
          email?: string | null
          erased_at?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          lead_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_id: string
          phone?: string | null
          postal_code?: string | null
          preferred_channel?: string
          preferred_name?: string | null
          search_name?: string | null
          source_system?: string | null
          status?: string
          street?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: never
          date_of_birth?: string | null
          email?: string | null
          erased_at?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          lead_id?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          postal_code?: string | null
          preferred_channel?: string
          preferred_name?: string | null
          search_name?: string | null
          source_system?: string | null
          status?: string
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      edge_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      employee_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          employee_id: string
          expires_at: string
          id: string
          invited_by: string | null
          linked_at: string | null
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          employee_id: string
          expires_at: string
          id?: string
          invited_by?: string | null
          linked_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          employee_id?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          linked_at?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          email: string
          employee_no: string
          employment_type: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          start_date: string
          status: string
          timezone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          email: string
          employee_no?: string
          employment_type?: string
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          start_date: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          email?: string
          employee_no?: string
          employment_type?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          start_date?: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      exception_queue: {
        Row: {
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          reason_code: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          reason_code: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          reason_code?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          expense_date: string
          file_name: string
          id: string
          image_url: string
          products: Json
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          expense_date: string
          file_name: string
          id?: string
          image_url: string
          products?: Json
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          expense_date?: string
          file_name?: string
          id?: string
          image_url?: string
          products?: Json
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      export_log: {
        Row: {
          actor_id: string | null
          at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          kind: string
          request_id: string | null
          row_count: number | null
        }
        Insert: {
          actor_id?: string | null
          at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          kind: string
          request_id?: string | null
          row_count?: number | null
        }
        Update: {
          actor_id?: string | null
          at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          kind?: string
          request_id?: string | null
          row_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "export_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "privacy_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_reviews: {
        Row: {
          comment: string | null
          created_at: string
          decision: string
          goal_id: string
          id: string
          reviewer_id: string
          version: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decision: string
          goal_id: string
          id?: string
          reviewer_id: string
          version: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          decision?: string
          goal_id?: string
          id?: string
          reviewer_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_reviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "monthly_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_reviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "v_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      hierarchy_assignments: {
        Row: {
          approved_by: string | null
          change_reason: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          manager_id: string | null
        }
        Insert: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          manager_id?: string | null
        }
        Update: {
          approved_by?: string | null
          change_reason?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          manager_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "hierarchy_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      import_batches: {
        Row: {
          committed_at: string | null
          committed_count: number
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          kind: string
          row_count: number
          source_system: string
          status: string
          valid_count: number
        }
        Insert: {
          committed_at?: string | null
          committed_count?: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          kind: string
          row_count?: number
          source_system: string
          status?: string
          valid_count?: number
        }
        Update: {
          committed_at?: string | null
          committed_count?: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          row_count?: number
          source_system?: string
          status?: string
          valid_count?: number
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          batch_id: string
          errors: string[]
          id: string
          production_id: string | null
          raw: Json
          row_number: number
        }
        Insert: {
          batch_id: string
          errors?: string[]
          id?: string
          production_id?: string | null
          raw: Json
          row_number: number
        }
        Update: {
          batch_id?: string
          errors?: string[]
          id?: string
          production_id?: string | null
          raw?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
        ]
      }
      income_goals: {
        Row: {
          created_at: string
          goal_amount: number
          id: string
          month: number | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          goal_amount: number
          id?: string
          month?: number | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          goal_amount?: number
          id?: string
          month?: number | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      lead_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          from_owner: string | null
          id: number
          lead_id: string
          reason: string | null
          to_owner: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id: string
          reason?: string | null
          to_owner?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          from_owner?: string | null
          id?: never
          lead_id?: string
          reason?: string | null
          to_owner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "lead_assignments_from_owner_fkey"
            columns: ["from_owner"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_from_owner_fkey"
            columns: ["from_owner"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "lead_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_to_owner_fkey"
            columns: ["to_owner"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_to_owner_fkey"
            columns: ["to_owner"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      lead_source_costs: {
        Row: {
          amount: number
          month: string
          note: string | null
          source_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          month: string
          note?: string | null
          source_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          month?: string
          note?: string | null
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_source_costs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_stage_history: {
        Row: {
          automatic: boolean
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: number
          lead_id: string
          note: string | null
          to_stage: string
        }
        Insert: {
          automatic?: boolean
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
          lead_id: string
          note?: string | null
          to_stage: string
        }
        Update: {
          automatic?: boolean
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: never
          lead_id?: string
          note?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "lead_stage_history_from_stage_fkey"
            columns: ["from_stage"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_to_stage_fkey"
            columns: ["to_stage"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["code"]
          },
        ]
      }
      lead_stages: {
        Row: {
          active: boolean
          allow_skip: boolean
          code: string
          kind: string
          name_de: string
          position: number
          required_fields: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_skip?: boolean
          code: string
          kind: string
          name_de: string
          position: number
          required_fields?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_skip?: boolean
          code?: string
          kind?: string
          name_de?: string
          position?: number
          required_fields?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          campaign: string | null
          closed_at: string | null
          company: string | null
          consent_basis: string | null
          consent_recorded_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          erased_at: string | null
          first_contact_at: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_no: number
          loss_reason: string | null
          merged_into: string | null
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          preferred_channel: string
          priority: string
          product_interest: string[]
          production_id: string | null
          received_at: string
          referral: string | null
          region: string | null
          search_name: string | null
          sla_due_at: string | null
          source_id: string
          stage: string
          stage_entered_at: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          campaign?: string | null
          closed_at?: string | null
          company?: string | null
          consent_basis?: string | null
          consent_recorded_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          erased_at?: string | null
          first_contact_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_no?: never
          loss_reason?: string | null
          merged_into?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          preferred_channel?: string
          priority?: string
          product_interest?: string[]
          production_id?: string | null
          received_at?: string
          referral?: string | null
          region?: string | null
          search_name?: string | null
          sla_due_at?: string | null
          source_id: string
          stage?: string
          stage_entered_at?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          campaign?: string | null
          closed_at?: string | null
          company?: string | null
          consent_basis?: string | null
          consent_recorded_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          erased_at?: string | null
          first_contact_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_no?: never
          loss_reason?: string | null
          merged_into?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          preferred_channel?: string
          priority?: string
          product_interest?: string[]
          production_id?: string | null
          received_at?: string
          referral?: string | null
          region?: string | null
          search_name?: string | null
          sla_due_at?: string | null
          source_id?: string
          stage?: string
          stage_entered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leads_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leads_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["code"]
          },
        ]
      }
      monthly_goal_versions: {
        Row: {
          employee_comment: string | null
          goal_id: string
          id: string
          submitted_at: string
          submitted_by: string | null
          targets: Json
          version: number
        }
        Insert: {
          employee_comment?: string | null
          goal_id: string
          id?: string
          submitted_at?: string
          submitted_by?: string | null
          targets: Json
          version: number
        }
        Update: {
          employee_comment?: string | null
          goal_id?: string
          id?: string
          submitted_at?: string
          submitted_by?: string | null
          targets?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_goal_versions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "monthly_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_goal_versions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "v_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_goals: {
        Row: {
          created_at: string
          current_version: number
          draft: Json
          employee_id: string
          id: string
          late: boolean
          month: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          draft?: Json
          employee_id: string
          id?: string
          late?: boolean
          month: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version?: number
          draft?: Json
          employee_id?: string
          id?: string
          late?: boolean
          month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          employee_id: string
          muted_kinds: string[]
          updated_at: string
        }
        Insert: {
          employee_id: string
          muted_kinds?: string[]
          updated_at?: string
        }
        Update: {
          employee_id?: string
          muted_kinds?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          critical: boolean
          id: string
          kind: string
          link: string | null
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          critical?: boolean
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          critical?: boolean
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      pdf_records: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          date_created: string
          date_uploaded: string
          file_name: string
          general_grant: number
          id: string
          pdf_url: string
          profit: number
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          date_created: string
          date_uploaded?: string
          file_name: string
          general_grant?: number
          id?: string
          pdf_url: string
          profit?: number
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          date_created?: string
          date_uploaded?: string
          file_name?: string
          general_grant?: number
          id?: string
          pdf_url?: string
          profit?: number
          user_id?: string
        }
        Relationships: []
      }
      point_calculations: {
        Row: {
          ae: number
          calculated_at: string
          created_by: string | null
          details: Json
          id: string
          kind: string
          kv_points: number
          points: number
          production_id: string
          reason: string | null
          reverses_id: string | null
          rule_version_id: string | null
          seq: number
        }
        Insert: {
          ae: number
          calculated_at?: string
          created_by?: string | null
          details: Json
          id?: string
          kind: string
          kv_points: number
          points: number
          production_id: string
          reason?: string | null
          reverses_id?: string | null
          rule_version_id?: string | null
          seq?: never
        }
        Update: {
          ae?: number
          calculated_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          kind?: string
          kv_points?: number
          points?: number
          production_id?: string
          reason?: string | null
          reverses_id?: string | null
          rule_version_id?: string | null
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "point_calculations_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_calculations_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_calculations_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "point_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_calculations_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string
          handled_by: string | null
          id: string
          kind: string
          note: string | null
          outcome_note: string | null
          received_at: string
          received_via: string
          request_no: number
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at: string
          handled_by?: string | null
          id?: string
          kind: string
          note?: string | null
          outcome_note?: string | null
          received_at?: string
          received_via: string
          request_no?: never
          status?: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string
          handled_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          outcome_note?: string | null
          received_at?: string
          received_via?: string
          request_no?: never
          status?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          active: boolean
          code: string
          is_kv: boolean
          name_de: string
          sort: number
        }
        Insert: {
          active?: boolean
          code: string
          is_kv?: boolean
          name_de: string
          sort?: number
        }
        Update: {
          active?: boolean
          code?: string
          is_kv?: boolean
          name_de?: string
          sort?: number
        }
        Relationships: []
      }
      production_records: {
        Row: {
          cancelled_at: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          eligible_at: string | null
          id: string
          import_batch_id: string | null
          net_or_gross: string | null
          notes: string | null
          premium_amount: number
          premium_period: string
          producer_id: string
          product_reference: string | null
          production_date: string
          source: string
          source_system: string | null
          source_system_id: string | null
          status: string
          term_years: number | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          category_code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          eligible_at?: string | null
          id?: string
          import_batch_id?: string | null
          net_or_gross?: string | null
          notes?: string | null
          premium_amount: number
          premium_period: string
          producer_id: string
          product_reference?: string | null
          production_date: string
          source?: string
          source_system?: string | null
          source_system_id?: string | null
          status?: string
          term_years?: number | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          category_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          eligible_at?: string | null
          id?: string
          import_batch_id?: string | null
          net_or_gross?: string | null
          notes?: string | null
          premium_amount?: number
          premium_period?: string
          producer_id?: string
          product_reference?: string | null
          production_date?: string
          source?: string
          source_system?: string | null
          source_system_id?: string | null
          status?: string
          term_years?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_records_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "production_records_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      rule_versions: {
        Row: {
          ae_per_point: number | null
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          kind: string
          label: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          reserve_ratio: number | null
          status: string
        }
        Insert: {
          ae_per_point?: number | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          id?: string
          kind: string
          label: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          reserve_ratio?: number | null
          status?: string
        }
        Update: {
          ae_per_point?: number | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          reserve_ratio?: number | null
          status?: string
        }
        Relationships: []
      }
      signup_allowlist: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      statement_periods: {
        Row: {
          created_at: string
          id: string
          period_month: string
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          period_month: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          period_month?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Relationships: []
      }
      subsidy_records: {
        Row: {
          approved_amount: number
          approved_by: string | null
          coverage_note: string
          created_at: string
          employee_id: string
          id: string
          max_amount_snapshot: number | null
          month: string
          override_reason: string | null
          status: string
        }
        Insert: {
          approved_amount: number
          approved_by?: string | null
          coverage_note: string
          created_at?: string
          employee_id: string
          id?: string
          max_amount_snapshot?: number | null
          month: string
          override_reason?: string | null
          status?: string
        }
        Update: {
          approved_amount?: number
          approved_by?: string | null
          coverage_note?: string
          created_at?: string
          employee_id?: string
          id?: string
          max_amount_snapshot?: number | null
          month?: string
          override_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsidy_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsidy_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      sync_errors: {
        Row: {
          created_at: string
          error_code: string
          external_contract_id: string | null
          external_customer_id: string | null
          id: number
          row_no: number
          run_id: string
        }
        Insert: {
          created_at?: string
          error_code: string
          external_contract_id?: string | null
          external_customer_id?: string | null
          id?: never
          row_no: number
          run_id: string
        }
        Update: {
          created_at?: string
          error_code?: string
          external_contract_id?: string | null
          external_customer_id?: string | null
          id?: never
          row_no?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          finished_at: string | null
          id: string
          rows_failed: number
          rows_ok: number
          rows_total: number
          source_system: string
          started_at: string
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          rows_failed?: number
          rows_ok?: number
          rows_total?: number
          source_system: string
          started_at?: string
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          rows_failed?: number
          rows_ok?: number
          rows_total?: number
          source_system?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          linked_id: string | null
          linked_type: string | null
          owner_id: string
          priority: string
          source: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          owner_id: string
          priority?: string
          source?: string
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          owner_id?: string
          priority?: string
          source?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_commission_ledger: {
        Row: {
          calculation_id: string | null
          category_code: string | null
          commission_type: string | null
          created_at: string | null
          depth: number | null
          entry_kind: string | null
          gross_amount: number | null
          id: string | null
          net_after_reserve: number | null
          period_month: string | null
          period_status: string | null
          points: number | null
          producer_id: string | null
          producer_level: string | null
          producer_name: string | null
          production_date: string | null
          production_id: string | null
          rate_per_point: number | null
          recipient_id: string | null
          recipient_level: string | null
          recipient_name: string | null
          relationship: string | null
          reserve_amount: number | null
          reverses_entry_id: string | null
          rule_version_id: string | null
          seq: number | null
          statement_period_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "point_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_ledger_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "commission_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "v_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_statement_period_id_fkey"
            columns: ["statement_period_id"]
            isOneToOne: false
            referencedRelation: "statement_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      v_current_hierarchy: {
        Row: {
          effective_from: string | null
          employee_id: string | null
          employee_no: string | null
          first_name: string | null
          last_name: string | null
          manager_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_customer_consent_state: {
        Row: {
          action: string | null
          customer_id: string | null
          effective_at: string | null
          event_id: number | null
          evidence: string | null
          legal_basis: string | null
          purpose: string | null
          recorded_by: string | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_goals: {
        Row: {
          created_at: string | null
          current_version: number | null
          draft: Json | null
          employee_id: string | null
          employee_name: string | null
          id: string | null
          last_review_comment: string | null
          late: boolean | null
          month: string | null
          reviewer_id: string | null
          status: string | null
          submitted_targets: Json | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      v_production: {
        Row: {
          ae: number | null
          cancelled_at: string | null
          category_code: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          eligible_at: string | null
          id: string | null
          import_batch_id: string | null
          kv_points: number | null
          net_or_gross: string | null
          notes: string | null
          points: number | null
          premium_amount: number | null
          premium_period: string | null
          producer_first_name: string | null
          producer_id: string | null
          producer_last_name: string | null
          product_reference: string | null
          production_date: string | null
          source: string | null
          source_system: string | null
          source_system_id: string | null
          status: string | null
          term_years: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_records_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "production_records_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "v_current_hierarchy"
            referencedColumns: ["employee_id"]
          },
        ]
      }
    }
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      get_user_report_years: {
        Args: never
        Returns: {
          year: number
        }[]
      }
      rpc_activity_summary: {
        Args: { p_employee_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      rpc_add_coaching_note: {
        Args: { p_body: string; p_employee_id: string; p_visibility: string }
        Returns: string
      }
      rpc_add_coaching_session: {
        Args: {
          p_actions?: Json
          p_employee_id: string
          p_held_on: string
          p_next_review_on?: string
          p_participants?: string
          p_summary: string
        }
        Returns: string
      }
      rpc_approve_promotion: {
        Args: { p_employee_id: string; p_reason: string }
        Returns: string
      }
      rpc_archive_contract_link: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_archive_customer: {
        Args: { p_archived: boolean; p_customer_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_assign_customer: {
        Args: { p_customer_id: string; p_owner_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_assign_lead: {
        Args: { p_lead_id: string; p_owner_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_assign_manager: {
        Args: {
          p_effective_from: string
          p_employee_id: string
          p_manager_id: string
          p_reason: string
        }
        Returns: string
      }
      rpc_audit_for: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          action: string
          actor_id: string
          actor_kind: string
          actor_name: string
          at: string
          id: number
          new_values: Json
          old_values: Json
          reason: string
        }[]
      }
      rpc_cancel_future_assignment: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancel_production: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_career_progress: { Args: { p_employee_id?: string }; Returns: Json }
      rpc_close_privacy_request: {
        Args: { p_id: string; p_outcome: string; p_status: string }
        Returns: undefined
      }
      rpc_commit_production_import: {
        Args: { p_batch_id: string }
        Returns: number
      }
      rpc_consent_report: { Args: never; Returns: Json }
      rpc_convert_lead: {
        Args: { p_confirm_duplicates?: boolean; p_lead_id: string }
        Returns: string
      }
      rpc_correct_production: {
        Args: {
          p_id: string
          p_net_or_gross: string
          p_premium_amount: number
          p_premium_period: string
          p_production_date: string
          p_reason: string
          p_term_years: number
        }
        Returns: undefined
      }
      rpc_create_customer: {
        Args: {
          p_confirm_duplicates?: boolean
          p_data: Json
          p_owner_id?: string
        }
        Returns: string
      }
      rpc_create_employee: {
        Args: {
          p_email: string
          p_employee_no?: string
          p_employment_type?: string
          p_first_name: string
          p_last_name: string
          p_phone?: string
          p_start_date: string
        }
        Returns: Json
      }
      rpc_create_lead: {
        Args: {
          p_confirm_duplicates?: boolean
          p_data: Json
          p_owner_id?: string
          p_to_pool?: boolean
        }
        Returns: string
      }
      rpc_create_rule_draft: {
        Args: { p_effective_from: string; p_kind: string; p_label: string }
        Returns: string
      }
      rpc_create_task: {
        Args: {
          p_description?: string
          p_due_at?: string
          p_linked_id?: string
          p_linked_type?: string
          p_owner_id: string
          p_priority?: string
          p_title: string
        }
        Returns: string
      }
      rpc_dashboard_admin: { Args: never; Returns: Json }
      rpc_dashboard_me: { Args: { p_month?: string }; Returns: Json }
      rpc_dashboard_team: { Args: { p_month?: string }; Returns: Json }
      rpc_delete_production_draft: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_delete_rule_draft: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      rpc_dismiss_exception: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_erase_subject: { Args: { p_request_id: string }; Returns: undefined }
      rpc_export_subject_data: { Args: { p_request_id: string }; Returns: Json }
      rpc_find_customer_duplicates: {
        Args: {
          p_company: string
          p_email: string
          p_exclude?: string
          p_first_name: string
          p_last_name: string
          p_phone: string
        }
        Returns: Json
      }
      rpc_find_lead_duplicates: {
        Args: {
          p_company: string
          p_email: string
          p_exclude?: string
          p_first_name: string
          p_last_name: string
          p_phone: string
        }
        Returns: Json
      }
      rpc_find_privacy_subject: {
        Args: { p_number: number; p_subject_type: string }
        Returns: Json
      }
      rpc_generate_all_periods: { Args: never; Returns: number }
      rpc_grant_role: {
        Args: {
          p_reason: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      rpc_ingest_contracts: {
        Args: { p_rows: Json; p_source_system: string }
        Returns: Json
      }
      rpc_issue_invite: { Args: { p_employee_id: string }; Returns: Json }
      rpc_lead_config: { Args: never; Returns: Json }
      rpc_lead_funnel: {
        Args: { p_from: string; p_scope?: string; p_to: string }
        Returns: Json
      }
      rpc_link_customer_external: {
        Args: {
          p_customer_id: string
          p_external_id: string
          p_source_system: string
        }
        Returns: undefined
      }
      rpc_log_activity: {
        Args: {
          p_linked_id?: string
          p_linked_type?: string
          p_notes?: string
          p_occurred_at?: string
          p_outcome?: string
          p_owner_id?: string
          p_scheduled_at?: string
          p_type: string
        }
        Returns: string
      }
      rpc_log_export: {
        Args: { p_kind: string; p_row_count: number; p_scope: Json }
        Returns: undefined
      }
      rpc_mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: number
      }
      rpc_mark_production_eligible: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_may_contact: {
        Args: { p_customer_id: string; p_purpose: string }
        Returns: Json
      }
      rpc_merge_leads: {
        Args: { p_keep_id: string; p_merge_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_my_context: { Args: never; Returns: Json }
      rpc_open_privacy_request: {
        Args: {
          p_kind: string
          p_note?: string
          p_received_at?: string
          p_received_via: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: string
      }
      rpc_performance_profile: {
        Args: { p_employee_id: string }
        Returns: Json
      }
      rpc_preview_points: {
        Args: {
          p_category: string
          p_currency: string
          p_net_or_gross: string
          p_period: string
          p_premium: number
          p_production_date: string
          p_term_years: number
        }
        Returns: Json
      }
      rpc_promotion_queue: { Args: never; Returns: Json[] }
      rpc_publish_rule_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: undefined
      }
      rpc_reassign_task: {
        Args: { p_new_owner: string; p_reason: string; p_task_id: string }
        Returns: undefined
      }
      rpc_record_consent: {
        Args: {
          p_action: string
          p_customer_id: string
          p_effective_at?: string
          p_evidence?: string
          p_legal_basis: string
          p_purpose: string
          p_source: string
        }
        Returns: number
      }
      rpc_retention_candidates: { Args: never; Returns: Json }
      rpc_retry_commission: {
        Args: { p_calculation_id: string }
        Returns: number
      }
      rpc_review_goal: {
        Args: { p_comment?: string; p_decision: string; p_goal_id: string }
        Returns: undefined
      }
      rpc_revoke_invite: {
        Args: { p_employee_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_revoke_role: {
        Args: {
          p_reason: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      rpc_revoke_subsidy: {
        Args: { p_employee_id: string; p_month: string; p_reason: string }
        Returns: undefined
      }
      rpc_rules_at: { Args: { p_date?: string }; Returns: Json }
      rpc_run_task_generators: { Args: never; Returns: Json }
      rpc_save_contract_link: {
        Args: {
          p_customer_id: string
          p_data: Json
          p_dates_confirmed?: boolean
          p_id: string
        }
        Returns: string
      }
      rpc_save_goal_draft: {
        Args: { p_month: string; p_targets: Json }
        Returns: string
      }
      rpc_save_lead_source: {
        Args: {
          p_active: boolean
          p_id: string
          p_kind: string
          p_name: string
        }
        Returns: string
      }
      rpc_save_production: {
        Args: {
          p_category_code: string
          p_currency?: string
          p_id: string
          p_net_or_gross: string
          p_notes?: string
          p_premium_amount: number
          p_premium_period: string
          p_producer_id: string
          p_product_reference?: string
          p_production_date: string
          p_term_years: number
        }
        Returns: string
      }
      rpc_save_service_item: {
        Args: {
          p_contract_link_id?: string
          p_customer_id: string
          p_due_on: string
          p_id: string
          p_kind: string
          p_note?: string
          p_owner_id?: string
          p_recurrence?: string
          p_title: string
        }
        Returns: string
      }
      rpc_set_appointment_outcome: {
        Args: { p_activity_id: string; p_notes?: string; p_outcome: string }
        Returns: undefined
      }
      rpc_set_coaching_action_status: {
        Args: { p_action_id: string; p_status: string }
        Returns: undefined
      }
      rpc_set_employee_active: {
        Args: { p_active: boolean; p_employee_id: string; p_reason: string }
        Returns: string
      }
      rpc_set_employee_level: {
        Args: {
          p_effective_from: string
          p_employee_id: string
          p_level_code: string
          p_reason: string
        }
        Returns: string
      }
      rpc_set_holiday: {
        Args: { p_day: string; p_name?: string; p_region: string }
        Returns: undefined
      }
      rpc_set_lead_sla: {
        Args: { p_reason: string; p_value: Json }
        Returns: undefined
      }
      rpc_set_lead_source_cost: {
        Args: {
          p_amount: number
          p_month: string
          p_note?: string
          p_source_id: string
        }
        Returns: undefined
      }
      rpc_set_lead_stage: {
        Args: {
          p_lead_id: string
          p_loss_reason?: string
          p_next_action?: string
          p_next_action_at?: string
          p_note?: string
          p_production_id?: string
          p_stage: string
        }
        Returns: undefined
      }
      rpc_set_muted_notifications: {
        Args: { p_kinds: string[] }
        Returns: string[]
      }
      rpc_set_service_item_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: string
      }
      rpc_set_statement_status: {
        Args: { p_month: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      rpc_set_subsidy: {
        Args: {
          p_amount: number
          p_coverage_note: string
          p_employee_id: string
          p_month: string
          p_override_reason?: string
          p_reason: string
        }
        Returns: string
      }
      rpc_set_task_status: {
        Args: { p_note?: string; p_status: string; p_task_id: string }
        Returns: undefined
      }
      rpc_stage_production_import: {
        Args: { p_file_name: string; p_rows: Json; p_source_system: string }
        Returns: string
      }
      rpc_statement: {
        Args: { p_employee_id?: string; p_month: string }
        Returns: Json
      }
      rpc_statement_overview: {
        Args: { p_month: string }
        Returns: {
          employee_no: string
          entries: number
          gross: number
          net: number
          recipient_id: string
          recipient_name: string
          reserve: number
          subsidy: number
        }[]
      }
      rpc_submit_goal: {
        Args: { p_comment?: string; p_goal_id: string }
        Returns: number
      }
      rpc_submit_production: { Args: { p_id: string }; Returns: undefined }
      rpc_update_conversion_draft: {
        Args: {
          p_ae_per_point: number
          p_category_code: string
          p_divisor: number
          p_max_term_years: number
          p_version_id: string
        }
        Returns: undefined
      }
      rpc_update_customer: {
        Args: { p_customer_id: string; p_data: Json }
        Returns: undefined
      }
      rpc_update_employee: {
        Args: {
          p_employee_id: string
          p_employment_type: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_reason: string
          p_start_date: string
        }
        Returns: undefined
      }
      rpc_update_lead: {
        Args: { p_data: Json; p_lead_id: string }
        Returns: undefined
      }
      rpc_update_lead_stage_config: {
        Args: {
          p_active: boolean
          p_allow_skip: boolean
          p_code: string
          p_reason: string
          p_required_fields: string[]
        }
        Returns: undefined
      }
      rpc_update_level_draft: {
        Args: {
          p_code: string
          p_kv_min_ratio: number
          p_max_subsidy: number
          p_point_rate: number
          p_structure_cap_ratio: number
          p_threshold_points: number
          p_version_id: string
        }
        Returns: undefined
      }
      rpc_update_reserve_draft: {
        Args: { p_reserve_ratio: number; p_version_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "finance" | "compliance"
      document_category:
        | "Strom & Gas"
        | "Barmenia Abrechnung"
        | "IKK Abrechnung"
        | "Adcuri Abschlussprovision"
        | "Adcuri Bestandsprovision"
      expense_category:
        | "Mobilität"
        | "Geschäftsessen"
        | "Büro & Arbeitsmittel"
        | "Kommunikation"
        | "Weiterbildung"
        | "Reisen"
        | "Versicherungen"
        | "Bank & Gebühren"
        | "Marketing"
        | "Sonstiges"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "finance", "compliance"],
      document_category: [
        "Strom & Gas",
        "Barmenia Abrechnung",
        "IKK Abrechnung",
        "Adcuri Abschlussprovision",
        "Adcuri Bestandsprovision",
      ],
      expense_category: [
        "Mobilität",
        "Geschäftsessen",
        "Büro & Arbeitsmittel",
        "Kommunikation",
        "Weiterbildung",
        "Reisen",
        "Versicherungen",
        "Bank & Gebühren",
        "Marketing",
        "Sonstiges",
      ],
    },
  },
} as const

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
      rpc_approve_promotion: {
        Args: { p_employee_id: string; p_reason: string }
        Returns: string
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
      rpc_commit_production_import: {
        Args: { p_batch_id: string }
        Returns: number
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
      rpc_create_rule_draft: {
        Args: { p_effective_from: string; p_kind: string; p_label: string }
        Returns: string
      }
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
      rpc_generate_all_periods: { Args: never; Returns: number }
      rpc_grant_role: {
        Args: {
          p_reason: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      rpc_issue_invite: { Args: { p_employee_id: string }; Returns: Json }
      rpc_mark_production_eligible: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_my_context: { Args: never; Returns: Json }
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
      rpc_retry_commission: {
        Args: { p_calculation_id: string }
        Returns: number
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
      rpc_rules_at: { Args: { p_date?: string }; Returns: Json }
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
      rpc_stage_production_import: {
        Args: { p_file_name: string; p_rows: Json; p_source_system: string }
        Returns: string
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

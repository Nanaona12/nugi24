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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cashier_shifts: {
        Row: {
          actual_cash: number
          cashier_id: string
          closed_at: string | null
          created_at: string
          difference: number
          expected_cash: number
          id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          status: string
          tenant_id: string
          total_cash: number
          total_expenses: number
          total_other: number
          total_qris: number
          total_sales: number
          total_transactions: number
          updated_at: string
        }
        Insert: {
          actual_cash?: number
          cashier_id: string
          closed_at?: string | null
          created_at?: string
          difference?: number
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          tenant_id: string
          total_cash?: number
          total_expenses?: number
          total_other?: number
          total_qris?: number
          total_sales?: number
          total_transactions?: number
          updated_at?: string
        }
        Update: {
          actual_cash?: number
          cashier_id?: string
          closed_at?: string | null
          created_at?: string
          difference?: number
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          tenant_id?: string
          total_cash?: number
          total_expenses?: number
          total_other?: number
          total_qris?: number
          total_sales?: number
          total_transactions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_shifts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "cashiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashier_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashiers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          pin_hash: string
          pin_salt: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          pin_hash: string
          pin_salt: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          pin_hash?: string
          pin_salt?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          discount_percent: number
          expires_at: string | null
          id: string
          max_uses: number | null
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          discount_percent: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          note: string | null
          phone: string | null
          points: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          phone?: string | null
          points?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          phone?: string | null
          points?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          name: string
          rating: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name: string
          rating?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string
          rating?: number | null
        }
        Relationships: []
      }
      household_withdrawals: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          id: string
          note: string | null
          product_id: string
          qty: number
          status: string
          taken_at: string
          taken_by: string | null
          tenant_id: string
          unit_conversion: number
          updated_at: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          qty: number
          status?: string
          taken_at?: string
          taken_by?: string | null
          tenant_id?: string
          unit_conversion?: number
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          qty?: number
          status?: string
          taken_at?: string
          taken_by?: string | null
          tenant_id?: string
          unit_conversion?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_withdrawals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          discount_percent: number | null
          id: string
          midtrans_order_id: string | null
          midtrans_transaction_id: string | null
          paid_at: string | null
          payment_type: string | null
          raw_response: Json | null
          snap_token: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_percent?: number | null
          id?: string
          midtrans_order_id?: string | null
          midtrans_transaction_id?: string | null
          paid_at?: string | null
          payment_type?: string | null
          raw_response?: Json | null
          snap_token?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          discount_percent?: number | null
          id?: string
          midtrans_order_id?: string | null
          midtrans_transaction_id?: string | null
          paid_at?: string | null
          payment_type?: string | null
          raw_response?: Json | null
          snap_token?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_audit: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          id: string
          new_period: string | null
          new_plan: string
          note: string | null
          old_period: string | null
          old_plan: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          new_period?: string | null
          new_plan: string
          note?: string | null
          old_period?: string | null
          old_plan?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          new_period?: string | null
          new_plan?: string
          note?: string | null
          old_period?: string | null
          old_plan?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          created_at: string
          expiry_date: string
          id: string
          note: string | null
          po_id: string | null
          product_id: string
          qty: number
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date: string
          id?: string
          note?: string | null
          po_id?: string | null
          product_id: string
          qty: number
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string
          id?: string
          note?: string | null
          po_id?: string | null
          product_id?: string
          qty?: number
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_tiers: {
        Row: {
          created_at: string
          id: string
          min_qty: number
          price: number
          product_unit_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_qty?: number
          price: number
          product_unit_id: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_qty?: number
          price?: number
          product_unit_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units: {
        Row: {
          conversion: number
          created_at: string
          id: string
          is_base: boolean
          name: string
          product_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversion?: number
          created_at?: string
          id?: string
          is_base?: boolean
          name: string
          product_id: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          conversion?: number
          created_at?: string
          id?: string
          is_base?: boolean
          name?: string
          product_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string | null
          code: string
          cost_price: number
          created_at: string
          id: string
          name: string
          price: number
          stock: number
          tenant_id: string
          updated_at: string
          wholesale_min_qty: number | null
          wholesale_price: number | null
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          code: string
          cost_price?: number
          created_at?: string
          id?: string
          name: string
          price?: number
          stock?: number
          tenant_id?: string
          updated_at?: string
          wholesale_min_qty?: number | null
          wholesale_price?: number | null
        }
        Update: {
          barcode?: string | null
          category?: string | null
          code?: string
          cost_price?: number
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock?: number
          tenant_id?: string
          updated_at?: string
          wholesale_min_qty?: number | null
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          po_id: string
          product_barcode: string | null
          product_code: string
          product_id: string | null
          product_name: string
          qty: number
          qty_received: number
          subtotal: number
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          id?: string
          po_id: string
          product_barcode?: string | null
          product_code: string
          product_id?: string | null
          product_name: string
          qty: number
          qty_received?: number
          subtotal?: number
          tenant_id?: string
          unit_cost?: number
        }
        Update: {
          id?: string
          po_id?: string
          product_barcode?: string | null
          product_code?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          qty_received?: number
          subtotal?: number
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          item_count: number
          notes: string | null
          received_at: string | null
          received_status: string
          status: string
          supplier: string
          tenant_id: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          received_at?: string | null
          received_status?: string
          status?: string
          supplier: string
          tenant_id?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          received_at?: string | null
          received_status?: string
          status?: string
          supplier?: string
          tenant_id?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          created_at: string
          id: string
          product_code: string
          product_id: string | null
          product_name: string
          qty: number
          refund_id: string
          subtotal: number
          tenant_id: string
          unit_conversion: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_code: string
          product_id?: string | null
          product_name: string
          qty: number
          refund_id: string
          subtotal?: number
          tenant_id?: string
          unit_conversion?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          refund_id?: string
          subtotal?: number
          tenant_id?: string
          unit_conversion?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          cashier_id: string
          created_at: string
          id: string
          item_count: number
          reason: string | null
          tenant_id: string
          total: number
          transaction_id: string | null
        }
        Insert: {
          cashier_id: string
          created_at?: string
          id?: string
          item_count?: number
          reason?: string | null
          tenant_id?: string
          total?: number
          transaction_id?: string | null
        }
        Update: {
          cashier_id?: string
          created_at?: string
          id?: string
          item_count?: number
          reason?: string | null
          tenant_id?: string
          total?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_expenses: {
        Row: {
          amount: number
          created_at: string
          id: string
          label: string
          shift_id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          label: string
          shift_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          label?: string
          shift_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          period: string
          plan: string
          price_idr: number
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          id?: string
          period?: string
          plan?: string
          price_idr?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          period?: string
          plan?: string
          price_idr?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_cashier_users: {
        Row: {
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_cashier_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          cashier_auth_password: string | null
          cashier_auth_user_id: string | null
          cashier_code: string | null
          created_at: string
          id: string
          name: string
          owner_user_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cashier_auth_password?: string | null
          cashier_auth_user_id?: string | null
          cashier_code?: string | null
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cashier_auth_password?: string | null
          cashier_auth_user_id?: string | null
          cashier_code?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transaction_items: {
        Row: {
          id: string
          is_wholesale: boolean
          product_barcode: string | null
          product_code: string
          product_id: string | null
          product_name: string
          qty: number
          subtotal: number
          tenant_id: string
          transaction_id: string
          unit_conversion: number | null
          unit_cost: number
          unit_name: string | null
          unit_price: number
          unit_qty: number | null
        }
        Insert: {
          id?: string
          is_wholesale?: boolean
          product_barcode?: string | null
          product_code: string
          product_id?: string | null
          product_name: string
          qty: number
          subtotal: number
          tenant_id?: string
          transaction_id: string
          unit_conversion?: number | null
          unit_cost?: number
          unit_name?: string | null
          unit_price: number
          unit_qty?: number | null
        }
        Update: {
          id?: string
          is_wholesale?: boolean
          product_barcode?: string | null
          product_code?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          subtotal?: number
          tenant_id?: string
          transaction_id?: string
          unit_conversion?: number | null
          unit_cost?: number
          unit_name?: string | null
          unit_price?: number
          unit_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          cashier_id: string
          change_amount: number
          created_at: string
          customer_phone: string | null
          id: string
          item_count: number
          paid: number
          payment_method: string
          shift_id: string | null
          tenant_id: string
          total: number
        }
        Insert: {
          cashier_id: string
          change_amount?: number
          created_at?: string
          customer_phone?: string | null
          id?: string
          item_count?: number
          paid?: number
          payment_method?: string
          shift_id?: string | null
          tenant_id?: string
          total?: number
        }
        Update: {
          cashier_id?: string
          change_amount?: number
          created_at?: string
          customer_phone?: string | null
          id?: string
          item_count?: number
          paid?: number
          payment_method?: string
          shift_id?: string | null
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      current_tenant_id: { Args: never; Returns: string }
      current_tenant_info: {
        Args: never
        Returns: {
          address: string
          id: string
          name: string
          phone: string
        }[]
      }
      generate_cashier_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cashier_session: { Args: never; Returns: boolean }
      next_product_code: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "super_admin"
      payment_status: "pending" | "paid" | "failed" | "expired"
      subscription_status: "trialing" | "active" | "past_due" | "canceled"
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
      app_role: ["super_admin"],
      payment_status: ["pending", "paid", "failed", "expired"],
      subscription_status: ["trialing", "active", "past_due", "canceled"],
    },
  },
} as const

export interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  is_active: boolean
  role_id: number | null
  role_name: string | null
}

export interface Product {
  id: number
  name: string
  description: string | null
  image_url: string | null
  price: number | string
  stock: number
  category_id: number | null
  store_id: number
}

export interface Category { id: number; name: string }
export interface Store { id: number; name: string; description: string | null; owner_id: number }
export interface OrderItem { id: number; order_id: number; product_id: number; quantity: number; price: number | string }
export interface Order { id: number; user_id: number; store_id: number; total_amount: number | string; status: string; items: OrderItem[] }
export interface Role { id: number; name: string; permissions: string }
export interface DashboardData {
  products: Product[]
  categories: Category[]
  stores: Store[]
  orders: Order[]
  users: User[]
  roles: Role[]
}

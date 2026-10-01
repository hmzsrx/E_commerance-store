import type { Category, Order, Product, Role, Store, User } from './types'

export const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = localStorage.getItem('access_token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
      else if (body.detail) message = JSON.stringify(body.detail)
    } catch { /* Keep the status-based message for non-JSON responses. */ }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  clearToken: () => localStorage.removeItem('access_token'),
  login(email: string, password: string) {
    const body = new FormData()
    body.set('email', email)
    body.set('password', password)
    return request<{ access_token: string; token_type: string }>('/auth/login', { method: 'POST', body }).then((result) => {
      localStorage.setItem('access_token', result.access_token)
      return result
    })
  },
  register: (payload: { username: string; email: string; full_name: string; password: string }) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<User>('/auth/me'),
  products: () => request<Product[]>('/products/'),
  categories: () => request<Category[]>('/products/categories'),
  stores: () => request<Store[]>('/stores/'),
  orders: () => request<Order[]>('/orders/'),
  users: () => request<User[]>('/users/'),
  roles: () => request<Role[]>('/roles/'),
  createRole: (name: string, permissions: string) =>
    request<Role>(`/roles/?name=${encodeURIComponent(name)}&permissions=${encodeURIComponent(permissions)}`, { method: 'POST' }),
  assignRole: (userId: number, roleId: number) =>
    request<User>(`/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role_id: roleId }) }),
  createOrder: (payload: { store_id: number; items: { product_id: number; quantity: number }[] }) =>
    request<Order>('/orders/', { method: 'POST', body: JSON.stringify(payload) }),
  checkout: (orderId: number) => request<{ checkout_url: string; payment_id: number }>(`/payments/checkout/${orderId}`, { method: 'POST' }),
  createStore: (payload: { name: string; description: string }) =>
    request<Store>('/stores/', { method: 'POST', body: JSON.stringify(payload) }),
  createCategory: (payload: { name: string }) =>
    request<Category>('/products/categories', { method: 'POST', body: JSON.stringify(payload) }),
  createProduct: (payload: FormData) =>
    request<Product>('/products/', { method: 'POST', body: payload }),
  updateProduct: (id: number, payload: FormData) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: payload }),
  deleteProduct: (id: number) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),
}

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, BadgeCheck, Boxes, Check, CreditCard, LayoutDashboard, LogOut, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Store, Trash2, Users, X } from 'lucide-react'
import { api, ApiError, baseUrl } from './api'
import type { Category, DashboardData, Order, Product, User } from './types'
import './store.css'

type Page = 'shop' | 'orders' | 'admin'
type AuthMode = 'login' | 'register'
type AdminTab = 'overview' | 'catalog' | 'orders' | 'customers' | 'roles'
const blank: DashboardData = { products: [], categories: [], stores: [], orders: [], users: [], roles: [] }
const imageIds = ['photo-1523275335684-37898b6baf30', 'photo-1505740420928-5e560c06d30e', 'photo-1542291026-7eec264c27ff', 'photo-1526170375885-4d8ecf77b99f', 'photo-1547887538-e3a2f32cb1cc', 'photo-1512499617640-c74ae3a79d37']
const photo = (product: Product) => product.image_url ? `${baseUrl}${product.image_url}` : `https://images.unsplash.com/${imageIds[product.id % imageIds.length]}?auto=format&fit=crop&w=800&q=85`
const price = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
const message = (error: unknown) => error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem('access_token')))
  const [auth, setAuth] = useState<AuthMode | null>(null)
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<Page>('shop')
  const [tab, setTab] = useState<AdminTab>('overview')
  const [data, setData] = useState(blank)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('access_token')))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const [cart, setCart] = useState<Record<number, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [cartError, setCartError] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const isAdmin = user?.role_name === 'admin'
  const ownedStore = data.stores.find((store) => store.owner_id === user?.id) || (isAdmin ? data.stores[0] : undefined)
  const cartItems = data.products.filter((product) => cart[product.id])
  const cartCount = Object.values(cart).reduce((total, count) => total + count, 0)
  const total = cartItems.reduce((sum, item) => sum + Number(item.price) * cart[item.id], 0)
  const products = data.products.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) && (category === null || item.category_id === category))

  async function loadData(account: User) {
    const admin = account.role_name === 'admin'
    const [productsResult, categories, stores, orders, users, roles] = await Promise.all([
      api.products(), api.categories(), api.stores(), api.orders(),
      admin ? api.users() : Promise.resolve([]), admin ? api.roles() : Promise.resolve([]),
    ])
    setData({ products: productsResult, categories, stores, orders, users, roles })
  }

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    api.me().then(setUser).catch(api.clearToken).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (window.location.pathname === '/payment/success') {
      setPaymentNotice('Thanks for your order. Stripe is confirming your payment; your order status will update shortly.')
      window.history.replaceState({}, '', '/')
    } else if (window.location.pathname === '/payment/cancelled') {
      setPaymentNotice('Checkout was cancelled. Your order is still here whenever you are ready.')
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    loadData(user).catch((reason: unknown) => { if (active) setError(message(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])

  async function refresh() {
    if (!user) return
    setLoading(true)
    try { await loadData(user); setError('') } catch (reason) { setError(message(reason)) } finally { setLoading(false) }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setAuthError('')
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') || '')
    const password = String(fields.get('password') || '')
    try {
      if (auth === 'register') await api.register({ username: String(fields.get('username')), full_name: String(fields.get('full_name')), email, password })
      await api.login(email, password)
      const account = await api.me()
      setError('')
      setLoading(true)
      setUser(account)
      setAuth(null)
      setPage('shop')
    } catch (reason) { setAuthError(message(reason)) } finally { setBusy(false) }
  }

  function signOut() {
    api.clearToken(); setUser(null); setData(blank); setLoading(false); setPage('shop'); setCart({}); setCartOpen(false)
  }

  function add(item: Product) {
    if (cartItems[0] && cartItems[0].store_id !== item.store_id) {
      setCartError('A single checkout can include products from one store. Clear your bag to switch stores.')
      setCartOpen(true)
      return
    }
    setCartError('')
    setCart((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))
    setCartOpen(true)
  }

  function quantity(id: number, change: number) {
    setCart((current) => {
      const next = { ...current }
      const count = (next[id] || 0) + change
      if (count < 1) delete next[id]
      else next[id] = count
      return next
    })
    setCartError('')
  }

  async function checkout(orderId?: number) {
    if (!user) { setAuth('login'); return }
    try {
      setCartError('')
      let id = orderId
      if (!id) {
        const first = cartItems[0]
        if (!first) return
        const order = await api.createOrder({ store_id: first.store_id, items: cartItems.map((item) => ({ product_id: item.id, quantity: cart[item.id] })) })
        id = order.id
      }
      const result = await api.checkout(id)
      window.location.assign(result.checkout_url)
    } catch (reason) { setCartError(message(reason)) }
  }

  async function adminSubmit(event: FormEvent<HTMLFormElement>, kind: 'store' | 'category' | 'product' | 'role') {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const form = event.currentTarget
    const fields = new FormData(form)
    try {
      if (kind === 'store') {
        await api.createStore({ name: String(fields.get('name')), description: String(fields.get('description') || '') })
        setNotice('Store created. Add your first product below.')
      } else if (kind === 'category') {
        await api.createCategory({ name: String(fields.get('name')) })
        setNotice('Category added.')
      } else if (kind === 'role') {
        await api.createRole(String(fields.get('name')), String(fields.get('permissions')))
        setNotice('Role added.')
      } else {
        await api.createProduct(fields)
        setNotice('Product published to your store.')
      }
      form.reset()
      if (user) await loadData(user)
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const fields = new FormData(event.currentTarget)
    try {
      await api.assignRole(Number(fields.get('user_id')), Number(fields.get('role_id')))
      setNotice('User role updated.')
      event.currentTarget.reset()
      if (user) await loadData(user)
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  async function updateProduct(productId: number, formData: FormData) {
    setBusy(true); setError(''); setNotice('')
    try {
      await api.updateProduct(productId, formData)
      setNotice('Product updated.')
      if (user) await loadData(user)
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  async function deleteProduct(productId: number) {
    if (!window.confirm('Delete this product permanently?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.deleteProduct(productId)
      setNotice('Product deleted.')
      if (user) await loadData(user)
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Package }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'catalog', label: 'Catalog', icon: Boxes },
    { id: 'orders', label: 'Orders', icon: Package }, { id: 'customers', label: 'Customers', icon: Users }, { id: 'roles', label: 'Roles', icon: ShieldCheck },
  ]

  return <div className="store-app">
    <div className="topline"><Sparkles size={13}/> Thoughtful finds for everyday living <span>Complimentary shipping over $75</span></div>
    <header className="header"><button className="brand" onClick={() => setPage('shop')}><i>c</i> common<span>goods</span></button><nav><button className={page === 'shop' ? 'chosen' : ''} onClick={() => setPage('shop')}>Shop</button>{user && <button className={page === 'orders' ? 'chosen' : ''} onClick={() => setPage('orders')}>My orders</button>}{isAdmin && <button className={page === 'admin' ? 'chosen' : ''} onClick={() => setPage('admin')}><LayoutDashboard size={14}/> Admin studio</button>}</nav><div className="head-right"><label className="searchbox"><Search size={15}/><input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>{user ? <button className="profile" onClick={() => setPage('orders')}><span>{(user.full_name || user.username)[0].toUpperCase()}</span>{user.full_name?.split(' ')[0] || user.username}</button> : <button className="signin" onClick={() => { setAuth('login'); setAuthError('') }}>Sign in <ArrowUpRight size={14}/></button>}<button className="bag" onClick={() => setCartOpen(true)} aria-label={`Shopping bag with ${cartCount} items`}><ShoppingBag size={17}/><span>Bag</span><b>{cartCount}</b></button>{user && <button className="icon-btn signout" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={16}/></button>}</div></header>

    {page === 'shop' && !selectedProduct && <main>
      <section className="hero"><div className="hero-copy"><span className="kicker">THE EVERYDAY EDIT · NO. 01</span><h1>Good things<br/>for <em>living well.</em></h1><p>Useful, beautiful finds that earn their place in your everyday. Thoughtfully chosen. Made to be kept.</p><button className="primary" onClick={() => user ? document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' }) : setAuth('login')}>{user ? 'Explore the collection' : 'Sign in to shop'} <ArrowRight size={16}/></button><small className="hero-small"><BadgeCheck size={16}/> Carefully chosen. Shipped with care.</small></div><div className="hero-photo"><img src="https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1400&q=90" alt="Sunlit table with books and home goods"/><div className="photo-tag">SLOW MORNING SET <ArrowUpRight size={15}/></div><span className="round-stamp">MADE FOR<br/><b>the everyday</b></span></div><span className="hero-count">01 <i/> 04</span></section>
      <section className="promise"><span><BadgeCheck/> Thoughtfully selected</span><span><Package/> Ships with care</span><span><ShieldCheck/> Secure checkout</span><b>LESS, BUT BETTER.</b></section>
      <section className="collection" id="collection"><div className="collection-title"><div><span className="kicker">A GOOD PLACE TO START</span><h2>Find your <em>everyday.</em></h2></div><p>Small upgrades. Long-time favorites.<br/>Things you’ll be glad you brought home.</p></div>
        {paymentNotice && <div className="success"><Check size={15}/>{paymentNotice}<button aria-label="Dismiss message" onClick={() => setPaymentNotice('')}><X size={15}/></button></div>}
        {data.categories.length > 0 && <div className="filters"><button className={category === null ? 'selected' : ''} onClick={() => setCategory(null)}>All finds</button>{data.categories.map((item: Category) => <button key={item.id} className={category === item.id ? 'selected' : ''} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div>}
        {error && <div className="alert">{error}<button onClick={() => void refresh()}>Try again</button></div>}
        {checking || loading ? <div className="loading"><span/>Gathering the good things...</div> : !user ? <div className="signin-shelf"><ShoppingBag size={23}/><div><strong>Your next favorite thing is in here.</strong><p>Sign in or create an account to browse the live collection and place an order.</p></div><button className="primary" onClick={() => setAuth('login')}>Explore the store <ArrowRight size={15}/></button></div> : products.length === 0 ? <div className="empty"><Store size={25}/><strong>{search || category !== null ? 'Nothing found this time.' : 'The shelves are being stocked.'}</strong><p>{search || category !== null ? 'Try another search or category.' : 'There are no products in the catalog yet.'}</p></div> : <div className="products">{products.map((item, index) => <article className="product" key={item.id} style={{ animationDelay: `${index * 50}ms` }} role="button" tabIndex={0} onClick={() => setSelectedProduct(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedProduct(item) } }}><div className="product-photo"><img src={photo(item)} alt={item.name} loading="lazy"/><span>0{index + 1}</span><button aria-label={`Add ${item.name} to bag`} disabled={item.stock < 1} onClick={(event) => { event.stopPropagation(); add(item) }}><Plus size={18}/></button></div><div className="product-info"><div><h3>{item.name}</h3><p>{item.description || 'A considered little upgrade.'}</p></div><strong>{price(item.price)}</strong></div><div className="product-meta"><span>{data.categories.find((cat) => cat.id === item.category_id)?.name || 'EVERYDAY GOODS'}</span><span>{item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}</span></div></article>)}</div>}
      </section><section className="closing"><span>“</span><p>Make room for the things that<br/><em>make a day feel like yours.</em></p><small>COMMON GOODS · OBJECTS FOR LIVING</small></section>
    </main>}

    {page === 'orders' && <main className="account-page"><div className="page-heading"><span className="kicker">YOUR ACCOUNT</span><h1>Orders & <em>more.</em></h1><p>Hi {user?.full_name || user?.username}, here's your order history.</p></div>{data.orders.length ? <div className="order-list">{data.orders.map((order: Order) => <article className="order" key={order.id}><div className="order-top"><span>ORDER #{String(order.id).padStart(4, '0')} <i className={`status ${order.status}`}>{order.status}</i></span><strong>{price(order.total_amount)}</strong></div><div className="order-items">{order.items.map((item) => <span key={item.id}>Product #{item.product_id} <b>× {item.quantity}</b></span>)}</div>{order.status !== 'paid' && <button className="secondary" onClick={() => void checkout(order.id)}><CreditCard size={15}/> Continue payment <ArrowRight size={15}/></button>}</article>)}</div> : <div className="empty"><Package size={25}/><strong>No orders just yet.</strong><p>Your next good find is waiting in the store.</p><button className="primary" onClick={() => setPage('shop')}>Explore the store <ArrowRight size={15}/></button></div>}</main>}

    {page === 'admin' && isAdmin && <main className="admin"><aside className="sidebar"><div className="sidebar-brand"><LayoutDashboard/><b>Studio</b><small>STORE MANAGEMENT</small></div><span className="side-label">WORKSPACE</span>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{label}{id === 'orders' && <b>{data.orders.length}</b>}</button>)}<button className="side-logout" onClick={signOut}><LogOut size={15}/> Sign out</button></aside><section className="admin-main"><div className="admin-top"><span>Common Goods <i>/</i> {tabs.find((item) => item.id === tab)?.label}</span><b><i/> STORE CONNECTED</b></div>{error && <div className="alert">{error}<button onClick={() => void refresh()}>Refresh</button></div>}{notice && <div className="success"><Check size={15}/>{notice}</div>}
      {tab === 'overview' && <><div className="admin-heading"><div><span className="kicker">YOUR STORE AT A GLANCE</span><h1>Good morning, {user.full_name?.split(' ')[0] || user.username}.</h1><p>Here’s what’s happening with your store today.</p></div><button className="primary" onClick={() => setTab('catalog')}><Plus size={15}/> Add to catalog</button></div><div className="metrics"><Metric icon={CreditCard} title="Gross sales" value={price(data.orders.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.total_amount), 0))}/><Metric icon={Package} title="Orders" value={String(data.orders.length)}/><Metric icon={Boxes} title="Products" value={String(data.products.length)}/><Metric icon={Users} title="Customers" value={String(data.users.length)}/></div><div className="admin-panel"><div className="panel-head"><div><small>RECENT ACTIVITY</small><h2>Latest orders</h2></div><button className="link-btn" onClick={() => setTab('orders')}>View all <ArrowRight size={14}/></button></div>{data.orders.length ? data.orders.slice(-5).reverse().map((item) => <div className="simple-row" key={item.id}><b>#{String(item.id).padStart(4, '0')}</b><span>{item.items.length} items</span><i className={`status ${item.status}`}>{item.status}</i><strong>{price(item.total_amount)}</strong></div>) : <p className="panel-empty">Orders will appear here when customers check out.</p>}</div></>}
      {tab === 'catalog' && <><div className="admin-heading"><div><span className="kicker">PRODUCTS · CATEGORIES · STORES</span><h1>Your catalog.</h1><p>Keep the good things coming.</p></div></div><div className="forms-grid">{!ownedStore && <form className="admin-panel admin-form" onSubmit={(event) => void adminSubmit(event, 'store')}><small>FIRST THINGS FIRST</small><h2>Set up your store</h2><label>Store name<input name="name" required maxLength={100} placeholder="Common Goods"/></label><label>Description<input name="description" maxLength={255} placeholder="Considered things for everyday living"/></label><button className="primary" disabled={busy}>Create store <ArrowRight size={15}/></button></form>}{ownedStore && <form className="admin-panel admin-form" onSubmit={(event) => void adminSubmit(event, 'product')}><small>NEW ARRIVAL · {ownedStore.name.toUpperCase()}</small><h2>Add a product</h2><label>Product image<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label><label>Product name<input name="name" required placeholder="A well-made everyday thing"/></label><label>Description<textarea name="description" rows={2} placeholder="What makes it worth keeping?"/></label><div className="field-row"><label>Price (USD)<input name="price" type="number" min="0.01" step="0.01" required placeholder="28.00"/></label><label>Stock<input name="stock" type="number" min="0" defaultValue="1" required/></label></div><label>Category<select name="category_id" defaultValue=""><option value="">Uncategorized</option>{data.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label><button className="primary" disabled={busy}>Publish product <ArrowUpRight size={15}/></button></form>}<div className="admin-side"><form className="admin-panel admin-form" onSubmit={(event) => void adminSubmit(event, 'category')}><small>KEEP IT ORGANIZED</small><h2>Add a category</h2><label>Category name<input name="name" required placeholder="Home, accessories..."/></label><button className="secondary" disabled={busy}><Plus size={15}/> Add category</button><div className="category-list">{data.categories.map((cat) => <span key={cat.id}>{cat.name}</span>)}</div></form><div className="admin-panel catalog-count"><Boxes size={20}/><strong>{data.products.length}</strong><span>products in your catalog</span></div></div></div>{data.products.length > 0 && <div className="admin-panel table-panel"><div className="panel-head"><div><small>LIVE IN YOUR STORE</small><h2>Published products</h2></div></div><Table heads={['PRODUCT', 'CATEGORY', 'PRICE', 'STOCK', 'STORE']} rows={data.products.map((item) => [item.name, data.categories.find((cat) => cat.id === item.category_id)?.name || 'Uncategorized', price(item.price), String(item.stock), data.stores.find((store) => store.id === item.store_id)?.name || `#${item.store_id}`])}/></div>}</>}
      {tab === 'catalog' && <ProductAdminTools products={data.products} categories={data.categories} busy={busy} onUpdate={(productId, formData) => void updateProduct(productId, formData)} onDelete={(productId) => void deleteProduct(productId)}/>} 
      {tab === 'orders' && <AdminListing title="Orders" subtitle="EVERY CUSTOMER CHECKOUT" heads={['ORDER', 'CUSTOMER', 'ITEMS', 'TOTAL', 'STATUS']} rows={data.orders.map((item) => [`#${String(item.id).padStart(4, '0')}`, `Customer #${item.user_id}`, `${item.items.length} items`, price(item.total_amount), item.status])}/>} 
      {tab === 'customers' && <AdminListing title="Customers" subtitle="PEOPLE WHO SHOP WITH YOU" heads={['NAME', 'EMAIL', 'ROLE', 'STATUS']} rows={data.users.map((item) => [item.full_name || item.username, item.email, item.role_name || 'buyer', item.is_active ? 'Active' : 'Inactive'])}/>}
      {tab === 'roles' && <><div className="access-forms"><form className="admin-panel admin-form" onSubmit={(event) => void adminSubmit(event, 'role')}><small>WORKSPACE ACCESS</small><h2>Add a role</h2><label>Role name<input name="name" required maxLength={50} placeholder="support"/></label><label>Permissions<input name="permissions" required placeholder="buyer:read_products"/></label><button className="primary" disabled={busy}><Plus size={15}/> Add role</button></form><form className="admin-panel admin-form" onSubmit={(event) => void assignRole(event)}><small>CHANGE ACCESS</small><h2>Assign a role</h2><label>User<select name="user_id" required defaultValue=""><option value="" disabled>Select a user</option>{data.users.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.username} · {item.email}</option>)}</select></label><label>Role<select name="role_id" required defaultValue=""><option value="" disabled>Select a role</option>{data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary" disabled={busy}><ShieldCheck size={15}/> Assign role</button></form></div><AdminListing title="Roles & access" subtitle="WORKSPACE PERMISSIONS" heads={['ROLE', 'PERMISSIONS']} rows={data.roles.map((item) => [item.name, item.permissions || 'No permissions assigned'])}/></>}
    </section></main>}

    {page === 'admin' && !isAdmin && <main className="account-page"><div className="empty"><ShieldCheck size={25}/><strong>Admin access required.</strong><p>This workspace is for administrator accounts.</p><button className="primary" onClick={() => setPage('shop')}>Back to store <ArrowRight size={15}/></button></div></main>}
    <footer className="footer"><button className="brand" onClick={() => setPage('shop')}><i>c</i> common<span>goods</span></button><small>GOOD THINGS, KEPT CLOSE.</small><small>© 2026 COMMON GOODS</small></footer>

    {cartOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false) }}><aside className="drawer"><div className="drawer-head"><div><small>YOUR BAG · {cartCount} ITEMS</small><h2>A few good things.</h2></div><button className="icon-btn" aria-label="Close bag" onClick={() => setCartOpen(false)}><X/></button></div>{cartError && <div className="alert">{cartError}</div>}{cartItems.length === 0 ? <div className="cart-empty"><ShoppingBag/><h3>Your bag is taking a breather.</h3><p>Add something lovely when you find it.</p></div> : <><div className="cart-list">{cartItems.map((item) => <div className="cart-item" key={item.id}><img src={photo(item)} alt=""/><div><b>{item.name}</b><span>{price(item.price)}</span><div className="quantity"><button aria-label="Remove one" onClick={() => quantity(item.id, -1)}><Minus size={13}/></button>{cart[item.id]}<button aria-label="Add one" onClick={() => quantity(item.id, 1)}><Plus size={13}/></button></div></div><button className="icon-btn" aria-label={`Remove ${item.name}`} onClick={() => setCart((current) => { const next = { ...current }; delete next[item.id]; return next })}><Trash2 size={16}/></button></div>)}</div><div className="checkout"><div><span>Subtotal</span><b>{price(total)}</b></div><p>Shipping and taxes are calculated at checkout.</p><button className="primary" onClick={() => void checkout()}><CreditCard size={16}/> Continue to secure checkout <ArrowRight size={15}/></button><button className="link-btn clear" onClick={() => setCart({})}>Clear bag</button></div></>}</aside></div>}

    {auth && <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuth(null) }}><section className="auth-modal" role="dialog" aria-modal="true"><button className="icon-btn modal-x" aria-label="Close" onClick={() => setAuth(null)}><X/></button><div className="auth-mark">c</div><small className="kicker">A GOOD PLACE TO COME BACK TO</small><h2>{auth === 'login' ? 'Welcome back.' : 'Come on in.'}</h2><p>{auth === 'login' ? 'Sign in to find your favorites and follow your orders.' : 'Create an account and find a few new everyday favorites.'}</p>{authError && <div className="alert">{authError}</div>}<form onSubmit={(event) => void submitAuth(event)}>{auth === 'register' && <><label>Your name<input name="full_name" required autoComplete="name" placeholder="Jamie Taylor"/></label><label>Username<input name="username" required autoComplete="username" placeholder="jamietaylor"/></label></>}<label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com"/></label><label>Password<input name="password" type="password" minLength={8} required autoComplete={auth === 'login' ? 'current-password' : 'new-password'}/></label><button className="primary" disabled={busy}>{busy ? 'One moment...' : auth === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={15}/></button></form><div className="auth-switch">{auth === 'login' ? 'New around here?' : 'Already have an account?'} <button onClick={() => { setAuth(auth === 'login' ? 'register' : 'login'); setAuthError('') }}>{auth === 'login' ? 'Create an account' : 'Sign in'}</button></div></section></div>}

    {selectedProduct && <main className="product-page"><div className="product-page-inner"><button className="back-link" onClick={() => setSelectedProduct(null)}><ArrowRight size={16}/> Back to collection</button><section className="product-detail" aria-labelledby="product-title"><div className="product-detail-photo"><img src={photo(selectedProduct)} alt={selectedProduct.name}/><span>COMMON GOODS · OBJECTS FOR LIVING</span></div><div className="product-detail-copy"><span className="kicker">{data.categories.find((cat) => cat.id === selectedProduct.category_id)?.name || 'EVERYDAY GOODS'}</span><h1 id="product-title">{selectedProduct.name}</h1><strong className="product-modal-price">{price(selectedProduct.price)}</strong><p className="product-description">{selectedProduct.description || 'A considered little upgrade, thoughtfully chosen for everyday living.'}</p><div className="product-facts"><span><Package size={16}/> {selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Out of stock'}</span><span><ShieldCheck size={16}/> Secure checkout</span><span><BadgeCheck size={16}/> Ships with care</span></div><button className="primary product-modal-action" disabled={selectedProduct.stock < 1} onClick={() => { add(selectedProduct); setSelectedProduct(null) }}><ShoppingBag size={16}/> Add to bag <ArrowRight size={15}/></button><small className="product-modal-note">Shipping and taxes are calculated at checkout.</small></div></section></div></main>}
  </div>
}

function ProductAdminTools({ products, categories, busy, onUpdate, onDelete }: { products: Product[]; categories: Category[]; busy: boolean; onUpdate: (productId: number, formData: FormData) => void; onDelete: (productId: number) => void }) {
  const [editingId, setEditingId] = useState<number | null>(null)
  return <section className="admin-panel product-tools"><div className="panel-head"><div><small>ADMIN CONTROLS</small><h2>Manage products</h2></div><span>{products.length} products</span></div>{products.length === 0 ? <p className="panel-empty">Add a product above to manage it here.</p> : <div className="product-admin-list">{products.map((product) => editingId === product.id ? <form className="product-edit-form" key={product.id} onSubmit={(event) => { event.preventDefault(); onUpdate(product.id, new FormData(event.currentTarget)); setEditingId(null) }}><strong>{product.name}</strong><input name="name" defaultValue={product.name} required/><textarea name="description" defaultValue={product.description || ''} rows={2}/><div className="field-row"><input name="price" type="number" min="0.01" step="0.01" defaultValue={product.price} required/><input name="stock" type="number" min="0" defaultValue={product.stock} required/></div><select name="category_id" defaultValue={product.category_id || ''}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input name="image" type="file" accept="image/jpeg,image/png,image/webp"/><div className="product-admin-actions"><button className="primary" type="submit" disabled={busy}><Check size={14}/> Save</button><button className="secondary" type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <div className="product-admin-row" key={product.id}><div><strong>{product.name}</strong><span>{price(product.price)} · {product.stock} in stock</span></div><div className="product-admin-actions"><button className="secondary" onClick={() => setEditingId(product.id)}>Edit</button><button className="danger-btn" disabled={busy} onClick={() => onDelete(product.id)}><Trash2 size={14}/> Delete</button></div></div>)}</div>}</section>
}

function Metric({ icon: Icon, title, value }: { icon: typeof Package; title: string; value: string }) { return <div className="metric"><span>{title}<Icon size={17}/></span><strong>{value}</strong><small>All-time overview</small></div> }
function Table({ heads, rows }: { heads: string[]; rows: string[][] }) { return <div className="table-scroll"><table><thead><tr>{heads.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="panel-empty">Nothing to show yet.</p>}</div> }
function AdminListing({ title, subtitle, heads, rows }: { title: string; subtitle: string; heads: string[]; rows: string[][] }) { return <><div className="admin-heading"><div><span className="kicker">{subtitle}</span><h1>{title}.</h1><p>Everything in one place, right when you need it.</p></div></div><div className="admin-panel table-panel"><Table heads={heads} rows={rows}/></div></> }

export default App

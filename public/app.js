const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = (value) => value.toLowerCase().replaceAll('ё', 'е').trim();
const storageKey = 'yaraton-cart-v1';
let products = [];
let cart = new Map();
let activeCategory = 'Все продукты';
let query = '';
let toastTimer;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}

function quantity(product, count) {
  return `<div class="quantity"><button data-action="minus" data-id="${product.id}" aria-label="Уменьшить количество: ${escape(product.name)}">−</button><output aria-label="Количество упаковок">${count}</output><button data-action="plus" data-id="${product.id}" aria-label="Увеличить количество: ${escape(product.name)}" ${count >= 99 ? 'disabled' : ''}>+</button></div>`;
}

function productControl(product) {
  const count = cart.get(product.id) || 0;
  return count ? quantity(product, count) : `<button class="add-button" data-action="plus" data-id="${product.id}" aria-label="В корзину: ${escape(product.name)}">В корзину <span aria-hidden="true">+</span></button>`;
}

function renderProducts() {
  const visible = products.filter(product => (activeCategory === 'Все продукты' || product.category === activeCategory) && normalize(product.name + ' ' + product.description).includes(normalize(query)));
  $('results-label').textContent = `${activeCategory} · ${visible.length} из ${products.length}`;
  $('products').innerHTML = visible.map(product => `<article class="product" data-product="${product.id}"><div class="product-image"><img src="${product.image}" alt="${escape(product.name)}" loading="lazy" width="450" height="324"><span class="image-tag">${product.category === 'Молочные продукты' ? 'Своё хозяйство' : 'По-домашнему'}</span></div><div class="product-body"><span class="product-category">${escape(product.category)}</span><h3>${escape(product.name)}</h3><span class="product-weight">${escape(product.weight)} · 1 упаковка</span>${product.description ? `<details><summary>Состав и описание</summary><p>${escape(product.description)}</p></details>` : '<p class="product-weight">Из собственного хозяйства</p>'}<div class="product-bottom"><strong class="price">${money(product.price)}</strong><div data-control="${product.id}">${productControl(product)}</div></div></div></article>`).join('');
  $('products').setAttribute('aria-busy', 'false');
  $('empty-search').hidden = visible.length > 0;
}

function renderCategories() {
  const categories = ['Все продукты', 'Пельмени', 'Мясные блюда', 'Вареники', 'Блины и выпечка', 'Манты и хинкали', 'Молочные продукты'];
  $('categories').innerHTML = categories.map(category => `<button class="category ${category === activeCategory ? 'active' : ''}" data-category="${category}" aria-pressed="${category === activeCategory}">${category}<span>${category === 'Все продукты' ? products.length : products.filter(p => p.category === category).length}</span></button>`).join('');
}

function renderCart() {
  const selected = [...cart].map(([id, count]) => ({product: products.find(p => p.id === id), count}));
  const count = selected.reduce((sum, item) => sum + item.count, 0);
  const subtotal = selected.reduce((sum, {product, count}) => sum + product.price * count, 0);
  const delivery = subtotal > 0 && subtotal < 2000 ? 500 : 0;
  $('header-count').textContent = count;
  $('cart-count').textContent = count;
  $('mobile-count').textContent = count;
  $('mobile-total').textContent = money(subtotal + delivery);
  $('mobile-cart').hidden = !count;
  $('clear-cart').hidden = !count;
  $('cart-totals').hidden = !count;
  $('cart-items').innerHTML = count ? selected.map(({product, count}) => `<div class="cart-item" data-cart-product="${product.id}"><div class="cart-item-top"><img src="${product.image}" alt="" width="44" height="44"><h3>${escape(product.name)}<br><span class="product-weight">${escape(product.weight)}</span></h3><button class="remove-item" data-action="remove" data-id="${product.id}" aria-label="Удалить: ${escape(product.name)}">×</button></div><div class="cart-item-bottom">${quantity(product, count)}<b>${money(product.price * count)}</b></div></div>`).join('') : '<div class="cart-empty"><span class="empty-icon" aria-hidden="true">♧</span><h3>Здесь будет что-то вкусное</h3><p>Добавьте любимые продукты —<br>мы соберём их в один заказ.</p></div>';
  $('subtotal').textContent = money(subtotal);
  $('delivery').textContent = delivery ? money(delivery) : 'Бесплатно';
  $('total').textContent = money(subtotal + delivery);
  $('progress-bar').style.width = `${Math.min(100, subtotal / 2000 * 100)}%`;
  $('progress-note').textContent = subtotal < 2000 ? `Ещё ${money(2000 - subtotal)} — и доставка бесплатно` : 'Бесплатная доставка вашего заказа';
  $('order-text').value = selected.map(({product, count}) => `${product.name} ${count}`).join(' ');
}

function saveCart() {
  try { localStorage.setItem(storageKey, JSON.stringify([...cart])); }
  catch { /* Shopping still works when storage is unavailable. */ }
}

function changeQuantity(id, action) {
  if (!products.some(p => p.id === id)) return;
  const count = cart.get(id) || 0;
  if (action === 'remove' || (action === 'minus' && count <= 1)) cart.delete(id);
  else cart.set(id, Math.max(0, Math.min(99, count + (action === 'plus' ? 1 : -1))));
  saveCart();
  const oldFocus = document.activeElement;
  const focusAction = oldFocus?.dataset.action;
  const inCart = Boolean(oldFocus?.closest('.cart-item'));
  const product = products.find(p => p.id === id);
  document.querySelectorAll(`[data-control="${id}"]`).forEach(control => { control.innerHTML = productControl(product); });
  renderCart();
  const container = document.querySelector(inCart ? `[data-cart-product="${id}"]` : `[data-control="${id}"]`);
  if (focusAction) (container?.querySelector(`[data-action="${focusAction}"]`) || container?.querySelector('button') || $('clear-cart')).focus({preventScroll:true});
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) changeQuantity(action.dataset.id, action.dataset.action);
  const category = event.target.closest('[data-category]');
  if (category) {
    activeCategory = category.dataset.category;
    document.querySelectorAll('[data-category]').forEach(button => {
      const active = button.dataset.category === activeCategory;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderProducts();
  }
});

$('search').addEventListener('input', event => { query = event.target.value; renderProducts(); });
$('reset-search').addEventListener('click', () => { activeCategory = 'Все продукты'; query = ''; $('search').value = ''; renderCategories(); renderProducts(); });
$('clear-cart').addEventListener('click', () => { cart.clear(); saveCart(); renderProducts(); renderCart(); notify('Корзина очищена'); });
for (const id of ['open-cart', 'mobile-cart']) $(id).addEventListener('click', () => $('cart').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'}));
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT','TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); $('search').focus(); } });

$('copy-order').addEventListener('click', async () => {
  if (!cart.size) return;
  const text = $('order-text').value;
  try {
    await navigator.clipboard.writeText(text);
    notify('Заказ скопирован. Отправьте его в ваш чат!');
  } catch {
    const field = $('order-text');
    field.focus(); field.select(); field.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Show the manual fallback. */ }
    notify(copied ? 'Заказ скопирован. Отправьте его в ваш чат!' : 'Выделили заказ — выберите «Скопировать» или нажмите Ctrl+C');
  }
});

try {
  const response = await fetch('products.json');
  if (!response.ok) throw new Error(`Products: ${response.status}`);
  products = await response.json();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) {
      cart = new Map(saved.filter(item => Array.isArray(item) && products.some(p => p.id === item[0]) && Number.isInteger(item[1]) && item[1] > 0 && item[1] <= 99));
    }
  } catch { cart = new Map(); }
  $('product-count').textContent = products.length;
  $('hero-image').src = products.find(p => p.category === 'Пельмени').image;
  renderCategories(); renderProducts(); renderCart();
} catch {
  $('products').innerHTML = '<div class="empty-search"><h3>Не удалось загрузить каталог</h3><p>Обновите страницу или свяжитесь с Полиной: <a href="tel:+79124644412">8 912 464-44-12</a>.</p><button class="secondary" id="retry-load">Попробовать ещё раз</button></div>';
  $('products').setAttribute('aria-busy', 'false');
  $('retry-load').addEventListener('click', () => location.reload());
  renderCart();
}

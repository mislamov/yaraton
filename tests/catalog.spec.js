import { test, expect } from '@playwright/test';

async function openCatalog(page) {
  await page.goto('./', {waitUntil:'domcontentloaded'});
  await expect(page.locator('.product')).toHaveCount(43);
}
const card = (page, name) => page.locator('.product').filter({ has: page.getByRole('heading', {name, exact: true}) });
async function add(page, name) {
  await card(page, name).getByRole('button', {name: `В корзину: ${name}`, exact: true}).click();
}

test('all source products, prices and local photographs are present', async ({page, request}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openCatalog(page);
  const response = await request.get('products.json');
  const products = await response.json();
  expect(products).toHaveLength(43);
  expect(new Set(products.map(p => p.id)).size).toBe(43);
  for (const image of new Set(products.map(p => p.image))) {
    const response = await request.get(image, {maxRetries:2});
    expect(response.ok(), image).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/');
  }
  await expect.poll(() => page.locator('#hero-image').evaluate(img => img.complete && img.naturalWidth > 0)).toBeTruthy();
  expect(errors).toEqual([]);
  await expect(card(page, 'Пельмени Царские')).toContainText('800 гр.');
  await expect(card(page, 'Пельмени Царские')).toContainText('450 ₽');
});

test('cart calculates delivery, persists and copies exactly the requested format', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await openCatalog(page);
  await add(page, 'Блины с курицей');
  await expect(page.locator('#subtotal')).toHaveText('550 ₽');
  await expect(page.locator('#delivery')).toHaveText('500 ₽');
  await expect(page.locator('#total')).toHaveText('1 050 ₽');
  await add(page, 'Голубцы Натуральные');
  await add(page, 'Бифштекс рубленый');
  await card(page, 'Бифштекс рубленый').getByRole('button', {name: 'Увеличить количество: Бифштекс рубленый', exact:true}).click();
  await add(page, 'Пельмени Царские');
  await add(page, 'Гнёзда Фитнес');
  await card(page, 'Гнёзда Фитнес').getByRole('button', {name: 'Увеличить количество: Гнёзда Фитнес', exact:true}).click();
  const expected = 'Блины с курицей 1 Голубцы Натуральные 1 Бифштекс рубленый 2 Пельмени Царские 1 Гнёзда Фитнес 2';
  await expect(page.locator('#order-text')).toHaveValue(expected);
  await expect(page.locator('#subtotal')).toHaveText('4 040 ₽');
  await expect(page.locator('#delivery')).toHaveText('Бесплатно');
  await expect(page.locator('#header-count')).toHaveText('7');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#order-text')).toHaveValue(expected);
  await page.getByRole('button', {name:'Скопировать заказ'}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await page.getByRole('button', {name:'Удалить: Пельмени Царские', exact:true}).click();
  await expect(page.locator('#subtotal')).toHaveText('3 590 ₽');
  await page.getByRole('button', {name:'Очистить', exact:true}).click();
  await expect(page.locator('#cart-totals')).toBeHidden();
  await expect(page.locator('#header-count')).toHaveText('0');
});

test('free delivery starts at exactly 2000 and decrement removes last package', async ({page}) => {
  await openCatalog(page);
  await add(page, 'Блины с курицей');
  await add(page, 'Голубцы Натуральные');
  await add(page, 'Пельмени с индейкой');
  await card(page,'Пельмени с индейкой').getByRole('button', {name:'Увеличить количество: Пельмени с индейкой',exact:true}).click();
  await expect(page.locator('#subtotal')).toHaveText('2 000 ₽');
  await expect(page.locator('#delivery')).toHaveText('Бесплатно');
  await card(page,'Блины с курицей').getByRole('button', {name:'Уменьшить количество: Блины с курицей',exact:true}).click();
  await expect(page.locator('#subtotal')).toHaveText('1 450 ₽');
  await expect(page.locator('#total')).toHaveText('1 950 ₽');
  await expect(card(page,'Блины с курицей').getByRole('button',{name:'В корзину: Блины с курицей',exact:true})).toBeVisible();
});

test('search, categories and empty state work without changing cart', async ({page}) => {
  await openCatalog(page);
  await add(page,'Блины с курицей');
  await page.locator('[data-category="Пельмени"]').click();
  await expect(page.locator('.product')).toHaveCount(7);
  await page.getByRole('searchbox').fill('царские');
  await expect(page.locator('.product')).toHaveCount(1);
  await page.getByRole('searchbox').fill('неттакогоблюда');
  await expect(page.locator('#empty-search')).toBeVisible();
  await page.getByRole('button',{name:'Сбросить поиск'}).click();
  await expect(page.locator('.product')).toHaveCount(43);
  await page.getByRole('searchbox').fill('гнезда');
  await expect(page.locator('.product')).toHaveCount(1);
  await expect(page.locator('#header-count')).toHaveText('1');
});

test('mobile layout has no overflow and order is reachable', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await openCatalog(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await add(page,'Блины с курицей');
  await expect(page.locator('#mobile-cart')).toBeVisible();
  await page.locator('#mobile-cart').click();
  await expect(page.getByRole('button',{name:'Скопировать заказ'})).toBeInViewport();
  await page.screenshot({path:'screenshots/mobile.png',fullPage:true});
});

test('corrupt storage is ignored; clipboard fallback selects the order', async ({page}) => {
  await page.addInitScript(() => { localStorage.setItem('yaraton-cart-v1', '{bad'); Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.reject(new Error('Denied'))}}); });
  await openCatalog(page);
  await add(page,'Блины с курицей');
  await page.getByRole('button',{name:'Скопировать заказ'}).click();
  await expect(page.locator('#toast')).toBeVisible();
  expect(await page.locator('#order-text').evaluate(el => el.selectionEnd - el.selectionStart)).toBeGreaterThan(0);
});

test('desktop screenshot', async ({page}) => {
  await page.setViewportSize({width:1440,height:1100});
  await openCatalog(page);
  await page.screenshot({path:'screenshots/desktop.png',fullPage:false});
});
